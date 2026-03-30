import { Router } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import { analyzeSession, getLearningQueue, reviewLearningItem } from '../intelligence/session-analyzer.js';

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

// ==================== LEARNING QUEUE ====================

// GET /api/intelligence/learning-queue/:projectId — unverified items for approval
intelligenceRouter.get('/learning-queue/:projectId', (req, res) => {
  const queue = getLearningQueue(req.params.projectId);
  res.json(queue);
});

// POST /api/intelligence/learning-queue/review — approve or dismiss an item
intelligenceRouter.post('/learning-queue/review', (req, res) => {
  const { id, type, action } = req.body;
  if (!id || !type || !action) {
    res.status(400).json({ error: 'id, type (pattern|debug), and action (approve|dismiss) are required' });
    return;
  }
  reviewLearningItem(id, type, action);
  res.json({ success: true });
});

// POST /api/intelligence/analyze-session/:sessionId — analyze a session
intelligenceRouter.post('/analyze-session/:sessionId', (req, res) => {
  const { project_id } = req.body;
  if (!project_id) {
    res.status(400).json({ error: 'project_id is required' });
    return;
  }
  const result = analyzeSession(req.params.sessionId, project_id);
  res.json(result);
});

// ==================== CROSS-PROJECT SEARCH ====================

// GET /api/intelligence/global-search — cross-project search across everything
intelligenceRouter.get('/global-search', (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') { res.status(400).json({ error: 'q (query) is required' }); return; }

  const db = getDb();
  const term = `%${q}%`;

  // Search projects
  const projects = db.prepare(`
    SELECT id, name, path, type, company, 'project' as _type FROM projects
    WHERE name LIKE ? OR path LIKE ? OR company LIKE ?
    ORDER BY last_opened DESC LIMIT 10
  `).all(term, term, term);

  // Search project brains
  const brains = db.prepare(`
    SELECT pb.project_id, p.name as project_name, pb.summary, pb.architecture_notes, pb.known_issues, 'brain' as _type
    FROM project_brain pb JOIN projects p ON pb.project_id = p.id
    WHERE pb.summary LIKE ? OR pb.architecture_notes LIKE ? OR pb.known_issues LIKE ?
      OR pb.decisions LIKE ? OR pb.conventions LIKE ?
    LIMIT 10
  `).all(term, term, term, term, term);

  // Search session history
  const sessions = db.prepare(`
    SELECT sh.id, sh.session_id, sh.prompt_text, sh.response_summary, sh.timestamp,
      cs.name as session_name, cs.project_id, p.name as project_name, 'session' as _type
    FROM session_history sh
    JOIN claude_sessions cs ON sh.session_id = cs.id
    JOIN projects p ON cs.project_id = p.id
    WHERE sh.prompt_text LIKE ? OR sh.response_summary LIKE ?
    ORDER BY sh.timestamp DESC LIMIT 15
  `).all(term, term);

  // Search patterns
  const patterns = db.prepare(`
    SELECT pm.*, p.name as project_name, 'pattern' as _type FROM pattern_memory pm
    LEFT JOIN projects p ON pm.source_project_id = p.id
    WHERE (pm.title LIKE ? OR pm.description LIKE ? OR pm.tags LIKE ?)
    AND pm.confidence != 'deprecated'
    ORDER BY pm.usage_count DESC LIMIT 10
  `).all(term, term, term);

  // Search debug memory
  const debug = db.prepare(`
    SELECT dm.*, p.name as project_name, 'debug' as _type FROM debug_memory dm
    LEFT JOIN projects p ON dm.source_project_id = p.id
    WHERE (dm.problem LIKE ? OR dm.root_cause LIKE ? OR dm.solution LIKE ?)
    AND dm.confidence != 'deprecated'
    ORDER BY dm.usage_count DESC LIMIT 10
  `).all(term, term, term);

  res.json({
    results: { projects, brains, sessions, patterns, debug },
    total: projects.length + brains.length + sessions.length + patterns.length + debug.length,
  });
});

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

// ==================== MANUAL INTELLIGENCE CAPTURE ====================

// POST /api/intelligence/capture — manually save intelligence from a session
// Use this to capture insights, decisions, server info, etc. from a conversation
intelligenceRouter.post('/capture', (req, res) => {
  const db = getDb();
  const { project_id, type, content } = req.body;

  if (!project_id || !type || !content) {
    res.status(400).json({ error: 'project_id, type, and content are required' });
    return;
  }

  const now = new Date().toISOString();

  switch (type) {
    case 'decision': {
      // Append to brain decisions
      const brain = db.prepare('SELECT decisions FROM project_brain WHERE project_id = ?').get(project_id) as any;
      if (brain) {
        const existing = brain.decisions || '';
        const updated = existing + `\n\n--- Captured ${new Date().toLocaleDateString()} ---\n${content}`;
        db.prepare('UPDATE project_brain SET decisions = ?, updated_at = ? WHERE project_id = ?')
          .run(updated, now, project_id);
      }
      res.json({ success: true, saved: 'decision' });
      break;
    }

    case 'known_issue': {
      // Append to brain known issues
      const brain = db.prepare('SELECT known_issues FROM project_brain WHERE project_id = ?').get(project_id) as any;
      if (brain) {
        const existing = brain.known_issues || '';
        const updated = existing + `\n- ${content}`;
        db.prepare('UPDATE project_brain SET known_issues = ?, updated_at = ? WHERE project_id = ?')
          .run(updated, now, project_id);
      }
      res.json({ success: true, saved: 'known_issue' });
      break;
    }

    case 'pattern': {
      // Create a new verified pattern
      const { title, code, tags } = req.body;
      db.prepare(`
        INSERT INTO pattern_memory (id, title, description, code, tags, source_project_id, scope, confidence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'project', 'verified', ?, ?)
      `).run(uuid(), title || 'Captured pattern', content, code || '', JSON.stringify(tags || []), project_id, now, now);
      res.json({ success: true, saved: 'pattern' });
      break;
    }

    case 'debug': {
      // Create a new verified debug solution
      const { problem, root_cause, error_signature, tags: debugTags } = req.body;
      db.prepare(`
        INSERT INTO debug_memory (id, problem, root_cause, solution, error_signature, tags, source_project_id, scope, confidence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'project', 'verified', ?, ?)
      `).run(uuid(), problem || content, root_cause || '', content, error_signature || '', JSON.stringify(debugTags || []), project_id, now, now);
      res.json({ success: true, saved: 'debug' });
      break;
    }

    case 'server': {
      // Append server/deployment info to architecture
      const brain = db.prepare('SELECT architecture_notes FROM project_brain WHERE project_id = ?').get(project_id) as any;
      if (brain) {
        const existing = brain.architecture_notes || '';
        const updated = existing + `\n\n--- Server Info (captured ${new Date().toLocaleDateString()}) ---\n${content}`;
        db.prepare('UPDATE project_brain SET architecture_notes = ?, updated_at = ? WHERE project_id = ?')
          .run(updated, now, project_id);
      }
      res.json({ success: true, saved: 'server' });
      break;
    }

    case 'convention': {
      // Append to conventions
      const brain = db.prepare('SELECT conventions FROM project_brain WHERE project_id = ?').get(project_id) as any;
      if (brain) {
        const existing = brain.conventions || '';
        const updated = existing + `\n${content}`;
        db.prepare('UPDATE project_brain SET conventions = ?, updated_at = ? WHERE project_id = ?')
          .run(updated, now, project_id);
      }
      res.json({ success: true, saved: 'convention' });
      break;
    }

    default:
      res.status(400).json({ error: `Unknown intelligence type: ${type}. Use: decision, known_issue, pattern, debug, server, convention` });
  }
});
