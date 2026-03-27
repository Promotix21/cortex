import { Router } from 'express';
import { getDb } from '../db/index.js';
import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';

export const gitRouter: ReturnType<typeof Router> = Router();

function getProjectPath(projectId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT path, git_enabled FROM projects WHERE id = ?').get(projectId) as any;
  if (!row || !row.git_enabled) return null;
  if (!fs.existsSync(path.join(row.path, '.git'))) return null;
  return row.path;
}

// GET /api/git/:projectId/status — git status
gitRouter.get('/:projectId/status', async (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) {
    res.status(400).json({ error: 'Git not available for this project' });
    return;
  }

  try {
    const git = simpleGit(projectPath);
    const status = await git.status();
    res.json({
      branch: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      modified: status.modified,
      not_added: status.not_added,
      created: status.created,
      deleted: status.deleted,
      renamed: status.renamed,
      conflicted: status.conflicted,
      isClean: status.isClean(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/git/:projectId/log — recent commits
gitRouter.get('/:projectId/log', async (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) {
    res.status(400).json({ error: 'Git not available for this project' });
    return;
  }

  const limit = parseInt(req.query.limit as string) || 20;

  try {
    const git = simpleGit(projectPath);
    const log = await git.log({ maxCount: limit });
    res.json({
      commits: log.all.map(c => ({
        hash: c.hash,
        hashShort: c.hash.slice(0, 7),
        message: c.message,
        author: c.author_name,
        date: c.date,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/git/:projectId/diff — uncommitted diff
gitRouter.get('/:projectId/diff', async (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) {
    res.status(400).json({ error: 'Git not available for this project' });
    return;
  }

  try {
    const git = simpleGit(projectPath);
    const diff = await git.diff();
    const stagedDiff = await git.diff(['--cached']);
    res.json({ diff, stagedDiff });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/git/:projectId/branches — list branches
gitRouter.get('/:projectId/branches', async (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) {
    res.status(400).json({ error: 'Git not available for this project' });
    return;
  }

  try {
    const git = simpleGit(projectPath);
    const branches = await git.branchLocal();
    res.json({
      current: branches.current,
      branches: branches.all,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/git/:projectId/pull — git pull
gitRouter.post('/:projectId/pull', async (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) {
    res.status(400).json({ error: 'Git not available for this project' });
    return;
  }

  try {
    const git = simpleGit(projectPath);
    const result = await git.pull();
    res.json({
      summary: result.summary,
      files: result.files,
      created: result.created,
      deleted: result.deletions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/git/:projectId/push — git push
gitRouter.post('/:projectId/push', async (req, res) => {
  const projectPath = getProjectPath(req.params.projectId);
  if (!projectPath) {
    res.status(400).json({ error: 'Git not available for this project' });
    return;
  }

  try {
    const git = simpleGit(projectPath);
    const result = await git.push();
    res.json({ pushed: true, remoteMessages: result.remoteMessages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
