import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';

export interface FileEntry {
  filePath: string;
  fileType: string;
  sizeBytes: number;
  lastModified: string;
}

// Path patterns for classification
const FILE_TYPE_PATTERNS: [RegExp, string][] = [
  // Controllers / handlers
  [/controllers?[/\\]/i, 'controller'],
  [/handlers?[/\\]/i, 'handler'],
  // Routes
  [/routes?[/\\]/i, 'route'],
  [/router[/\\]/i, 'route'],
  // Models / schemas
  [/models?[/\\]/i, 'model'],
  [/schemas?[/\\]/i, 'schema'],
  [/entities[/\\]/i, 'model'],
  // Config
  [/config[/\\]/i, 'config'],
  [/\.config\.(ts|js|mjs|cjs)$/, 'config'],
  [/\.env/, 'config'],
  [/tsconfig/, 'config'],
  [/package\.json$/, 'config'],
  [/Cargo\.toml$/, 'config'],
  [/go\.mod$/, 'config'],
  // Migrations
  [/migrations?[/\\]/i, 'migration'],
  [/migrate[/\\]/i, 'migration'],
  // Tests
  [/tests?[/\\]/i, 'test'],
  [/spec[/\\]/i, 'test'],
  [/__tests__[/\\]/, 'test'],
  [/\.test\.(ts|tsx|js|jsx)$/, 'test'],
  [/\.spec\.(ts|tsx|js|jsx)$/, 'test'],
  // Components (React/Vue/Svelte)
  [/components?[/\\]/i, 'component'],
  // Hooks
  [/hooks?[/\\]/i, 'hook'],
  [/^use[A-Z].*\.(ts|tsx)$/, 'hook'],
  // Store / state
  [/stores?[/\\]/i, 'store'],
  [/state[/\\]/i, 'store'],
  [/redux[/\\]/i, 'store'],
  // Services
  [/services?[/\\]/i, 'service'],
  // Middleware
  [/middleware[/\\]/i, 'middleware'],
  // Utils / helpers
  [/utils?[/\\]/i, 'util'],
  [/helpers?[/\\]/i, 'util'],
  [/lib[/\\]/i, 'util'],
  // Styles
  [/styles?[/\\]/i, 'style'],
  [/\.(css|scss|sass|less)$/, 'style'],
  // Types
  [/types?[/\\]/i, 'type'],
  [/interfaces?[/\\]/i, 'type'],
  [/\.d\.ts$/, 'type'],
  // Pages / views
  [/pages?[/\\]/i, 'page'],
  [/views?[/\\]/i, 'view'],
  // API
  [/api[/\\]/i, 'api'],
  // Database
  [/db[/\\]/i, 'database'],
  [/database[/\\]/i, 'database'],
  // Assets
  [/assets[/\\]/i, 'asset'],
  [/public[/\\]/i, 'asset'],
  [/static[/\\]/i, 'asset'],
  [/\.(png|jpg|jpeg|gif|svg|ico|webp)$/, 'asset'],
];

// Directories to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out',
  '.cache', '.turbo', '.vercel', '__pycache__', '.pytest_cache',
  'target', 'vendor', '.gradle', '.idea', '.vscode',
  'coverage', '.nyc_output', '.parcel-cache',
]);

// File extensions we care about
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.php', '.vue', '.svelte', '.astro',
  '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.sql', '.graphql', '.gql',
  '.sh', '.bash', '.zsh', '.fish',
  '.dockerfile', '.env', '.gitignore',
]);

function classifyFile(relativePath: string): string {
  for (const [pattern, type] of FILE_TYPE_PATTERNS) {
    if (pattern.test(relativePath)) return type;
  }
  return 'source';
}

function shouldInclude(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (CODE_EXTENSIONS.has(ext)) return true;
  // Include extensionless config files
  const base = path.basename(filename).toLowerCase();
  if (['dockerfile', 'makefile', 'rakefile', 'gemfile', 'procfile'].includes(base)) return true;
  if (base.startsWith('.') && !base.includes('.', 1)) return false; // hidden files
  return false;
}

/**
 * Parse .gitignore patterns from a file (simplified)
 */
function parseGitignorePatterns(gitignorePath: string): string[] {
  if (!fs.existsSync(gitignorePath)) return [];
  try {
    return fs.readFileSync(gitignorePath, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => l.replace(/\/$/, ''));
  } catch {
    return [];
  }
}

/**
 * Build a gitignore checker that respects nested .gitignore files.
 * Collects patterns from root and each subdirectory's .gitignore.
 */
class GitignoreChecker {
  private rootPatterns: string[];
  private nestedCache = new Map<string, string[]>();
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.rootPatterns = parseGitignorePatterns(path.join(projectPath, '.gitignore'));
  }

  /** Load and cache nested .gitignore patterns for a directory */
  loadNested(dir: string): void {
    const gitignorePath = path.join(dir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const relDir = path.relative(this.projectPath, dir);
      if (!this.nestedCache.has(relDir)) {
        this.nestedCache.set(relDir, parseGitignorePatterns(gitignorePath));
      }
    }
  }

  /** Check if a relative path is ignored by any applicable .gitignore */
  isIgnored(relativePath: string): boolean {
    // Check root patterns
    for (const pattern of this.rootPatterns) {
      if (relativePath.includes(pattern)) return true;
    }
    // Check nested patterns — apply patterns from parent directories
    for (const [dir, patterns] of this.nestedCache) {
      if (relativePath.startsWith(dir + '/') || dir === '') {
        const relToDir = dir ? relativePath.slice(dir.length + 1) : relativePath;
        for (const pattern of patterns) {
          if (relToDir.includes(pattern)) return true;
        }
      }
    }
    return false;
  }
}

/**
 * Walk directory tree and collect file entries
 */
export function walkProject(projectPath: string, maxFiles = 2000): FileEntry[] {
  const entries: FileEntry[] = [];
  const ignoreChecker = new GitignoreChecker(projectPath);

  function walk(dir: string, depth: number) {
    if (depth > 15 || entries.length >= maxFiles) return;

    // Check for nested .gitignore at this directory level
    ignoreChecker.loadNested(dir);

    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      if (entries.length >= maxFiles) break;

      if (item.isDirectory()) {
        if (SKIP_DIRS.has(item.name)) continue;
        const rel = path.relative(projectPath, path.join(dir, item.name));
        if (ignoreChecker.isIgnored(rel)) continue;
        walk(path.join(dir, item.name), depth + 1);
      } else if (item.isFile()) {
        if (!shouldInclude(item.name)) continue;
        const fullPath = path.join(dir, item.name);
        const rel = path.relative(projectPath, fullPath);
        if (ignoreChecker.isIgnored(rel)) continue;

        try {
          const stat = fs.statSync(fullPath);
          entries.push({
            filePath: rel,
            fileType: classifyFile(rel),
            sizeBytes: stat.size,
            lastModified: stat.mtime.toISOString(),
          });
        } catch {
          // Permission errors etc
        }
      }
    }
  }

  walk(projectPath, 0);
  return entries;
}

/**
 * Index a project's files into the database
 */
export function indexProject(projectId: string, projectPath: string): { indexed: number; byType: Record<string, number> } {
  const entries = walkProject(projectPath);
  const db = getDb();

  // Clear existing index
  db.prepare('DELETE FROM file_index WHERE project_id = ?').run(projectId);

  // Batch insert
  const stmt = db.prepare(
    'INSERT INTO file_index (id, project_id, file_path, file_type, size_bytes, last_modified) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertAll = db.transaction(() => {
    for (const entry of entries) {
      stmt.run(uuid(), projectId, entry.filePath, entry.fileType, entry.sizeBytes, entry.lastModified);
    }
  });
  insertAll();

  // Compute type counts
  const byType: Record<string, number> = {};
  for (const e of entries) {
    byType[e.fileType] = (byType[e.fileType] || 0) + 1;
  }

  return { indexed: entries.length, byType };
}

/**
 * Get a condensed project structure summary for AI context
 */
export function getProjectStructureSummary(projectId: string): string {
  const db = getDb();

  const typeCounts = db.prepare(`
    SELECT file_type, COUNT(*) as count, SUM(size_bytes) as total_size
    FROM file_index WHERE project_id = ?
    GROUP BY file_type ORDER BY count DESC
  `).all(projectId) as any[];

  if (typeCounts.length === 0) return '';

  const totalFiles = typeCounts.reduce((s, t) => s + t.count, 0);
  const lines: string[] = [`Project structure: ${totalFiles} files`];

  for (const t of typeCounts) {
    const sizeKb = Math.round(t.total_size / 1024);
    lines.push(`  ${t.file_type}: ${t.count} files (${sizeKb}KB)`);
  }

  // Show key files
  const keyFiles = db.prepare(`
    SELECT file_path, file_type FROM file_index
    WHERE project_id = ? AND file_type IN ('config', 'route', 'controller', 'model', 'migration')
    ORDER BY file_type, file_path LIMIT 30
  `).all(projectId) as any[];

  if (keyFiles.length > 0) {
    lines.push('\nKey files:');
    for (const f of keyFiles) {
      lines.push(`  [${f.file_type}] ${f.file_path}`);
    }
  }

  return lines.join('\n');
}
