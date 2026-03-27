import { Router } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

export const referenceRouter: ReturnType<typeof Router> = Router();

// ==================== TOOLS ====================

referenceRouter.get('/tools', (_req, res) => {
  const db = getDb();
  const tools = db.prepare('SELECT * FROM tools ORDER BY name').all();
  res.json({ tools });
});

referenceRouter.post('/tools', (req, res) => {
  const { name, category = 'general', doc_url } = req.body;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  const db = getDb();
  const id = uuid();
  db.prepare('INSERT INTO tools (id, name, category, doc_url) VALUES (?, ?, ?, ?)').run(id, name, category, doc_url || null);
  res.status(201).json({ tool: db.prepare('SELECT * FROM tools WHERE id = ?').get(id) });
});

referenceRouter.delete('/tools/:id', (req, res) => {
  getDb().prepare('DELETE FROM tools WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== VERSIONS ====================

referenceRouter.get('/tools/:toolId/versions', (req, res) => {
  const versions = getDb().prepare('SELECT * FROM tool_versions WHERE tool_id = ? ORDER BY release_date DESC').all(req.params.toolId);
  res.json({ versions });
});

referenceRouter.post('/tools/:toolId/versions', (req, res) => {
  const { version, release_notes, release_date } = req.body;
  if (!version) { res.status(400).json({ error: 'version required' }); return; }
  const db = getDb();
  const id = uuid();
  db.prepare('INSERT INTO tool_versions (id, tool_id, version, release_notes, release_date) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.toolId, version, release_notes || null, release_date || null);
  res.status(201).json({ version: db.prepare('SELECT * FROM tool_versions WHERE id = ?').get(id) });
});

// ==================== COMMANDS ====================

referenceRouter.get('/commands', (req, res) => {
  const { tool_id, version, os } = req.query;
  const db = getDb();
  let query = 'SELECT c.*, t.name as tool_name FROM commands c JOIN tools t ON t.id = c.tool_id WHERE 1=1';
  const params: any[] = [];
  if (tool_id) { query += ' AND c.tool_id = ?'; params.push(tool_id); }
  if (version) { query += ' AND c.version = ?'; params.push(version); }
  if (os) { query += " AND (c.os = ? OR c.os = 'all')"; params.push(os); }
  query += ' ORDER BY c.deprecated, t.name, c.command';
  res.json({ commands: db.prepare(query).all(...params) });
});

referenceRouter.post('/commands', (req, res) => {
  const { tool_id, version, os = 'all', command, description, deprecated = false, replacement } = req.body;
  if (!tool_id || !version || !command) { res.status(400).json({ error: 'tool_id, version, command required' }); return; }
  const db = getDb();
  const id = uuid();
  db.prepare('INSERT INTO commands (id, tool_id, version, os, command, description, deprecated, replacement) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, tool_id, version, os, command, description || '', deprecated ? 1 : 0, replacement || null);
  res.status(201).json({ command: db.prepare('SELECT * FROM commands WHERE id = ?').get(id) });
});

referenceRouter.delete('/commands/:id', (req, res) => {
  getDb().prepare('DELETE FROM commands WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== API CHANGES ====================

referenceRouter.get('/changes', (req, res) => {
  const { tool_id } = req.query;
  const db = getDb();
  let query = 'SELECT ac.*, t.name as tool_name FROM api_changes ac JOIN tools t ON t.id = ac.tool_id';
  const params: any[] = [];
  if (tool_id) { query += ' WHERE ac.tool_id = ?'; params.push(tool_id); }
  query += ' ORDER BY ac.created_at DESC';
  res.json({ changes: db.prepare(query).all(...params) });
});

referenceRouter.post('/changes', (req, res) => {
  const { tool_id, version, change_type, old_usage, new_usage, notes } = req.body;
  if (!tool_id || !version || !change_type) { res.status(400).json({ error: 'tool_id, version, change_type required' }); return; }
  const db = getDb();
  const id = uuid();
  db.prepare('INSERT INTO api_changes (id, tool_id, version, change_type, old_usage, new_usage, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, tool_id, version, change_type, old_usage || null, new_usage || null, notes || null);
  res.status(201).json({ change: db.prepare('SELECT * FROM api_changes WHERE id = ?').get(id) });
});

// ==================== PROJECT-TOOL BINDING ====================

referenceRouter.get('/project-tools/:projectId', (req, res) => {
  const db = getDb();
  const bindings = db.prepare(`
    SELECT pt.*, t.name as tool_name, t.category FROM project_tools pt
    JOIN tools t ON t.id = pt.tool_id WHERE pt.project_id = ?
  `).all(req.params.projectId);
  res.json({ bindings });
});

referenceRouter.post('/project-tools/:projectId', (req, res) => {
  const { tool_id, pinned_version } = req.body;
  if (!tool_id || !pinned_version) { res.status(400).json({ error: 'tool_id and pinned_version required' }); return; }
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO project_tools (project_id, tool_id, pinned_version) VALUES (?, ?, ?)')
    .run(req.params.projectId, tool_id, pinned_version);
  res.json({ success: true });
});

referenceRouter.delete('/project-tools/:projectId/:toolId', (req, res) => {
  getDb().prepare('DELETE FROM project_tools WHERE project_id = ? AND tool_id = ?').run(req.params.projectId, req.params.toolId);
  res.json({ success: true });
});
