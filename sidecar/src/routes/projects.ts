import { Router } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';

export const projectsRouter: ReturnType<typeof Router> = Router();

// Detect project type from filesystem
function detectProjectType(projectPath: string): string {
  const checks: [string, string][] = [
    ['next.config.js', 'nextjs'],
    ['next.config.ts', 'nextjs'],
    ['next.config.mjs', 'nextjs'],
    ['nest-cli.json', 'nestjs'],
    ['angular.json', 'angular'],
    ['Cargo.toml', 'rust'],
    ['go.mod', 'go'],
    ['requirements.txt', 'python'],
    ['pyproject.toml', 'python'],
    ['composer.json', 'php'],
    ['artisan', 'laravel'],
    ['Gemfile', 'ruby'],
    ['pom.xml', 'java'],
    ['build.gradle', 'java'],
  ];

  for (const [file, type] of checks) {
    if (fs.existsSync(path.join(projectPath, file))) return type;
  }

  // Check package.json for react/express
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['react']) return 'react';
      if (deps['express']) return 'express';
      return 'node';
    } catch {
      return 'node';
    }
  }

  return 'unknown';
}

// Check if git is initialized
function detectGit(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, '.git'));
}

// GET /api/projects
projectsRouter.get('/', (req, res) => {
  const db = getDb();
  const projects = db.prepare('SELECT * FROM projects ORDER BY last_opened DESC').all();
  res.json({ projects });
});

// GET /api/projects/:id
projectsRouter.get('/:id', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ project });
});

// POST /api/projects
projectsRouter.post('/', (req, res) => {
  const { name, path: projectPath, status = 'active', dev_server_port = null } = req.body;

  if (!name || !projectPath) {
    res.status(400).json({ error: 'name and path are required' });
    return;
  }

  // Validate path exists
  if (!fs.existsSync(projectPath)) {
    res.status(400).json({ error: `Path does not exist: ${projectPath}` });
    return;
  }

  const db = getDb();
  const id = uuid();
  const type = detectProjectType(projectPath);
  const gitEnabled = detectGit(projectPath) ? 1 : 0;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO projects (id, name, path, type, git_enabled, status, last_opened, dev_server_port, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, projectPath, type, gitEnabled, status, now, dev_server_port, now, now);

    // Auto-create project brain
    db.prepare(`
      INSERT INTO project_brain (id, project_id) VALUES (?, ?)
    `).run(uuid(), id);

    // Auto-create workspace state
    db.prepare(`
      INSERT INTO workspace (id, project_id) VALUES (?, ?)
    `).run(uuid(), id);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.status(201).json({ project });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'A project with this path already exists' });
      return;
    }
    throw err;
  }
});

// PUT /api/projects/:id
projectsRouter.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { name, status, dev_server_port } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE projects SET
      name = COALESCE(?, name),
      status = COALESCE(?, status),
      dev_server_port = COALESCE(?, dev_server_port),
      last_opened = ?,
      updated_at = ?
    WHERE id = ?
  `).run(name ?? null, status ?? null, dev_server_port ?? null, now, now, req.params.id);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json({ project });
});

// DELETE /api/projects/:id
projectsRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});
