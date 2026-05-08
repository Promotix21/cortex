import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { safeSlice } from './text-utils.js';

/**
 * Hook handlers for the prime + hint endpoints fired by Claude Code hooks.
 *
 * The prime hook runs on UserPromptSubmit and prepends to Claude's context:
 *   1) the project brain summary,
 *   2) the most recent typed observations + decisions,
 *   3) a hard memory-policy directive that tells Claude to write project facts
 *      through Cortex's MCP tool, NOT through Claude's built-in memory.
 *
 * The hint hook runs on PreToolUse for Glob|Grep|Read and surfaces relevant
 * observation IDs so Claude can ask Cortex first instead of re-greeping.
 *
 * Both handlers also log to hook_consults so we can verify in two weeks
 * whether anything is actually being consulted.
 */

interface PrimePayload {
  cwd?: string;
  prompt?: string;
  session_id?: string;
}

interface HintPayload {
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  session_id?: string;
}

interface TodoWritePayload {
  cwd?: string;
  session_id?: string;
  tool_name?: string;
  tool_input?: { todos?: unknown };
  [key: string]: unknown;
}

interface TodoEntry {
  id?: string;
  content: string;
  status: string;
  priority?: string;
}

const SAVE_INTENT_PATTERN =
  /\b(remember|save (?:this|that|it)|note (?:this|that|it)|for (?:the )?(?:future|next time)|don't forget|keep (?:track|note)|write (?:this )?down)\b/i;

/**
 * Full policy — sent on the FIRST prime call per session only. ~280 tokens.
 */
const MEMORY_POLICY_DIRECTIVE = `
[CORTEX POLICY — applies for the entire session]

MEMORY: Persist project facts (decisions, fixes, conventions, server info, gotchas)
via mcp__cortex-intelligence__cortex action="save_intelligence". Do NOT use Claude
memory or write to CLAUDE.md when the user says "remember/save/note this".

CREDENTIALS: Before asking for any password (ssh, wordpress, shopify, smtp, api_key,
db, github PAT, etc.), call action="list_credentials" then action="get_credential"
with name + reason. Never echo, log, or commit credentials. If missing, ask user
to add it via Cortex Settings → Vault.

CONSULT FIRST: Before grep/glob across the codebase, prefer action="get_context",
action="recall_room", action="query_history" — Cortex already knows the architecture.
`.trim();

/**
 * Short reminder — sent on every prime call AFTER the first per session. ~40 tokens.
 * Claude has already seen the full directive in the prime call earlier this session;
 * this just keeps the policy salient without re-injecting the whole thing.
 */
const SHORT_POLICY_REMINDER = '[CORTEX] save→cortex.save_intelligence; secrets→cortex.get_credential; before grep→cortex.get_context.';

function sessionAlreadyPrimed(sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as c FROM hook_consults WHERE session_id = ? AND hook_type = 'prime'",
    )
    .get(sessionId) as { c: number };
  return row.c > 0;
}

function lookupProject(
  cwd: string | undefined,
): { id: string; name: string; path: string } | null {
  if (!cwd) return null;
  const db = getDb();
  const exact = db.prepare('SELECT id, name, path FROM projects WHERE path = ?').get(cwd) as
    | { id: string; name: string; path: string }
    | undefined;
  if (exact) return exact;
  const all = db.prepare('SELECT id, name, path FROM projects').all() as Array<{
    id: string;
    name: string;
    path: string;
  }>;
  let best: { id: string; name: string; path: string } | null = null;
  for (const p of all) {
    if (cwd.startsWith(p.path) && (!best || p.path.length > best.path.length)) best = p;
  }
  return best;
}

function logConsult(opts: {
  projectId: string | null;
  sessionId?: string;
  hookType: 'prime' | 'hint' | 'session_end';
  toolName?: string;
  query?: string;
  resultCount: number;
  cwd?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO hook_consults
      (id, project_id, session_id, hook_type, tool_name, query, result_count, cwd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    opts.projectId,
    opts.sessionId || null,
    opts.hookType,
    opts.toolName || null,
    opts.query || null,
    opts.resultCount,
    opts.cwd || null,
  );
}

interface BrainRow {
  summary: string;
  architecture_notes: string;
  conventions: string;
  decisions: string;
  known_issues: string;
}

function recentObservations(projectId: string, limit: number): Array<{
  kind: string;
  title: string;
  room_tag: string | null;
}> {
  const db = getDb();
  return db
    .prepare(
      `SELECT kind, title, room_tag FROM session_observations
       WHERE project_id = ? AND confidence != 'deprecated'
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(projectId, limit) as Array<{ kind: string; title: string; room_tag: string | null }>;
}

export function handlePrime(payload: PrimePayload): { text: string; projectId: string | null } {
  const project = lookupProject(payload.cwd);
  const alreadyPrimed = sessionAlreadyPrimed(payload.session_id);

  // No project match → just the policy reminder, full or short depending on prior calls.
  if (!project) {
    logConsult({
      projectId: null,
      sessionId: payload.session_id,
      hookType: 'prime',
      resultCount: 0,
      cwd: payload.cwd,
    });
    return {
      text: alreadyPrimed ? SHORT_POLICY_REMINDER : MEMORY_POLICY_DIRECTIVE,
      projectId: null,
    };
  }

  // Save-intent detection always upgrades to a directed nudge — even if already primed,
  // because this is the moment Claude needs to actually fire the tool.
  const saveIntent = !!(payload.prompt && SAVE_INTENT_PATTERN.test(payload.prompt));

  // Already primed in this session → short reminder + (optional) save-intent nudge.
  // Claude has the full brain from the first prime; re-injecting it on every prompt
  // is the single biggest token leak in this pipeline.
  if (alreadyPrimed && !saveIntent) {
    logConsult({
      projectId: project.id,
      sessionId: payload.session_id,
      hookType: 'prime',
      resultCount: 0,
      cwd: payload.cwd,
    });
    return { text: SHORT_POLICY_REMINDER, projectId: project.id };
  }

  // First prime of this session (or save-intent triggered) → send the full payload.
  const db = getDb();
  const brain = db
    .prepare(
      `SELECT summary, architecture_notes, conventions, decisions, known_issues
       FROM project_brain WHERE project_id = ?`,
    )
    .get(project.id) as BrainRow | undefined;

  const observations = recentObservations(project.id, 5);

  const sections: string[] = [];
  sections.push(`[CORTEX BRAIN — ${project.name}]`);

  if (brain?.summary) sections.push(`## Summary\n${safeSlice(brain.summary, 600)}`);
  if (brain?.conventions) sections.push(`## Conventions\n${safeSlice(brain.conventions, 400)}`);
  if (brain?.architecture_notes) sections.push(`## Architecture\n${safeSlice(brain.architecture_notes, 400)}`);

  const decisionLines = (brain?.decisions || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(-5);
  if (decisionLines.length > 0) sections.push(`## Recent Decisions\n${decisionLines.join('\n')}`);

  if (observations.length > 0) {
    const obsLines = observations
      .map(o => `- ${o.kind}${o.room_tag ? ` [${o.room_tag}]` : ''}: ${o.title}`)
      .join('\n');
    sections.push(`## Recent Observations\n${obsLines}`);
  }

  if (brain?.known_issues) {
    sections.push(`## Known Issues\n${safeSlice(brain.known_issues, 300)}`);
  }

  // Policy: full on first prime; short + save-intent nudge thereafter.
  if (alreadyPrimed) {
    sections.push(SHORT_POLICY_REMINDER);
  } else {
    sections.push(MEMORY_POLICY_DIRECTIVE);
  }

  if (saveIntent) {
    sections.push(
      '[INTENT] User wants to remember/save something. Call cortex.save_intelligence now ' +
      '(type ∈ {decision, known_issue, pattern, debug, server, convention}).',
    );
  }

  const text = sections.join('\n\n');

  logConsult({
    projectId: project.id,
    sessionId: payload.session_id,
    hookType: 'prime',
    resultCount: observations.length + (brain ? 1 : 0),
    cwd: payload.cwd,
  });

  return { text, projectId: project.id };
}

function buildQueryFromTool(payload: HintPayload): string {
  const input = payload.tool_input || {};
  const candidates: string[] = [];
  for (const key of ['pattern', 'query', 'file_path', 'path']) {
    const v = input[key];
    if (typeof v === 'string') candidates.push(v);
  }
  return candidates.join(' ').trim();
}

export function handleHint(payload: HintPayload): { text: string; matches: number } {
  const project = lookupProject(payload.cwd);
  const query = buildQueryFromTool(payload);

  if (!project || !query) {
    logConsult({
      projectId: project?.id || null,
      sessionId: payload.session_id,
      hookType: 'hint',
      toolName: payload.tool_name,
      query,
      resultCount: 0,
      cwd: payload.cwd,
    });
    return { text: '', matches: 0 };
  }

  const db = getDb();
  const term = `%${query}%`;

  // Combined cap of 3 hits keeps the per-tool-call payload under ~200 tokens.
  // Observations are usually more relevant than generic debug memory matches.
  const obsHits = db
    .prepare(
      `SELECT id, kind, title, room_tag FROM session_observations
       WHERE project_id = ? AND (title LIKE ? OR before_state LIKE ? OR after_state LIKE ?)
         AND confidence != 'deprecated'
       ORDER BY created_at DESC LIMIT 3`,
    )
    .all(project.id, term, term, term) as Array<{
      id: string;
      kind: string;
      title: string;
      room_tag: string | null;
    }>;

  const remainingSlots = Math.max(0, 3 - obsHits.length);
  const debugHits = remainingSlots > 0
    ? (db
        .prepare(
          `SELECT id, problem, solution FROM debug_memory
           WHERE (source_project_id = ? OR scope = 'reusable')
             AND (problem LIKE ? OR solution LIKE ? OR error_signature LIKE ?)
             AND confidence != 'deprecated'
           ORDER BY usage_count DESC LIMIT ?`,
        )
        .all(project.id, term, term, term, remainingSlots) as Array<{
          id: string;
          problem: string;
          solution: string;
        }>)
    : [];

  const total = obsHits.length + debugHits.length;
  if (total === 0) {
    logConsult({
      projectId: project.id,
      sessionId: payload.session_id,
      hookType: 'hint',
      toolName: payload.tool_name,
      query,
      resultCount: 0,
      cwd: payload.cwd,
    });
    return { text: '', matches: 0 };
  }

  // Compact one-liner format. No header, no footer — Claude already knows the
  // policy from prime; every byte here multiplies across tool calls.
  const lines: string[] = [];
  for (const o of obsHits) {
    lines.push(`[cx:${o.id.slice(0, 6)}] ${o.kind}${o.room_tag ? `/${o.room_tag}` : ''}: ${safeSlice(o.title, 100)}`);
  }
  for (const d of debugHits) {
    lines.push(`[cx-dbg] ${safeSlice(d.problem, 80)}${d.solution ? ` → ${safeSlice(d.solution, 80)}` : ''}`);
  }

  logConsult({
    projectId: project.id,
    sessionId: payload.session_id,
    hookType: 'hint',
    toolName: payload.tool_name,
    query,
    resultCount: total,
    cwd: payload.cwd,
  });

  return { text: lines.join('\n'), matches: total };
}

/**
 * PostToolUse hook for TodoWrite — captures the structured todos snapshot
 * so the live session sidebar can render real Claude-driven tasks.
 *
 * The interactive Claude Code TUI renders TodoWrite as colored text, not JSON,
 * so the regex-based parser never matched in interactive mode. This hook gives
 * us the canonical todos every time Claude calls TodoWrite.
 */
export function handleTodoWrite(payload: TodoWritePayload): { stored: number } {
  const sessionId = payload.session_id;
  console.log(`[todo-write] keys=${Object.keys(payload).join(',')} session_id=${sessionId ?? 'MISSING'} tool=${payload.tool_name}`);

  if (!sessionId) return { stored: 0 };
  const todos = (payload.tool_input?.todos ?? []) as unknown;
  if (!Array.isArray(todos)) return { stored: 0 };

  const cleaned: TodoEntry[] = (todos as Array<Record<string, unknown>>)
    .filter(t => typeof t === 'object' && t && typeof t.content === 'string')
    .map((t, idx) => ({
      id: typeof t.id === 'string' ? t.id : `${sessionId}:${idx}`,
      content: String(t.content),
      status: typeof t.status === 'string' ? t.status : 'pending',
      priority: typeof t.priority === 'string' ? t.priority : 'medium',
    }));

  const db = getDb();
  db.prepare(
    `INSERT INTO session_todos (id, session_id, cwd, todos_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(session_id) DO UPDATE SET
       cwd = excluded.cwd,
       todos_json = excluded.todos_json,
       updated_at = excluded.updated_at`,
  ).run(uuid(), sessionId, payload.cwd ?? null, JSON.stringify(cleaned));

  return { stored: cleaned.length };
}

export function getSessionTodos(sessionId: string): TodoEntry[] {
  const db = getDb();
  const row = db
    .prepare('SELECT todos_json FROM session_todos WHERE session_id = ?')
    .get(sessionId) as { todos_json: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.todos_json) as TodoEntry[];
  } catch {
    return [];
  }
}
