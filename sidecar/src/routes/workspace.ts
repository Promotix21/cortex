import { Router } from 'express';
import { getDb } from '../db/index.js';

export const workspaceRouter: ReturnType<typeof Router> = Router();

// GET /api/workspace/state — get last workspace state
workspaceRouter.get('/state', (_req, res) => {
  const db = getDb();
  // Get the most recently opened project's workspace
  const row = db.prepare(`
    SELECT w.*, p.name as project_name, p.id as project_id
    FROM workspace w
    JOIN projects p ON p.id = w.project_id
    ORDER BY p.last_opened DESC LIMIT 1
  `).get() as any;

  if (!row) {
    res.json({ state: null });
    return;
  }

  res.json({
    state: {
      projectId: row.project_id,
      projectName: row.project_name,
      ...JSON.parse(row.state_json || '{}'),
    },
  });
});

// PUT /api/workspace/:projectId — save workspace state
workspaceRouter.put('/:projectId', (req, res) => {
  const { state } = req.body;
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT id FROM workspace WHERE project_id = ?').get(req.params.projectId) as any;
  if (existing) {
    db.prepare('UPDATE workspace SET state_json = ?, updated_at = ? WHERE project_id = ?')
      .run(JSON.stringify(state || {}), now, req.params.projectId);
  }

  res.json({ success: true });
});

// GET /api/workspace/resume/:projectId — get resume context
workspaceRouter.get('/resume/:projectId', async (req, res) => {
  const db = getDb();

  // Get workspace state
  const workspace = db.prepare('SELECT state_json FROM workspace WHERE project_id = ?')
    .get(req.params.projectId) as any;

  // Get latest snapshot
  const snapshot = db.prepare('SELECT * FROM project_snapshots WHERE project_id = ? ORDER BY timestamp DESC LIMIT 1')
    .get(req.params.projectId) as any;

  // Get recent sessions
  const sessions = db.prepare('SELECT * FROM claude_sessions WHERE project_id = ? ORDER BY last_active DESC LIMIT 5')
    .all(req.params.projectId);

  res.json({
    workspace: workspace ? JSON.parse(workspace.state_json || '{}') : null,
    snapshot: snapshot ? {
      ...snapshot,
      uncommitted_files: JSON.parse(snapshot.uncommitted_files || '[]'),
      open_terminals: JSON.parse(snapshot.open_terminals || '[]'),
    } : null,
    recentSessions: sessions,
  });
});

// ==================== CONTEXT BUDGET ====================

export const contextRouter: ReturnType<typeof Router> = Router();

// GET /api/context/:projectId — get context priorities
contextRouter.get('/:projectId', (req, res) => {
  const db = getDb();
  let priorities = db.prepare('SELECT * FROM context_priorities WHERE project_id = ? ORDER BY priority_weight DESC')
    .all(req.params.projectId) as any[];

  // Return defaults if none configured
  if (priorities.length === 0) {
    priorities = getDefaultPriorities();
  }

  res.json({ priorities });
});

// PUT /api/context/:projectId — update context priorities
contextRouter.put('/:projectId', (req, res) => {
  const { priorities } = req.body;
  if (!Array.isArray(priorities)) { res.status(400).json({ error: 'priorities array required' }); return; }

  const db = getDb();
  const { v4: uuid } = require('uuid');

  // Clear existing
  db.prepare('DELETE FROM context_priorities WHERE project_id = ?').run(req.params.projectId);

  // Insert new
  const stmt = db.prepare('INSERT INTO context_priorities (id, project_id, source_type, priority_weight, max_tokens) VALUES (?, ?, ?, ?, ?)');
  for (const p of priorities) {
    stmt.run(uuid(), req.params.projectId, p.source_type, p.priority_weight, p.max_tokens);
  }

  res.json({ success: true });
});

// GET /api/context/:projectId/build — build context for AI (preview what would be assembled)
contextRouter.get('/:projectId/build', (req, res) => {
  const db = getDb();
  const totalBudget = parseInt(req.query.budget as string) || 11500;

  // Get priorities
  let priorities = db.prepare('SELECT * FROM context_priorities WHERE project_id = ? ORDER BY priority_weight DESC')
    .all(req.params.projectId) as any[];
  if (priorities.length === 0) priorities = getDefaultPriorities();

  // Collect sources
  const brain = db.prepare('SELECT * FROM project_brain WHERE project_id = ?').get(req.params.projectId) as any;
  const recentErrors = db.prepare('SELECT * FROM captured_errors WHERE project_id = ? ORDER BY timestamp DESC LIMIT 5')
    .all(req.params.projectId);
  const patterns = db.prepare("SELECT * FROM pattern_memory WHERE (source_project_id = ? OR scope = 'reusable') AND confidence = 'verified' ORDER BY usage_count DESC LIMIT 5")
    .all(req.params.projectId);

  const context: { source: string; tokens: number; included: boolean; content: string }[] = [];
  let usedTokens = 0;

  // Add sources by priority
  for (const p of priorities) {
    let content = '';
    switch (p.source_type) {
      case 'brain_summary': content = brain?.summary || ''; break;
      case 'brain_architecture': content = brain?.architecture_notes || ''; break;
      case 'brain_conventions': content = brain?.conventions || ''; break;
      case 'brain_issues': content = brain?.known_issues || ''; break;
      case 'brain_decisions': content = brain?.decisions || ''; break;
      case 'recent_errors': content = (recentErrors as any[]).map(e => e.message).join('\n'); break;
      case 'verified_patterns': content = (patterns as any[]).map(p => `${p.title}: ${p.description}`).join('\n'); break;
      default: continue;
    }

    const tokens = Math.ceil(content.length / 4);
    const cappedTokens = Math.min(tokens, p.max_tokens);
    const fits = usedTokens + cappedTokens <= totalBudget;

    context.push({ source: p.source_type, tokens: cappedTokens, included: fits && content.length > 0, content: content.slice(0, p.max_tokens * 4) });
    if (fits) usedTokens += cappedTokens;
  }

  res.json({
    totalBudget,
    usedTokens,
    remaining: totalBudget - usedTokens,
    sources: context,
  });
});

function getDefaultPriorities(): any[] {
  return [
    { source_type: 'brain_summary', priority_weight: 10, max_tokens: 500 },
    { source_type: 'brain_architecture', priority_weight: 9, max_tokens: 1000 },
    { source_type: 'brain_conventions', priority_weight: 8, max_tokens: 300 },
    { source_type: 'brain_issues', priority_weight: 7, max_tokens: 500 },
    { source_type: 'recent_errors', priority_weight: 7, max_tokens: 800 },
    { source_type: 'brain_decisions', priority_weight: 6, max_tokens: 500 },
    { source_type: 'verified_patterns', priority_weight: 5, max_tokens: 600 },
  ];
}
