/**
 * Claude Session Resolver
 *
 * Claude Code stores each session as `~/.claude/projects/<slug>/<uuid>.jsonl`
 * where <slug> is the cwd with "/" replaced by "-" (and a leading "-").
 *
 * When Cortex resumes a session whose `claude_session_id` was never captured,
 * we must NOT fall back to `claude --resume` (no args) — that triggers
 * Claude's interactive picker which lists sessions from ALL projects globally.
 *
 * This module resolves a Cortex session to a specific Claude session UUID by
 * scanning the project's slug directory and matching by timestamp proximity.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

/** Convert a cwd path to Claude's project slug. */
export function projectPathToSlug(projectPath: string): string {
  // Normalize: remove trailing slash, ensure leading slash
  let p = projectPath.replace(/\/+$/, '');
  if (!p.startsWith('/')) p = '/' + p;
  // Replace "/" with "-" ⇒ leading slash becomes leading "-"
  return p.replace(/\//g, '-');
}

export interface ClaudeSessionFile {
  uuid: string;
  filePath: string;
  mtimeMs: number;
  sizeBytes: number;
}

/** List all Claude session .jsonl files for a project, sorted newest first. */
export function listClaudeSessionFiles(projectPath: string): ClaudeSessionFile[] {
  const slug = projectPathToSlug(projectPath);
  const slugDir = path.join(CLAUDE_PROJECTS_DIR, slug);
  if (!fs.existsSync(slugDir)) return [];

  let entries: string[];
  try {
    entries = fs.readdirSync(slugDir);
  } catch {
    return [];
  }

  const files: ClaudeSessionFile[] = [];
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const uuid = name.slice(0, -'.jsonl'.length);
    // Validate UUID shape
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) continue;

    const filePath = path.join(slugDir, name);
    try {
      const stat = fs.statSync(filePath);
      files.push({ uuid, filePath, mtimeMs: stat.mtimeMs, sizeBytes: stat.size });
    } catch { /* skip unreadable */ }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

/**
 * Resolve a Cortex session to a specific Claude session UUID.
 *
 * Matching strategy (in order):
 *   1. If any file's mtime falls within [startedAt, lastActive + 5min], use that.
 *   2. Otherwise, pick the file whose mtime is closest to lastActive.
 *   3. If no candidates at all, return null — caller must handle.
 */
export function resolveClaudeSessionId(opts: {
  projectPath: string;
  startedAt: string;     // ISO date string
  lastActive?: string;   // ISO date string
}): string | null {
  const files = listClaudeSessionFiles(opts.projectPath);
  if (files.length === 0) return null;

  const startedMs = Date.parse(opts.startedAt);
  const lastActiveMs = opts.lastActive ? Date.parse(opts.lastActive) : startedMs;
  const windowEndMs = lastActiveMs + 5 * 60 * 1000; // 5 min grace

  // Pass 1: file mtime within session's active window
  const inWindow = files.filter(f => f.mtimeMs >= startedMs - 30_000 && f.mtimeMs <= windowEndMs);
  if (inWindow.length > 0) {
    // Pick the one closest to lastActive
    inWindow.sort((a, b) => Math.abs(a.mtimeMs - lastActiveMs) - Math.abs(b.mtimeMs - lastActiveMs));
    return inWindow[0].uuid;
  }

  // Pass 2: closest mtime overall (within reasonable bound — 24h)
  const bounded = files.filter(f => Math.abs(f.mtimeMs - lastActiveMs) < 24 * 60 * 60 * 1000);
  if (bounded.length > 0) {
    bounded.sort((a, b) => Math.abs(a.mtimeMs - lastActiveMs) - Math.abs(b.mtimeMs - lastActiveMs));
    return bounded[0].uuid;
  }

  return null;
}
