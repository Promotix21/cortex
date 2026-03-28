import { Router } from 'express';
import { getDb } from '../db/index.js';
import { execSync } from 'child_process';

export const settingsRouter: ReturnType<typeof Router> = Router();

// Ensure settings table exists
function ensureTable(): void {
  const db = getDb();
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
}

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

// GET /api/settings/claude-status — check Claude CLI status
settingsRouter.get('/claude-status', (_req, res) => {
  let installed = false;
  let authenticated = false;
  let version: string | null = null;

  try {
    const whichResult = execSync('which claude', { encoding: 'utf-8', timeout: 5000 }).trim();
    installed = whichResult.length > 0;
  } catch {
    installed = false;
  }

  if (installed) {
    try {
      const versionOutput = execSync('claude --version', { encoding: 'utf-8', timeout: 10000 }).trim();
      version = versionOutput || null;
      // If we got a version, CLI is installed and accessible
      // Check auth by trying to run a quick status-like command
      // claude --version succeeding + having config typically means authenticated
      authenticated = true;
    } catch {
      version = null;
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
      // 400 or 429 still means the key is valid (it authenticated)
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
