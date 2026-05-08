import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { stripAnsi, safeSlice, hasCredentialMarker } from './text-utils.js';
import { detectRoomFromContent } from './room-detector.js';
import { analyzeSession } from './session-analyzer.js';
import { buildMemory } from './temporal-service.js';

/**
 * One-shot backfill worker.
 *
 * Twelve projects of session_history existed before MemPalace shipped — none
 * of it has been compressed into typed observations or facts. This worker
 * walks every unprocessed claude_sessions row, ANSI-strips its history, runs
 * the existing analyzeSession pipeline, mines a small set of typed
 * observations, and marks the session backfilled_at so reruns are no-ops.
 *
 * Per-project: also runs buildMemory once (best-effort) so the temporal
 * knowledge graph picks up project_brain content that's been sitting idle.
 */

interface BackfillStatus {
  state: 'idle' | 'running' | 'completed' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  sessionsProcessed: number;
  sessionsTotal: number;
  observationsCreated: number;
  factsCreated: number;
  errors: string[];
}

let status: BackfillStatus = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  sessionsProcessed: 0,
  sessionsTotal: 0,
  observationsCreated: 0,
  factsCreated: 0,
  errors: [],
};

const FIX_PATTERN = /(?:fix(?:ed|es|ing)?|resolved|solved|patched)\s*[:\-]?\s*(.{8,200}?)(?:[.\n;]|$)/gi;
const DECISION_PATTERN = /(?:decided|chose|switching to|moving to|will use|going with)\s+(.{6,180}?)(?:[.\n;]|$)/gi;
const GOTCHA_PATTERN = /(?:gotcha|caveat|watch out|note:|warning:|careful)\s*[:\-]?\s*(.{8,200}?)(?:[.\n;]|$)/gi;

interface MinedObs {
  kind: 'fix' | 'decision' | 'gotcha';
  title: string;
  before: string;
  after: string;
}

function mine(text: string): MinedObs[] {
  const out: MinedObs[] = [];
  const seen = new Set<string>();

  const harvest = (pattern: RegExp, kind: MinedObs['kind']): void => {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const title = safeSlice(m[1].trim().replace(/\s+/g, ' '), 160);
      if (!title || title.length < 8) continue;
      const dedup = `${kind}:${title.toLowerCase()}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      const start = Math.max(0, m.index - 200);
      const end = Math.min(text.length, m.index + m[0].length + 200);
      const window = text.slice(start, end);

      out.push({
        kind,
        title,
        before: kind === 'fix' || kind === 'gotcha' ? safeSlice(window.slice(0, 200), 200) : '',
        after: safeSlice(window.slice(-200), 200),
      });
      if (out.length >= 8) break;
    }
  };

  harvest(FIX_PATTERN, 'fix');
  harvest(DECISION_PATTERN, 'decision');
  harvest(GOTCHA_PATTERN, 'gotcha');
  return out;
}

function backfillSession(row: { id: string; project_id: string }): {
  observationsCreated: number;
} {
  const db = getDb();
  const history = db
    .prepare(
      'SELECT prompt_text, response_summary FROM session_history WHERE session_id = ? ORDER BY timestamp ASC',
    )
    .all(row.id) as Array<{ prompt_text: string; response_summary: string | null }>;

  if (history.length === 0) {
    db.prepare("UPDATE claude_sessions SET backfilled_at = datetime('now') WHERE id = ?").run(row.id);
    return { observationsCreated: 0 };
  }

  const text = history
    .map(h => `${stripAnsi(h.prompt_text || '')}\n${stripAnsi(h.response_summary || '')}`)
    .join('\n');

  const observations = mine(text);

  const insert = db.prepare(`
    INSERT INTO session_observations
      (id, project_id, session_id, kind, title, before_state, after_state, files_touched, room_tag, confidence, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, 'probable', 'backfill')
  `);

  for (const obs of observations) {
    // Hard-drop observations whose title/window matches a credential pattern.
    // The surrounding window usually leaks the password even after redaction.
    if (
      hasCredentialMarker(obs.title) ||
      hasCredentialMarker(obs.before) ||
      hasCredentialMarker(obs.after)
    ) {
      continue;
    }
    const room = detectRoomFromContent(`${obs.title} ${obs.before} ${obs.after}`);
    insert.run(
      uuid(),
      row.project_id,
      row.id,
      obs.kind,
      obs.title,
      obs.before,
      obs.after,
      room,
    );
  }

  try {
    analyzeSession(row.id, row.project_id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    status.errors.push(`analyzeSession ${row.id.slice(0, 8)}: ${message}`);
  }

  db.prepare("UPDATE claude_sessions SET backfilled_at = datetime('now') WHERE id = ?").run(row.id);

  return { observationsCreated: observations.length };
}

async function buildMemoryForAllProjects(): Promise<number> {
  const db = getDb();
  const projects = db.prepare('SELECT id FROM projects').all() as Array<{ id: string }>;
  let factsCreated = 0;
  for (const p of projects) {
    try {
      const r = await buildMemory(p.id);
      factsCreated += r.factsCreated;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      status.errors.push(`buildMemory ${p.id.slice(0, 8)}: ${message}`);
    }
  }
  return factsCreated;
}

async function runWorker(): Promise<void> {
  const db = getDb();

  const pending = db
    .prepare(
      "SELECT id, project_id FROM claude_sessions WHERE backfilled_at IS NULL ORDER BY started_at ASC",
    )
    .all() as Array<{ id: string; project_id: string }>;

  status.sessionsTotal = pending.length;

  for (const row of pending) {
    try {
      const r = backfillSession(row);
      status.observationsCreated += r.observationsCreated;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      status.errors.push(`session ${row.id.slice(0, 8)}: ${message}`);
    }
    status.sessionsProcessed++;
  }

  try {
    status.factsCreated = await buildMemoryForAllProjects();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    status.errors.push(`buildMemory pass: ${message}`);
  }

  status.state = 'completed';
  status.finishedAt = new Date().toISOString();
  console.log(
    `[backfill] done — ${status.sessionsProcessed}/${status.sessionsTotal} sessions, ` +
      `${status.observationsCreated} observations, ${status.factsCreated} facts, ${status.errors.length} errors`,
  );
}

export function runBackfill(opts: { background: boolean }): BackfillStatus {
  if (status.state === 'running') return status;

  status = {
    state: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    sessionsProcessed: 0,
    sessionsTotal: 0,
    observationsCreated: 0,
    factsCreated: 0,
    errors: [],
  };

  const promise = runWorker().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    status.state = 'error';
    status.errors.push(message);
    status.finishedAt = new Date().toISOString();
    console.error('[backfill] fatal:', message);
  });

  if (!opts.background) {
    void promise;
  }

  return status;
}

export function getBackfillStatus(): BackfillStatus {
  return status;
}

/**
 * Boot-time backfill: runs once per sidecar startup if there are unprocessed sessions.
 * Idempotent and lazy — does nothing if everything is already backfilled.
 */
export function maybeRunBackfillOnBoot(): void {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as c FROM claude_sessions WHERE backfilled_at IS NULL")
    .get() as { c: number };
  if (row.c === 0) {
    console.log('[backfill] nothing pending — skipping boot run');
    return;
  }
  console.log(`[backfill] ${row.c} session(s) pending — running in background`);
  runBackfill({ background: true });
}
