import { Router } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

export const intelligenceRouter: ReturnType<typeof Router> = Router();

// ==================== PATTERN MEMORY ====================

// GET /api/intelligence/patterns — list patterns (optional ?project_id, ?search, ?scope)
intelligenceRouter.get('/patterns', (req, res) => {
  const db = getDb();
  const { project_id, search, scope } = req.query;

  let query = 'SELECT * FROM pattern_memory WHERE 1=1';
  const params: any[] = [];

  if (scope === 'reusable') {
    query += " AND scope = 'reusable'";
  } else if (project_id) {
    query += " AND (source_project_id = ? OR scope = 'reusable')";
    params.push(project_id);
  }

  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += " AND confidence != 'deprecated' ORDER BY confidence DESC, usage_count DESC, updated_at DESC";

  const patterns = db.prepare(query).all(...params);
  // Parse tags JSON
  const parsed = (patterns as any[]).map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') }));
  res.json({ patterns: parsed });
});

// POST /api/intelligence/patterns — create pattern
intelligenceRouter.post('/patterns', (req, res) => {
  const { title, description, code, tags = [], source_project_id, scope = 'project' } = req.body;
  if (!title) { res.status(400).json({ error: 'title is required' }); return; }

  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO pattern_memory (id, title, description, code, tags, source_project_id, scope, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description || '', code || '', JSON.stringify(tags), source_project_id || null, scope, now, now);

  const pattern = db.prepare('SELECT * FROM pattern_memory WHERE id = ?').get(id) as any;
  pattern.tags = JSON.parse(pattern.tags || '[]');
  res.status(201).json({ pattern });
});

// PUT /api/intelligence/patterns/:id — update pattern
intelligenceRouter.put('/patterns/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM pattern_memory WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: 'Pattern not found' }); return; }

  const { title, description, code, tags, scope, confidence, user_rating } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE pattern_memory SET
      title = COALESCE(?, title), description = COALESCE(?, description),
      code = COALESCE(?, code), tags = COALESCE(?, tags),
      scope = COALESCE(?, scope), confidence = COALESCE(?, confidence),
      user_rating = COALESCE(?, user_rating), updated_at = ?
    WHERE id = ?
  `).run(
    title ?? null, description ?? null, code ?? null,
    tags ? JSON.stringify(tags) : null, scope ?? null,
    confidence ?? null, user_rating ?? null, now, req.params.id
  );

  const pattern = db.prepare('SELECT * FROM pattern_memory WHERE id = ?').get(req.params.id) as any;
  pattern.tags = JSON.parse(pattern.tags || '[]');
  res.json({ pattern });
});

// DELETE /api/intelligence/patterns/:id
intelligenceRouter.delete('/patterns/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM pattern_memory WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== DEBUG MEMORY ====================

// GET /api/intelligence/debug — list debug solutions
intelligenceRouter.get('/debug', (req, res) => {
  const db = getDb();
  const { project_id, search, scope } = req.query;

  let query = 'SELECT * FROM debug_memory WHERE 1=1';
  const params: any[] = [];

  if (scope === 'reusable') {
    query += " AND scope = 'reusable'";
  } else if (project_id) {
    query += " AND (source_project_id = ? OR scope = 'reusable')";
    params.push(project_id);
  }

  if (search) {
    query += ' AND (problem LIKE ? OR root_cause LIKE ? OR solution LIKE ? OR tags LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  query += " AND confidence != 'deprecated' ORDER BY confidence DESC, usage_count DESC";

  const items = db.prepare(query).all(...params);
  const parsed = (items as any[]).map(d => ({ ...d, tags: JSON.parse(d.tags || '[]') }));
  res.json({ debug: parsed });
});

// POST /api/intelligence/debug — create debug solution
intelligenceRouter.post('/debug', (req, res) => {
  const { problem, root_cause, solution, tags = [], source_project_id, scope = 'project', error_signature } = req.body;
  if (!problem) { res.status(400).json({ error: 'problem is required' }); return; }

  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO debug_memory (id, problem, root_cause, solution, tags, source_project_id, scope, error_signature, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, problem, root_cause || '', solution || '', JSON.stringify(tags), source_project_id || null, scope, error_signature || null, now, now);

  const item = db.prepare('SELECT * FROM debug_memory WHERE id = ?').get(id) as any;
  item.tags = JSON.parse(item.tags || '[]');
  res.status(201).json({ debug: item });
});

// PUT /api/intelligence/debug/:id
intelligenceRouter.put('/debug/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM debug_memory WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Debug solution not found' }); return; }

  const { problem, root_cause, solution, tags, scope, confidence, user_rating, error_signature } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE debug_memory SET
      problem = COALESCE(?, problem), root_cause = COALESCE(?, root_cause),
      solution = COALESCE(?, solution), tags = COALESCE(?, tags),
      scope = COALESCE(?, scope), confidence = COALESCE(?, confidence),
      user_rating = COALESCE(?, user_rating), error_signature = COALESCE(?, error_signature),
      updated_at = ?
    WHERE id = ?
  `).run(
    problem ?? null, root_cause ?? null, solution ?? null,
    tags ? JSON.stringify(tags) : null, scope ?? null,
    confidence ?? null, user_rating ?? null, error_signature ?? null,
    now, req.params.id
  );

  const item = db.prepare('SELECT * FROM debug_memory WHERE id = ?').get(req.params.id) as any;
  item.tags = JSON.parse(item.tags || '[]');
  res.json({ debug: item });
});

// DELETE /api/intelligence/debug/:id
intelligenceRouter.delete('/debug/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM debug_memory WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/intelligence/debug/match — match an error against debug memory
intelligenceRouter.post('/debug/match', (req, res) => {
  const { error_signature, error_message } = req.body;
  const db = getDb();

  let match = null;

  // Try exact signature match first
  if (error_signature) {
    match = db.prepare("SELECT * FROM debug_memory WHERE error_signature = ? AND confidence != 'deprecated' ORDER BY usage_count DESC LIMIT 1")
      .get(error_signature);
  }

  // Fallback to fuzzy message match
  if (!match && error_message) {
    match = db.prepare("SELECT * FROM debug_memory WHERE problem LIKE ? AND confidence != 'deprecated' ORDER BY usage_count DESC LIMIT 1")
      .get(`%${error_message.slice(0, 100)}%`);
  }

  if (match) {
    (match as any).tags = JSON.parse((match as any).tags || '[]');
    // Increment usage count
    db.prepare('UPDATE debug_memory SET usage_count = usage_count + 1, last_used = ? WHERE id = ?')
      .run(new Date().toISOString(), (match as any).id);
  }

  res.json({ match: match || null });
});

// ==================== CROSS-PROJECT SEARCH ====================

// GET /api/intelligence/search — search across patterns + debug memory
intelligenceRouter.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) { res.status(400).json({ error: 'q (query) is required' }); return; }

  const db = getDb();
  const term = `%${q}%`;

  const patterns = db.prepare(`
    SELECT *, 'pattern' as _type FROM pattern_memory
    WHERE (title LIKE ? OR description LIKE ? OR tags LIKE ? OR code LIKE ?)
    AND confidence != 'deprecated'
    ORDER BY usage_count DESC LIMIT 20
  `).all(term, term, term, term).map((p: any) => ({ ...p, tags: JSON.parse(p.tags || '[]') }));

  const debug = db.prepare(`
    SELECT *, 'debug' as _type FROM debug_memory
    WHERE (problem LIKE ? OR root_cause LIKE ? OR solution LIKE ? OR tags LIKE ?)
    AND confidence != 'deprecated'
    ORDER BY usage_count DESC LIMIT 20
  `).all(term, term, term, term).map((d: any) => ({ ...d, tags: JSON.parse(d.tags || '[]') }));

  res.json({ results: [...patterns, ...debug] });
});
