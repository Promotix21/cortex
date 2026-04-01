import { Router } from 'express';
import { getDb } from '../db/index.js';
import { execSync } from 'child_process';
import fs from 'fs';

export const settingsRouter: ReturnType<typeof Router> = Router();

// Ensure settings table exists
function ensureTable(): void {
  const db = getDb();
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
}

// IMPORTANT: Specific routes MUST come before parameterized routes in Express 5

// GET /api/settings/claude-status — check Claude CLI status
settingsRouter.get('/claude-status', (_req, res) => {
  let installed = false;
  let authenticated = false;
  let version: string | null = null;

  const shellCmd = (cmd: string) => {
    const shell = process.env.SHELL || '/bin/bash';
    return execSync(`${shell} -lc '${cmd}'`, {
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env, HOME: process.env.HOME || '/home/' + (process.env.USER || 'user') },
    }).trim();
  };

  try {
    const whichResult = shellCmd('which claude');
    installed = whichResult.length > 0;
  } catch {
    const commonPaths = [
      `${process.env.HOME}/.local/bin/claude`,
      `${process.env.HOME}/.nvm/versions/node/${process.version}/bin/claude`,
      `${process.env.HOME}/.npm-global/bin/claude`,
      '/usr/local/bin/claude',
      '/usr/bin/claude',
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) { installed = true; break; }
    }
  }

  if (installed) {
    try {
      const versionOutput = shellCmd('claude --version');
      version = versionOutput.split('\n')[0] || null;
      authenticated = true;
    } catch {
      installed = true;
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
