import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getSessionManager } from '../sessions/session-manager.js';
import { v4 as uuid } from 'uuid';

type LiveTodo = { id?: string; content: string; status: string; priority?: string };

function parseTodosFromBuffer(buffer: string): LiveTodo[] {
  if (!buffer) return [];
  const clean = buffer
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\].*?\x07/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  const todoPattern = /"name"\s*:\s*"Todo(?:Write|Read)"[\s\S]*?"todos"\s*:\s*(\[[\s\S]*?\])/g;
  let lastParsed: LiveTodo[] = [];
  let match: RegExpExecArray | null;
  while ((match = todoPattern.exec(clean)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) lastParsed = parsed;
    } catch { /* skip malformed */ }
  }
  return lastParsed;
}

export const notesRouter: ReturnType<typeof Router> = Router();

// GET /api/notes/:projectId — get note for project
notesRouter.get('/:projectId', (req, res) => {
  const db = getDb();
  let row = db.prepare('SELECT * FROM notes WHERE project_id = ?').get(req.params.projectId) as any;

  if (!row) {
    // Auto-create empty note
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO notes (id, project_id, content, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, req.params.projectId, '', now);
    row = { id, project_id: req.params.projectId, content: '', updated_at: now };
  }

  res.json({ note: row });
});

// PUT /api/notes/:projectId — update note (autosave)
notesRouter.put('/:projectId', (req, res) => {
  const { content } = req.body;
  if (content === undefined) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM notes WHERE project_id = ?').get(req.params.projectId) as any;

  if (existing) {
    db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE project_id = ?')
      .run(content, now, req.params.projectId);
  } else {
    db.prepare('INSERT INTO notes (id, project_id, content, updated_at) VALUES (?, ?, ?, ?)')
      .run(uuid(), req.params.projectId, content, now);
  }

  res.json({ success: true, updated_at: now });
});

// --- Tasks ---

export const tasksRouter: ReturnType<typeof Router> = Router();

// GET /api/tasks/:projectId/live — aggregate live TodoWrite output from every session of this project.
// Returns a flat list of live todos plus a per-session breakdown so the UI can group them.
// MUST be declared before `/:projectId` (Express 5 matches param routes eagerly).
tasksRouter.get('/:projectId/live', (req, res) => {
  const db = getDb();
  const sessions = db.prepare(
    'SELECT id, name, status, last_active FROM claude_sessions WHERE project_id = ? ORDER BY last_active DESC'
  ).all(req.params.projectId) as Array<{ id: string; name: string; status: string; last_active: string }>;

  const mgr = getSessionManager();
  const groups: Array<{ sessionId: string; sessionName: string; sessionStatus: string; lastActive: string; todos: LiveTodo[] }> = [];
  const flat: Array<LiveTodo & { sessionId: string; sessionName: string; sessionStatus: string }> = [];

  for (const s of sessions) {
    let buffer = '';
    const live = mgr.getSessionInfo(s.id);
    if (live && live.status === 'running') {
      buffer = mgr.getSessionOutput(s.id, 102400);
    } else {
      const row = db.prepare('SELECT session_output FROM claude_sessions WHERE id = ?').get(s.id) as any;
      buffer = row?.session_output || '';
    }
    const todos = parseTodosFromBuffer(buffer);
    if (todos.length === 0) continue;
    groups.push({ sessionId: s.id, sessionName: s.name, sessionStatus: s.status, lastActive: s.last_active, todos });
    for (const t of todos) {
      flat.push({ ...t, sessionId: s.id, sessionName: s.name, sessionStatus: s.status });
    }
  }

  res.json({ groups, todos: flat });
});

// GET /api/tasks/:projectId — list tasks
tasksRouter.get('/:projectId', (req, res) => {
  const db = getDb();
  const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC')
    .all(req.params.projectId);
  res.json({ tasks });
});

// POST /api/tasks/:projectId — create task
tasksRouter.post('/:projectId', (req, res) => {
  const { title, status = 'pending' } = req.body;
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();
  const validStatuses = ['pending', 'doing', 'done', 'blocked'];
  const finalStatus = validStatuses.includes(status) ? status : 'pending';

  db.prepare('INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.projectId, title, finalStatus, now, now);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.status(201).json({ task });
});

// PUT /api/tasks/:id — update task
tasksRouter.put('/item/:id', (req, res) => {
  const { title, status } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE tasks SET title = COALESCE(?, title), status = COALESCE(?, status), updated_at = ? WHERE id = ?')
    .run(title ?? null, status ?? null, now, req.params.id);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  res.json({ task });
});

// DELETE /api/tasks/:id — delete task
tasksRouter.delete('/item/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json({ success: true });
});
