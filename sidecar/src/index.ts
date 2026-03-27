import express from 'express';
import cors from 'cors';
import { initDb, closeDb } from './db/index.js';
import { projectsRouter } from './routes/projects.js';
import { sessionsRouter } from './routes/sessions.js';
import { getSessionManager } from './sessions/session-manager.js';

const PORT = 4700;
const app = express();

// Middleware
app.use(cors({ origin: ['http://localhost:1420', 'tauri://localhost'] }));
app.use(express.json());

// Initialize database
initDb();

// Initialize session manager
const sessionManager = getSessionManager();

// Routes
app.get('/api/health', (_req, res) => {
  const activeSessions = sessionManager.getActiveSessions().length;
  res.json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    activeSessions,
  });
});

app.use('/api/projects', projectsRouter);
app.use('/api/sessions', sessionsRouter);

// Start server
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[cortex-sidecar] Running on http://127.0.0.1:${PORT}`);
  console.log(`[cortex-sidecar] Session manager ready`);
});

// Graceful shutdown
function shutdown() {
  console.log('[cortex-sidecar] Shutting down...');
  sessionManager.destroy();
  server.close();
  closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
