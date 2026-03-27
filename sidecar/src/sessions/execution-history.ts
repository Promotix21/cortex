import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';

export type ActionType = 'file_edit' | 'file_create' | 'file_delete' | 'command_run' | 'git_operation';

export interface ExecutionEntry {
  id: string;
  sessionId: string;
  actionType: ActionType;
  fileChanged: string | null;
  commandRun: string | null;
  diffSummary: string | null;
  timestamp: string;
}

/**
 * Log an AI action to execution history
 */
export function logExecution(
  sessionId: string,
  actionType: ActionType,
  opts: {
    fileChanged?: string;
    commandRun?: string;
    diffSummary?: string;
  } = {}
): ExecutionEntry {
  const id = uuid();
  const now = new Date().toISOString();

  const db = getDb();
  db.prepare(`
    INSERT INTO execution_history (id, session_id, action_type, file_changed, command_run, diff_summary, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, actionType, opts.fileChanged ?? null, opts.commandRun ?? null, opts.diffSummary ?? null, now);

  return {
    id,
    sessionId,
    actionType,
    fileChanged: opts.fileChanged ?? null,
    commandRun: opts.commandRun ?? null,
    diffSummary: opts.diffSummary ?? null,
    timestamp: now,
  };
}

/**
 * Get execution history for a session
 */
export function getSessionExecutions(sessionId: string, limit = 100): ExecutionEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM execution_history WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
  `).all(sessionId, limit) as any[];

  return rows.map(row => ({
    id: row.id,
    sessionId: row.session_id,
    actionType: row.action_type,
    fileChanged: row.file_changed,
    commandRun: row.command_run,
    diffSummary: row.diff_summary,
    timestamp: row.timestamp,
  }));
}

/**
 * Get execution summary for a session (for AI context)
 */
export function getExecutionSummary(sessionId: string): string {
  const entries = getSessionExecutions(sessionId, 20);
  if (entries.length === 0) return '';

  const lines = entries.reverse().map(e => {
    switch (e.actionType) {
      case 'file_edit':
        return `- Edited ${e.fileChanged}${e.diffSummary ? `: ${e.diffSummary}` : ''}`;
      case 'file_create':
        return `- Created ${e.fileChanged}`;
      case 'file_delete':
        return `- Deleted ${e.fileChanged}`;
      case 'command_run':
        return `- Ran: ${e.commandRun}${e.diffSummary ? ` (${e.diffSummary})` : ''}`;
      case 'git_operation':
        return `- Git: ${e.commandRun || e.diffSummary || 'operation'}`;
      default:
        return `- ${e.actionType}: ${e.diffSummary || ''}`;
    }
  });

  return `Recent AI actions:\n${lines.join('\n')}`;
}

/**
 * Parse Claude Code output to detect actions (heuristic-based)
 */
export function parseOutputForActions(output: string): {
  actionType: ActionType;
  fileChanged?: string;
  commandRun?: string;
  diffSummary?: string;
}[] {
  const actions: ReturnType<typeof parseOutputForActions> = [];

  // Detect file edits: patterns like "Wrote to /path/file" or "Updated /path/file"
  const writePattern = /(?:Wrote to|Updated|Created|Edited)\s+([^\s]+)/gi;
  let match;
  while ((match = writePattern.exec(output)) !== null) {
    actions.push({
      actionType: 'file_edit',
      fileChanged: match[1],
      diffSummary: match[0],
    });
  }

  // Detect command execution: patterns like "$ command" or "Running: command"
  const cmdPattern = /(?:\$|Running:|Executing:)\s+(.+)/g;
  while ((match = cmdPattern.exec(output)) !== null) {
    const cmd = match[1].trim();
    if (cmd.startsWith('git ')) {
      actions.push({ actionType: 'git_operation', commandRun: cmd });
    } else {
      actions.push({ actionType: 'command_run', commandRun: cmd });
    }
  }

  // Detect file creation
  const createPattern = /(?:Created file|New file):\s+([^\s]+)/gi;
  while ((match = createPattern.exec(output)) !== null) {
    actions.push({ actionType: 'file_create', fileChanged: match[1] });
  }

  // Detect file deletion
  const deletePattern = /(?:Deleted|Removed file):\s+([^\s]+)/gi;
  while ((match = deletePattern.exec(output)) !== null) {
    actions.push({ actionType: 'file_delete', fileChanged: match[1] });
  }

  return actions;
}
