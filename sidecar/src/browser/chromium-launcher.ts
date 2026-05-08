/**
 * Chromium Launcher — discovers the system Chromium/Chrome binary and spawns
 * it with the Chrome DevTools Protocol remote debugging port open.
 *
 * Never bundles a browser. Honors CHROME_PATH for user override.
 */

import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const LINUX_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];
const MACOS_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const WIN_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

export function findChromiumBinary(): string | null {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const platform = os.platform();
  const candidates = platform === 'darwin' ? MACOS_CANDIDATES : platform === 'win32' ? WIN_CANDIDATES : LINUX_CANDIDATES;
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export interface LaunchOptions {
  port?: number;
  headless?: boolean;
  userDataDir?: string;
  windowSize?: { width: number; height: number };
}

export interface LaunchedBrowser {
  process: ChildProcess;
  port: number;
  pid: number;
  userDataDir: string;
}

export async function launchChromium(opts: LaunchOptions = {}): Promise<LaunchedBrowser> {
  const binary = findChromiumBinary();
  if (!binary) {
    throw new Error('No Chromium/Chrome binary found. Install google-chrome or set CHROME_PATH.');
  }

  const port = opts.port ?? 9222;
  const headless = opts.headless ?? false;
  const userDataDir = opts.userDataDir ?? path.join(os.homedir(), '.cortex', 'browser-profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  const size = opts.windowSize ?? { width: 1280, height: 800 };

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${size.width},${size.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,OptimizationHints',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ];
  if (headless) args.push('--headless=new');

  const proc = spawn(binary, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Drain stdout/stderr so Chromium doesn't block on full buffers
  proc.stdout?.on('data', () => {});
  proc.stderr?.on('data', () => {});

  // Wait for the DevTools endpoint to come up
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await pingDevTools(port)) {
      return { process: proc, port, pid: proc.pid!, userDataDir };
    }
    await sleep(100);
  }

  try { proc.kill('SIGTERM'); } catch { /* ignore */ }
  throw new Error(`Chromium launched but DevTools port ${port} did not open within 10s.`);
}

async function pingDevTools(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function getTargets(port: number): Promise<Array<{ id: string; type: string; title: string; url: string; webSocketDebuggerUrl: string }>> {
  const r = await fetch(`http://127.0.0.1:${port}/json`);
  if (!r.ok) throw new Error(`GET /json failed: ${r.status}`);
  return (await r.json()) as any;
}

export async function getFirstPageTarget(port: number): Promise<{ id: string; url: string; webSocketDebuggerUrl: string } | null> {
  const targets = await getTargets(port);
  const page = targets.find(t => t.type === 'page');
  return page ? { id: page.id, url: page.url, webSocketDebuggerUrl: page.webSocketDebuggerUrl } : null;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
