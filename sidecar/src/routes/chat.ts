import { Router } from 'express';
import { getDb } from '../db/index.js';
import {
  getChatHistory,
  clearChatHistory,
  getProjectBrain,
  updateProjectBrain,
} from '../chat/chat-service.js';
import { orchestrator } from '../orchestrator/index.js';
import { v4 as uuid } from 'uuid';

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
    let fullResponse = '';
    for await (const event of orchestrator.processInteraction(message, {
      projectId: req.params.projectId,
      useCLI
    })) {
      if (event.type === 'chunk') fullResponse += event.content;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // Save history (simplified for now, ideally the orchestrator handles this)
    const db = getDb();
    const historyRow = db.prepare('SELECT history_json FROM ai_sessions WHERE project_id = ?').get(req.params.projectId) as any;
    let history = JSON.parse(historyRow?.history_json || '[]');
    history.push({ id: uuid(), role: 'user', content: message, timestamp: new Date().toISOString() });
    if (fullResponse) {
      history.push({ id: uuid(), role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() });
    }
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
