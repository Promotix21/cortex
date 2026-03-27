import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  sessionId: string | null;
  gitCommit: string | null;
  activeBranch: string | null;
  uncommittedFiles: string[];
  openTerminals: string[];
  runningServices: string[];
  envHash: string | null;
  timestamp: string;
}

/**
 * Capture the current state of a project
 */
export async function captureSnapshot(
  projectId: string,
  projectPath: string,
  sessionId?: string | null,
  openTerminals: string[] = []
): Promise<ProjectSnapshot> {
  const id = uuid();
  const now = new Date().toISOString();

  let gitCommit: string | null = null;
  let activeBranch: string | null = null;
  let uncommittedFiles: string[] = [];

  // Capture git state
  if (fs.existsSync(path.join(projectPath, '.git'))) {
    try {
      const git = simpleGit(projectPath);
      const log = await git.log({ maxCount: 1 });
      gitCommit = log.latest?.hash ?? null;

      const status = await git.status();
      activeBranch = status.current;
      uncommittedFiles = [
        ...status.modified,
        ...status.not_added,
        ...status.created,
        ...status.deleted,
        ...status.renamed.map(r => r.to),
      ];
    } catch {
      // Git operations can fail, that's ok
    }
  }

  // Hash .env file if it exists (never store contents)
  let envHash: string | null = null;
  const envPath = path.join(projectPath, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath);
      envHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    } catch {
      // Permission issues etc
    }
  }

  // Detect running services (dev servers on common ports)
  const runningServices: string[] = [];
  // We'll populate this from terminal info passed in

  const snapshot: ProjectSnapshot = {
    id,
    projectId,
    sessionId: sessionId ?? null,
    gitCommit,
    activeBranch,
    uncommittedFiles,
    openTerminals,
    runningServices,
    envHash,
    timestamp: now,
  };

  // Persist
  const db = getDb();
  db.prepare(`
    INSERT INTO project_snapshots
      (id, project_id, session_id, git_commit, active_branch, uncommitted_files, open_terminals, running_services, env_hash, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    snapshot.sessionId,
    gitCommit,
    activeBranch,
    JSON.stringify(uncommittedFiles),
    JSON.stringify(openTerminals),
    JSON.stringify(runningServices),
    envHash,
    now
  );

  return snapshot;
}

/**
 * Get the most recent snapshot for a project
 */
export function getLatestSnapshot(projectId: string): ProjectSnapshot | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM project_snapshots WHERE project_id = ? ORDER BY timestamp DESC LIMIT 1
  `).get(projectId) as any;

  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    gitCommit: row.git_commit,
    activeBranch: row.active_branch,
    uncommittedFiles: JSON.parse(row.uncommitted_files || '[]'),
    openTerminals: JSON.parse(row.open_terminals || '[]'),
    runningServices: JSON.parse(row.running_services || '[]'),
    envHash: row.env_hash,
    timestamp: row.timestamp,
  };
}

/**
 * Compare current state to the latest snapshot and return a human-readable diff
 */
export async function getResumeDiff(
  projectId: string,
  projectPath: string
): Promise<string | null> {
  const lastSnapshot = getLatestSnapshot(projectId);
  if (!lastSnapshot) return null;

  const changes: string[] = [];

  if (fs.existsSync(path.join(projectPath, '.git'))) {
    try {
      const git = simpleGit(projectPath);
      const status = await git.status();
      const log = await git.log({ maxCount: 1 });

      // Branch change
      if (lastSnapshot.activeBranch && status.current !== lastSnapshot.activeBranch) {
        changes.push(`Branch changed from \`${lastSnapshot.activeBranch}\` to \`${status.current}\``);
      }

      // New commits
      if (lastSnapshot.gitCommit && log.latest?.hash !== lastSnapshot.gitCommit) {
        changes.push(`New commits since last session (was ${lastSnapshot.gitCommit.slice(0, 7)})`);
      }

      // Uncommitted files change
      const currentDirty = [
        ...status.modified,
        ...status.not_added,
        ...status.created,
        ...status.deleted,
      ];
      const newFiles = currentDirty.filter(f => !lastSnapshot.uncommittedFiles.includes(f));
      const resolvedFiles = lastSnapshot.uncommittedFiles.filter(f => !currentDirty.includes(f));

      if (newFiles.length > 0) {
        changes.push(`${newFiles.length} new uncommitted file(s): ${newFiles.slice(0, 5).join(', ')}`);
      }
      if (resolvedFiles.length > 0) {
        changes.push(`${resolvedFiles.length} file(s) resolved since last session`);
      }
    } catch {
      // Git operations can fail
    }
  }

  // Env change
  const envPath = path.join(projectPath, '.env');
  if (fs.existsSync(envPath) && lastSnapshot.envHash) {
    try {
      const content = fs.readFileSync(envPath);
      const currentHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
      if (currentHash !== lastSnapshot.envHash) {
        changes.push('.env file has changed since last session');
      }
    } catch {
      // ok
    }
  }

  if (changes.length === 0) return null;

  return `Since your last session (${lastSnapshot.timestamp}):\n${changes.map(c => `- ${c}`).join('\n')}`;
}

/**
 * Prune old snapshots, keeping the most recent N per project
 */
export function pruneSnapshots(projectId: string, keep = 50): number {
  const db = getDb();
  const result = db.prepare(`
    DELETE FROM project_snapshots
    WHERE project_id = ? AND id NOT IN (
      SELECT id FROM project_snapshots WHERE project_id = ?
      ORDER BY timestamp DESC LIMIT ?
    )
  `).run(projectId, projectId, keep);

  return result.changes;
}
