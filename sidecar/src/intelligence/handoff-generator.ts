import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index.js';
import { getProjectBrain } from '../chat/chat-service.js';

/**
 * Generate NEXT_SESSION_PROMPT.md when a session ends.
 * Queries session_history, session_metrics, project_snapshots, debug_memory
 * to produce a comprehensive handoff document.
 */
export async function generateHandoff(
  sessionId: string,
  projectId: string,
  projectPath: string,
): Promise<{ written: boolean; path: string }> {
  const db = getDb();
  const outputPath = path.join(projectPath, 'NEXT_SESSION_PROMPT.md');

  // Gather data
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) return { written: false, path: outputPath };

  const brain = getProjectBrain(projectId);
  const session = db.prepare('SELECT * FROM claude_sessions WHERE id = ?').get(sessionId) as any;
  const metrics = db.prepare('SELECT * FROM session_metrics WHERE session_id = ?').get(sessionId) as any;
  const history = db.prepare(
    'SELECT * FROM session_history WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(sessionId) as any[];
  const recentSessions = db.prepare(
    'SELECT * FROM claude_sessions WHERE project_id = ? ORDER BY last_active DESC LIMIT 5'
  ).all(projectId) as any[];
  const snapshot = db.prepare(
    'SELECT * FROM project_snapshots WHERE project_id = ? ORDER BY timestamp DESC LIMIT 1'
  ).get(projectId) as any;
  const recentErrors = db.prepare(
    'SELECT * FROM captured_errors WHERE project_id = ? ORDER BY timestamp DESC LIMIT 5'
  ).all(projectId) as any[];
  const debugSolutions = db.prepare(`
    SELECT * FROM debug_memory
    WHERE (source_project_id = ? OR scope = 'reusable') AND confidence IN ('verified','probable')
    ORDER BY usage_count DESC LIMIT 5
  `).all(projectId) as any[];

  // Check for CLAUDE.md
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
  const hasClaude = fs.existsSync(claudeMdPath);

  // Build the document
  const lines: string[] = [];

  lines.push('# Next Session Prompt');
  lines.push('');
  lines.push('## File Read Order (DO THIS FIRST)');
  if (hasClaude) lines.push('1. `CLAUDE.md` — Development rules, architecture, known issues');
  lines.push(`${hasClaude ? '2' : '1'}. `.trim() + '`.cortex-context.md` — Auto-generated intelligence context');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Where We Are
  lines.push('## Where We Are');
  lines.push('');
  if (brain?.summary) {
    lines.push(`**Project:** ${project.name}`);
    lines.push(`**Summary:** ${brain.summary}`);
    lines.push('');
  }

  // Session Summary
  if (session) {
    lines.push(`### Last Session: ${session.name}`);
    lines.push(`- **Status:** ${session.status}`);
    lines.push(`- **Started:** ${session.started_at}`);
    lines.push(`- **Last Active:** ${session.last_active}`);
    if (metrics) {
      lines.push(`- **Prompts:** ${metrics.prompt_count}`);
      lines.push(`- **Tokens:** ~${metrics.token_usage_input + metrics.token_usage_output}`);
      const mins = Math.floor(metrics.duration_seconds / 60);
      lines.push(`- **Duration:** ${mins} minutes`);
    }
    lines.push('');
  }

  // What was worked on (from prompt history)
  if (history.length > 0) {
    lines.push('### Session Activity');
    const summaryPrompts = history.slice(-10);
    for (const h of summaryPrompts) {
      const shortPrompt = h.prompt_text.slice(0, 150).replace(/\n/g, ' ');
      lines.push(`- ${shortPrompt}${h.prompt_text.length > 150 ? '...' : ''}`);
    }
    lines.push('');
  }

  // Git state
  if (snapshot) {
    lines.push('### Git State');
    if (snapshot.active_branch) lines.push(`- **Branch:** ${snapshot.active_branch}`);
    if (snapshot.git_commit) lines.push(`- **Commit:** ${snapshot.git_commit}`);
    try {
      const uncommitted = JSON.parse(snapshot.uncommitted_files || '[]');
      if (uncommitted.length > 0) {
        lines.push(`- **Uncommitted files:** ${uncommitted.length}`);
        for (const f of uncommitted.slice(0, 10)) {
          lines.push(`  - ${f}`);
        }
      }
    } catch { /* ignore */ }
    lines.push('');
  }

  // Known Issues
  if (brain?.knownIssues) {
    lines.push('### Known Issues');
    lines.push(brain.knownIssues);
    lines.push('');
  }

  // Recent Errors
  if (recentErrors.length > 0) {
    lines.push('### Recent Errors');
    for (const err of recentErrors) {
      lines.push(`- [${err.error_type}] ${err.message}`);
    }
    lines.push('');
  }

  // Debug Solutions
  if (debugSolutions.length > 0) {
    lines.push('### Known Solutions');
    for (const sol of debugSolutions) {
      lines.push(`- **${sol.problem}**: ${sol.solution}`);
    }
    lines.push('');
  }

  // Architecture
  if (brain?.architectureNotes) {
    lines.push('### Architecture');
    lines.push(brain.architectureNotes);
    lines.push('');
  }

  // If Something Breaks
  lines.push('---');
  lines.push('');
  lines.push('## If Something Breaks');
  lines.push('');
  lines.push('### Sidecar won\'t start');
  lines.push('```bash');
  lines.push('rm -f ~/.cortex/cortex.db*  # Clean DB');
  lines.push('cd sidecar && npx tsx src/index.ts  # Restart');
  lines.push('```');
  lines.push('');
  lines.push('### Type errors');
  lines.push('```bash');
  lines.push('npx tsc --noEmit  # Check for errors');
  lines.push('```');
  lines.push('');

  lines.push('---');
  lines.push(`*Generated by Cortex handoff. Last updated: ${new Date().toISOString().split('T')[0]}*`);

  const content = lines.join('\n');
  fs.writeFileSync(outputPath, content, 'utf-8');

  return { written: true, path: outputPath };
}

/**
 * Get handoff content for a session (for UI viewer)
 */
export function getHandoff(projectPath: string): string | null {
  const handoffPath = path.join(projectPath, 'NEXT_SESSION_PROMPT.md');
  if (!fs.existsSync(handoffPath)) return null;
  return fs.readFileSync(handoffPath, 'utf-8');
}
