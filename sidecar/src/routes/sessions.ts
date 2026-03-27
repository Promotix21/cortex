import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getSessionManager } from '../sessions/session-manager.js';
import { captureSnapshot, getResumeDiff, getLatestSnapshot } from '../sessions/snapshot.js';
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

// GET /api/sessions/:id/output — recent terminal output
sessionsRouter.get('/:id/output', (req, res) => {
  const mgr = getSessionManager();
  const limit = parseInt(req.query.limit as string) || 4096;
  const output = mgr.getSessionOutput(req.params.id, limit);
  res.json({ output });
});

// GET /api/sessions/:id/history — prompt history
sessionsRouter.get('/:id/history', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM session_history WHERE session_id = ? ORDER BY timestamp ASC
  `).all(req.params.id);
  res.json({ history: rows });
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

  // Capture snapshot before starting
  try {
    await captureSnapshot(project_id, project.path, null);
  } catch {
    // Non-fatal
  }

  // Update project last_opened
  db.prepare('UPDATE projects SET last_opened = ? WHERE id = ?')
    .run(new Date().toISOString(), project_id);

  const mgr = getSessionManager();
  const session = mgr.spawnSession(project_id, name, project.path);
  res.status(201).json({ session });
});

// POST /api/sessions/:id/input — send input to session
sessionsRouter.post('/:id/input', (req, res) => {
  const { input } = req.body;
  if (!input) {
    res.status(400).json({ error: 'input is required' });
    return;
  }

  const mgr = getSessionManager();
  const success = mgr.sendInput(req.params.id, input);
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
  res.json({ success });
});

// DELETE /api/sessions/:id — force kill
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
