import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
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
import { settingsRouter } from './routes/settings.js';
import { explorerRouter } from './routes/explorer.js';
import { mempalaceRouter } from './routes/mempalace.js';
import { shadowRouter } from './routes/shadow.js';
import { browserRouter } from './routes/browser.js';
import { vaultRouter } from './routes/vault.js';
import { getBrowserSession } from './browser/browser-session.js';
import { getBridgeClient } from './bridge/bridge-client.js';
import { getBackgroundWorker } from './intelligence/background-worker.js';
import { jobsRouter } from './routes/jobs.js';
import { budgetRouter } from './routes/budget.js';
import { providersRouter } from './routes/providers.js';
import { remotionRouter } from './routes/remotion.js';
import { getSessionManager } from './sessions/session-manager.js';
import { getTerminalManager } from './terminals/terminal-manager.js';
import { startMCPServer, stopMCPServer } from './mcp/mcp-server.js';
import { watchProject } from './intelligence/file-indexer.js';
import { maybeRunBackfillOnBoot } from './intelligence/backfill.js';

const PORT = 4700;
const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:1420',
    'tauri://localhost',
    'http://tauri.localhost',
    'https://tauri.localhost',
  ],
}));
app.use(express.json());

// Initialize database
initDb();

// Clean up stale sessions AND terminals from previous runs (crash/hibernation recovery)
const dbClean = getDb();
const staleCount = dbClean.prepare("UPDATE claude_sessions SET status = 'completed' WHERE status = 'running' OR status = 'idle'").run();
if (staleCount.changes > 0) {
  console.log(`[cleanup] Marked ${staleCount.changes} stale session(s) as completed`);
}
const staleTerminals = dbClean.prepare("UPDATE terminals SET status = 'stopped' WHERE status = 'running'").run();
if (staleTerminals.changes > 0) {
  console.log(`[cleanup] Marked ${staleTerminals.changes} stale terminal(s) as exited`);
}
// Clear any stale file locks left by a crashed process
const staleLocks = dbClean.prepare("DELETE FROM file_locks WHERE 1=1").run();
if (staleLocks.changes > 0) {
  console.log(`[cleanup] Cleared ${staleLocks.changes} stale file lock(s)`);
}

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
app.use('/api/budget', budgetRouter);
app.use('/api/providers', providersRouter);
app.use('/api/remotion', remotionRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/explorer', explorerRouter);
app.use('/api/mempalace', mempalaceRouter);
app.use('/api/shadow', shadowRouter);
app.use('/api/browser', browserRouter);
app.use('/api/vault', vaultRouter);

// Start bridge client polling
const bridgeClient = getBridgeClient();
bridgeClient.start(3000);

// Start background intelligence worker (every 5 min)
const bgWorker = getBackgroundWorker();
bgWorker.start(300000);

// Start MCP server (port 4710)
startMCPServer();

// Kill zombie sidecar processes from a previous crash BEFORE we try to bind the port.
function killZombiesOnPort(port: number): void {
  try {
    // fuser -k is more reliable than lsof+kill — it atomically finds and kills all processes on the port
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { encoding: 'utf8' });
  } catch {
    // fuser not available, try lsof fallback
    try {
      const output = execSync(`lsof -ti tcp:${port} 2>/dev/null || true`, { encoding: 'utf8' }).trim();
      if (!output) return;
      const pids = output.split('\n').map(p => parseInt(p.trim(), 10)).filter(p => p && p !== process.pid);
      for (const pid of pids) {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
      }
    } catch { /* no tools available */ }
  }
}

// Start server with retry — handles zombie processes and TIME_WAIT port states after crash/hibernation.
// On EADDRINUSE: kill zombies, wait for OS to release the port, retry up to 5 times.
function startServerWithRetry(attempt = 0): Promise<ReturnType<typeof app.listen>> {
  return new Promise((resolve, reject) => {
    // Listen on '::' (IPv6 wildcard) — Node enables dual-stack by default,
    // so this also accepts IPv4 connections on 127.0.0.1. This fixes WebKitGTK
    // which resolves 'localhost' to ::1 (IPv6) and refuses to fall back to IPv4.
    const srv = app.listen(PORT, '::', () => {
      console.log(`[cortex-sidecar] Running on http://localhost:${PORT} (dual-stack)`);
      console.log(`[cortex-sidecar] Session manager ready`);
      console.log(`[cortex-sidecar] Terminal manager ready`);
      resolve(srv);
    });

    srv.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < 5) {
        console.warn(`[cortex-sidecar] Port ${PORT} in use (attempt ${attempt + 1}/5) — killing zombies and retrying...`);
        killZombiesOnPort(PORT);
        // Wait for OS to fully release the port (TIME_WAIT can linger)
        setTimeout(() => {
          startServerWithRetry(attempt + 1).then(resolve, reject);
        }, 1000);
      } else {
        console.error(`[cortex-sidecar] FATAL: Could not bind port ${PORT}: ${err.message}`);
        process.exit(1);
      }
    });
  });
}

// Start server FIRST so the frontend can connect immediately
let server: ReturnType<typeof app.listen>;
startServerWithRetry().then(srv => { server = srv; });

// Initialize watchers AFTER the server is up — watchProject does synchronous
// file indexing per project which can take many seconds across 20+ projects.
// Doing this before app.listen() was blocking the port from opening, causing
// the 15-second waitForSidecar timeout to expire with an empty project list.
setImmediate(() => {
  const allProjects = dbClean.prepare('SELECT id, path FROM projects').all() as any[];
  for (const p of allProjects) {
    watchProject(p.id, p.path);
  }
});

// Lazy boot-time backfill — kicks off only if there are unprocessed sessions.
// Runs in the background; the API endpoint /intelligence/backfill/status reports progress.
setTimeout(() => {
  try { maybeRunBackfillOnBoot(); } catch (err) { console.warn('[backfill] boot run skipped:', err); }
}, 5000);

// Graceful shutdown
function shutdown() {
  console.log('[cortex-sidecar] Shutting down...');
  sessionManager.destroy();
  terminalManager.destroy();
  bridgeClient.stop();
  bgWorker.stop();
  stopMCPServer();
  getBrowserSession().close().catch(() => {});
  server.close();
  closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
