import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getSessionManager } from '../sessions/session-manager.js';
import { getTerminalManager } from '../terminals/terminal-manager.js';
import { captureSnapshot, getResumeDiff, getLatestSnapshot } from '../sessions/snapshot.js';
import { injectContext, assembleContext } from '../intelligence/context-injector.js';
import { importClaudeSessions, importAllClaudeSessions } from '../intelligence/claude-session-importer.js';
import { generateHandoff, getHandoff } from '../intelligence/handoff-generator.js';
import { canSpawnSession } from '../intelligence/budget-guard.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs';

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

  // Build resume context from old session
  const oldHistory = db.prepare('SELECT prompt_text FROM session_history WHERE session_id = ? ORDER BY timestamp ASC').all(oldSession.id) as any[];
  const oldOutput = oldSession.session_output || '';
  const handoff = await getHandoff(project.path);

  let resumeContext = `You are resuming a previous Claude Code session named "${oldSession.name}".\n\n`;

  if (handoff) {
    resumeContext += `--- HANDOFF FROM PREVIOUS SESSION ---\n${handoff}\n\n`;
  }

  if (oldHistory.length > 0) {
    resumeContext += `--- PREVIOUS SESSION PROMPTS (${oldHistory.length}) ---\n`;
    for (const h of oldHistory.slice(-10)) {
      resumeContext += `> ${h.prompt_text}\n`;
    }
    resumeContext += '\n';
  }

  if (oldOutput) {
    // Include last 3000 chars of output for context
    const trimmedOutput = oldOutput.slice(-3000);
    resumeContext += `--- PREVIOUS SESSION OUTPUT (last 3000 chars) ---\n${trimmedOutput}\n\n`;
  }

  resumeContext += 'Continue from where the previous session left off. Ask me what to work on next.';

  // Inject fresh context
  try { injectContext(oldSession.project_id, project.path); } catch { /* */ }

  // Spawn terminal + session
  const tmgr = getTerminalManager();
  const terminal = tmgr.spawn(oldSession.project_id, `${oldSession.name} (resumed)`, project.path, 'ai_session', 120, 40, 'claude');

  const mgr = getSessionManager();
  const session = mgr.spawnSession(oldSession.project_id, `${oldSession.name} (resumed)`, project.path, true);

  try { db.exec('ALTER TABLE claude_sessions ADD COLUMN terminal_id TEXT DEFAULT NULL'); } catch { /* */ }
  db.prepare('UPDATE claude_sessions SET terminal_id = ? WHERE id = ?').run(terminal.id, session.id);
  mgr.setTerminalId(session.id, terminal.id);

  // Auto-inject resume context after Claude boots
  setTimeout(() => {
    tmgr.write(terminal.id, resumeContext + '\r');
    console.log(`[sessions] Resumed session ${oldSession.name} → ${session.id} with ${resumeContext.length} chars context`);
  }, 5000);

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
    const ctx = injectContext(project_id, project.path);
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
  const tmgr = getTerminalManager();
  const terminal = tmgr.spawn(project_id, name, project.path, 'ai_session', 120, 40, 'claude');

  // Also create session record for tracking metrics (skip spawning claude — terminal handles it)
  const mgr = getSessionManager();
  const session = mgr.spawnSession(project_id, name, project.path, true);

  // Link the terminal to the session (DB + in-memory)
  try {
    db.exec('ALTER TABLE claude_sessions ADD COLUMN terminal_id TEXT DEFAULT NULL');
  } catch { /* column may already exist */ }
  db.prepare('UPDATE claude_sessions SET terminal_id = ? WHERE id = ?').run(terminal.id, session.id);
  mgr.setTerminalId(session.id, terminal.id);

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
