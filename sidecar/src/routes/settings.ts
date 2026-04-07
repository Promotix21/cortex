import { Router } from 'express';
import { getDb } from '../db/index.js';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';

export const settingsRouter: ReturnType<typeof Router> = Router();

// Ensure settings table exists
function ensureTable(): void {
  const db = getDb();
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
}

// IMPORTANT: Specific routes MUST come before parameterized routes in Express 5

// Resolve the true home directory — os.homedir() reads /etc/passwd, immune to missing HOME env
const HOME = process.env.HOME || os.homedir();

/**
 * Find the claude binary path using multiple strategies.
 * Returns the path string if found, null otherwise.
 * Robust against Tauri launching with a stripped environment.
 */
function findClaudeBinary(): string | null {
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

  // 2. Direct filesystem scan — covers all known install locations
  const candidates = [
    `${HOME}/.local/bin/claude`,
    `${HOME}/.npm-global/bin/claude`,
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    `${HOME}/.nvm/versions/node/v20.0.0/bin/claude`,
    `${HOME}/.nvm/versions/node/v22.0.0/bin/claude`,
    `${HOME}/.nvm/versions/node/v23.0.0/bin/claude`,
    `${HOME}/.nvm/versions/node/v24.0.0/bin/claude`,
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 3. Scan ~/.nvm/versions/node/*/bin/claude (any node version)
  const nvmDir = `${HOME}/.nvm/versions/node`;
  if (fs.existsSync(nvmDir)) {
    for (const ver of fs.readdirSync(nvmDir)) {
      const p = `${nvmDir}/${ver}/bin/claude`;
      if (fs.existsSync(p)) return p;
    }
  }

  // 4. Scan ~/.local/share/claude/versions/ (claude's own install dir)
  const claudeVersions = `${HOME}/.local/share/claude/versions`;
  if (fs.existsSync(claudeVersions)) {
    const versions = fs.readdirSync(claudeVersions).sort().reverse();
    if (versions.length > 0) {
      // The binary is the versioned directory itself (executable)
      const p = `${claudeVersions}/${versions[0]}`;
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

// GET /api/settings/claude-status — check Claude CLI status
settingsRouter.get('/claude-status', (_req, res) => {
  let installed = false;
  let authenticated = false;
  let version: string | null = null;

  const claudePath = findClaudeBinary();
  installed = !!claudePath;

  if (claudePath) {
    try {
      // Run directly by path — no PATH lookup needed, works in any environment
      const result = spawnSync(claudePath, ['--version'], {
        encoding: 'utf-8',
        timeout: 8000,
        env: { ...process.env, HOME },
      });
      if (result.status === 0 && result.stdout) {
        version = result.stdout.trim().split('\n')[0] || null;
        authenticated = true;
      } else {
        authenticated = false;
      }
    } catch {
      authenticated = false;
    }
  }

  res.json({ installed, authenticated, version });
});

// POST /api/settings/validate-key — validate an Anthropic API key
settingsRouter.post('/validate-key', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    res.status(400).json({ valid: false, error: 'apiKey is required' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (response.ok || response.status === 200) {
      res.json({ valid: true });
    } else if (response.status === 401) {
      res.json({ valid: false, error: 'Invalid API key' });
    } else {
      const status = response.status;
      if (status === 400 || status === 429 || status === 529) {
        res.json({ valid: true });
      } else {
        res.json({ valid: false, error: `Unexpected status: ${status}` });
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.json({ valid: false, error: message });
  }
});

// GET /api/settings — return all settings as object
settingsRouter.get('/', (_req, res) => {
  ensureTable();
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json({ settings });
});

// PUT /api/settings — save a single setting
settingsRouter.put('/', (req, res) => {
  ensureTable();
  const { key, value } = req.body;
  if (!key) {
    res.status(400).json({ error: 'key is required' });
    return;
  }
  const db = getDb();
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value ?? '');
  res.json({ success: true });
});
