import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getTerminalManager } from '../terminals/terminal-manager.js';
import type { TerminalType } from '../terminals/terminal-manager.js';
import fs from 'fs';

export const terminalsRouter: ReturnType<typeof Router> = Router();

// GET /api/terminals — all active terminals (optionally by project)
terminalsRouter.get('/', (req, res) => {
  const mgr = getTerminalManager();
  const projectId = req.query.project_id as string | undefined;
  const terminals = projectId ? mgr.getProjectTerminals(projectId) : mgr.getAllTerminals();
  res.json({ terminals });
});

// GET /api/terminals/:id — single terminal info
terminalsRouter.get('/:id', (req, res) => {
  const mgr = getTerminalManager();
  const terminal = mgr.getTerminal(req.params.id);
  if (!terminal) {
    res.status(404).json({ error: 'Terminal not found' });
    return;
  }
  res.json({ terminal });
});

// GET /api/terminals/:id/output — full output buffer
terminalsRouter.get('/:id/output', (req, res) => {
  const mgr = getTerminalManager();
  const limit = parseInt(req.query.limit as string) || 8192;
  const output = mgr.getOutput(req.params.id, limit);
  res.json({ output });
});

// GET /api/terminals/:id/poll — poll for new output since seq
terminalsRouter.get('/:id/poll', (req, res) => {
  const mgr = getTerminalManager();
  const sinceSeq = parseInt(req.query.since as string) || -1;
  const result = mgr.pollOutput(req.params.id, sinceSeq);
  res.json(result);
});

// POST /api/terminals — spawn a new terminal
terminalsRouter.post('/', (req, res) => {
  const { project_id, name, type = 'shell', cols = 120, rows = 40, command } = req.body;

  if (!project_id || !name) {
    res.status(400).json({ error: 'project_id and name are required' });
    return;
  }

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

  const validTypes: TerminalType[] = ['shell', 'ai_session', 'dev_server', 'git'];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    return;
  }

  const mgr = getTerminalManager();
  const terminal = mgr.spawn(project_id, name, project.path, type, cols, rows, command);
  res.status(201).json({ terminal });
});

// POST /api/terminals/:id/write — send input
terminalsRouter.post('/:id/write', (req, res) => {
  const { data } = req.body;
  if (data === undefined || data === null) {
    res.status(400).json({ error: 'data is required' });
    return;
  }

  const mgr = getTerminalManager();
  const success = mgr.write(req.params.id, data);
  if (!success) {
    res.status(404).json({ error: 'Terminal not found or not running' });
    return;
  }
  res.json({ success: true });
});

// POST /api/terminals/:id/resize — resize terminal
terminalsRouter.post('/:id/resize', (req, res) => {
  const { cols = 120, rows = 40 } = req.body;
  const mgr = getTerminalManager();
  const success = mgr.resize(req.params.id, cols, rows);
  res.json({ success });
});

// POST /api/terminals/:id/rename — rename terminal
terminalsRouter.post('/:id/rename', (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const mgr = getTerminalManager();
  const success = mgr.rename(req.params.id, name);
  res.json({ success });
});

// POST /api/terminals/:id/clear — clear output
terminalsRouter.post('/:id/clear', (req, res) => {
  const mgr = getTerminalManager();
  const success = mgr.clear(req.params.id);
  res.json({ success });
});

// POST /api/terminals/:id/restart — restart terminal
terminalsRouter.post('/:id/restart', (req, res) => {
  const db = getDb();
  const mgr = getTerminalManager();
  const existing = mgr.getTerminal(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Terminal not found' });
    return;
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(existing.projectId) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const terminal = mgr.restart(req.params.id, project.path);
  if (!terminal) {
    res.status(500).json({ error: 'Failed to restart terminal' });
    return;
  }
  res.json({ terminal });
});

// DELETE /api/terminals/:id — kill terminal
terminalsRouter.delete('/:id', (req, res) => {
  const mgr = getTerminalManager();
  const success = mgr.kill(req.params.id);
  if (!success) {
    res.status(404).json({ error: 'Terminal not found' });
    return;
  }
  res.json({ success: true });
});
