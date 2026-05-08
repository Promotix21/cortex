/**
 * Local Impact Graph — v2.5 Phase 3.
 *
 * Parses import statements from TS/JS source files using regex (no AST parser
 * dependency — ts-morph would be 30MB+). Good enough for ~95% of imports in
 * the Cortex codebase. Resolves relative imports against the project root.
 */

import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

const IMPORT_EXT_ORDER = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

// Matches ES module imports: `import X from 'path'`, `import { X } from 'path'`, `import 'path'`
// plus re-exports: `export { X } from 'path'`
const ESM_IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)(?:\s+type)?\s+(?:[^;'"]*\s+from\s+)?['"]([^'"]+)['"]/g;
// Matches CommonJS: `require('path')`
const CJS_REQUIRE_PATTERN = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
// Matches dynamic imports: `import('path')`
const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export interface FileImport {
  sourcePath: string;
  targetPath: string;
  rawSpecifier: string;
}

export function extractImports(fileContent: string): string[] {
  const specifiers: string[] = [];
  const seen = new Set<string>();
  for (const pattern of [ESM_IMPORT_PATTERN, CJS_REQUIRE_PATTERN, DYNAMIC_IMPORT_PATTERN]) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(fileContent)) !== null) {
      const spec = m[1];
      if (!seen.has(spec)) {
        seen.add(spec);
        specifiers.push(spec);
      }
    }
  }
  return specifiers;
}

/**
 * Resolve a relative import specifier to an absolute file path within projectRoot.
 * Returns null for external packages (no leading . or /).
 */
export function resolveImport(sourceFile: string, specifier: string, projectRoot: string): string | null {
  // External package — skip
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    // Handle @/* alias (common Vite/Next pattern mapping to src/)
    if (specifier.startsWith('@/')) {
      const aliased = path.join(projectRoot, 'src', specifier.slice(2));
      return tryResolve(aliased);
    }
    return null;
  }

  const baseDir = path.dirname(sourceFile);
  const absolute = path.resolve(baseDir, specifier);
  return tryResolve(absolute);
}

function tryResolve(absoluteBase: string): string | null {
  // If exact path exists and is a file, use it
  if (fs.existsSync(absoluteBase) && fs.statSync(absoluteBase).isFile()) {
    return absoluteBase;
  }
  // Strip common JS extensions from specifier (common in ESM .js imports of .ts source)
  const stripped = absoluteBase.replace(/\.(js|mjs|cjs)$/, '');
  for (const ext of IMPORT_EXT_ORDER) {
    const candidate = stripped + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  // Directory with index file
  if (fs.existsSync(absoluteBase) && fs.statSync(absoluteBase).isDirectory()) {
    for (const ext of IMPORT_EXT_ORDER) {
      const candidate = path.join(absoluteBase, 'index' + ext);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Index imports for a single file. Called by the file-indexer after it writes file_index rows.
 */
export function indexFileImports(projectId: string, projectRoot: string, filePath: string): number {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) return 0;
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return 0;
  }

  const specifiers = extractImports(content);
  const db = getDb();
  const deleteStmt = db.prepare('DELETE FROM file_imports WHERE project_id = ? AND source_path = ?');
  const insertStmt = db.prepare('INSERT OR IGNORE INTO file_imports (id, project_id, source_path, target_path, raw_specifier) VALUES (?, ?, ?, ?, ?)');

  const tx = db.transaction(() => {
    deleteStmt.run(projectId, filePath);
    let count = 0;
    for (const spec of specifiers) {
      const target = resolveImport(filePath, spec, projectRoot);
      if (target) {
        insertStmt.run(uuid(), projectId, filePath, target, spec);
        count++;
      }
    }
    return count;
  });

  return tx();
}

/**
 * Compute dependents of a target file — who imports it?
 */
export function getDependents(projectId: string, targetPath: string): string[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT DISTINCT source_path FROM file_imports WHERE project_id = ? AND target_path = ?'
  ).all(projectId, targetPath) as { source_path: string }[];
  return rows.map(r => r.source_path);
}

export interface ImpactResult {
  target: string;
  resolvedTarget: string | null;
  dependents: string[];
  dependentCount: number;
}

/**
 * Called by the orchestrator's plan phase. Takes prompt-mentioned file names
 * (which may be bare filenames like "schema.ts") and tries to match them to
 * indexed files, then returns their dependents.
 */
export function computeImpactForFiles(projectId: string, mentionedFiles: string[]): ImpactResult[] {
  const db = getDb();
  const results: ImpactResult[] = [];

  for (const mention of mentionedFiles) {
    // Try exact absolute match first, then suffix match on indexed files
    let resolved: string | null = null;
    if (path.isAbsolute(mention) && fs.existsSync(mention)) {
      resolved = mention;
    } else {
      const row = db.prepare(
        'SELECT file_path FROM file_index WHERE project_id = ? AND file_path LIKE ? LIMIT 1'
      ).get(projectId, `%${mention}`) as { file_path: string } | undefined;
      resolved = row?.file_path || null;
    }

    const dependents = resolved ? getDependents(projectId, resolved) : [];
    results.push({
      target: mention,
      resolvedTarget: resolved,
      dependents,
      dependentCount: dependents.length,
    });
  }

  return results;
}
