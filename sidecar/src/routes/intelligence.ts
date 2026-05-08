import { Router } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import { analyzeSession, getLearningQueue, reviewLearningItem } from '../intelligence/session-analyzer.js';
import { listProjectRooms, getRoomContext } from '../intelligence/room-detector.js';
import { getActiveFacts, getFactHistory, buildMemory } from '../intelligence/temporal-service.js';
import { checkConsistency } from '../intelligence/contradiction-service.js';
import { getCompressionStats, compressBrainField } from '../intelligence/aaak-service.js';
import { handlePrime, handleHint, handleTodoWrite } from '../intelligence/hook-handlers.js';
import { handleSessionEnd } from '../intelligence/session-end.js';
import { installCortexHooks, uninstallCortexHooks, getHookStatus } from '../intelligence/hook-installer.js';
import { runBackfill, getBackfillStatus } from '../intelligence/backfill.js';

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

  query += " AND confidence != 'deprecated' ORDER BY confidence DESC, usage_count DESC, updated_at DESC LIMIT 500";

  const patterns = db.prepare(query).all(...params);
  // Parse tags JSON
  const parsed = (patterns as any[]).map(p => ({ ...p, tags: JSON.parse(p.tags || '[]') }));
  res.json({ patterns: parsed });
});

// POST /api/intelligence/patterns — create pattern
intelligenceRouter.post('/patterns', (req, res) => {
  const { title, description, code, tags = [], source_project_id, scope = 'project', room_tag } = req.body;
  if (!title) { res.status(400).json({ error: 'title is required' }); return; }

  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO pattern_memory (id, title, description, code, tags, source_project_id, scope, room_tag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description || '', code || '', JSON.stringify(tags), source_project_id || null, scope, room_tag || null, now, now);

  const pattern = db.prepare('SELECT * FROM pattern_memory WHERE id = ?').get(id) as any;
  pattern.tags = JSON.parse(pattern.tags || '[]');
  res.status(201).json({ pattern });
});

// PUT /api/intelligence/patterns/:id — update pattern
intelligenceRouter.put('/patterns/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM pattern_memory WHERE id = ?').get(req.params.id) as any;
  if (!existing) { res.status(404).json({ error: 'Pattern not found' }); return; }

  const { title, description, code, tags, scope, confidence, user_rating, room_tag } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE pattern_memory SET
      title = COALESCE(?, title), description = COALESCE(?, description),
      code = COALESCE(?, code), tags = COALESCE(?, tags),
      scope = COALESCE(?, scope), confidence = COALESCE(?, confidence),
      user_rating = COALESCE(?, user_rating), room_tag = COALESCE(?, room_tag),
      updated_at = ?
    WHERE id = ?
  `).run(
    title ?? null, description ?? null, code ?? null,
    tags ? JSON.stringify(tags) : null, scope ?? null,
    confidence ?? null, user_rating ?? null, room_tag ?? null, now, req.params.id
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

  query += " AND confidence != 'deprecated' ORDER BY confidence DESC, usage_count DESC LIMIT 500";

  const items = db.prepare(query).all(...params);
  const parsed = (items as any[]).map(d => ({ ...d, tags: JSON.parse(d.tags || '[]') }));
  res.json({ debug: parsed });
});

// POST /api/intelligence/debug — create debug solution
intelligenceRouter.post('/debug', (req, res) => {
  const { problem, root_cause, solution, tags = [], source_project_id, scope = 'project', error_signature, room_tag } = req.body;
  if (!problem) { res.status(400).json({ error: 'problem is required' }); return; }

  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO debug_memory (id, problem, root_cause, solution, tags, source_project_id, scope, error_signature, room_tag, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, problem, root_cause || '', solution || '', JSON.stringify(tags), source_project_id || null, scope, error_signature || null, room_tag || null, now, now);

  const item = db.prepare('SELECT * FROM debug_memory WHERE id = ?').get(id) as any;
  item.tags = JSON.parse(item.tags || '[]');
  res.status(201).json({ debug: item });
});

// PUT /api/intelligence/debug/:id
intelligenceRouter.put('/debug/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM debug_memory WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Debug solution not found' }); return; }

  const { problem, root_cause, solution, tags, scope, confidence, user_rating, error_signature, room_tag } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE debug_memory SET
      problem = COALESCE(?, problem), root_cause = COALESCE(?, root_cause),
      solution = COALESCE(?, solution), tags = COALESCE(?, tags),
      scope = COALESCE(?, scope), confidence = COALESCE(?, confidence),
      user_rating = COALESCE(?, user_rating), error_signature = COALESCE(?, error_signature),
      room_tag = COALESCE(?, room_tag), updated_at = ?
    WHERE id = ?
  `).run(
    problem ?? null, root_cause ?? null, solution ?? null,
    tags ? JSON.stringify(tags) : null, scope ?? null,
    confidence ?? null, user_rating ?? null, error_signature ?? null,
    room_tag ?? null, now, req.params.id
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

// ==================== MEMPALACE: ROOMS ====================

// GET /api/intelligence/rooms/:projectId — list all rooms with fact counts
intelligenceRouter.get('/rooms/:projectId', (req, res) => {
  const rooms = listProjectRooms(req.params.projectId);
  res.json({ rooms });
});

// GET /api/intelligence/rooms/:projectId/:room — get all intelligence for a room
intelligenceRouter.get('/rooms/:projectId/:room', (req, res) => {
  const context = getRoomContext(req.params.projectId, req.params.room);
  res.json(context);
});

// ==================== MEMPALACE: TEMPORAL HISTORY ====================

// GET /api/intelligence/history/:projectId — temporal fact timeline
intelligenceRouter.get('/history/:projectId', (req, res) => {
  const { subject, room_tag, start_date, end_date, active_only } = req.query;

  if (active_only === 'true') {
    const facts = getActiveFacts(req.params.projectId, room_tag as string | undefined);
    res.json({ facts, total: facts.length, mode: 'active_only' });
    return;
  }

  const facts = getFactHistory(req.params.projectId, {
    subject: subject as string | undefined,
    roomTag: room_tag as string | undefined,
    startDate: start_date as string | undefined,
    endDate: end_date as string | undefined,
  });
  res.json({ facts, total: facts.length, mode: 'full_history' });
});

// ==================== MEMPALACE: CONSISTENCY CHECK ====================

// POST /api/intelligence/check-consistency — check a fact before saving
intelligenceRouter.post('/check-consistency', (req, res) => {
  const { project_id, fact, room_tag } = req.body;
  if (!project_id || !fact) {
    res.status(400).json({ error: 'project_id and fact are required' });
    return;
  }
  const result = checkConsistency(project_id, fact, room_tag);
  res.json(result);
});

// ==================== MEMPALACE: COMPRESSION STATS ====================

// GET /api/intelligence/compression-stats/:projectId — AAAK compression metrics
intelligenceRouter.get('/compression-stats/:projectId', (req, res) => {
  const stats = getCompressionStats(req.params.projectId);
  res.json(stats);
});

// ==================== MEMPALACE: BUILD MEMORY ====================

// POST /api/intelligence/build-memory/:projectId — build/rebuild memory for a project
intelligenceRouter.post('/build-memory/:projectId', async (req, res) => {
  const projectId = req.params.projectId;
  const db = getDb();

  // Verify project exists
  const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Build knowledge graph from brain (now uses Claude AI)
  const result = await buildMemory(projectId);

  // Pre-compress brain fields for AAAK cache
  const brain = db.prepare('SELECT summary, architecture_notes, conventions, decisions, dependencies_notes FROM project_brain WHERE project_id = ?')
    .get(projectId) as any;

  let compressionStats = null;
  if (brain) {
    if (brain.summary) compressBrainField(projectId, 'summary', brain.summary);
    if (brain.architecture_notes) compressBrainField(projectId, 'architecture', brain.architecture_notes);
    if (brain.conventions) compressBrainField(projectId, 'conventions', brain.conventions);
    if (brain.decisions) compressBrainField(projectId, 'decisions', brain.decisions);
    if (brain.dependencies_notes) compressBrainField(projectId, 'dependencies', brain.dependencies_notes);
    compressionStats = getCompressionStats(projectId);
  }

  res.json({
    success: true,
    project: project.name,
    ...result,
    compressionStats,
  });
});

// ==================== HOOK ENDPOINTS (called by Claude Code hooks) ====================
// IMPORTANT: These return PLAIN TEXT (not JSON) because Claude Code hooks
// inject stdout directly into the session context.

// POST /api/intelligence/prime — UserPromptSubmit hook callback
intelligenceRouter.post('/prime', (req, res) => {
  const result = handlePrime(req.body || {});
  res.type('text/plain').send(result.text);
});

// POST /api/intelligence/hint — PreToolUse hook callback (Glob|Grep|Read)
intelligenceRouter.post('/hint', (req, res) => {
  const result = handleHint(req.body || {});
  res.type('text/plain').send(result.text);
});

// POST /api/intelligence/todo-write — PostToolUse hook callback (TodoWrite)
intelligenceRouter.post('/todo-write', (req, res) => {
  try {
    const result = handleTodoWrite(req.body || {});
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/intelligence/session-end — Stop hook callback
intelligenceRouter.post('/session-end', (req, res) => {
  try {
    const result = handleSessionEnd(req.body || {});
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[session-end] handler failed:', message);
    res.status(500).json({ error: message });
  }
});

// ==================== HOOK INSTALLER ====================

// GET /api/intelligence/hooks/status — is the Claude Code hook installed?
intelligenceRouter.get('/hooks/status', (_req, res) => {
  res.json(getHookStatus());
});

// POST /api/intelligence/hooks/install — install the three Cortex hooks
intelligenceRouter.post('/hooks/install', (_req, res) => {
  try {
    const result = installCortexHooks();
    const db = getDb();
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('cortex_hooks_installed', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'",
    ).run();
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/intelligence/hooks/uninstall — remove Cortex hooks
intelligenceRouter.post('/hooks/uninstall', (_req, res) => {
  try {
    const result = uninstallCortexHooks();
    const db = getDb();
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('cortex_hooks_installed', 'false') ON CONFLICT(key) DO UPDATE SET value = 'false'",
    ).run();
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ==================== BACKFILL ====================

// POST /api/intelligence/backfill/start — kick off the historical-session backfill worker
intelligenceRouter.post('/backfill/start', (_req, res) => {
  const status = runBackfill({ background: true });
  res.json(status);
});

// GET /api/intelligence/backfill/status — current run status + counters
intelligenceRouter.get('/backfill/status', (_req, res) => {
  res.json(getBackfillStatus());
});

// ==================== BRAIN PANEL DATA ====================

// GET /api/intelligence/brain-panel/:projectId — everything the read-only brain panel needs
intelligenceRouter.get('/brain-panel/:projectId', (req, res) => {
  const db = getDb();
  const projectId = req.params.projectId;

  const project = db.prepare('SELECT id, name, path FROM projects WHERE id = ?').get(projectId) as
    | { id: string; name: string; path: string }
    | undefined;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const brain = db
    .prepare(
      `SELECT summary, architecture_notes, conventions, decisions, known_issues, updated_at
       FROM project_brain WHERE project_id = ?`,
    )
    .get(projectId) as
      | {
          summary: string;
          architecture_notes: string;
          conventions: string;
          decisions: string;
          known_issues: string;
          updated_at: string;
        }
      | undefined;

  const observations = db
    .prepare(
      `SELECT id, kind, title, before_state, after_state, files_touched, room_tag, source, created_at
       FROM session_observations
       WHERE project_id = ? AND confidence != 'deprecated'
       ORDER BY created_at DESC LIMIT 25`,
    )
    .all(projectId) as Array<{
      id: string;
      kind: string;
      title: string;
      before_state: string;
      after_state: string;
      files_touched: string;
      room_tag: string | null;
      source: string;
      created_at: string;
    }>;

  const consultsTotal = db
    .prepare('SELECT COUNT(*) as c FROM hook_consults WHERE project_id = ?')
    .get(projectId) as { c: number };

  const consultsByType = db
    .prepare(
      'SELECT hook_type, COUNT(*) as c FROM hook_consults WHERE project_id = ? GROUP BY hook_type',
    )
    .all(projectId) as Array<{ hook_type: string; c: number }>;

  const recentConsults = db
    .prepare(
      `SELECT hook_type, tool_name, query, result_count, created_at
       FROM hook_consults WHERE project_id = ?
       ORDER BY created_at DESC LIMIT 12`,
    )
    .all(projectId) as Array<{
      hook_type: string;
      tool_name: string | null;
      query: string | null;
      result_count: number;
      created_at: string;
    }>;

  const rooms = listProjectRooms(projectId);

  res.json({
    project,
    brain: brain || null,
    observations: observations.map(o => ({ ...o, files_touched: JSON.parse(o.files_touched || '[]') })),
    rooms,
    hookStats: {
      total: consultsTotal.c,
      byType: Object.fromEntries(consultsByType.map(r => [r.hook_type, r.c])),
      recent: recentConsults,
    },
  });
});
