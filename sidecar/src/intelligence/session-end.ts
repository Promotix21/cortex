import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { stripAnsi, safeSlice, hasCredentialMarker } from './text-utils.js';
import { detectRoomFromContent } from './room-detector.js';
import { analyzeSession } from './session-analyzer.js';

interface ClaudeHookPayload {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
}

interface SessionEndResult {
  projectId: string | null;
  cortexSessionId: string | null;
  observationsCreated: number;
  fixesExtracted: number;
  analyzeResult?: ReturnType<typeof analyzeSession>;
  git: {
    attempted: boolean;
    committed: boolean;
    pushed: boolean;
    files: number;
    commitSha?: string;
    error?: string;
  };
}

const FIX_PATTERN = /(?:fix(?:ed|es|ing)?|resolved|solved|patched|repaired)\s*[:\-]?\s*(.{8,200}?)(?:[.\n;]|$)/gi;
const DECISION_PATTERN = /(?:decided|chose|switching to|moving to|will use|going with|going to use)\s+(.{6,180}?)(?:[.\n;]|$)/gi;
const GOTCHA_PATTERN = /(?:gotcha|caveat|watch out|note:|warning:|careful)\s*[:\-]?\s*(.{8,200}?)(?:[.\n;]|$)/gi;

interface ExtractedObs {
  kind: 'fix' | 'decision' | 'discovery' | 'gotcha' | 'feature' | 'refactor';
  title: string;
  before: string;
  after: string;
  filesTouched: string[];
}

function extractObservationsFromText(text: string, files: string[]): ExtractedObs[] {
  const out: ExtractedObs[] = [];
  const seen = new Set<string>();

  const harvest = (
    pattern: RegExp,
    kind: ExtractedObs['kind'],
  ): void => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const title = safeSlice(match[1].trim().replace(/\s+/g, ' '), 160);
      if (!title || title.length < 8) continue;
      const dedup = `${kind}:${title.toLowerCase()}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      const start = Math.max(0, match.index - 200);
      const end = Math.min(text.length, match.index + match[0].length + 200);
      const window = text.slice(start, end);

      out.push({
        kind,
        title,
        before: kind === 'fix' || kind === 'gotcha' ? safeSlice(window.slice(0, 200), 200) : '',
        after: safeSlice(window.slice(-200), 200),
        filesTouched: files,
      });

      if (out.length >= 10) break;
    }
  };

  harvest(FIX_PATTERN, 'fix');
  harvest(DECISION_PATTERN, 'decision');
  harvest(GOTCHA_PATTERN, 'gotcha');

  return out;
}

function lookupProjectByCwd(cwd: string): { id: string; path: string; name: string } | null {
  const db = getDb();
  const exact = db.prepare('SELECT id, path, name FROM projects WHERE path = ?').get(cwd) as
    | { id: string; path: string; name: string }
    | undefined;
  if (exact) return exact;

  const projects = db.prepare('SELECT id, path, name FROM projects').all() as Array<{
    id: string;
    path: string;
    name: string;
  }>;
  let best: { id: string; path: string; name: string } | null = null;
  for (const p of projects) {
    if (cwd.startsWith(p.path) && (!best || p.path.length > best.path.length)) {
      best = p;
    }
  }
  return best;
}

function lookupCortexSession(claudeSessionId: string | undefined): string | null {
  if (!claudeSessionId) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT id FROM claude_sessions WHERE claude_session_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(claudeSessionId) as { id: string } | undefined;
  return row?.id || null;
}

function readTranscriptText(transcriptPath: string | undefined): { text: string; files: Set<string> } {
  const files = new Set<string>();
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return { text: '', files };

  let raw = '';
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return { text: '', files };
  }

  const chunks: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj: unknown = JSON.parse(line);
      if (typeof obj !== 'object' || obj === null) continue;
      const record = obj as Record<string, unknown>;
      const message = record.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (typeof content === 'string') {
        chunks.push(stripAnsi(content));
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (!part || typeof part !== 'object') continue;
          const partObj = part as Record<string, unknown>;
          if (partObj.type === 'text' && typeof partObj.text === 'string') {
            chunks.push(stripAnsi(partObj.text));
          }
          if (partObj.type === 'tool_use') {
            const input = partObj.input as Record<string, unknown> | undefined;
            const file = input?.file_path;
            if (typeof file === 'string') files.add(file);
          }
          if (partObj.type === 'tool_result') {
            const tr = partObj.content;
            if (typeof tr === 'string') chunks.push(stripAnsi(tr));
          }
        }
      }
    } catch {
      /* ignore malformed JSONL lines */
    }
  }

  return { text: chunks.join('\n'), files };
}

function gitChangedFiles(projectPath: string, sessionId: string | null): string[] {
  const db = getDb();
  const fromHistory = sessionId
    ? (
        db
          .prepare(
            "SELECT DISTINCT file_changed FROM execution_history WHERE session_id = ? AND file_changed IS NOT NULL",
          )
          .all(sessionId) as Array<{ file_changed: string }>
      )
        .map(r => r.file_changed)
        .filter((f): f is string => !!f)
    : [];

  let dirty: string[] = [];
  try {
    const out = execFileSync('git', ['-C', projectPath, 'status', '--porcelain=v1'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    dirty = out
      .split('\n')
      .filter(Boolean)
      .map(line => line.slice(3).trim());
  } catch {
    return [];
  }

  if (fromHistory.length === 0) return dirty;
  const dirtySet = new Set(dirty);
  const dirtyAbsoluteSet = new Set(dirty.map(f => path.resolve(projectPath, f)));
  return fromHistory.filter(f => {
    const rel = path.isAbsolute(f) ? path.relative(projectPath, f) : f;
    return dirtySet.has(rel) || dirtyAbsoluteSet.has(path.resolve(projectPath, f));
  });
}

function getSetting(key: string, fallback: string): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

function autoCommit(opts: {
  projectPath: string;
  sessionId: string | null;
  observations: ExtractedObs[];
  push: boolean;
}): SessionEndResult['git'] {
  const result: SessionEndResult['git'] = {
    attempted: true,
    committed: false,
    pushed: false,
    files: 0,
  };

  const files = gitChangedFiles(opts.projectPath, opts.sessionId);
  if (files.length === 0) {
    result.attempted = false;
    return result;
  }

  result.files = files.length;

  try {
    execFileSync('git', ['-C', opts.projectPath, 'add', '--', ...files], {
      encoding: 'utf8',
      timeout: 10000,
    });
  } catch (err: unknown) {
    result.error = `git add failed: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  const titles = opts.observations.slice(0, 3).map(o => `- ${o.kind}: ${o.title}`).join('\n');
  const message =
    `Cortex auto-commit: ${files.length} file${files.length === 1 ? '' : 's'} from session\n` +
    (titles ? `\n${titles}\n` : '') +
    `\nCo-Authored-By: WebXExpert <Promotix21@users.noreply.github.com>\n`;

  try {
    execFileSync('git', ['-C', opts.projectPath, 'commit', '-m', message], {
      encoding: 'utf8',
      timeout: 15000,
    });
    result.committed = true;
  } catch (err: unknown) {
    result.error = `git commit failed: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  try {
    const sha = execFileSync('git', ['-C', opts.projectPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    result.commitSha = sha.slice(0, 12);
  } catch {
    /* non-fatal */
  }

  if (opts.push) {
    try {
      execFileSync('git', ['-C', opts.projectPath, 'push'], {
        encoding: 'utf8',
        timeout: 30000,
      });
      result.pushed = true;
    } catch (err: unknown) {
      result.error = `git push failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return result;
}

export function handleSessionEnd(payload: ClaudeHookPayload): SessionEndResult {
  const cwd = payload.cwd || '';
  const project = cwd ? lookupProjectByCwd(cwd) : null;
  const cortexSessionId = lookupCortexSession(payload.session_id);

  const baseResult: SessionEndResult = {
    projectId: project?.id || null,
    cortexSessionId,
    observationsCreated: 0,
    fixesExtracted: 0,
    git: { attempted: false, committed: false, pushed: false, files: 0 },
  };

  if (!project) return baseResult;

  const db = getDb();

  const transcript = readTranscriptText(payload.transcript_path);
  let combinedText = transcript.text;
  let combinedFiles = Array.from(transcript.files);

  if (cortexSessionId) {
    const history = db
      .prepare(
        'SELECT prompt_text, response_summary FROM session_history WHERE session_id = ? ORDER BY timestamp ASC',
      )
      .all(cortexSessionId) as Array<{ prompt_text: string; response_summary: string | null }>;
    const text = history
      .map(h => `${stripAnsi(h.prompt_text || '')}\n${stripAnsi(h.response_summary || '')}`)
      .join('\n');
    combinedText += '\n' + text;

    const execFiles = db
      .prepare('SELECT DISTINCT file_changed FROM execution_history WHERE session_id = ?')
      .all(cortexSessionId) as Array<{ file_changed: string | null }>;
    const seenFiles = new Set(combinedFiles);
    for (const r of execFiles) {
      if (r.file_changed && !seenFiles.has(r.file_changed)) {
        seenFiles.add(r.file_changed);
        combinedFiles.push(r.file_changed);
      }
    }
  }

  const observations = combinedText.trim()
    ? extractObservationsFromText(combinedText, combinedFiles)
    : [];

  const insertObs = db.prepare(`
    INSERT INTO session_observations
      (id, project_id, session_id, kind, title, before_state, after_state, files_touched, room_tag, confidence, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'probable', 'session_end')
  `);

  for (const obs of observations) {
    if (
      hasCredentialMarker(obs.title) ||
      hasCredentialMarker(obs.before) ||
      hasCredentialMarker(obs.after)
    ) {
      continue;
    }
    const room = detectRoomFromContent(`${obs.title} ${obs.before} ${obs.after}`);
    insertObs.run(
      uuid(),
      project.id,
      cortexSessionId,
      obs.kind,
      obs.title,
      obs.before,
      obs.after,
      JSON.stringify(obs.filesTouched.slice(0, 25)),
      room,
    );
    baseResult.observationsCreated++;
    if (obs.kind === 'fix') baseResult.fixesExtracted++;
  }

  if (cortexSessionId) {
    try {
      baseResult.analyzeResult = analyzeSession(cortexSessionId, project.id);
    } catch (err: unknown) {
      console.warn('[session-end] analyzeSession failed:', err instanceof Error ? err.message : err);
    }
  }

  if (getSetting('git_auto_commit', 'true') === 'true') {
    baseResult.git = autoCommit({
      projectPath: project.path,
      sessionId: cortexSessionId,
      observations,
      push: getSetting('git_auto_push', 'false') === 'true',
    });
  }

  db.prepare(
    'INSERT INTO hook_consults (id, project_id, session_id, hook_type, cwd, result_count) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(uuid(), project.id, cortexSessionId, 'session_end', cwd, baseResult.observationsCreated);

  return baseResult;
}
