import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { createErrorSignature } from './error-normalizer.js';

/**
 * Error signature patterns to detect in session output
 */
const ERROR_PATTERNS = [
  { regex: /Error: (.+)/g, type: 'runtime' },
  { regex: /TypeError: (.+)/g, type: 'type' },
  { regex: /SyntaxError: (.+)/g, type: 'syntax' },
  { regex: /ReferenceError: (.+)/g, type: 'reference' },
  { regex: /Cannot find module '([^']+)'/g, type: 'module_not_found' },
  { regex: /ENOENT: no such file or directory[, ]*(.+)/g, type: 'file_not_found' },
  { regex: /ECONNREFUSED (.+)/g, type: 'connection_refused' },
  { regex: /fatal: (.+)/g, type: 'git_error' },
  { regex: /warning: (.+)/g, type: 'warning' },
  { regex: /TS\d+: (.+)/g, type: 'typescript' },
  { regex: /ERR! (.+)/g, type: 'npm_error' },
];

/**
 * File change patterns in session output
 */
const FILE_CHANGE_PATTERNS = [
  { regex: /(?:created?|wrote?|writing)\s+(?:file\s+)?['"`]?([^\s'"`,]+\.\w+)['"`]?/gi, action: 'file_create' as const },
  { regex: /(?:edited?|modified?|updated?|changed?)\s+(?:file\s+)?['"`]?([^\s'"`,]+\.\w+)['"`]?/gi, action: 'file_edit' as const },
  { regex: /(?:deleted?|removed?)\s+(?:file\s+)?['"`]?([^\s'"`,]+\.\w+)['"`]?/gi, action: 'file_delete' as const },
  { regex: /git commit -m ['"](.*?)['"]/g, action: 'git_operation' as const },
];

interface AnalysisResult {
  errorsFound: number;
  patternsDetected: number;
  fileChanges: number;
  debugEntriesCreated: number;
}

/**
 * Analyze a session's output for errors, file changes, and patterns.
 * Creates unverified debug_memory and pattern_memory entries.
 */
export function analyzeSession(sessionId: string, projectId: string): AnalysisResult {
  const db = getDb();
  const result: AnalysisResult = {
    errorsFound: 0,
    patternsDetected: 0,
    fileChanges: 0,
    debugEntriesCreated: 0,
  };

  // Get session history (prompts/responses)
  const history = db.prepare(
    'SELECT prompt_text, response_summary FROM session_history WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(sessionId) as { prompt_text: string; response_summary: string | null }[];

  const fullText = history.map(h => `${h.prompt_text}\n${h.response_summary || ''}`).join('\n');

  // Detect errors
  const seenErrors = new Set<string>();
  for (const pattern of ERROR_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      const errorMsg = match[1]?.trim();
      if (!errorMsg || errorMsg.length < 5 || seenErrors.has(errorMsg)) continue;
      seenErrors.add(errorMsg);
      result.errorsFound++;

      // Create an error signature
      const signature = createErrorSignature(pattern.type, errorMsg);

      // Check if we already have this error in debug_memory
      const existing = db.prepare(
        'SELECT id FROM debug_memory WHERE error_signature = ?'
      ).get(signature);

      if (!existing) {
        // Look for solution context nearby in the text
        const errorIdx = fullText.indexOf(errorMsg);
        const solutionContext = fullText.slice(errorIdx, errorIdx + 1000);
        const solutionMatch = solutionContext.match(/(?:fix|solution|resolved|solved|fixed by|try|instead)[:\s]+(.{10,200})/i);

        db.prepare(`
          INSERT INTO debug_memory (id, problem, root_cause, solution, tags, source_project_id, error_signature, confidence)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'unverified')
        `).run(
          uuid(),
          errorMsg.slice(0, 500),
          pattern.type,
          solutionMatch ? solutionMatch[1].trim() : '',
          JSON.stringify([pattern.type]),
          projectId,
          signature,
        );
        result.debugEntriesCreated++;
      }
    }
  }

  // Detect file changes
  for (const pattern of FILE_CHANGE_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      const filePath = match[1]?.trim();
      if (!filePath || filePath.length < 3) continue;
      result.fileChanges++;

      // Log to execution_history
      db.prepare(`
        INSERT INTO execution_history (id, session_id, action_type, file_changed, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuid(), sessionId, pattern.action, filePath, new Date().toISOString());
    }
  }

  // Detect repeated code patterns (simple heuristic: look for code blocks)
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let codeMatch;
  const codeBlocks: string[] = [];
  while ((codeMatch = codeBlockRegex.exec(fullText)) !== null) {
    const code = codeMatch[2]?.trim();
    if (code && code.length > 50 && code.length < 2000) {
      codeBlocks.push(code);
    }
  }

  // If a code pattern appears in multiple prompts, flag it
  if (codeBlocks.length >= 2) {
    // Check for similar blocks (simple length + first-line similarity)
    const groups: Map<string, string[]> = new Map();
    for (const block of codeBlocks) {
      const key = block.split('\n')[0].trim().slice(0, 50);
      const arr = groups.get(key) || [];
      arr.push(block);
      groups.set(key, arr);
    }

    for (const [key, blocks] of groups) {
      if (blocks.length >= 2) {
        result.patternsDetected++;

        // Create unverified pattern
        const existing = db.prepare(
          'SELECT id FROM pattern_memory WHERE title = ? AND source_project_id = ?'
        ).get(key, projectId);

        if (!existing) {
          db.prepare(`
            INSERT INTO pattern_memory (id, title, description, code, tags, source_project_id, confidence)
            VALUES (?, ?, ?, ?, ?, ?, 'unverified')
          `).run(
            uuid(),
            key.slice(0, 200),
            `Auto-detected pattern from session (appeared ${blocks.length}x)`,
            blocks[0].slice(0, 2000),
            JSON.stringify(['auto-detected']),
            projectId,
          );
        }
      }
    }
  }

  return result;
}

/**
 * Get unverified (pending approval) entries for a project
 */
export function getLearningQueue(projectId: string): {
  patterns: any[];
  debug: any[];
} {
  const db = getDb();

  const patterns = db.prepare(`
    SELECT * FROM pattern_memory
    WHERE source_project_id = ? AND confidence = 'unverified'
    ORDER BY created_at DESC LIMIT 50
  `).all(projectId);

  const debug = db.prepare(`
    SELECT * FROM debug_memory
    WHERE source_project_id = ? AND confidence = 'unverified'
    ORDER BY created_at DESC LIMIT 50
  `).all(projectId);

  return { patterns, debug };
}

/**
 * Approve or dismiss a learning queue item
 */
export function reviewLearningItem(
  id: string,
  type: 'pattern' | 'debug',
  action: 'approve' | 'dismiss',
): void {
  const db = getDb();
  const table = type === 'pattern' ? 'pattern_memory' : 'debug_memory';
  const newConfidence = action === 'approve' ? 'probable' : 'deprecated';

  db.prepare(`UPDATE ${table} SET confidence = ?, updated_at = ? WHERE id = ?`)
    .run(newConfidence, new Date().toISOString(), id);
}
