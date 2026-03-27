import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getBridgeClient } from '../bridge/bridge-client.js';

export const bridgeRouter: ReturnType<typeof Router> = Router();

// GET /api/bridge/status — bridge connection status
bridgeRouter.get('/status', (_req, res) => {
  const client = getBridgeClient();
  res.json({ connected: client.isConnected });
});

// GET /api/bridge/errors/:projectId — captured errors for a project
bridgeRouter.get('/errors/:projectId', (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit as string) || 50;
  const errors = db.prepare(`
    SELECT ce.*, dm.solution as matched_solution, dm.problem as matched_problem
    FROM captured_errors ce
    LEFT JOIN debug_memory dm ON dm.id = ce.matched_debug_id
    WHERE ce.project_id = ?
    ORDER BY ce.timestamp DESC LIMIT ?
  `).all(req.params.projectId, limit);
  res.json({ errors });
});

// DELETE /api/bridge/errors/:projectId — clear errors for a project
bridgeRouter.delete('/errors/:projectId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM captured_errors WHERE project_id = ?').run(req.params.projectId);
  res.json({ success: true });
});

// GET /api/bridge/network/:projectId — captured network requests
bridgeRouter.get('/network/:projectId', (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit as string) || 50;
  const requests = db.prepare(
    'SELECT * FROM captured_network WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?'
  ).all(req.params.projectId, limit);
  res.json({ requests });
});
