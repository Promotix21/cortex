import express from 'express';
import cors from 'cors';
import { initDb, closeDb, getDb } from './db/index.js';
import { projectsRouter } from './routes/projects.js';
import { sessionsRouter } from './routes/sessions.js';
import { terminalsRouter } from './routes/terminals.js';
import { chatRouter } from './routes/chat.js';
import { notesRouter, tasksRouter } from './routes/notes.js';
import { gitRouter } from './routes/git.js';
import { intelligenceRouter } from './routes/intelligence.js';
import { bridgeRouter } from './routes/bridge.js';
import { referenceRouter } from './routes/reference.js';
import { policiesRouter, playbooksRouter } from './routes/policies.js';
import { checkPolicy } from './routes/policy-check.js';
import { workspaceRouter, contextRouter } from './routes/workspace.js';
import { getBridgeClient } from './bridge/bridge-client.js';
import { getBackgroundWorker } from './intelligence/background-worker.js';
import { jobsRouter } from './routes/jobs.js';
import { getSessionManager } from './sessions/session-manager.js';
import { getTerminalManager } from './terminals/terminal-manager.js';

const PORT = 4700;
const app = express();

// Middleware
app.use(cors({ origin: ['http://localhost:1420', 'tauri://localhost'] }));
app.use(express.json());

// Initialize database
initDb();

// Initialize managers
const sessionManager = getSessionManager();
const terminalManager = getTerminalManager();

// Routes
app.get('/api/health', (_req, res) => {
  const activeSessions = sessionManager.getActiveSessions().length;
  const activeTerminals = terminalManager.activeCount;
  res.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    activeSessions,
    activeTerminals,
  });
});

app.use('/api/projects', projectsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/terminals', terminalsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/notes', notesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/git', gitRouter);
app.use('/api/intelligence', intelligenceRouter);
app.use('/api/bridge', bridgeRouter);

app.use('/api/reference', referenceRouter);
// Policy check — use app.all for exact path match (Express 5 app.use is prefix-only)
app.all('/api/policy-check', checkPolicy);
app.use('/api/policies', policiesRouter);
app.use('/api/playbooks', playbooksRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/context', contextRouter);
app.use('/api/jobs', jobsRouter);

// Start bridge client polling
const bridgeClient = getBridgeClient();
bridgeClient.start(3000);

// Start background intelligence worker (every 5 min)
const bgWorker = getBackgroundWorker();
bgWorker.start(300000);

// Start server
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[cortex-sidecar] Running on http://127.0.0.1:${PORT}`);
  console.log(`[cortex-sidecar] Session manager ready`);
  console.log(`[cortex-sidecar] Terminal manager ready`);
});

// Graceful shutdown
function shutdown() {
  console.log('[cortex-sidecar] Shutting down...');
  sessionManager.destroy();
  terminalManager.destroy();
  bridgeClient.stop();
  bgWorker.stop();
  server.close();
  closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
