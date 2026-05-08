import { Router } from 'express';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import { shadowBus, type ShadowEvent } from '../orchestrator/event-bus.js';
import { computeImpactForFiles, getDependents } from '../intelligence/impact-graph.js';

export const shadowRouter: ReturnType<typeof Router> = Router();

// GET /api/shadow/stream?projectId=...  — SSE stream of orchestrator events
shadowRouter.get('/stream', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const sinceTs = req.query.since ? Number(req.query.since) : undefined;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Replay recent buffered events for the requesting project
  const recent = shadowBus.getRecent(sinceTs, projectId);
  for (const ev of recent) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }

  const listener = (ev: ShadowEvent) => {
    if (projectId && ev.projectId !== projectId) return;
    try {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    } catch { /* client disconnected */ }
  };
  shadowBus.on('shadow', listener);

  // Heartbeat every 15s so proxies don't kill the stream
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { /* noop */ }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    shadowBus.off('shadow', listener);
    try { res.end(); } catch { /* noop */ }
  });
});

// GET /api/shadow/recent?projectId=...&since=... — polling fallback
shadowRouter.get('/recent', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const sinceTs = req.query.since ? Number(req.query.since) : undefined;
  const events = shadowBus.getRecent(sinceTs, projectId);
  res.json({ events, serverTs: Date.now() });
});

// GET /api/shadow/impact?projectId=...&file=... — dependents of a file
shadowRouter.get('/impact', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const file = req.query.file as string | undefined;
  if (!projectId || !file) {
    res.status(400).json({ error: 'projectId and file are required' });
    return;
  }

  const [result] = computeImpactForFiles(projectId, [file]);
  res.json({ result });
});

// POST /api/shadow/impact/batch — batch query: { projectId, files: [...] }
shadowRouter.post('/impact/batch', (req, res) => {
  const { projectId, files } = req.body || {};
  if (!projectId || !Array.isArray(files)) {
    res.status(400).json({ error: 'projectId and files[] are required' });
    return;
  }
  const results = computeImpactForFiles(projectId, files);
  res.json({ results });
});

// GET /api/shadow/dependents?projectId=...&target=... — exact absolute-path match
shadowRouter.get('/dependents', (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const target = req.query.target as string | undefined;
  if (!projectId || !target) {
    res.status(400).json({ error: 'projectId and target are required' });
    return;
  }
  const dependents = getDependents(projectId, target);
  res.json({ target, dependents, count: dependents.length });
});

export interface TestExecResult {
  jobId: string;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  passed: boolean;
  durationMs: number;
}

// POST /api/shadow/exec — run a shell command, capture output, emit test events
// Body: { projectId, command, cwd?, timeoutMs? }
shadowRouter.post('/exec', async (req, res) => {
  const { projectId, command, cwd, timeoutMs = 120_000 } = req.body || {};
  if (!projectId || !command) {
    res.status(400).json({ error: 'projectId and command are required' });
    return;
  }

  const jobId = uuid();
  const runId = uuid();
  const startTs = Date.now();

  shadowBus.emitEvent({
    runId,
    projectId,
    type: 'test:start',
    payload: { jobId, command, cwd: cwd || process.cwd() },
  });

  try {
    const result = await runCommand(command, cwd || process.cwd(), timeoutMs as number);
    const durationMs = Date.now() - startTs;

    shadowBus.emitEvent({
      runId,
      projectId,
      type: 'test:end',
      payload: {
        jobId,
        command,
        exitCode: result.exitCode,
        passed: result.exitCode === 0,
        durationMs,
        stdoutPreview: result.stdout.slice(-1000),
        stderrPreview: result.stderr.slice(-500),
      },
    });

    const response: TestExecResult = {
      jobId,
      command,
      cwd: cwd || process.cwd(),
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      passed: result.exitCode === 0,
      durationMs,
    };
    res.json(response);
  } catch (err: any) {
    const durationMs = Date.now() - startTs;
    shadowBus.emitEvent({
      runId,
      projectId,
      type: 'test:end',
      payload: { jobId, command, exitCode: -1, passed: false, durationMs, error: err.message },
    });
    res.status(500).json({ error: err.message, jobId });
  }
});

function runCommand(command: string, cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const errChunks: string[] = [];
    let timedOut = false;

    const child = spawn('bash', ['-c', command], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => chunks.push(d.toString()));
    child.stderr.on('data', (d: Buffer) => errChunks.push(d.toString()));

    child.on('close', (code) => {
      clearTimeout(timer);
      if (!timedOut) {
        resolve({ stdout: chunks.join(''), stderr: errChunks.join(''), exitCode: code ?? 1 });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) reject(err);
    });
  });
}
