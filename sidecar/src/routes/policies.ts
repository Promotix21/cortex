import { Router } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import { getPlaybookManager } from '../intelligence/playbook-manager.js';

export const policiesRouter: ReturnType<typeof Router> = Router();

// Default restricted patterns
const DEFAULT_RESTRICTED = [
  'rm -rf', 'sudo', 'chmod 777', 'curl | bash', 'curl | sh',
  'DROP TABLE', 'DROP DATABASE', 'DELETE FROM', '> /dev/sda',
];

// ==================== EXECUTION POLICIES ====================

policiesRouter.get('/:projectId', (req, res) => {
  const db = getDb();
  const policies = db.prepare('SELECT * FROM execution_policies WHERE project_id = ? OR project_id IS NULL ORDER BY created_at')
    .all(req.params.projectId);
  res.json({ policies });
});

policiesRouter.post('/project/:projectId', (req, res) => {
  const { action_pattern, policy, reason } = req.body;
  if (!action_pattern || !policy) { res.status(400).json({ error: 'action_pattern and policy required' }); return; }
  const db = getDb();
  const id = uuid();
  db.prepare('INSERT INTO execution_policies (id, project_id, action_pattern, policy, reason) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.projectId, action_pattern, policy, reason || null);
  res.status(201).json({ policy: db.prepare('SELECT * FROM execution_policies WHERE id = ?').get(id) });
});

policiesRouter.delete('/rule/:id', (req, res) => {
  getDb().prepare('DELETE FROM execution_policies WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== PLAYBOOKS ====================

export const playbooksRouter: ReturnType<typeof Router> = Router();

playbooksRouter.get('/', (req, res) => {
  const db = getDb();
  const { tech_stack } = req.query;
  let query = 'SELECT * FROM playbooks';
  const params: any[] = [];
  if (tech_stack) { query += ' WHERE tech_stack LIKE ?'; params.push(`%${tech_stack}%`); }
  query += ' ORDER BY usage_count DESC';
  const playbooks = db.prepare(query).all(...params).map((p: any) => ({
    ...p, tech_stack: JSON.parse(p.tech_stack || '[]'), steps_json: JSON.parse(p.steps_json || '[]'),
  }));
  res.json({ playbooks });
});

playbooksRouter.post('/', (req, res) => {
  const { name, description, tech_stack = [], steps_json = [] } = req.body;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO playbooks (id, name, description, tech_stack, steps_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, description || '', JSON.stringify(tech_stack), JSON.stringify(steps_json), now, now);
  const pb = db.prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as any;
  pb.tech_stack = JSON.parse(pb.tech_stack); pb.steps_json = JSON.parse(pb.steps_json);
  res.status(201).json({ playbook: pb });
});

playbooksRouter.get('/:id', (req, res) => {
  const pb = getDb().prepare('SELECT * FROM playbooks WHERE id = ?').get(req.params.id) as any;
  if (!pb) { res.status(404).json({ error: 'Playbook not found' }); return; }
  pb.tech_stack = JSON.parse(pb.tech_stack || '[]'); pb.steps_json = JSON.parse(pb.steps_json || '[]');
  res.json({ playbook: pb });
});

playbooksRouter.put('/:id', (req, res) => {
  const { name, description, tech_stack, steps_json } = req.body;
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`UPDATE playbooks SET name = COALESCE(?, name), description = COALESCE(?, description),
    tech_stack = COALESCE(?, tech_stack), steps_json = COALESCE(?, steps_json), updated_at = ? WHERE id = ?`)
    .run(name ?? null, status ?? null,
      tech_stack ? JSON.stringify(tech_stack) : null,
      steps_json ? JSON.stringify(steps_json) : null, now, req.params.id);
  const pb = db.prepare('SELECT * FROM playbooks WHERE id = ?').get(req.params.id) as any;
  if (pb) { pb.tech_stack = JSON.parse(pb.tech_stack || '[]'); pb.steps_json = JSON.parse(pb.steps_json || '[]'); }
  res.json({ playbook: pb });
});

playbooksRouter.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM playbooks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== PLAYBOOK RUNS ====================

// GET /api/playbooks/runs/:runId — get run status
playbooksRouter.get('/runs/:runId', (req, res) => {
  const db = getDb();
  const run = db.prepare('SELECT * FROM playbook_runs WHERE id = ?').get(req.params.runId) as any;
  if (!run) { res.status(404).json({ error: 'Run not found' }); return; }
  res.json({ run });
});

// POST /api/playbooks/:id/run — start a playbook run
playbooksRouter.post('/:id/run', (req, res) => {
  const { project_id, session_id } = req.body;
  if (!project_id) { res.status(400).json({ error: 'project_id required' }); return; }
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO playbook_runs (id, playbook_id, project_id, session_id, status, started_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, project_id, session_id || null, 'running', now);

  // Increment usage
  db.prepare('UPDATE playbooks SET usage_count = usage_count + 1, last_used = ? WHERE id = ?').run(now, req.params.id);

  const run = db.prepare('SELECT * FROM playbook_runs WHERE id = ?').get(id);

  // Trigger execution in background
  getPlaybookManager().runPlaybook(id);

  res.status(201).json({ run });
});

// POST /api/playbooks/runs/:runId/resume — resume a paused playbook run
playbooksRouter.post('/runs/:runId/resume', (req, res) => {
  getPlaybookManager().resumeRun(req.params.runId);
  res.json({ success: true });
});

// GET /api/playbooks/project/:projectId — get all runs for a project
playbooksRouter.get('/project/:projectId/runs', (req, res) => {
  const db = getDb();
  const runs = db.prepare(`
    SELECT pr.*, p.name as playbook_name
    FROM playbook_runs pr
    JOIN playbooks p ON p.id = pr.playbook_id
    WHERE pr.project_id = ?
    ORDER BY pr.started_at DESC
  `).all(req.params.projectId);
  res.json({ runs });
});
