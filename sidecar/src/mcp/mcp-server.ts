import { createServer, IncomingMessage, ServerResponse } from 'http';
import { getDb } from '../db/index.js';
import { getProjectBrain } from '../chat/chat-service.js';
import { assembleContext } from '../intelligence/context-injector.js';
import { DOCUMENT_TOOLS, handleDocumentTool } from './document-builder.js';
import { getRoomContext, listProjectRooms, detectRoomFromContent } from '../intelligence/room-detector.js';
import { getActiveFacts, getFactHistory, addFact, parseDecisionToTriples, buildMemory } from '../intelligence/temporal-service.js';
import { checkConsistency } from '../intelligence/contradiction-service.js';
import { invalidateCache, getCompressionStats } from '../intelligence/aaak-service.js';

const MCP_PORT = 4710;

/**
 * Cortex MCP Server — exposes intelligence to Claude Code via JSON-RPC over HTTP.
 *
 * Tools:
 *  - get_project_brain: Get brain fields for a project
 *  - search_patterns: Search pattern memory
 *  - match_error: Match an error against debug memory
 *  - get_file_index: Get indexed file structure
 *  - get_server_info: Get deployment/server info
 *  - get_context: Get assembled context for a project
 */

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

const TOOLS_LIST: any[] = [
  // Document tools (global — no per-project install needed)
  ...DOCUMENT_TOOLS,
  // Intelligence capture tool
  {
    name: 'save_intelligence',
    description: 'Save a piece of intelligence to the Cortex project brain. Use this to capture decisions, known issues, server info, patterns, or debug solutions discovered during a session.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
        type: { type: 'string', enum: ['decision', 'known_issue', 'pattern', 'debug', 'server', 'convention'], description: 'Type of intelligence to save' },
        content: { type: 'string', description: 'The intelligence content to save' },
        title: { type: 'string', description: 'Title (for patterns)' },
        problem: { type: 'string', description: 'Problem description (for debug)' },
        root_cause: { type: 'string', description: 'Root cause (for debug)' },
      },
      required: ['project_id', 'type', 'content'],
    },
  },
  // Intelligence tools
  {
    name: 'get_project_brain',
    description: 'Get the project brain (summary, architecture, conventions, known issues, decisions, dependencies) for a Cortex-managed project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'search_patterns',
    description: 'Search verified code patterns in Cortex intelligence.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term' },
        project_id: { type: 'string', description: 'Optional project filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'match_error',
    description: 'Match an error against the Cortex debug memory to find known solutions.',
    inputSchema: {
      type: 'object',
      properties: {
        error_signature: { type: 'string', description: 'Error type:message signature' },
        error_message: { type: 'string', description: 'Full error message text' },
      },
      required: ['error_message'],
    },
  },
  {
    name: 'get_file_index',
    description: 'Get the file index structure for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
        file_type: { type: 'string', description: 'Optional filter by file type (component, service, etc.)' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_server_info',
    description: 'Get deployment and server information for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_context',
    description: 'Get the full assembled intelligence context for a project (respects token budget).',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
      },
      required: ['project_id'],
    },
  },
  // Chrome Console Bridge tools
  {
    name: 'get_active_browser_context',
    description: 'Get the currently active browser tab (what page the user has open right now) and its recent errors. Call this FIRST before get_browser_errors — it tells you exactly which page and project the user is looking at so you fetch the right errors.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_browser_errors',
    description: 'Get browser console errors captured by the Cortex Chrome Console Bridge. If project_id is omitted, returns the most recent errors across all pages grouped by source URL — useful when you are not sure which project to look at.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID to filter by. Omit to get all recent errors across all pages.' },
        limit: { type: 'number', description: 'Max errors to return (default 20)' },
      },
    },
  },
  {
    name: 'get_network_failures',
    description: 'Get failed network requests captured by the Cortex Chrome Console Bridge. If project_id is omitted, returns recent failures across all pages.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID to filter by. Omit to get all recent failures.' },
        limit: { type: 'number', description: 'Max requests to return (default 20)' },
      },
    },
  },
  {
    name: 'clear_browser_errors',
    description: 'Clear captured browser errors for a project from the Cortex Console Bridge buffer.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
      },
      required: ['project_id'],
    },
  },
  // Cross-project discovery tools
  {
    name: 'cortex_list_projects',
    description: 'List all projects registered in Cortex. Returns name, path, type, company, and project ID for each. Use this to discover other projects when the user references a project by name.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Optional search term to filter projects by name, path, or company' },
      },
    },
  },
  {
    name: 'cortex_get_project_context',
    description: 'Get the brain and context for ANY Cortex-managed project by name or ID. Use this when the user asks about another project — retrieves its summary, architecture, conventions, known issues, decisions, and dependencies.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID (use cortex_list_projects to find it)' },
        project_name: { type: 'string', description: 'The project name (fuzzy matched if project_id not provided)' },
      },
    },
  },
  // MemPalace tools
  {
    name: 'recall_room',
    description: 'Get deep context for a specific technical domain (room) in a project. Returns all patterns, debug solutions, and knowledge graph facts tagged with that room. Rooms: auth, database, ui, api, testing, deploy, config, state, build, intelligence, chat, terminal. Use this when working on a specific area to get targeted context.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
        room_name: { type: 'string', description: 'Room name (e.g. auth, database, ui, api, testing, deploy, config, state, build)' },
      },
      required: ['project_id', 'room_name'],
    },
  },
  {
    name: 'query_history',
    description: 'Access the temporal knowledge graph to see how facts and decisions evolved over time. Shows what was used before, why things changed, and which decisions superseded others. Use this to understand project evolution.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
        subject: { type: 'string', description: 'Filter by subject (e.g. "framework", "database", "auth")' },
        room_tag: { type: 'string', description: 'Filter by room tag' },
        start_date: { type: 'string', description: 'Start date (ISO format)' },
        end_date: { type: 'string', description: 'End date (ISO format)' },
        active_only: { type: 'boolean', description: 'Only show active facts (default false)' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'check_consistency',
    description: 'Validate a new finding against existing memory before committing it. Checks for contradictions, stale references, and superseded decisions. Use this BEFORE save_intelligence to prevent memory corruption.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
        fact: { type: 'string', description: 'The new fact or decision to validate' },
        room_tag: { type: 'string', description: 'Optional room tag for scoped checking' },
      },
      required: ['project_id', 'fact'],
    },
  },
  {
    name: 'build_memory',
    description: 'Build the MemPalace memory for a project. Scans the project brain and creates knowledge graph entries, AAAK compression cache, and room tags. Use this to initialize or rebuild memory for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'The project ID' },
      },
      required: ['project_id'],
    },
  },
];

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Document tools (create_docx, create_pdf, create_spreadsheet, read_docx, read_pdf)
  if (['create_docx', 'create_pdf', 'create_spreadsheet', 'read_docx', 'read_pdf'].includes(name)) {
    return handleDocumentTool(name, args);
  }

  // Intelligence capture (MemPalace-enhanced)
  if (name === 'save_intelligence') {
    const db = getDb();
    const { project_id, type, content } = args as { project_id: string; type: string; content: string };
    const now = new Date().toISOString();

    // Auto-detect room tag from content
    const roomTag = detectRoomFromContent(content);

    // Run contradiction check before saving
    const consistency = checkConsistency(project_id, content, roomTag || undefined);

    if (type === 'decision' || type === 'known_issue' || type === 'server' || type === 'convention') {
      const fieldMap: Record<string, string> = { decision: 'decisions', known_issue: 'known_issues', server: 'architecture_notes', convention: 'conventions' };
      const field = fieldMap[type];
      const brain = db.prepare(`SELECT ${field} FROM project_brain WHERE project_id = ?`).get(project_id) as any;
      if (brain) {
        const existing = brain[field] || '';
        const updated = existing + `\n\n--- Captured ${new Date().toLocaleDateString()} ---\n${content}`;
        db.prepare(`UPDATE project_brain SET ${field} = ?, updated_at = ? WHERE project_id = ?`).run(updated, now, project_id);
      }

      // For decisions, also create knowledge graph triples
      if (type === 'decision') {
        const triples = parseDecisionToTriples(content);
        for (const triple of triples) {
          triple.roomTag = roomTag || undefined;
          triple.source = 'mcp';
          addFact(project_id, triple);
        }
      }

      // Invalidate AAAK cache for the updated field
      invalidateCache(project_id, field);

      return {
        success: true,
        saved: type,
        roomTag,
        consistency: consistency.safe ? 'clean' : { conflicts: consistency.conflicts.length, details: consistency.conflicts },
      };
    }
    return { error: `Use API endpoint for type: ${type}` };
  }

  const db = getDb();

  switch (name) {
    case 'get_project_brain': {
      const brain = getProjectBrain(args.project_id as string);
      return brain || { error: 'No brain found for this project' };
    }

    case 'search_patterns': {
      const query = args.query as string;
      const term = `%${query}%`;
      let sql = `SELECT title, description, code, tags, confidence, usage_count
        FROM pattern_memory
        WHERE (title LIKE ? OR description LIKE ? OR tags LIKE ?)
        AND confidence != 'deprecated'`;
      const params: string[] = [term, term, term];

      if (args.project_id) {
        sql += " AND (source_project_id = ? OR scope = 'reusable')";
        params.push(args.project_id as string);
      }

      sql += ' ORDER BY usage_count DESC LIMIT 10';
      const results = db.prepare(sql).all(...params);
      return (results as any[]).map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
    }

    case 'match_error': {
      const sig = args.error_signature as string | undefined;
      const msg = args.error_message as string;

      let match = null;
      if (sig) {
        match = db.prepare(
          "SELECT * FROM debug_memory WHERE error_signature = ? AND confidence != 'deprecated' LIMIT 1"
        ).get(sig);
      }
      if (!match && msg) {
        match = db.prepare(
          "SELECT * FROM debug_memory WHERE problem LIKE ? AND confidence != 'deprecated' LIMIT 1"
        ).get(`%${msg.slice(0, 100)}%`);
      }

      if (match) {
        (match as any).tags = JSON.parse((match as any).tags || '[]');
        db.prepare('UPDATE debug_memory SET usage_count = usage_count + 1, last_used = ? WHERE id = ?')
          .run(new Date().toISOString(), (match as any).id);
      }

      return match || { error: 'No matching solution found' };
    }

    case 'get_file_index': {
      let sql = 'SELECT file_path, file_type, size_bytes FROM file_index WHERE project_id = ?';
      const params: string[] = [args.project_id as string];

      if (args.file_type) {
        sql += ' AND file_type = ?';
        params.push(args.file_type as string);
      }

      sql += ' ORDER BY file_type, file_path LIMIT 200';
      return db.prepare(sql).all(...params);
    }

    case 'get_server_info': {
      try {
        return db.prepare('SELECT * FROM servers WHERE project_id = ?').all(args.project_id as string);
      } catch {
        return { error: 'Server info not available' };
      }
    }

    case 'get_context': {
      return assembleContext(args.project_id as string);
    }

    case 'get_active_browser_context': {
      // Fetch live active tab from bridge route state
      let activeTab: any = null;
      try {
        const res = await fetch('http://127.0.0.1:4700/api/bridge/active-tab');
        activeTab = await res.json();
      } catch { /* sidecar internal call */ }

      if (!activeTab?.active) {
        return {
          active: false,
          message: 'No active browser tab detected. Make sure the Cortex Chrome extension is installed and the browser has focus.',
        };
      }

      // Get recent errors for this tab's project or URL
      const limit = 10;
      let errors: any[] = [];
      if (activeTab.projectId) {
        errors = db.prepare(`
          SELECT error_type, message, source, timestamp FROM captured_errors
          WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?
        `).all(activeTab.projectId, limit) as any[];
      } else {
        // No project match — get errors from this exact URL
        errors = db.prepare(`
          SELECT error_type, message, source, timestamp FROM captured_errors
          WHERE source LIKE ? ORDER BY timestamp DESC LIMIT ?
        `).all(`%${new URL(activeTab.url).hostname}%`, limit) as any[];
      }

      const project = activeTab.projectId
        ? db.prepare('SELECT id, name, path FROM projects WHERE id = ?').get(activeTab.projectId) as any
        : null;

      return {
        active: true,
        tab: { url: activeTab.url, title: activeTab.title },
        project: project
          ? { id: project.id, name: project.name, path: project.path }
          : { id: null, note: `No Cortex project matched for ${activeTab.url} — you can still use get_browser_errors without a project_id` },
        recent_errors: errors,
        error_count: errors.length,
      };
    }

    case 'get_browser_errors': {
      const limit = (args.limit as number) || 20;
      let errors: any[];
      if (args.project_id) {
        errors = db.prepare(`
          SELECT ce.error_type, ce.message, ce.stack, ce.source, ce.timestamp,
                 ce.error_signature, dm.solution as matched_solution
          FROM captured_errors ce
          LEFT JOIN debug_memory dm ON dm.id = ce.matched_debug_id
          WHERE ce.project_id = ?
          ORDER BY ce.timestamp DESC LIMIT ?
        `).all(args.project_id as string, limit) as any[];
      } else {
        // No project_id — return all recent errors across all pages with their source URLs
        errors = db.prepare(`
          SELECT ce.error_type, ce.message, ce.stack, ce.source, ce.timestamp,
                 ce.project_id, dm.solution as matched_solution
          FROM captured_errors ce
          LEFT JOIN debug_memory dm ON dm.id = ce.matched_debug_id
          ORDER BY ce.timestamp DESC LIMIT ?
        `).all(limit) as any[];
      }
      return {
        count: errors.length,
        tip: errors.length === 0 ? 'No errors captured yet. Call get_active_browser_context to check what page is active.' : undefined,
        errors,
      };
    }

    case 'get_network_failures': {
      const limit = (args.limit as number) || 20;
      let requests: any[];
      if (args.project_id) {
        requests = db.prepare(`
          SELECT * FROM captured_network
          WHERE project_id = ? AND (failed = 1 OR status_code >= 400)
          ORDER BY timestamp DESC LIMIT ?
        `).all(args.project_id as string, limit) as any[];
      } else {
        requests = db.prepare(`
          SELECT * FROM captured_network
          WHERE failed = 1 OR status_code >= 400
          ORDER BY timestamp DESC LIMIT ?
        `).all(limit) as any[];
      }
      return { count: requests.length, requests };
    }

    case 'clear_browser_errors': {
      db.prepare('DELETE FROM captured_errors WHERE project_id = ?').run(args.project_id as string);
      return { success: true, message: 'Browser errors cleared.' };
    }

    case 'cortex_list_projects': {
      const search = args.search as string | undefined;
      let sql = 'SELECT id, name, path, type, company, git_enabled, last_opened FROM projects ORDER BY last_opened DESC';
      let projects = db.prepare(sql).all() as any[];

      if (search) {
        const term = search.toLowerCase();
        projects = projects.filter((p: any) =>
          p.name.toLowerCase().includes(term) ||
          p.path.toLowerCase().includes(term) ||
          (p.company && p.company.toLowerCase().includes(term))
        );
      }

      return {
        total: projects.length,
        projects: projects.map((p: any) => ({
          id: p.id,
          name: p.name,
          path: p.path,
          type: p.type,
          company: p.company || null,
          git_enabled: !!p.git_enabled,
          last_opened: p.last_opened,
        })),
      };
    }

    case 'cortex_get_project_context': {
      let projectId = args.project_id as string | undefined;

      // Fuzzy match by name if no ID provided
      if (!projectId && args.project_name) {
        const name = (args.project_name as string).toLowerCase();
        const match = db.prepare('SELECT id, name FROM projects').all() as any[];
        const found = match.find((p: any) => p.name.toLowerCase().includes(name));
        if (found) projectId = found.id;
        else return { error: `No project found matching "${args.project_name}". Use cortex_list_projects to see available projects.` };
      }

      if (!projectId) return { error: 'Provide either project_id or project_name' };

      const project = db.prepare('SELECT id, name, path, type, company FROM projects WHERE id = ?').get(projectId) as any;
      if (!project) return { error: `Project not found: ${projectId}` };

      const brain = getProjectBrain(projectId);

      return {
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          type: project.type,
          company: project.company,
        },
        brain: brain || { note: 'No brain data yet — project may not have been scanned' },
      };
    }

    // MemPalace tools
    case 'recall_room': {
      const roomCtx = getRoomContext(args.project_id as string, args.room_name as string);
      const allRooms = listProjectRooms(args.project_id as string);
      return {
        ...roomCtx,
        availableRooms: allRooms.map(r => r.room),
      };
    }

    case 'query_history': {
      if (args.active_only) {
        const facts = getActiveFacts(args.project_id as string, args.room_tag as string | undefined);
        return { facts, total: facts.length, mode: 'active_only' };
      }
      const history = getFactHistory(args.project_id as string, {
        subject: args.subject as string | undefined,
        roomTag: args.room_tag as string | undefined,
        startDate: args.start_date as string | undefined,
        endDate: args.end_date as string | undefined,
      });
      return { facts: history, total: history.length, mode: 'full_history' };
    }

    case 'check_consistency': {
      const result = checkConsistency(
        args.project_id as string,
        args.fact as string,
        args.room_tag as string | undefined
      );
      return result;
    }

    case 'build_memory': {
      const result = buildMemory(args.project_id as string);
      // Also get compression stats
      const stats = getCompressionStats(args.project_id as string);
      return { ...result, compressionStats: stats };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function handleRequest(req: MCPRequest): Promise<MCPResponse> {
  switch (req.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'cortex-mcp', version: '0.3.0' },
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { tools: TOOLS_LIST },
      };

    case 'tools/call': {
      const { name, arguments: toolArgs } = req.params as { name: string; arguments: Record<string, unknown> };
      try {
        const result = await handleToolCall(name, toolArgs || {});
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32000, message: err.message },
        };
      }
    }

    default:
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      };
  }
}

let mcpServer: ReturnType<typeof createServer> | null = null;

/**
 * Start the Cortex MCP server on a separate port.
 */
export function startMCPServer(port = MCP_PORT): void {
  mcpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const request = JSON.parse(body) as MCPRequest;
        const response = await handleRequest(request);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error: ' + err.message },
        }));
      }
    });
  });

  mcpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Port already held by a previous Cortex instance — MCP is non-critical, keep going
      console.warn(`[cortex-mcp] Port ${port} already in use — MCP server skipped (sidecar continues normally)`);
      mcpServer = null;
    } else {
      console.error('[cortex-mcp] Server error:', err.message);
    }
  });

  mcpServer.listen(port, '127.0.0.1', () => {
    console.log(`[cortex-mcp] MCP server running on http://127.0.0.1:${port}`);
  });
}

/**
 * Stop the MCP server.
 */
export function stopMCPServer(): void {
  if (mcpServer) {
    mcpServer.close();
    mcpServer = null;
  }
}
