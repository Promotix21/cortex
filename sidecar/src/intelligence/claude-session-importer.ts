import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';

/**
 * Import Claude Code's local session data into Cortex.
 * Reads from ~/.claude/projects/ — JSONL conversation logs + memory files.
 */

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

interface ImportResult {
  projectId: string;
  sessionsImported: number;
  memoryFilesImported: number;
  promptsImported: number;
  decisionsAdded: number;
}

/**
 * Map a Claude project directory name back to a Cortex project path.
 * Claude uses: -home-user-projects-name → /home/user/projects/name
 */
function claudeDirToPath(dirName: string): string {
  return dirName.replace(/^-/, '/').replace(/-/g, '/');
}

/**
 * Import all Claude sessions for a specific Cortex project.
 */
export function importClaudeSessions(projectId: string, projectPath: string): ImportResult {
  const result: ImportResult = {
    projectId,
    sessionsImported: 0,
    memoryFilesImported: 0,
    promptsImported: 0,
    decisionsAdded: 0,
  };

  const db = getDb();

  // Find the matching Claude project directory
  const claudeDirName = projectPath.replace(/\//g, '-').replace(/^-/, '-');
  let claudeDir = path.join(CLAUDE_PROJECTS_DIR, claudeDirName);

  // Try exact match first, then fuzzy
  if (!fs.existsSync(claudeDir)) {
    // Try without leading dash
    const alt = claudeDirName.startsWith('-') ? claudeDirName : '-' + claudeDirName;
    claudeDir = path.join(CLAUDE_PROJECTS_DIR, alt);
  }

  if (!fs.existsSync(claudeDir)) {
    // Try to find by project folder name
    try {
      const dirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
      const projectName = path.basename(projectPath);
      const match = dirs.find(d => d.endsWith(projectName));
      if (match) claudeDir = path.join(CLAUDE_PROJECTS_DIR, match);
    } catch { /* */ }
  }

  if (!fs.existsSync(claudeDir)) {
    return result;
  }

  // --- Import JSONL session files ---
  try {
    const files = fs.readdirSync(claudeDir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const sessionUuid = file.replace('.jsonl', '');
      const fullPath = path.join(claudeDir, file);

      // Skip if already imported
      const existing = db.prepare(
        "SELECT id FROM claude_sessions WHERE name LIKE ? AND project_id = ?"
      ).get(`%claude-import-${sessionUuid.slice(0, 8)}%`, projectId);
      if (existing) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        const prompts: { text: string; timestamp: string }[] = [];
        const responses: string[] = [];
        let firstTimestamp = '';
        let lastTimestamp = '';

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);

            if (entry.type === 'user' && entry.message?.content) {
              const msgContent = entry.message.content;
              let text = '';
              if (Array.isArray(msgContent)) {
                text = msgContent
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join(' ');
              } else {
                text = String(msgContent);
              }
              if (text.trim()) {
                prompts.push({
                  text: text.trim().slice(0, 5000),
                  timestamp: entry.timestamp || new Date().toISOString(),
                });
                if (!firstTimestamp) firstTimestamp = entry.timestamp;
                lastTimestamp = entry.timestamp || lastTimestamp;
              }
            }

            if (entry.type === 'assistant' && entry.message?.content) {
              const msgContent = entry.message.content;
              if (Array.isArray(msgContent)) {
                const text = msgContent
                  .filter((c: any) => c.type === 'text')
                  .map((c: any) => c.text)
                  .join(' ');
                if (text.trim()) responses.push(text.trim().slice(0, 2000));
              }
            }
          } catch { /* skip malformed lines */ }
        }

        if (prompts.length === 0) continue;

        // Create session record
        const sessionId = uuid();
        const sessionName = `claude-import-${sessionUuid.slice(0, 8)}`;
        const startedAt = firstTimestamp || new Date().toISOString();
        const lastActive = lastTimestamp || startedAt;

        // Build output summary from responses
        const outputSummary = responses.slice(0, 20).join('\n\n---\n\n').slice(0, 50000);

        db.prepare(`
          INSERT OR IGNORE INTO claude_sessions (id, project_id, name, status, started_at, last_active)
          VALUES (?, ?, ?, 'completed', ?, ?)
        `).run(sessionId, projectId, sessionName, startedAt, lastActive);

        // Create metrics
        db.prepare(`
          INSERT OR IGNORE INTO session_metrics (id, session_id, prompt_count, token_usage_input, token_usage_output)
          VALUES (?, ?, ?, 0, 0)
        `).run(uuid(), sessionId, prompts.length);

        // Import prompts to session_history
        const insertHistory = db.prepare(`
          INSERT INTO session_history (id, session_id, prompt_text, response_summary, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `);

        const importAll = db.transaction(() => {
          for (let i = 0; i < prompts.length; i++) {
            insertHistory.run(
              uuid(),
              sessionId,
              prompts[i].text,
              responses[i]?.slice(0, 2000) || null,
              prompts[i].timestamp
            );
          }
        });
        importAll();

        // Save session output
        try {
          db.exec('ALTER TABLE claude_sessions ADD COLUMN session_output TEXT DEFAULT NULL');
        } catch { /* */ }
        db.prepare('UPDATE claude_sessions SET session_output = ? WHERE id = ?')
          .run(outputSummary, sessionId);

        result.sessionsImported++;
        result.promptsImported += prompts.length;

      } catch { /* skip unreadable files */ }
    }
  } catch { /* */ }

  // --- Import memory files into brain ---
  const memoryDir = path.join(claudeDir, 'memory');
  if (fs.existsSync(memoryDir)) {
    try {
      const memFiles = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
      const brain = db.prepare('SELECT * FROM project_brain WHERE project_id = ?').get(projectId) as any;

      if (brain) {
        const memoryContent: string[] = [];

        for (const file of memFiles) {
          if (file === 'MEMORY.md') continue; // Skip the index file
          try {
            const content = fs.readFileSync(path.join(memoryDir, file), 'utf-8');
            if (content.trim()) {
              memoryContent.push(`\n--- ${file} ---\n${content.slice(0, 2000)}`);
              result.memoryFilesImported++;
            }
          } catch { /* */ }
        }

        if (memoryContent.length > 0) {
          // Append to decisions field
          const existing = brain.decisions || '';
          const newContent = `\n\n=== Claude Memory Files (imported) ===\n${memoryContent.join('\n')}`;

          // Only append if not already imported
          if (!existing.includes('Claude Memory Files (imported)')) {
            db.prepare('UPDATE project_brain SET decisions = ?, updated_at = ? WHERE project_id = ?')
              .run(existing + newContent, new Date().toISOString(), projectId);
            result.decisionsAdded = memoryContent.length;
          }
        }
      }
    } catch { /* */ }
  }

  return result;
}

/**
 * Import Claude sessions for ALL Cortex projects.
 */
export function importAllClaudeSessions(): ImportResult[] {
  const db = getDb();
  const projects = db.prepare('SELECT id, path FROM projects').all() as any[];
  const results: ImportResult[] = [];

  for (const project of projects) {
    const result = importClaudeSessions(project.id, project.path);
    if (result.sessionsImported > 0 || result.memoryFilesImported > 0) {
      results.push(result);
      console.log(`[claude-import] ${path.basename(project.path)}: ${result.sessionsImported} sessions, ${result.memoryFilesImported} memory files, ${result.promptsImported} prompts`);
    }
  }

  return results;
}
