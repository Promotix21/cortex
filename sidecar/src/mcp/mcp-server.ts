import { createServer, IncomingMessage, ServerResponse } from 'http';
import { getDb } from '../db/index.js';
import { getProjectBrain } from '../chat/chat-service.js';
import { assembleContext } from '../intelligence/context-injector.js';
import { DOCUMENT_TOOLS, handleDocumentTool } from './document-builder.js';

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
];

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Document tools (create_docx, create_pdf, create_spreadsheet, read_docx, read_pdf)
  if (['create_docx', 'create_pdf', 'create_spreadsheet', 'read_docx', 'read_pdf'].includes(name)) {
    return handleDocumentTool(name, args);
  }

  // Intelligence capture
  if (name === 'save_intelligence') {
    const db = getDb();
    const { project_id, type, content } = args as { project_id: string; type: string; content: string };
    const now = new Date().toISOString();

    if (type === 'decision' || type === 'known_issue' || type === 'server' || type === 'convention') {
      const fieldMap: Record<string, string> = { decision: 'decisions', known_issue: 'known_issues', server: 'architecture_notes', convention: 'conventions' };
      const field = fieldMap[type];
      const brain = db.prepare(`SELECT ${field} FROM project_brain WHERE project_id = ?`).get(project_id) as any;
      if (brain) {
        const existing = brain[field] || '';
        const updated = existing + `\n\n--- Captured ${new Date().toLocaleDateString()} ---\n${content}`;
        db.prepare(`UPDATE project_brain SET ${field} = ?, updated_at = ? WHERE project_id = ?`).run(updated, now, project_id);
      }
      return { success: true, saved: type };
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
          serverInfo: { name: 'cortex-mcp', version: '0.2.0' },
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
