import { createServer, IncomingMessage, ServerResponse } from 'http';
import { getDb } from '../db/index.js';
import { getProjectBrain } from '../chat/chat-service.js';
import { assembleContext } from '../intelligence/context-injector.js';
import { DOCUMENT_TOOLS, handleDocumentTool } from './document-builder.js';
import { getRoomContext, listProjectRooms, detectRoomFromContent } from '../intelligence/room-detector.js';
import { getActiveFacts, getFactHistory, addFact, parseDecisionToTriples, buildMemory } from '../intelligence/temporal-service.js';
import { checkConsistency } from '../intelligence/contradiction-service.js';
import { invalidateCache, getCompressionStats } from '../intelligence/aaak-service.js';
import { listCredentials, revealCredential, createCredential, type CredentialKind } from '../vault/vault-service.js';
import { getSessionManager } from '../sessions/session-manager.js';

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

/**
 * Single gateway tool — replaces 22 individual tool schemas.
 * Claude reads the description to know what action to use and what params to pass.
 * Reduces per-session MCP token overhead by ~92%.
 */
const TOOLS_LIST: any[] = [
  {
    name: 'cortex',
    description: `Cortex workspace intelligence. Pass action + relevant params.
Actions (call action="action_help" with name="<action>" for full docs/params):
  context: get_context, get_project_brain, get_project_context, list_projects
  memory: recall_room, query_history, search_patterns, match_error
  capture: save_intelligence, check_consistency, build_memory
  vault: list_credentials, get_credential, save_credential
  browser: get_active_browser_context, get_browser_errors, get_network_failures, clear_browser_errors
  files: get_file_index, get_server_info
  docs: create_pdf, create_docx, create_spreadsheet, read_pdf, read_docx
  testing: shadow_run_test
  meta: action_help(name)
Use vault BEFORE asking user for any password. Use save_intelligence (NOT Claude memory) for project facts.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'The action to perform (see tool description)' },
        project_id: { type: 'string' },
        project_name: { type: 'string' },
        search: { type: 'string' },
        room_name: { type: 'string' },
        subject: { type: 'string' },
        room_tag: { type: 'string' },
        active_only: { type: 'boolean' },
        query: { type: 'string' },
        error_message: { type: 'string' },
        error_signature: { type: 'string' },
        file_type: { type: 'string' },
        type: { type: 'string' },
        content: { type: 'string' },
        fact: { type: 'string' },
        title: { type: 'string' },
        problem: { type: 'string' },
        root_cause: { type: 'string' },
        limit: { type: 'number' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        file_path: { type: 'string' },
        output_path: { type: 'string' },
        sheets: { type: 'array' },
        name: { type: 'string', description: 'Credential name for vault tools' },
        reason: { type: 'string', description: 'Reason for credential reveal (audited)' },
        kind: { type: 'string', description: 'Credential kind for save_credential' },
        fields: { type: 'object', description: 'Credential field map for save_credential, e.g. {host, user, password}' },
        description: { type: 'string', description: 'Optional human-readable note for save_credential' },
        command: { type: 'string', description: 'Shell command for shadow_run_test, e.g. "npm test", "pnpm vitest run"' },
        cwd: { type: 'string', description: 'Working directory for shadow_run_test (defaults to project path)' },
        timeout_ms: { type: 'number', description: 'Timeout in ms for shadow_run_test (default 120000)' },
      },
      required: ['action'],
    },
  },
];

/**
 * Per-action help — fetched on demand via action_help(name) so the tool's top-level
 * description can stay short. Each entry is the params + a one-liner.
 */
const ACTION_DOCS: Record<string, string> = {
  get_context: 'get_context(project_id) — assembled project context respecting token budget.',
  get_project_brain: 'get_project_brain(project_id) — raw brain fields: summary, architecture, conventions, decisions, issues, deps.',
  get_project_context: 'get_project_context(project_id|project_name) — brain+context resolved by ID or fuzzy name.',
  list_projects: 'list_projects([search]) — list every Cortex project with IDs and paths.',
  recall_room: 'recall_room(project_id, room_name) — deep room context. room_name ∈ {auth,database,ui,api,testing,deploy,config,state,build,intelligence}.',
  query_history: 'query_history(project_id, [subject], [room_tag], [active_only]) — how facts evolved over time.',
  search_patterns: 'search_patterns(query, [project_id]) — find code patterns from pattern_memory.',
  match_error: 'match_error(error_message, [error_signature]) — find a known solution for an error.',
  save_intelligence: 'save_intelligence(project_id, type, content) — type ∈ {decision,known_issue,pattern,debug,server,convention}. USE INSTEAD OF Claude memory.',
  check_consistency: 'check_consistency(project_id, fact, [room_tag]) — validate a fact before saving to prevent contradiction.',
  build_memory: 'build_memory(project_id) — rebuild the temporal knowledge graph from brain.',
  list_credentials: 'list_credentials([project_id]) — names + kinds only, no secret values.',
  get_credential: 'get_credential(name, reason, [project_id]) — decrypt and return fields. Reason is REQUIRED (audited). Use BEFORE asking the user for any password.',
  save_credential: 'save_credential(kind, name, fields, [project_id], [description]) — encrypt + store. kind ∈ {ssh,wordpress,shopify,smtp,backend_panel,api_key,db,app_user,github,other}. fields is an object e.g. {host, user, password}. After save, Cortex aggressively redacts the field values from all live PTY buffers + saved session_output. Caveat: terminal emulator scrollback already rendered cannot be scrubbed.',
  get_active_browser_context: 'get_active_browser_context() — active tab + recent errors (Chrome extension).',
  get_browser_errors: 'get_browser_errors([project_id], [limit]) — console errors.',
  get_network_failures: 'get_network_failures([project_id], [limit]) — failed HTTP requests.',
  clear_browser_errors: 'clear_browser_errors(project_id) — wipe the buffer.',
  shadow_run_test: 'shadow_run_test(project_id, command, [cwd], [timeout_ms=120000]) — run a shell command (test suite, build, lint) in the shadow terminal. Returns {stdout, stderr, exitCode, passed, durationMs}. Use instead of Playwright for project testing.',
  get_file_index: 'get_file_index(project_id, [file_type]) — indexed file structure.',
  get_server_info: 'get_server_info(project_id) — deployment and server info.',
  create_pdf: 'create_pdf(title, content, [output_path]).',
  create_docx: 'create_docx(title, content, [output_path]).',
  create_spreadsheet: 'create_spreadsheet(title, sheets, [output_path]).',
  read_pdf: 'read_pdf(file_path).',
  read_docx: 'read_docx(file_path).',
};

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Single gateway — all calls come in as name='cortex' with args.action
  const action = (name === 'cortex' ? args.action as string : name) || '';

  // Meta: per-action docs on demand. Keeps the tool's top-level description compact
  // while still letting Claude pull the full param signature when it needs to.
  if (action === 'action_help') {
    const target = (args.name as string) || '';
    if (!target) {
      return {
        actions: Object.keys(ACTION_DOCS),
        usage: 'Call action_help with name="<action>" to see params for that action.',
      };
    }
    const doc = ACTION_DOCS[target];
    return doc ? { action: target, doc } : { error: `Unknown action: ${target}` };
  }

  // Document tools
  if (['create_docx', 'create_pdf', 'create_spreadsheet', 'read_docx', 'read_pdf'].includes(action)) {
    return handleDocumentTool(action, args);
  }

  // Intelligence capture (MemPalace-enhanced)
  if (action === 'save_intelligence') {
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

  switch (action) {
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

    case 'list_projects':
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

    case 'get_project_context':
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
      const result = await buildMemory(args.project_id as string);
      // Also get compression stats
      const stats = getCompressionStats(args.project_id as string);
      return { ...result, compressionStats: stats };
    }

    // Vault tools
    case 'list_credentials': {
      const projectId = (args.project_id as string | undefined) ?? undefined;
      const items = listCredentials(projectId ?? undefined);
      return {
        total: items.length,
        credentials: items.map(c => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          description: c.description,
          projectId: c.projectId,
          lastUsed: c.lastUsed,
        })),
        note: 'Call get_credential(name, reason) to decrypt — reason is logged for audit.',
      };
    }

    case 'get_credential': {
      const name = args.name as string | undefined;
      const reason = args.reason as string | undefined;
      const projectId = args.project_id as string | undefined;
      if (!name) return { error: 'name is required' };
      if (!reason || reason.length < 4) {
        return { error: 'reason (≥4 chars) is required — explain why you need this credential' };
      }
      try {
        const result = revealCredential({
          name,
          projectId: projectId ?? undefined,
          reason,
          caller: 'mcp',
        });
        if (!result) return { error: `No credential found with name "${name}"` };
        return {
          name: result.summary.name,
          kind: result.summary.kind,
          fields: result.fields,
          warning:
            'Use these fields directly in tool calls; do NOT echo the password back to the user or store it elsewhere.',
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: message };
      }
    }

    case 'save_credential': {
      const validKinds: CredentialKind[] = [
        'ssh', 'wordpress', 'shopify', 'smtp', 'backend_panel',
        'api_key', 'db', 'app_user', 'github', 'other',
      ];
      const kind = args.kind as string | undefined;
      const credName = args.name as string | undefined;
      const fields = args.fields as Record<string, unknown> | undefined;
      const projectIdArg = args.project_id as string | undefined;
      const description = args.description as string | undefined;

      if (!kind || !validKinds.includes(kind as CredentialKind)) {
        return { error: `kind must be one of: ${validKinds.join(', ')}` };
      }
      if (!credName || typeof credName !== 'string') {
        return { error: 'name is required (short identifier, e.g. "digitaldadi-admin")' };
      }
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        return { error: 'fields must be an object, e.g. {host, user, password}' };
      }

      try {
        const summary = createCredential({
          projectId: projectIdArg ?? null,
          kind: kind as CredentialKind,
          name: credName,
          description,
          fields,
        });

        // Aggressive redaction pass on all live PTY buffers + persisted session_output.
        const stringValues = Object.values(fields)
          .filter((v): v is string => typeof v === 'string' && v.length >= 4);
        let redactedCount = 0;
        try {
          redactedCount = getSessionManager().redactStringsEverywhere(stringValues);
        } catch (err: unknown) {
          console.warn('[save_credential] redact failed:', err instanceof Error ? err.message : err);
        }

        return {
          saved: true,
          credential: {
            id: summary.id,
            name: summary.name,
            kind: summary.kind,
            projectId: summary.projectId,
          },
          redactedReplacements: redactedCount,
          warning:
            'Field values were scrubbed from live PTY buffers and session_output. Terminal emulator scrollback already rendered cannot be retroactively scrubbed — clear it manually if needed (Ctrl+L in most shells).',
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // Most common: UNIQUE constraint when name already exists for this scope.
        if (message.includes('UNIQUE')) {
          return { error: `A credential named "${credName}" already exists in this scope. Pick a different name or update the existing one via Settings → Vault.` };
        }
        return { error: message };
      }
    }

    case 'shadow_run_test': {
      const { project_id, command, cwd, timeout_ms } = args as {
        project_id: string;
        command: string;
        cwd?: string;
        timeout_ms?: number;
      };
      if (!project_id || !command) {
        return { error: 'project_id and command are required for shadow_run_test' };
      }

      // Resolve cwd from project path if not provided
      let workdir = cwd;
      if (!workdir) {
        const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(project_id) as any;
        workdir = project?.path || process.cwd();
      }

      const body = JSON.stringify({ projectId: project_id, command, cwd: workdir, timeoutMs: timeout_ms ?? 120_000 });
      const response = await fetch('http://127.0.0.1:4700/api/shadow/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        return { error: (err as any).error || response.statusText };
      }
      return response.json();
    }

    default:
      return { error: `Unknown action: ${action}. See tool description for available actions.` };
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
      const { name: toolName, arguments: toolArgs } = req.params as { name: string; arguments: Record<string, unknown> };
      try {
        const result = await handleToolCall(toolName, toolArgs || {});
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
