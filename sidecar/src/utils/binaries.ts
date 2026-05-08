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
 * Find the claude binary path using multiple strategies.
 * Returns the path string if found, null otherwise.
 */
export function findClaudeBinary(): string | null {
  // 1. Try login shell which command (picks up nvm, user PATH)
  try {
    const shell = process.env.SHELL || '/bin/bash';
    const result = execSync(`${shell} -lc 'which claude 2>/dev/null'`, {
      encoding: 'utf-8',
      timeout: 8000,
      env: { ...process.env, HOME },
    }).trim();
    if (result && fs.existsSync(result)) return result;
  } catch { /* fall through */ }

  // 2. Direct filesystem scan
  const candidates = [
    `${HOME}/.local/bin/claude`,
    `${HOME}/.npm-global/bin/claude`,
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 3. Scan ~/.nvm/versions/node/*/bin/claude
  const nvmDir = `${HOME}/.nvm/versions/node`;
  if (fs.existsSync(nvmDir)) {
    try {
      for (const ver of fs.readdirSync(nvmDir)) {
        const p = `${nvmDir}/${ver}/bin/claude`;
        if (fs.existsSync(p)) return p;
      }
    } catch { /* ignore */ }
  }

  return null;
}
