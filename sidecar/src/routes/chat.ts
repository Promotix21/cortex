import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index.js';
import {
  getChatHistory,
  clearChatHistory,
  getProjectBrain,
  updateProjectBrain,
} from '../chat/chat-service.js';
import { orchestrator } from '../orchestrator/index.js';
import { v4 as uuid } from 'uuid';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv', '.next', 'coverage', '.pytest_cache', 'target', '.tox']);
const SKIP_EXTS = new Set(['.lock', '.pyc', '.pyo', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.ttf', '.eot', '.db', '.sqlite', '.log']);
const SOURCE_EXTS = new Set(['.py', '.ts', '.tsx', '.js', '.jsx', '.rs', '.go', '.java', '.rb', '.php', '.toml', '.yaml', '.yml', '.json', '.md', '.txt', '.sh', '.env.example', '.sql']);

function walkFiles(dir: string, results: { rel: string; abs: string; size: number }[], base = dir) {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.env.example') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walkFiles(abs, results, base);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      if (!SOURCE_EXTS.has(ext) || SKIP_EXTS.has(ext)) continue;
      try {
        const { size } = fs.statSync(abs);
        if (size > 0 && size < 80_000) {
          results.push({ rel: path.relative(base, abs), abs, size });
        }
      } catch { /* skip */ }
    }
  }
}

function readProjectFiles(projectPath: string, maxTotalChars = 120_000): string {
  const files: { rel: string; abs: string; size: number }[] = [];
  walkFiles(projectPath, files);

  // Sort: smaller + higher-priority files first
  const priority = (rel: string) => {
    const base = path.basename(rel);
    if (base === 'main.py' || base === 'main.ts' || base === 'index.ts') return 0;
    if (base.startsWith('README') || base === 'CLAUDE.md' || base === 'SPEC.md') return 1;
    if (base === 'package.json' || base === 'pyproject.toml' || base === 'Cargo.toml') return 2;
    return 3;
  };
  files.sort((a, b) => priority(a.rel) - priority(b.rel) || a.size - b.size);

  const parts: string[] = [];
  let total = 0;
  for (const f of files) {
    if (total >= maxTotalChars) break;
    try {
      let content = fs.readFileSync(f.abs, 'utf-8');
      const budget = Math.min(8000, maxTotalChars - total);
      if (content.length > budget) content = content.slice(0, budget) + '\n... [truncated]';
      const block = `### ${f.rel}\n\`\`\`\n${content}\n\`\`\``;
      parts.push(block);
      total += block.length;
    } catch { /* skip unreadable */ }
  }

  if (parts.length === 0) return '';
  return `## Project Source Files (${parts.length} files read)\n\n${parts.join('\n\n')}`;
}

export const chatRouter: ReturnType<typeof Router> = Router();

// GET /api/chat/:projectId — get chat history
chatRouter.get('/:projectId', (req, res) => {
  const history = getChatHistory(req.params.projectId);
  res.json({ history });
});

// POST /api/chat/:projectId — send a message (streaming via SSE)
chatRouter.post('/:projectId', async (req, res) => {
  const { message, useCLI = true } = req.body;

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // Load conversation history to thread multi-turn context
    const db = getDb();
    const historyRow = db.prepare('SELECT history_json FROM ai_sessions WHERE project_id = ?').get(req.params.projectId) as any;
    const history: { id: string; role: 'user' | 'assistant'; content: string; timestamp: string }[] = JSON.parse(historyRow?.history_json || '[]');
    const conversationHistory = history.slice(-20).map(m => ({ role: m.role, content: m.content }));

    // Read actual project source files so the AI can answer code questions
    const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(req.params.projectId) as { path: string } | undefined;
    const fileContext = project?.path ? readProjectFiles(project.path) : '';

    let fullResponse = '';
    for await (const event of orchestrator.processInteraction(message, {
      projectId: req.params.projectId,
      useCLI,
      history: conversationHistory,
      fileContext,
    })) {
      if (event.type === 'chunk') fullResponse += event.content;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Save this turn to history
    history.push({ id: uuid(), role: 'user', content: message, timestamp: new Date().toISOString() });
    if (fullResponse) {
      history.push({ id: uuid(), role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() });
    }

    // Ensure session row exists then update
    db.prepare('INSERT OR IGNORE INTO ai_sessions (id, project_id, history_json) VALUES (?, ?, ?)').run(uuid(), req.params.projectId, '[]');
    db.prepare('UPDATE ai_sessions SET history_json = ?, updated_at = ? WHERE project_id = ?')
      .run(JSON.stringify(history), new Date().toISOString(), req.params.projectId);

  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

// DELETE /api/chat/:projectId — clear chat history
chatRouter.delete('/:projectId', (_req, res) => {
  clearChatHistory(_req.params.projectId);
  res.json({ success: true });
});

// GET /api/chat/:projectId/brief — check if session brief exists
chatRouter.get('/:projectId/brief', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(req.params.projectId) as { path: string } | undefined;
  if (!project?.path) { res.json({ exists: false }); return; }
  const briefPath = path.join(project.path, 'NEXT_SESSION_PROMPT.md');
  const exists = fs.existsSync(briefPath);
  let size = 0;
  if (exists) { try { size = fs.statSync(briefPath).size; } catch {} }
  res.json({ exists, size, path: briefPath });
});

// POST /api/chat/:projectId/brief — save/append AI response to NEXT_SESSION_PROMPT.md
chatRouter.post('/:projectId/brief', (req, res) => {
  const { content } = req.body;
  if (!content) { res.status(400).json({ error: 'content required' }); return; }
  const db = getDb();
  const project = db.prepare('SELECT path, name FROM projects WHERE id = ?').get(req.params.projectId) as { path: string; name: string } | undefined;
  if (!project?.path) { res.status(404).json({ error: 'Project not found' }); return; }

  const briefPath = path.join(project.path, 'NEXT_SESSION_PROMPT.md');
  const timestamp = new Date().toLocaleString();
  const block = `\n\n---\n*Saved from Cortex Chat — ${timestamp}*\n\n${content}\n`;

  let existing = '';
  try { existing = fs.readFileSync(briefPath, 'utf-8'); } catch { /* new file */ }

  if (!existing) {
    fs.writeFileSync(briefPath, `# Session Brief — ${project.name}\n${block}`, 'utf-8');
  } else {
    fs.appendFileSync(briefPath, block, 'utf-8');
  }

  res.json({ success: true, path: briefPath });
});

// DELETE /api/chat/:projectId/brief — delete the session brief
chatRouter.delete('/:projectId/brief', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(req.params.projectId) as { path: string } | undefined;
  if (!project?.path) { res.status(404).json({ error: 'Project not found' }); return; }
  const briefPath = path.join(project.path, 'NEXT_SESSION_PROMPT.md');
  try { fs.unlinkSync(briefPath); } catch { /* already gone */ }
  res.json({ success: true });
});

// GET /api/chat/:projectId/export — export chat as JSON
chatRouter.get('/:projectId/export', (req, res) => {
  const history = getChatHistory(req.params.projectId);
  const db = getDb();
  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(req.params.projectId) as any;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=cortex-chat-${project?.name || 'unknown'}.json`);
  res.json({
    project: project?.name,
    exportedAt: new Date().toISOString(),
    messageCount: history.length,
    history,
  });
});

// --- Project Brain routes ---

// GET /api/brain/:projectId — get project brain
chatRouter.get('/brain/:projectId', (req, res) => {
  const brain = getProjectBrain(req.params.projectId);
  res.json({ brain: brain || { summary: '', architectureNotes: '', knownIssues: '', decisions: '', conventions: '', dependenciesNotes: '' } });
});

// PUT /api/brain/:projectId — update project brain
chatRouter.put('/brain/:projectId', (req, res) => {
  const fields = req.body;
  updateProjectBrain(req.params.projectId, fields);
  const brain = getProjectBrain(req.params.projectId);
  res.json({ brain });
});
