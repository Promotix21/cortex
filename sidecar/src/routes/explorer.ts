import { Router } from 'express';
import { getDb } from '../db/index.js';
import fsp from 'fs/promises';
import path from 'path';

export const explorerRouter: ReturnType<typeof Router> = Router();

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'target',
  '.cache', 'coverage', '__pycache__', '.turbo', '.vercel', '.output',
  '.nuxt', '.svelte-kit', 'out', '.parcel-cache',
]);

const MAX_FILE_READ_SIZE = 2 * 1024 * 1024; // 2MB

interface TreeNode {
  name: string;
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
  ext?: string;
  size?: number;
  children?: TreeNode[];
}

// Helper: resolve project from DB
function getProject(id: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as { id: string; path: string; name: string } | undefined;
}

// Helper: ensure path is within project
function validatePath(projectPath: string, filePath: string): string | null {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(projectPath))) return null;
  return resolved;
}

// GET /api/explorer/:id/tree — recursive directory tree
explorerRouter.get('/:id/tree', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const maxDepth = Math.min(parseInt(req.query.depth as string) || 4, 8);
  const projectPath = project.path;

  async function buildTree(dir: string, depth: number): Promise<TreeNode[]> {
    if (depth > maxDepth) return [];
    const nodes: TreeNode[] = [];
    try {
      const items = await fsp.readdir(dir, { withFileTypes: true });
      // Sort: directories first, then files, both alphabetical
      const sorted = items.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const item of sorted) {
        if (item.name.startsWith('.') && item.name !== '.env' && item.name !== '.env.local') {
          // Skip hidden files/dirs except common config
          if (item.isDirectory()) continue;
        }

        const fullPath = path.join(dir, item.name);
        const relativePath = path.relative(projectPath, fullPath);

        if (item.isDirectory()) {
          if (SKIP_DIRS.has(item.name)) continue;
          const children = await buildTree(fullPath, depth + 1);
          nodes.push({
            name: item.name,
            path: fullPath,
            relativePath,
            type: 'directory',
            children,
          });
        } else {
          let size = 0;
          try {
            const stat = await fsp.stat(fullPath);
            size = stat.size;
          } catch { /* skip */ }
          nodes.push({
            name: item.name,
            path: fullPath,
            relativePath,
            type: 'file',
            ext: path.extname(item.name).toLowerCase(),
            size,
          });
        }
      }
    } catch { /* permission denied or dir gone */ }
    return nodes;
  }

  const tree = await buildTree(project.path, 0);
  res.json({ tree, projectPath: project.path });
});

// GET /api/explorer/:id/read — read any file content
explorerRouter.get('/:id/read', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).json({ error: 'path query parameter required' }); return; }

  const resolved = validatePath(project.path, filePath);
  if (!resolved) { res.status(403).json({ error: 'File outside project directory' }); return; }

  try { await fsp.access(resolved); } catch {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const stat = await fsp.stat(resolved);
  if (stat.size > MAX_FILE_READ_SIZE) {
    res.status(413).json({ error: 'File too large (max 2MB)' });
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  const textExts = new Set([
    '.md', '.mdx', '.txt', '.csv', '.json', '.yaml', '.yml', '.toml',
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java', '.kt', '.scala', '.rb', '.php',
    '.html', '.css', '.scss', '.less', '.sass',
    '.sh', '.bash', '.zsh', '.fish',
    '.sql', '.graphql', '.gql',
    '.env', '.env.local', '.env.example',
    '.gitignore', '.dockerignore', '.editorconfig',
    '.xml', '.svg', '.vue', '.svelte', '.astro',
    '.c', '.cpp', '.h', '.hpp', '.cs',
    '.lua', '.zig', '.nim', '.dart', '.swift',
    '.prisma', '.proto', '.tf', '.hcl',
    '.lock', '.cfg', '.ini', '.conf',
  ]);

  // Also treat extensionless dotfiles as text
  const isText = textExts.has(ext) || ext === '' || ext === '.';

  if (isText) {
    try {
      const content = await fsp.readFile(resolved, 'utf-8');
      res.json({ content, type: 'text', language: extToLanguage(ext) });
    } catch {
      res.status(500).json({ error: 'Failed to read file' });
    }
  } else {
    // Binary — return metadata only
    res.json({ content: null, type: 'binary', size: stat.size, ext });
  }
});

// PUT /api/explorer/:id/write — save file content (markdown files only)
explorerRouter.put('/:id/write', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const { filePath, content } = req.body;
  if (!filePath || content === undefined) {
    res.status(400).json({ error: 'filePath and content required' });
    return;
  }

  const resolved = validatePath(project.path, filePath);
  if (!resolved) { res.status(403).json({ error: 'File outside project directory' }); return; }

  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.md' && ext !== '.mdx' && ext !== '.txt') {
    res.status(403).json({ error: 'Only .md, .mdx, and .txt files can be edited' });
    return;
  }

  try {
    await fsp.writeFile(resolved, content, 'utf-8');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to write file: ${err.message}` });
  }
});

// POST /api/explorer/:id/rename — rename a file or folder
explorerRouter.post('/:id/rename', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const { oldPath, newName } = req.body;
  if (!oldPath || !newName) {
    res.status(400).json({ error: 'oldPath and newName required' });
    return;
  }

  // Prevent directory traversal in new name
  if (newName.includes('/') || newName.includes('\\') || newName === '..' || newName === '.') {
    res.status(400).json({ error: 'Invalid file name' });
    return;
  }

  const resolvedOld = validatePath(project.path, oldPath);
  if (!resolvedOld) { res.status(403).json({ error: 'Path outside project directory' }); return; }

  const newPath = path.join(path.dirname(resolvedOld), newName);
  const resolvedNew = validatePath(project.path, newPath);
  if (!resolvedNew) { res.status(403).json({ error: 'New path outside project directory' }); return; }

  try {
    await fsp.access(resolvedOld);
    // Check new path doesn't already exist
    try {
      await fsp.access(resolvedNew);
      res.status(409).json({ error: 'A file/folder with that name already exists' });
      return;
    } catch { /* good, doesn't exist */ }

    await fsp.rename(resolvedOld, resolvedNew);
    res.json({ success: true, newPath: resolvedNew });
  } catch (err: any) {
    res.status(500).json({ error: `Rename failed: ${err.message}` });
  }
});

// POST /api/explorer/:id/create — create a file or folder
explorerRouter.post('/:id/create', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const { parentPath, name, type } = req.body as { parentPath: string; name: string; type: 'file' | 'directory' };
  if (!parentPath || !name || !type) {
    res.status(400).json({ error: 'parentPath, name, and type required' });
    return;
  }

  if (name.includes('/') || name.includes('\\') || name === '..' || name === '.') {
    res.status(400).json({ error: 'Invalid name' });
    return;
  }

  const fullPath = path.join(parentPath, name);
  const resolved = validatePath(project.path, fullPath);
  if (!resolved) { res.status(403).json({ error: 'Path outside project directory' }); return; }

  try {
    await fsp.access(resolved);
    res.status(409).json({ error: 'Already exists' });
    return;
  } catch { /* good */ }

  try {
    if (type === 'directory') {
      await fsp.mkdir(resolved, { recursive: true });
    } else {
      await fsp.writeFile(resolved, '', 'utf-8');
    }
    res.json({ success: true, path: resolved, relativePath: path.relative(project.path, resolved) });
  } catch (err: any) {
    res.status(500).json({ error: `Create failed: ${err.message}` });
  }
});

// DELETE /api/explorer/:id/delete — delete a file or empty folder
explorerRouter.delete('/:id/delete', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).json({ error: 'path query parameter required' }); return; }

  const resolved = validatePath(project.path, filePath);
  if (!resolved) { res.status(403).json({ error: 'Path outside project directory' }); return; }

  // Safety: don't allow deleting the project root
  if (resolved === path.resolve(project.path)) {
    res.status(403).json({ error: 'Cannot delete project root' });
    return;
  }

  try {
    const stat = await fsp.stat(resolved);
    if (stat.isDirectory()) {
      // Only delete empty directories for safety
      const contents = await fsp.readdir(resolved);
      if (contents.length > 0) {
        res.status(400).json({ error: 'Directory is not empty' });
        return;
      }
      await fsp.rmdir(resolved);
    } else {
      await fsp.unlink(resolved);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: `Delete failed: ${err.message}` });
  }
});

// GET /api/explorer/:id/search — search files by name
explorerRouter.get('/:id/search', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const query = (req.query.q as string || '').toLowerCase().trim();
  if (!query) { res.json({ results: [] }); return; }

  const results: { name: string; path: string; relativePath: string; type: 'file' | 'directory' }[] = [];
  const maxResults = 50;
  const projectPath = project.path;

  async function searchDir(dir: string, depth: number) {
    if (depth > 6 || results.length >= maxResults) return;
    try {
      const items = await fsp.readdir(dir, { withFileTypes: true });
      for (const item of items) {
        if (results.length >= maxResults) break;
        if (item.name.startsWith('.') && item.isDirectory()) continue;
        if (SKIP_DIRS.has(item.name) && item.isDirectory()) continue;

        const fullPath = path.join(dir, item.name);
        if (item.name.toLowerCase().includes(query)) {
          results.push({
            name: item.name,
            path: fullPath,
            relativePath: path.relative(projectPath, fullPath),
            type: item.isDirectory() ? 'directory' : 'file',
          });
        }
        if (item.isDirectory()) {
          await searchDir(fullPath, depth + 1);
        }
      }
    } catch { /* */ }
  }

  await searchDir(project.path, 0);
  res.json({ results });
});

// GET /api/explorer/:id/raw — serve raw file (images, videos, etc.)
explorerRouter.get('/:id/raw', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).json({ error: 'path query parameter required' }); return; }

  const resolved = validatePath(project.path, filePath);
  if (!resolved) { res.status(403).json({ error: 'File outside project directory' }); return; }

  try { await fsp.access(resolved); } catch {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.avif': 'image/avif',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg',
    '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
    '.pdf': 'application/pdf',
  };

  const mime = mimeMap[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.sendFile(resolved);
});

// Map file extension to language identifier for syntax highlighting
function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.mjs': 'javascript', '.cjs': 'javascript',
    '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.kt': 'kotlin', '.scala': 'scala',
    '.php': 'php', '.cs': 'csharp', '.cpp': 'cpp', '.c': 'c', '.h': 'c',
    '.html': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.md': 'markdown', '.mdx': 'markdown',
    '.sql': 'sql', '.graphql': 'graphql',
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
    '.xml': 'xml', '.svg': 'xml',
    '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
    '.prisma': 'prisma', '.proto': 'protobuf',
    '.lua': 'lua', '.dart': 'dart', '.swift': 'swift', '.zig': 'zig',
    '.txt': 'text', '.env': 'bash', '.gitignore': 'text',
  };
  return map[ext] || 'text';
}
