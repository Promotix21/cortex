/**
 * cortex-node — Backend error bridge for Cortex
 *
 * Install in any Node.js/Express project:
 *   npm install cortex-node
 *
 * Usage:
 *   import { initCortex } from 'cortex-node';
 *   initCortex({ projectId: 'your-project-id' });
 *
 * Express middleware:
 *   app.use(cortexErrorMiddleware());
 */

import { request } from 'node:http';

export interface CortexConfig {
  /** Cortex project ID. Find it in Cortex Settings > Projects. */
  projectId: string;
  /** Cortex sidecar URL. Default: http://localhost:4700 */
  cortexUrl?: string;
  /** Intercept console.error calls. Default: true */
  patchConsole?: boolean;
  /** Capture unhandledRejection and uncaughtException. Default: true */
  captureGlobalErrors?: boolean;
  /** Log to stdout when an error is sent. Default: false */
  verbose?: boolean;
}

let config: Required<CortexConfig> | null = null;

function send(payload: Record<string, unknown>): void {
  if (!config) return;
  const body = JSON.stringify({ ...payload, project_id: config.projectId });
  const opts = {
    hostname: 'localhost',
    port: new URL(config.cortexUrl).port || 4700,
    path: '/api/bridge/errors',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  try {
    const req = request(opts, (res) => {
      if (config?.verbose) console.log(`[cortex-node] sent (${res.statusCode})`);
    });
    req.on('error', () => { /* silent — Cortex not running is fine */ });
    req.write(body);
    req.end();
  } catch { /* never crash the host app */ }
}

function sendNetworkFailure(payload: Record<string, unknown>): void {
  if (!config) return;
  const body = JSON.stringify({ ...payload, project_id: config.projectId });
  const opts = {
    hostname: 'localhost',
    port: new URL(config.cortexUrl).port || 4700,
    path: '/api/bridge/network',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  try {
    const req = request(opts);
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch {}
}

function captureError(err: unknown, source: string): void {
  const error = err instanceof Error ? err : new Error(String(err));
  send({
    error_type: error.name || 'Error',
    message: error.message,
    stack: error.stack,
    source,
  });
}

/**
 * Initialize Cortex error capture for this Node.js process.
 * Call once at app startup, before any other code.
 */
export function initCortex(opts: CortexConfig): void {
  config = {
    cortexUrl: 'http://localhost:4700',
    patchConsole: true,
    captureGlobalErrors: true,
    verbose: false,
    ...opts,
  };

  if (config.captureGlobalErrors) {
    process.on('uncaughtException', (err) => {
      captureError(err, 'uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      captureError(reason, 'unhandledRejection');
    });
  }

  if (config.patchConsole) {
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      original(...args);
      const message = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
      const stack = args.find((a) => a instanceof Error)?.stack;
      send({ error_type: 'console.error', message, stack, source: 'console' });
    };
  }
}

/**
 * Manually capture an error and send it to Cortex.
 */
export function captureToCorex(err: unknown, context?: string): void {
  captureError(err, context || 'manual');
}

/**
 * Express error middleware. Add after all routes:
 *   app.use(cortexErrorMiddleware());
 */
export function cortexErrorMiddleware() {
  return function cortexMiddleware(
    err: Error,
    req: { method: string; url: string; headers: Record<string, string> },
    _res: unknown,
    next: (err: Error) => void
  ) {
    send({
      error_type: err.name || 'ExpressError',
      message: err.message,
      stack: err.stack,
      source: `${req.method} ${req.url}`,
    });
    next(err);
  };
}

/**
 * Report a failed HTTP request (outbound) to Cortex.
 * Useful for logging upstream API failures.
 */
export function captureNetworkFailure(opts: {
  method: string;
  url: string;
  statusCode: number;
  durationMs?: number;
  error?: string;
}): void {
  sendNetworkFailure({
    method: opts.method,
    url: opts.url,
    status_code: opts.statusCode,
    duration_ms: opts.durationMs ?? 0,
    failed: opts.statusCode === 0 || opts.statusCode >= 500 ? 1 : 0,
    error: opts.error,
  });
}
