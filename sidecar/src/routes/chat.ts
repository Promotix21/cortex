import { Router } from 'express';
import { getDb } from '../db/index.js';
import {
  getChatHistory,
  clearChatHistory,
  sendMessage,
  getProjectBrain,
  updateProjectBrain,
} from '../chat/chat-service.js';

export const chatRouter: ReturnType<typeof Router> = Router();

// GET /api/chat/:projectId — get chat history
chatRouter.get('/:projectId', (req, res) => {
  const history = getChatHistory(req.params.projectId);
  res.json({ history });
});

// POST /api/chat/:projectId — send a message (streaming via SSE)
chatRouter.post('/:projectId', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // Get project name
  const db = getDb();
  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(req.params.projectId) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const event of sendMessage(req.params.projectId, project.name, message)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
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
