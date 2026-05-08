import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Cortex hook installer for Claude Code.
 *
 * The whole reason MemPalace looks idle even with twelve projects of session
 * history: nothing in Claude Code's loop forces a consultation. We fix that by
 * dropping three small shell scripts under ~/.claude/cortex-hooks/ and wiring
 * them into ~/.claude/settings.json:
 *
 *   UserPromptSubmit  → cortex-prime.sh    : injects brain summary + memory policy
 *   PreToolUse        → cortex-hint.sh     : injects observation IDs before Glob/Grep/Read
 *   Stop              → cortex-session-end : extracts fixes, optional git auto-commit
 *
 * Each script reads Claude Code's hook JSON from stdin and forwards it to the
 * sidecar on :4700. Synchronous hooks have a tight timeout so they never
 * block the loop; the Stop hook is fire-and-forget so session close is never
 * delayed.
 */

const HOME = process.env.HOME || os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const HOOKS_DIR = path.join(CLAUDE_DIR, 'cortex-hooks');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

const SIDECAR_BASE = 'http://localhost:4700';

const PRIME_SCRIPT = `#!/bin/sh
# Cortex prime hook — injects brain summary + memory policy into context.
# Managed by Cortex; edits will be overwritten on next install.
INPUT=$(cat)
curl -s --max-time 2 -X POST "${SIDECAR_BASE}/api/intelligence/prime" \\
  -H 'Content-Type: application/json' -d "$INPUT" 2>/dev/null || true
`;

const HINT_SCRIPT = `#!/bin/sh
# Cortex hint hook — fires before Glob/Grep/Read, surfaces matching observations.
INPUT=$(cat)
curl -s --max-time 1 -X POST "${SIDECAR_BASE}/api/intelligence/hint" \\
  -H 'Content-Type: application/json' -d "$INPUT" 2>/dev/null || true
`;

const SESSION_END_SCRIPT = `#!/bin/sh
# Cortex session-end hook — extracts fixes, writes typed observations, runs git auto-commit.
# Fire-and-forget so session close is never blocked.
INPUT=$(cat)
(curl -s --max-time 30 -X POST "${SIDECAR_BASE}/api/intelligence/session-end" \\
  -H 'Content-Type: application/json' -d "$INPUT" 2>/dev/null || true) &
exit 0
`;

const TODO_WRITE_SCRIPT = `#!/bin/sh
# Cortex todo-write hook — captures TodoWrite snapshots for the live tasks sidebar.
# Fire-and-forget; does not influence Claude's loop.
INPUT=$(cat)
(curl -s --max-time 2 -X POST "${SIDECAR_BASE}/api/intelligence/todo-write" \\
  -H 'Content-Type: application/json' -d "$INPUT" 2>/dev/null || true) &
exit 0
`;

interface HookEntry {
  type: 'command';
  command: string;
  timeout?: number;
}

interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

interface InstallResult {
  installed: boolean;
  scripts: string[];
  settingsPath: string;
  events: string[];
  alreadyInstalled: boolean;
}

const CORTEX_TAG = 'cortex-hooks';

function writeScript(name: string, contents: string): string {
  const target = path.join(HOOKS_DIR, name);
  fs.writeFileSync(target, contents, { mode: 0o755 });
  fs.chmodSync(target, 0o755);
  return target;
}

function readSettings(): ClaudeSettings {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw) as ClaudeSettings;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[hook-installer] settings.json unreadable, starting fresh:', message);
    return {};
  }
}

function writeSettings(settings: ClaudeSettings): void {
  if (!fs.existsSync(CLAUDE_DIR)) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  }
  if (fs.existsSync(SETTINGS_PATH)) {
    const backup = SETTINGS_PATH + '.cortex-bak';
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(SETTINGS_PATH, backup);
    }
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function isCortexHook(entry: HookEntry): boolean {
  return entry.command.includes(CORTEX_TAG);
}

function pruneExistingCortexHooks(groups: HookGroup[]): HookGroup[] {
  return groups
    .map(group => ({
      ...group,
      hooks: group.hooks.filter(h => !isCortexHook(h)),
    }))
    .filter(group => group.hooks.length > 0);
}

function addHook(settings: ClaudeSettings, event: string, group: HookGroup): void {
  if (!settings.hooks) settings.hooks = {};
  const existing = settings.hooks[event] || [];
  const cleaned = pruneExistingCortexHooks(existing);
  cleaned.push(group);
  settings.hooks[event] = cleaned;
}

export function installCortexHooks(): InstallResult {
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
  }

  const primePath = writeScript('cortex-prime.sh', PRIME_SCRIPT);
  const hintPath = writeScript('cortex-hint.sh', HINT_SCRIPT);
  const stopPath = writeScript('cortex-session-end.sh', SESSION_END_SCRIPT);
  const todoPath = writeScript('cortex-todo-write.sh', TODO_WRITE_SCRIPT);

  const previous = fs.existsSync(SETTINGS_PATH) ? fs.readFileSync(SETTINGS_PATH, 'utf8') : '';
  const alreadyInstalled = previous.includes(CORTEX_TAG);

  const settings = readSettings();

  addHook(settings, 'UserPromptSubmit', {
    matcher: '',
    hooks: [{ type: 'command', command: primePath, timeout: 3000 }],
  });

  addHook(settings, 'PreToolUse', {
    matcher: 'Glob|Grep|Read',
    hooks: [{ type: 'command', command: hintPath, timeout: 1500 }],
  });

  addHook(settings, 'Stop', {
    matcher: '',
    hooks: [{ type: 'command', command: stopPath, timeout: 2000 }],
  });

  addHook(settings, 'PostToolUse', {
    matcher: 'TodoWrite|todo_write',
    hooks: [{ type: 'command', command: todoPath, timeout: 1500 }],
  });

  writeSettings(settings);

  return {
    installed: true,
    scripts: [primePath, hintPath, stopPath, todoPath],
    settingsPath: SETTINGS_PATH,
    events: ['UserPromptSubmit', 'PreToolUse', 'Stop', 'PostToolUse'],
    alreadyInstalled,
  };
}

export function uninstallCortexHooks(): { removed: number } {
  if (!fs.existsSync(SETTINGS_PATH)) return { removed: 0 };

  const settings = readSettings();
  if (!settings.hooks) return { removed: 0 };

  let removed = 0;
  for (const event of Object.keys(settings.hooks)) {
    const before = settings.hooks[event];
    const after = pruneExistingCortexHooks(before);
    removed += before.reduce((sum, g) => sum + g.hooks.filter(isCortexHook).length, 0);
    if (after.length === 0) {
      delete settings.hooks[event];
    } else {
      settings.hooks[event] = after;
    }
  }

  writeSettings(settings);

  if (fs.existsSync(HOOKS_DIR)) {
    try { fs.rmSync(HOOKS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  return { removed };
}

export function getHookStatus(): {
  installed: boolean;
  scriptsExist: boolean;
  settingsHasHooks: boolean;
  events: string[];
} {
  const scriptsExist = ['cortex-prime.sh', 'cortex-hint.sh', 'cortex-session-end.sh', 'cortex-todo-write.sh']
    .every(s => fs.existsSync(path.join(HOOKS_DIR, s)));

  const settings = readSettings();
  const events: string[] = [];
  if (settings.hooks) {
    for (const [event, groups] of Object.entries(settings.hooks)) {
      if (groups.some(g => g.hooks.some(isCortexHook))) {
        events.push(event);
      }
    }
  }

  return {
    installed: scriptsExist && events.length > 0,
    scriptsExist,
    settingsHasHooks: events.length > 0,
    events,
  };
}
