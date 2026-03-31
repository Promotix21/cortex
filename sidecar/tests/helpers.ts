// Set test DB dir BEFORE any sidecar modules are imported
const testDir = '/tmp/cortex-test-' + process.pid;
process.env.CORTEX_DB_DIR = testDir;

import express from 'express';
import { initDb, closeDb, getDb } from '../src/db/index.js';
import { projectsRouter } from '../src/routes/projects.js';
import { intelligenceRouter } from '../src/routes/intelligence.js';
import { budgetRouter } from '../src/routes/budget.js';
import { bridgeRouter } from '../src/routes/bridge.js';
import { notesRouter, tasksRouter } from '../src/routes/notes.js';
import { settingsRouter } from '../src/routes/settings.js';
import type { Express } from 'express';
import http from 'http';

let app: Express;
let server: http.Server;
let baseUrl: string;
let initialized = false;

export function getBaseUrl() { return baseUrl; }

export async function setupTestApp(): Promise<void> {
  if (initialized) {
    // Already running — just return (shared across test files in same process)
    return;
  }

  initDb();
  initialized = true;

  app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', activeSessions: 0, activeTerminals: 0 });
  });

  app.use('/api/projects', projectsRouter);
  app.use('/api/intelligence', intelligenceRouter);
  app.use('/api/budget', budgetRouter);
  app.use('/api/bridge', bridgeRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/settings', settingsRouter);

  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
}

export async function teardownTestApp(): Promise<void> {
  // Don't actually tear down — shared across test files
  // Cleanup happens on process exit
}

export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
