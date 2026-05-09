import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db/index.js';

export interface SearchResult {
  filePath: string;
  content: string;
  relevance: number;
  type: string;
}

/**
 * Perform a keyword-based search over the project codebase.
 * Uses a combination of DB index lookup and ripgrep (if available).
 */
export async function searchCodebase(
  projectId: string,
  projectPath: string,
  query: string,
  limit = 10
): Promise<SearchResult[]> {
  const db = getDb();
  const results: SearchResult[] = [];
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  if (queryTerms.length === 0) return [];

  // 1. Filename matching (High relevance)
  const fileMatches = db.prepare(`
    SELECT file_path, file_type FROM file_index
    WHERE project_id = ? AND (file_path LIKE ? OR file_path LIKE ?)
    LIMIT 20
  `).all(projectId, `%${queryTerms[0]}%`, `%${query.replace(/\s+/g, '-').toLowerCase()}%`) as any[];

  for (const f of fileMatches) {
    try {
      const absPath = path.join(projectPath, f.file_path);
      if (fs.existsSync(absPath)) {
        const content = fs.readFileSync(absPath, 'utf-8');
        results.push({
          filePath: f.file_path,
          content: content.slice(0, 5000), // Keep it manageable
          relevance: 10,
          type: f.file_type
        });
      }
    } catch {}
  }

  // 2. Content matching using ripgrep (if available) or fallback
  try {
    const rgQuery = queryTerms.join(' ');
    const output = execSync(`rg -l --max-count 1 --max-filesize 100K "${rgQuery}" "${projectPath}"`, {
      encoding: 'utf-8',
      timeout: 5000
    });

    const lines = output.split('\n').filter(Boolean).slice(0, 15);
    for (const line of lines) {
      const relPath = path.relative(projectPath, line);
      if (results.some(r => r.filePath === relPath)) continue;

      try {
        const content = fs.readFileSync(line, 'utf-8');
        results.push({
          filePath: relPath,
          content: content.slice(0, 5000),
          relevance: 5,
          type: 'source'
        });
      } catch {}
    }
  } catch (err) {
    // ripgrep failed or not found, fallback to simpler search if needed
  }

  // 3. Rank and limit
  return results
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

/**
 * Format search results for AI context
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return 'No relevant code snippets found.';

  return results.map(r => (
    `### FILE: ${r.filePath}\n` +
    `\`\`\`\n${r.content}\n\`\`\``
  )).join('\n\n');
}
