import { execSync, spawnSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';

const HOME = process.env.HOME || os.homedir();

/**
 * Run a prompt through Claude CLI and return the text response.
 * Uses `claude -p` (print mode) — one-shot, no interactive session.
 * Returns null if Claude CLI is unavailable or errors out.
 */
export async function claudeAnalyze(prompt: string, options?: { timeoutMs?: number; maxTokens?: number }): Promise<string | null> {
  const claudePath = findClaudeBinary();
  if (!claudePath) {
    console.warn('[claudeAnalyze] Claude CLI not found, skipping AI analysis');
    return null;
  }

  const timeout = options?.timeoutMs ?? 120_000; // 2 min default
  const args = ['-p', prompt, '--output-format', 'text'];
  if (options?.maxTokens) {
    args.push('--max-tokens', String(options.maxTokens));
  }

  return new Promise((resolve) => {
    const proc = spawn(claudePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, HOME },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      console.warn('[claudeAnalyze] Timed out after', timeout, 'ms');
      resolve(null);
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stderr.includes('Warning')) {
        console.warn('[claudeAnalyze] Exit code', code, stderr.slice(0, 200));
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      console.warn('[claudeAnalyze] Spawn error:', err.message);
      resolve(null);
    });
  });
}

/**
 * Check if a command exists in the system PATH.
 */
export function shellExists(cmd: string): boolean {
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? `where.exe ${cmd}` : `command -v ${cmd}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the claude binary path using multiple strategies.
 * Returns the path string if found, null otherwise.
 */
export function findClaudeBinary(): string | null {
  const isWin = process.platform === 'win32';

  // 1. Try which/where
  try {
    const checkCmd = isWin ? 'where.exe claude' : 'command -v claude';
    const result = execSync(checkCmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result) {
      // where.exe can return multiple lines
      const first = result.split('\n')[0].trim();
      if (fs.existsSync(first)) return first;
    }
  } catch { /* fall through */ }

  // 2. Direct filesystem scan
  const candidates = isWin ? [
    `${process.env.APPDATA}\\npm\\claude.cmd`,
    `${process.env.USERPROFILE}\\AppData\\Roaming\\npm\\claude.cmd`,
    'C:\\Program Files\\nodejs\\claude.cmd',
  ] : [
    `${HOME}/.local/bin/claude`,
    `${HOME}/.npm-global/bin/claude`,
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 3. Scan ~/.nvm/versions/node/*/bin/claude (Linux only)
  if (!isWin) {
    const nvmDir = `${HOME}/.nvm/versions/node`;
    if (fs.existsSync(nvmDir)) {
      try {
        for (const ver of fs.readdirSync(nvmDir)) {
          const p = `${nvmDir}/${ver}/bin/claude`;
          if (fs.existsSync(p)) return p;
        }
      } catch { /* ignore */ }
    }
  }

  return null;
}

