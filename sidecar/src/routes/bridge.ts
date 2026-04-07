import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getBridgeClient } from '../bridge/bridge-client.js';
import { v4 as uuid } from 'uuid';
import { createErrorSignature } from '../intelligence/error-normalizer.js';

export const bridgeRouter: ReturnType<typeof Router> = Router();

// Track Chrome extension activity + active tab
let lastExtensionPing = 0;
let activeTab: { url: string; title: string; tabId?: number; projectId: string | null; timestamp: number } | null = null;

// GET /api/bridge/status — bridge connection status
bridgeRouter.get('/status', (_req, res) => {
  const client = getBridgeClient();
  const extensionActive = Date.now() - lastExtensionPing < 30000;
  res.json({
    connected: client.isConnected || extensionActive,
    bridgeServer: client.isConnected,
    chromeExtension: extensionActive,
    activeTab: activeTab && (Date.now() - activeTab.timestamp < 60000) ? activeTab : null,
  });
});

// POST /api/bridge/tab — receive active tab from Chrome extension heartbeat
bridgeRouter.post('/tab', (req, res) => {
  lastExtensionPing = Date.now();
  const db = getDb();
  const { url, title, tab_id } = req.body;
  if (!url) { res.json({ ok: false }); return; }
  const projectId = findProjectByUrl(db, url);
  activeTab = { url, title: title || '', tabId: tab_id, projectId, timestamp: Date.now() };
  res.json({ ok: true, projectId });
});

// GET /api/bridge/active-tab — current active browser tab
bridgeRouter.get('/active-tab', (_req, res) => {
  if (!activeTab || Date.now() - activeTab.timestamp > 60000) {
    res.json({ active: false });
    return;
  }
  res.json({ active: true, ...activeTab });
});

// POST /api/bridge/errors — receive errors from Chrome extension OR cortex-node npm package
bridgeRouter.post('/errors', (req, res) => {
  lastExtensionPing = Date.now();
  const db = getDb();
  const { error_type, message, stack, source, url, tab_url, project_id } = req.body;
  if (!message) { res.status(400).json({ error: 'message required' }); return; }

  // Accept direct project_id (from cortex-node npm package) or resolve from URL
  const projectId = project_id || findProjectByUrl(db, tab_url || url) || 'unknown';
  const errorSig = createErrorSignature(error_type || 'error', message || '');

  try {
    db.prepare(`INSERT INTO captured_errors (id, project_id, error_type, message, stack, source, error_signature, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuid(), projectId, error_type || 'error', (message || '').slice(0, 2000), stack || '', source || tab_url || '', errorSig, new Date().toISOString());
    res.json({ saved: true });
  } catch {
    res.json({ saved: false });
  }
});

// POST /api/bridge/network — receive network failures from Chrome extension
bridgeRouter.post('/network', (req, res) => {
  lastExtensionPing = Date.now();
  const db = getDb();
  const { method, url, status_code, duration_ms, failed, error, tab_url } = req.body;
  if (!url) { res.status(400).json({ error: 'url required' }); return; }

  // Prefer tab_url for project matching (the page context), fall back to request URL
  const projectId = findProjectByUrl(db, tab_url || url) || 'unknown';

  try {
    db.prepare(`INSERT INTO captured_network (id, project_id, method, url, status_code, duration_ms, failed, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuid(), projectId, method || 'GET', (url || '').slice(0, 500), status_code || 0, duration_ms || 0, failed || 0, new Date().toISOString());
    res.json({ saved: true });
  } catch {
    res.json({ saved: false });
  }
});

// Match a URL to a project — by port first, then hostname pattern against project name/path
function findProjectByUrl(db: any, url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);

    // 1. Port match (localhost dev servers)
    const port = parseInt(parsed.port);
    if (port) {
      const project = db.prepare('SELECT id FROM projects WHERE dev_server_port = ?').get(port) as any;
      if (project) return project.id;
    }

    // 2. Hostname match — check if any project name or path segment appears in the hostname
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      const hostname = parsed.hostname.toLowerCase();
      const projects = db.prepare('SELECT id, name, path FROM projects').all() as any[];
      for (const p of projects) {
        const name = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const pathBase = (p.path || '').split('/').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
        if (name && hostname.includes(name)) return p.id;
        if (pathBase && pathBase.length > 3 && hostname.includes(pathBase)) return p.id;
      }
    }
  } catch { /* not a valid URL */ }
  return null;
}

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
