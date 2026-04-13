import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getSessionManager } from '../sessions/session-manager.js';
import { getTerminalManager } from '../terminals/terminal-manager.js';
import { captureSnapshot, getResumeDiff, getLatestSnapshot } from '../sessions/snapshot.js';
import { injectContext, assembleContext } from '../intelligence/context-injector.js';
import { importClaudeSessions, importAllClaudeSessions } from '../intelligence/claude-session-importer.js';
import { generateHandoff, getHandoff } from '../intelligence/handoff-generator.js';
import { canSpawnSession } from '../intelligence/budget-guard.js';
import { resolveClaudeSessionId, projectPathToSlug, listClaudeSessionFiles } from '../sessions/claude-session-resolver.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import os from 'os';

export const sessionsRouter: ReturnType<typeof Router> = Router();

// GET /api/sessions — all sessions (optionally filtered by project)
sessionsRouter.get('/', (req, res) => {
  const mgr = getSessionManager();
  const projectId = req.query.project_id as string | undefined;
  const sessions = projectId ? mgr.getProjectSessions(projectId) : mgr.getAllSessions();
  res.json({ sessions });
});

// POST /api/sessions/import-all — import Claude Code sessions from ~/.claude/projects/
// MUST be before /:id routes (Express 5 routing)
sessionsRouter.post('/import-all', (_req, res) => {
  const results = importAllClaudeSessions();
  const total = results.reduce((s, r) => ({
    sessions: s.sessions + r.sessionsImported,
    prompts: s.prompts + r.promptsImported,
    memory: s.memory + r.memoryFilesImported,
  }), { sessions: 0, prompts: 0, memory: 0 });

  res.json({
    imported: results,
    total,
    message: `Imported ${total.sessions} sessions, ${total.prompts} prompts, ${total.memory} memory files`,
  });
});

// GET /api/sessions/active — only live sessions
sessionsRouter.get('/active', (_req, res) => {
  const mgr = getSessionManager();
  res.json({ sessions: mgr.getActiveSessions() });
});

// GET /api/sessions/live — unified view of ALL live work across projects:
// running claude sessions + standalone terminals not linked to a session.
// Used by the global Sessions dashboard and the active-project tab strip.
sessionsRouter.get('/live', (_req, res) => {
  const mgr = getSessionManager();
  const tmgr = getTerminalManager();
  const db = getDb();

  const activeSessions = mgr.getActiveSessions();
  const sessionTerminalIds = new Set(activeSessions.map(s => s.terminalId).filter(Boolean) as string[]);

  const allTerminals = tmgr.getAllTerminals();
  const standaloneTerminals = allTerminals.filter(t => t.status === 'running' && !sessionTerminalIds.has(t.id));

  const projectIds = new Set<string>([
    ...activeSessions.map(s => s.projectId),
    ...standaloneTerminals.map(t => t.projectId),
  ]);
  const projectNames = new Map<string, string>();
  if (projectIds.size > 0) {
    const placeholders = Array.from(projectIds).map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, name FROM projects WHERE id IN (${placeholders})`).all(...projectIds) as any[];
    for (const r of rows) projectNames.set(r.id, r.name);
  }

  const items = [
    ...activeSessions.map(s => ({
      kind: 'session' as const,
      id: s.id,
      projectId: s.projectId,
      projectName: projectNames.get(s.projectId) ?? 'Unknown',
      name: s.name,
      status: s.status,
      startedAt: s.startedAt,
      lastActive: s.lastActive,
      terminalId: s.terminalId,
      promptCount: s.promptCount,
    })),
    ...standaloneTerminals.map(t => ({
      kind: 'terminal' as const,
      id: t.id,
      projectId: t.projectId,
      projectName: projectNames.get(t.projectId) ?? 'Unknown',
      name: t.name,
      status: t.status,
      startedAt: t.createdAt,
      lastActive: t.createdAt,
      terminalId: t.id,
      type: t.type,
    })),
  ];

  // Group by project for the tab strip (preserve order: most recent lastActive first)
  items.sort((a, b) => (b.lastActive || '').localeCompare(a.lastActive || ''));
  const byProject = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byProject.get(it.projectId) ?? [];
    arr.push(it);
    byProject.set(it.projectId, arr);
  }
  const projects = Array.from(byProject.entries()).map(([projectId, liveItems]) => ({
    projectId,
    projectName: projectNames.get(projectId) ?? 'Unknown',
    items: liveItems,
    count: liveItems.length,
  }));

  res.json({ items, projects });
});

// GET /api/sessions/recent — recent sessions (optionally filtered by project)
sessionsRouter.get('/recent', (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit as string) || 10;
  const projectId = req.query.project_id as string | undefined;

  let query = `
    SELECT cs.*, sm.prompt_count, sm.token_usage_input, sm.token_usage_output,
           p.name as project_name
    FROM claude_sessions cs
    LEFT JOIN session_metrics sm ON sm.session_id = cs.id
    LEFT JOIN projects p ON p.id = cs.project_id
  `;
  const params: (string | number)[] = [];

  if (projectId) {
    query += ' WHERE cs.project_id = ?';
    params.push(projectId);
  }

  query += ' ORDER BY cs.last_active DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as any[];

  const sessions = rows.map(r => ({
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name || 'Unknown',
    name: r.name,
    status: r.status,
    startedAt: r.started_at,
    lastActive: r.last_active,
    promptCount: r.prompt_count || 0,
    tokenUsageInput: r.token_usage_input || 0,
    tokenUsageOutput: r.token_usage_output || 0,
  }));

  res.json({ sessions });
});

// GET /api/sessions/usage — usage summary
sessionsRouter.get('/usage', (_req, res) => {
  const mgr = getSessionManager();
  res.json(mgr.getUsageSummary());
});

// GET /api/sessions/usage/export — export usage as JSON (or CSV via ?format=csv)
sessionsRouter.get('/usage/export', (req, res) => {
  const db = getDb();
  const format = req.query.format as string || 'json';

  const rows = db.prepare(`
    SELECT ud.*, p.name as project_name
    FROM usage_daily ud
    JOIN projects p ON p.id = ud.project_id
    ORDER BY ud.date DESC, p.name
  `).all() as any[];

  if (format === 'csv') {
    const header = 'date,project_name,project_id,prompt_count,token_total,session_count';
    const lines = rows.map(r =>
      `${r.date},${r.project_name},${r.project_id},${r.prompt_count},${r.token_total},${r.session_count}`
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=cortex-usage.csv');
    res.send([header, ...lines].join('\n'));
    return;
  }

  res.json({ usage: rows });
});

// GET /api/sessions/claude-files?projectId=... — list Claude .jsonl session files scoped to a project's cwd
// (diagnostic — not the global picker). Returns { slug, files: [{ uuid, mtimeMs, sizeBytes }] }
// MUST be declared before `/:id` parameterized routes (Express 5 matches param routes eagerly).
sessionsRouter.get('/claude-files', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const db = getDb();
  const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const slug = projectPathToSlug(project.path);
  const files = listClaudeSessionFiles(project.path);
  res.json({ slug, projectPath: project.path, files });
});

// GET /api/sessions/:id/todos — parse live TodoWrite task list from session output buffer
// Must be before plain /:id (Express 5 routing)
sessionsRouter.get('/:id/todos', (req, res) => {
  const mgr = getSessionManager();
  const session = mgr.getSessionInfo(req.params.id);

  let buffer = '';
  if (session && session.status === 'running') {
    // Get the live output buffer for running sessions
    buffer = mgr.getSessionOutput(req.params.id, 102400);
  } else {
    // Fall back to DB output for completed sessions
    const db = getDb();
    const row = db.prepare('SELECT session_output FROM claude_sessions WHERE id = ?').get(req.params.id) as any;
    buffer = row?.session_output || '';
  }

  if (!buffer) {
    res.json({ todos: [] });
    return;
  }

  // Strip ANSI escape codes
  const clean = buffer
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\].*?\x07/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  // Find all TodoWrite/TodoRead JSON blobs in the output.
  // Claude Code emits tool calls as JSON: {"type":"tool_use","name":"TodoWrite","input":{"todos":[...]}}
  const todos: any[] = [];
  const todoPattern = /"name"\s*:\s*"Todo(?:Write|Read)"[\s\S]*?"todos"\s*:\s*(\[[\s\S]*?\])/g;
  let match: RegExpExecArray | null;
  while ((match = todoPattern.exec(clean)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        todos.splice(0, todos.length, ...parsed);
      }
    } catch {
      // malformed JSON, skip
    }
  }

  res.json({ todos });
});

// GET /api/sessions/:id — single session
sessionsRouter.get('/:id', (req, res) => {
  const mgr = getSessionManager();
  const session = mgr.getSessionInfo(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ session });
});

// GET /api/sessions/:id/output — recent terminal output (live or saved)
sessionsRouter.get('/:id/output', (req, res) => {
  const mgr = getSessionManager();
  const limit = parseInt(req.query.limit as string) || 51200;
  let output = mgr.getSessionOutput(req.params.id, limit);

  // If no live output, try saved output from DB (completed sessions)
  if (!output) {
    const db = getDb();
    const row = db.prepare('SELECT session_output FROM claude_sessions WHERE id = ?').get(req.params.id) as any;
    if (row?.session_output) {
      output = row.session_output;
    }
  }

  res.json({ output });
});

// GET /api/sessions/:id/history — prompt history
sessionsRouter.get('/:id/history', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM session_history WHERE session_id = ? ORDER BY timestamp ASC LIMIT 1000
  `).all(req.params.id);
  res.json({ history: rows });
});

// POST /api/sessions/:id/resume — resume a completed session with its context
sessionsRouter.post('/:id/resume', async (req, res) => {
  const db = getDb();
  const oldSession = db.prepare('SELECT * FROM claude_sessions WHERE id = ?').get(req.params.id) as any;
  if (!oldSession) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(oldSession.project_id) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Inject fresh context file (CLAUDE.md etc.) — Claude --resume reads it automatically
  try { injectContext(oldSession.project_id, project.path); } catch { /* */ }

  // Spawn terminal + session — always resolve to a SPECIFIC Claude session ID.
  // Never fall back to bare `claude --resume` — that opens Claude's interactive
  // picker which lists sessions from ALL projects globally (Claude CLI behavior,
  // not scoped by cwd). We scan ~/.claude/projects/<slug>/ to find a match.
  const tmgr = getTerminalManager();
  let claudeSessionId: string | null = oldSession.claude_session_id;
  if (!claudeSessionId) {
    claudeSessionId = resolveClaudeSessionId({
      projectPath: project.path,
      startedAt: oldSession.started_at,
      lastActive: oldSession.last_active,
    });
    if (claudeSessionId) {
      // Persist for future resumes so we don't re-scan every time
      db.prepare('UPDATE claude_sessions SET claude_session_id = ? WHERE id = ?').run(claudeSessionId, oldSession.id);
      console.log(`[sessions] Resolved missing claude_session_id via disk scan: ${claudeSessionId}`);
    }
  }
  if (!claudeSessionId) {
    res.status(409).json({
      error: 'Could not resolve Claude session ID',
      detail: `No matching .jsonl found in ~/.claude/projects/${projectPathToSlug(project.path)}/ for session "${oldSession.name}". The Claude session files may have been deleted, or this session predates Claude\'s on-disk history.`,
    });
    return;
  }
  const colorEnv = 'FORCE_COLOR=3 COLORTERM=truecolor TERM=xterm-256color';
  const resumeCmd = `${colorEnv} claude --resume ${claudeSessionId}`;
  const baseName = oldSession.name.replace(/\s*\(resumed\)\s*$/i, '').trim();
  const resumedName = `${baseName} (resumed)`;
  const terminal = tmgr.spawn(oldSession.project_id, resumedName, project.path, 'ai_session', 120, 40, resumeCmd);

  const mgr = getSessionManager();
  const session = mgr.spawnSession(oldSession.project_id, resumedName, project.path, true);

  db.prepare('UPDATE claude_sessions SET terminal_id = ? WHERE id = ?').run(terminal.id, session.id);
  mgr.setTerminalId(session.id, terminal.id);

  // Wire terminal events to session tracking
  tmgr.on('terminal:output', ({ terminalId, data }: { terminalId: string; data: string }) => {
    if (terminalId === terminal.id) mgr.recordTerminalOutput(terminalId, data);
  });
  tmgr.on('terminal:exit', ({ terminalId, exitCode }: { terminalId: string; exitCode: number }) => {
    if (terminalId === terminal.id) mgr.markSessionCompleted(terminalId, exitCode);
  });

  console.log(`[sessions] Resumed session ${oldSession.name} → ${session.id} (claude --resume handles context)`);

  db.prepare('UPDATE projects SET last_opened = ? WHERE id = ?').run(new Date().toISOString(), oldSession.project_id);

  res.status(201).json({
    session: { ...session, terminalId: terminal.id },
    terminalId: terminal.id,
    resumedFrom: oldSession.id,
  });
});

// POST /api/sessions — spawn a new session
sessionsRouter.post('/', async (req, res) => {
  const { project_id, name } = req.body;

  if (!project_id || !name) {
    res.status(400).json({ error: 'project_id and name are required' });
    return;
  }

  // Get project path
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (!fs.existsSync(project.path)) {
    res.status(400).json({ error: `Project path does not exist: ${project.path}` });
    return;
  }

  // Check budget before spawning
  const budget = canSpawnSession();
  if (!budget.allowed) {
    res.status(429).json({ error: budget.reason });
    return;
  }

  // Capture snapshot before starting
  try {
    await captureSnapshot(project_id, project.path, null);
  } catch {
    // Non-fatal
  }

  // Inject Cortex intelligence context before spawn
  let contextInjected = false;
  try {
    const ctx = await injectContext(project_id, project.path);
    contextInjected = ctx.written;
    if (ctx.written) {
      console.log(`[sessions] Injected context for ${project.name}: ~${ctx.tokenCount} tokens`);
    }
  } catch {
    // Non-fatal — session can still run without context
  }

  // Update project last_opened
  db.prepare('UPDATE projects SET last_opened = ? WHERE id = ?')
    .run(new Date().toISOString(), project_id);

  // Spawn a terminal with `claude` command using the terminal manager
  // (uses ring-buffer polling which works reliably with XTerminal frontend)
  // Always start fresh — explicit resume uses the resume endpoint with --resume flag
  // Pass --name so Claude stores the session with a name we can identify for resume
  const tmgr = getTerminalManager();
  const safeName = name.replace(/['"\\]/g, '');
  const colorEnv = 'FORCE_COLOR=3 COLORTERM=truecolor TERM=xterm-256color';
  const terminal = tmgr.spawn(project_id, name, project.path, 'ai_session', 120, 40, `${colorEnv} claude --name "${safeName}"`);

  // Also create session record for tracking metrics (skip spawning claude — terminal handles it)
  const mgr = getSessionManager();
  const session = mgr.spawnSession(project_id, name, project.path, true);

  // Link the terminal to the session (DB + in-memory)
  db.prepare('UPDATE claude_sessions SET terminal_id = ? WHERE id = ?').run(terminal.id, session.id);
  mgr.setTerminalId(session.id, terminal.id);

  // Capture Claude Code's session ID from terminal output for proper resume
  let claudeIdCaptured = false;
  const captureClaudeSessionId = ({ terminalId, data }: { terminalId: string; data: string }) => {
    if (terminalId !== terminal.id || claudeIdCaptured) return;
    // Claude Code outputs session info like "session: abc123" or in its status bar
    // The most reliable way is to check ~/.claude/projects/ after Claude starts
    // For now, capture from the output buffer after Claude boots
    const stripped = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    // Claude Code v2+ shows session ID in output or we can read from filesystem
    const sessionIdMatch = stripped.match(/session[:\s]+([a-f0-9-]{36})/i)
      || stripped.match(/Resuming session[:\s]+([a-f0-9-]{36})/i);
    if (sessionIdMatch) {
      claudeIdCaptured = true;
      const claudeSessionId = sessionIdMatch[1];
      db.prepare('UPDATE claude_sessions SET claude_session_id = ? WHERE id = ?').run(claudeSessionId, session.id);
      console.log(`[sessions] Captured Claude session ID: ${claudeSessionId} for ${session.id}`);
    }
  };

  // Wire terminal output + exit events to session tracking
  tmgr.on('terminal:output', ({ terminalId, data }: { terminalId: string; data: string }) => {
    if (terminalId === terminal.id) {
      mgr.recordTerminalOutput(terminalId, data);
      captureClaudeSessionId({ terminalId, data });
    }
  });
  tmgr.on('terminal:exit', ({ terminalId, exitCode }: { terminalId: string; exitCode: number }) => {
    if (terminalId === terminal.id) {
      mgr.markSessionCompleted(terminalId, exitCode);
    }
  });

  // Fallback: after Claude boots, read the session ID from Claude's project dir.
  // Claude encodes the cwd as dir name: /home/x/proj -> -home-x-proj (leading dash kept),
  // and stores sessions as <uuid>.jsonl files. Snapshot existing IDs before the wait so we
  // pick up only the session created by *this* spawn, not a pre-existing one.
  const home = process.env.HOME || os.homedir();
  const claudeProjectDir = `${home}/.claude/projects/${project.path.replace(/\//g, '-')}`;
  const preExisting = new Set<string>();
  try {
    if (fs.existsSync(claudeProjectDir)) {
      for (const f of fs.readdirSync(claudeProjectDir)) {
        if (f.endsWith('.jsonl')) preExisting.add(f.replace(/\.jsonl$/, ''));
      }
    }
  } catch { /* */ }

  setTimeout(() => {
    if (claudeIdCaptured) return;
    try {
      if (!fs.existsSync(claudeProjectDir)) return;
      const fresh = fs.readdirSync(claudeProjectDir)
        .filter((f: string) => f.endsWith('.jsonl'))
        .map((f: string) => ({ id: f.replace(/\.jsonl$/, ''), mtime: fs.statSync(`${claudeProjectDir}/${f}`).mtimeMs }))
        .filter(s => !preExisting.has(s.id))
        .sort((a, b) => b.mtime - a.mtime);
      if (fresh.length > 0) {
        const claudeId = fresh[0].id;
        db.prepare('UPDATE claude_sessions SET claude_session_id = ? WHERE id = ?').run(claudeId, session.id);
        claudeIdCaptured = true;
        console.log(`[sessions] Captured Claude session ID from filesystem: ${claudeId} for ${session.id}`);
      }
    } catch (err) {
      console.warn('[sessions] Failed to capture Claude session ID from filesystem:', err);
    }
  }, 8000);

  // AUTO-INJECT context as Claude's FIRST prompt after it boots
  // This ensures Claude has project intelligence from the start without needing to read files
  if (contextInjected) {
    const { content: contextContent } = assembleContext(project_id);
    if (contextContent) {
      // Wait for Claude to boot (~4 seconds), then send the context as first prompt
      setTimeout(() => {
        const firstPrompt = `Read and internalize this project context from Cortex (our AI workspace). Use it to inform all your responses in this session. Do NOT summarize it back to me — just acknowledge briefly and wait for my actual task.\n\n${contextContent}`;
        tmgr.write(terminal.id, firstPrompt + '\r');
        console.log(`[sessions] Auto-injected context into session ${session.id} (~${contextContent.length} chars)`);
      }, 5000);
    }
  }

  res.status(201).json({
    session: { ...session, terminalId: terminal.id },
    terminalId: terminal.id,
  });
});

// POST /api/sessions/:id/input — send input to session
sessionsRouter.post('/:id/input', (req, res) => {
  const { input } = req.body;
  if (input === undefined || input === null) {
    res.status(400).json({ error: 'input is required' });
    return;
  }

  const mgr = getSessionManager();
  const success = mgr.sendInput(req.params.id, String(input));
  if (!success) {
    res.status(404).json({ error: 'Session not found or not running' });
    return;
  }
  res.json({ success: true });
});

// POST /api/sessions/:id/resize — resize terminal
sessionsRouter.post('/:id/resize', (req, res) => {
  const { cols, rows } = req.body;
  const mgr = getSessionManager();
  const success = mgr.resizeSession(req.params.id, cols || 120, rows || 40);
  res.json({ success });
});

// POST /api/sessions/:id/stop — graceful stop
sessionsRouter.post('/:id/stop', async (req, res) => {
  const mgr = getSessionManager();
  const session = mgr.getSessionInfo(req.params.id);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Capture snapshot before stopping
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(session.projectId) as any;
  if (project) {
    try {
      await captureSnapshot(session.projectId, project.path, session.id);
    } catch {
      // Non-fatal
    }
  }

  const success = mgr.stopSession(req.params.id);

  // Generate handoff document after stopping
  if (success && project) {
    try {
      await generateHandoff(session.id, session.projectId, project.path);
    } catch {
      // Non-fatal
    }
  }

  res.json({ success });
});

// DELETE /api/sessions/:id/permanent — delete session + all history from DB
// MUST be before /:id to avoid Express 5 matching "permanent" as :id
sessionsRouter.delete('/:id/permanent', (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM claude_sessions WHERE id = ?').get(req.params.id) as any;
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Kill if still running
  const mgr = getSessionManager();
  mgr.killSession(req.params.id);

  // CASCADE delete handles session_history, session_metrics, execution_history, etc.
  db.prepare('DELETE FROM claude_sessions WHERE id = ?').run(req.params.id);

  res.json({ success: true, deleted: req.params.id });
});

// DELETE /api/sessions/:id — force kill running session
sessionsRouter.delete('/:id', (req, res) => {
  const mgr = getSessionManager();
  const success = mgr.killSession(req.params.id);
  if (!success) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ success: true });
});

// GET /api/sessions/:id/resume-diff — what changed since last session
sessionsRouter.get('/:id/resume-diff', async (req, res) => {
  const mgr = getSessionManager();
  const session = mgr.getSessionInfo(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(session.projectId) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const diff = await getResumeDiff(session.projectId, project.path);
  res.json({ diff });
});

// GET /api/sessions/:id/handoff — get handoff document for session's project
sessionsRouter.get('/:id/handoff', async (req, res) => {
  const mgr = getSessionManager();
  const session = mgr.getSessionInfo(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(session.projectId) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const content = await getHandoff(project.path);
  res.json({ handoff: content });
});

// POST /api/sessions/:id/handoff — generate handoff now
sessionsRouter.post('/:id/handoff', async (req, res) => {
  const mgr = getSessionManager();
  const session = mgr.getSessionInfo(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(session.projectId) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const result = await generateHandoff(session.id, session.projectId, project.path);
  res.json(result);
});

// Snapshot routes

// GET /api/snapshots/:projectId — get snapshots for a project
sessionsRouter.get('/snapshots/:projectId', (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit as string) || 20;
  const rows = db.prepare(`
    SELECT * FROM project_snapshots WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?
  `).all(req.params.projectId, limit);

  const snapshots = rows.map((row: any) => ({
    ...row,
    uncommitted_files: JSON.parse(row.uncommitted_files || '[]'),
    open_terminals: JSON.parse(row.open_terminals || '[]'),
    running_services: JSON.parse(row.running_services || '[]'),
  }));

  res.json({ snapshots });
});

// GET /api/snapshots/:projectId/latest — latest snapshot
sessionsRouter.get('/snapshots/:projectId/latest', (req, res) => {
  const snapshot = getLatestSnapshot(req.params.projectId);
  res.json({ snapshot });
});
