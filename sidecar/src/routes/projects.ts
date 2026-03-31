import { Router } from 'express';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { scanProject } from '../intelligence/project-scanner.js';
import { indexProject, getProjectStructureSummary } from '../intelligence/file-indexer.js';

export const projectsRouter: ReturnType<typeof Router> = Router();

// Auto-detect company from project name/path
const COMPANY_MAP: Record<string, string[]> = {
  'WebXExpert': ['rankops', 'revops', 'nexara-saas', 'velaro-domain-checker', 'vtest-tia', 'drishti', 'cortex'],
  'Hiraya Digital': ['hiraya-digital-synergy-hub', 'growth-agent', 'wordpress-seo-optimization', 'honest-fermont', 'celebrate-festival', 'celebrate-festival-emailer', 'content-intelligence-planner', 'project-aura', 'realesgran'],
  'DigitalDadi': ['umang-boards', 'ninara', 'ninara-new-design', 'saie-paranjape', 'vellaro'],
};

function detectCompany(name: string, projectPath: string): string | null {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const dirName = path.basename(projectPath).toLowerCase();
  for (const [company, projects] of Object.entries(COMPANY_MAP)) {
    if (projects.some(p => slug.includes(p) || dirName.includes(p))) {
      return company;
    }
  }
  return null;
}

// Detect project type from filesystem
async function detectProjectType(projectPath: string): Promise<string> {
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
    try { await fsp.access(path.join(projectPath, file)); return type; } catch { /* not found */ }
  }

  // Check package.json for react/express
  const pkgPath = path.join(projectPath, 'package.json');
  try {
    const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['react']) return 'react';
    if (deps['express']) return 'express';
    return 'node';
  } catch {
    // no package.json or parse error
  }

  return 'unknown';
}

// Check if git is initialized
async function detectGit(projectPath: string): Promise<boolean> {
  try { await fsp.access(path.join(projectPath, '.git')); return true; } catch { return false; }
}

// GET /api/projects
projectsRouter.get('/', (req, res) => {
  const db = getDb();

  // Auto-backfill company for existing projects that have no company assigned
  const unassigned = db.prepare("SELECT id, name, path FROM projects WHERE company IS NULL").all() as any[];
  if (unassigned.length > 0) {
    const stmt = db.prepare("UPDATE projects SET company = ? WHERE id = ?");
    for (const p of unassigned) {
      const company = detectCompany(p.name, p.path);
      if (company) stmt.run(company, p.id);
    }
  }

  const projects = db.prepare('SELECT * FROM projects ORDER BY company ASC, last_opened DESC').all();
  res.json({ projects });
});

// POST /api/projects/browse — open native folder picker (for browser mode)
// MUST be before /:id to avoid Express 5 matching "browse" as an :id
projectsRouter.post('/browse', (_req, res) => {
  // Try zenity (GTK/GNOME), then kdialog (KDE), then xdg fallback
  const commands: [string, string[]][] = [
    ['zenity', ['--file-selection', '--directory', '--title=Select Project Folder']],
    ['kdialog', ['--getexistingdirectory', process.env.HOME || '/']],
  ];

  function tryNext(index: number) {
    if (index >= commands.length) {
      res.status(501).json({ error: 'No file picker available. Install zenity or kdialog.' });
      return;
    }
    const [cmd, args] = commands[index];
    execFile(cmd, args, { timeout: 60000 }, (err, stdout) => {
      if (err) {
        // Command not found or user cancelled
        if ((err as any).code === 'ENOENT') {
          tryNext(index + 1);
        } else {
          // User cancelled (exit code 1) or timeout
          res.json({ path: null, cancelled: true });
        }
        return;
      }
      const selected = stdout.trim();
      if (selected && fs.existsSync(selected)) {
        res.json({ path: selected, name: path.basename(selected) });
      } else {
        res.json({ path: null, cancelled: true });
      }
    });
  }

  tryNext(0);
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
projectsRouter.post('/', async (req, res) => {
  const { name, path: projectPath, status = 'active', dev_server_port = null, company } = req.body;

  if (!name || !projectPath) {
    res.status(400).json({ error: 'name and path are required' });
    return;
  }

  // Validate path exists
  try { await fsp.access(projectPath); } catch {
    res.status(400).json({ error: `Path does not exist: ${projectPath}` });
    return;
  }

  const db = getDb();
  const id = uuid();
  const type = await detectProjectType(projectPath);
  const gitEnabled = (await detectGit(projectPath)) ? 1 : 0;
  const resolvedCompany = company || detectCompany(name, projectPath);
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO projects (id, name, path, type, git_enabled, status, last_opened, dev_server_port, company, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, projectPath, type, gitEnabled, status, now, dev_server_port, resolvedCompany, now, now);

    // Auto-create project brain
    db.prepare(`
      INSERT INTO project_brain (id, project_id) VALUES (?, ?)
    `).run(uuid(), id);

    // Auto-create workspace state
    db.prepare(`
      INSERT INTO workspace (id, project_id) VALUES (?, ?)
    `).run(uuid(), id);

    // Check if this is an EXISTING project (has source files) vs empty/new
    let fileCount = 0;
    try {
      const items = fs.readdirSync(projectPath);
      fileCount = items.filter(i => !i.startsWith('.')).length;
    } catch { /* */ }

    let scanResult = null;

    if (fileCount > 0) {
      // EXISTING PROJECT — deep scan NOW (before responding)
      console.log(`[projects] Existing project detected (${fileCount} items). Running deep scan...`);
      try {
        scanResult = await scanProject(id, projectPath);
        console.log(`[projects] Scan complete: ${scanResult.summary}`);

        // Update project type if scanner found a better one
        if (scanResult.detectedStacks.length > 0) {
          const betterType = scanResult.detectedStacks[0].toLowerCase().replace(/\s+/g, '-');
          db.prepare('UPDATE projects SET type = ? WHERE id = ?').run(betterType, id);
        }
      } catch (err: any) {
        console.error(`[projects] Scan failed for ${name}:`, err.message);
      }
    } else {
      console.log(`[projects] New/empty project — skipping scan`);
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.status(201).json({ project, scan: scanResult });
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

  const { name, status, dev_server_port, icon, company } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE projects SET
      name = COALESCE(?, name),
      status = COALESCE(?, status),
      dev_server_port = COALESCE(?, dev_server_port),
      icon = COALESCE(?, icon),
      company = COALESCE(?, company),
      last_opened = ?,
      updated_at = ?
    WHERE id = ?
  `).run(name ?? null, status ?? null, dev_server_port ?? null, icon ?? null, company ?? null, now, now, req.params.id);

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

// POST /api/projects/:id/scan — manually trigger project scan
projectsRouter.post('/:id/scan', async (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const result = await scanProject(project.id, project.path);

    // Update project type if scanner found a better one
    if (result.detectedStacks.length > 0) {
      const betterType = result.detectedStacks[0].toLowerCase().replace(/\s+/g, '-');
      db.prepare('UPDATE projects SET type = ?, updated_at = ? WHERE id = ?')
        .run(betterType, new Date().toISOString(), project.id);
    }

    res.json({ scan: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/files — get file index for a project
projectsRouter.get('/:id/files', (req, res) => {
  const db = getDb();
  const { type } = req.query;

  let query = 'SELECT * FROM file_index WHERE project_id = ?';
  const params: any[] = [req.params.id];

  if (type) {
    query += ' AND file_type = ?';
    params.push(type);
  }

  query += ' ORDER BY file_type, file_path';
  const files = db.prepare(query).all(...params);
  res.json({ files, total: files.length });
});

// GET /api/projects/:id/structure — get condensed structure summary
projectsRouter.get('/:id/structure', (req, res) => {
  const summary = getProjectStructureSummary(req.params.id);
  res.json({ summary });
});

// GET /api/projects/:id/documents — list .md, .docx, .xlsx, .pdf files
projectsRouter.get('/:id/documents', async (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const docExtensions = new Set(['.md', '.mdx', '.docx', '.xlsx', '.xls', '.pdf', '.csv', '.doc', '.pptx', '.txt']);
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'target', '.cache', 'coverage', '__pycache__']);
  const documents: { name: string; path: string; relativePath: string; ext: string; size: number; modified: string }[] = [];

  async function scanDir(dir: string, depth: number) {
    if (depth > 5 || documents.length > 200) return;
    try {
      const items = await fsp.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          if (skipDirs.has(item.name)) continue;
          await scanDir(path.join(dir, item.name), depth + 1);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (!docExtensions.has(ext)) continue;
          const fullPath = path.join(dir, item.name);
          try {
            const stat = await fsp.stat(fullPath);
            documents.push({
              name: item.name,
              path: fullPath,
              relativePath: path.relative(project.path, fullPath),
              ext,
              size: stat.size,
              modified: stat.mtime.toISOString(),
            });
          } catch { /* */ }
        }
      }
    } catch { /* */ }
  }

  await scanDir(project.path, 0);
  documents.sort((a, b) => b.modified.localeCompare(a.modified));
  res.json({ documents, total: documents.length });
});

// GET /api/projects/:id/documents/read — read a document file content
projectsRouter.get('/:id/documents/read', async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ error: 'path query parameter required' });
    return;
  }

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Security: ensure file is within project directory
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(project.path))) {
    res.status(403).json({ error: 'File outside project directory' });
    return;
  }

  try { await fsp.access(resolved); } catch {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  if (ext === '.md' || ext === '.mdx' || ext === '.txt' || ext === '.csv') {
    const content = await fsp.readFile(resolved, 'utf-8');
    res.json({ content, type: 'text' });
  } else {
    // Binary files — serve as download
    res.sendFile(resolved);
  }
});
