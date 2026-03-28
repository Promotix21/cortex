import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index.js';
import { getProjectBrain } from '../chat/chat-service.js';
import { getMasterpieceContext } from './masterpiece-context.js';

/**
 * Context budget defaults (tokens per section, with priority)
 */
const DEFAULT_BUDGET: ContextBudget = {
  total: 11500,
  sections: {
    brain_summary:     { maxTokens: 500,  priority: 10 },
    architecture:      { maxTokens: 1000, priority: 9 },
    conventions:       { maxTokens: 300,  priority: 8 },
    known_issues:      { maxTokens: 500,  priority: 7 },
    recent_errors:     { maxTokens: 800,  priority: 7 },
    decisions:         { maxTokens: 500,  priority: 6 },
    verified_patterns: { maxTokens: 600,  priority: 5 },
    server_info:       { maxTokens: 300,  priority: 4 },
    dependencies:      { maxTokens: 400,  priority: 3 },
  },
};

interface SectionBudget {
  maxTokens: number;
  priority: number;
}

interface ContextBudget {
  total: number;
  sections: Record<string, SectionBudget>;
}

interface ContextSection {
  key: string;
  title: string;
  content: string;
  tokens: number;
  priority: number;
}

/** Rough token estimation: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Truncate content to fit within token budget */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 20) + '\n... [truncated]';
}

/**
 * Load custom context priorities from DB (if user has overridden defaults)
 */
function loadCustomBudget(projectId: string): ContextBudget {
  const db = getDb();
  const rows = db.prepare(
    'SELECT source_type, priority_weight, max_tokens FROM context_priorities WHERE project_id = ?'
  ).all(projectId) as { source_type: string; priority_weight: number; max_tokens: number }[];

  const budget = { ...DEFAULT_BUDGET, sections: { ...DEFAULT_BUDGET.sections } };

  for (const row of rows) {
    if (budget.sections[row.source_type]) {
      budget.sections[row.source_type] = {
        maxTokens: row.max_tokens,
        priority: row.priority_weight,
      };
    }
  }

  return budget;
}

/**
 * Gather recent captured errors for the project
 */
function getRecentErrors(projectId: string, limit = 10): string {
  const db = getDb();
  const errors = db.prepare(`
    SELECT error_type, message, source, timestamp
    FROM captured_errors
    WHERE project_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(projectId, limit) as { error_type: string; message: string; source: string; timestamp: string }[];

  if (errors.length === 0) return '';

  return errors.map(e =>
    `- [${e.error_type}] ${e.message}${e.source ? ` (${e.source})` : ''}`
  ).join('\n');
}

/**
 * Gather verified patterns for the project
 */
function getVerifiedPatterns(projectId: string): string {
  const db = getDb();
  const patterns = db.prepare(`
    SELECT title, description, code
    FROM pattern_memory
    WHERE (source_project_id = ? OR scope = 'reusable')
      AND confidence IN ('verified', 'probable')
    ORDER BY usage_count DESC
    LIMIT 10
  `).all(projectId) as { title: string; description: string; code: string }[];

  if (patterns.length === 0) return '';

  return patterns.map(p => {
    let entry = `### ${p.title}\n${p.description}`;
    if (p.code) entry += `\n\`\`\`\n${p.code.slice(0, 500)}\n\`\`\``;
    return entry;
  }).join('\n\n');
}

/**
 * Get server/deployment info for the project
 */
function getServerInfo(projectId: string): string {
  const db = getDb();

  // Check if servers table exists
  try {
    const servers = db.prepare(`
      SELECT name, type, url, port, status
      FROM servers
      WHERE project_id = ?
    `).all(projectId) as { name: string; type: string; url: string; port: number; status: string }[];

    if (servers.length === 0) return '';

    return servers.map(s =>
      `- **${s.name}** (${s.type}): ${s.url || `port ${s.port}`} — ${s.status}`
    ).join('\n');
  } catch {
    // servers table may not exist in all schemas
    return '';
  }
}

/**
 * Get debug memory solutions relevant to recent errors
 */
function getDebugSolutions(projectId: string): string {
  const db = getDb();
  const solutions = db.prepare(`
    SELECT problem, root_cause, solution
    FROM debug_memory
    WHERE (source_project_id = ? OR scope = 'reusable')
      AND confidence IN ('verified', 'probable')
    ORDER BY usage_count DESC
    LIMIT 5
  `).all(projectId) as { problem: string; root_cause: string; solution: string }[];

  if (solutions.length === 0) return '';

  return solutions.map(s =>
    `- **${s.problem}**: ${s.root_cause} → ${s.solution}`
  ).join('\n');
}

/**
 * Assemble the full context document from all intelligence sources.
 * Returns the markdown content and token count.
 */
export function assembleContext(projectId: string): { content: string; tokenCount: number } {
  const budget = loadCustomBudget(projectId);
  const brain = getProjectBrain(projectId);
  const sections: ContextSection[] = [];

  // Build sections from available data
  if (brain?.summary) {
    sections.push({
      key: 'brain_summary',
      title: 'Project Summary',
      content: brain.summary,
      tokens: estimateTokens(brain.summary),
      priority: budget.sections.brain_summary.priority,
    });
  }

  if (brain?.architectureNotes) {
    sections.push({
      key: 'architecture',
      title: 'Architecture',
      content: brain.architectureNotes,
      tokens: estimateTokens(brain.architectureNotes),
      priority: budget.sections.architecture.priority,
    });
  }

  if (brain?.conventions) {
    sections.push({
      key: 'conventions',
      title: 'Conventions',
      content: brain.conventions,
      tokens: estimateTokens(brain.conventions),
      priority: budget.sections.conventions.priority,
    });
  }

  if (brain?.knownIssues) {
    sections.push({
      key: 'known_issues',
      title: 'Known Issues',
      content: brain.knownIssues,
      tokens: estimateTokens(brain.knownIssues),
      priority: budget.sections.known_issues.priority,
    });
  }

  const recentErrors = getRecentErrors(projectId);
  if (recentErrors) {
    sections.push({
      key: 'recent_errors',
      title: 'Recent Errors (from dev tools)',
      content: recentErrors,
      tokens: estimateTokens(recentErrors),
      priority: budget.sections.recent_errors.priority,
    });
  }

  if (brain?.decisions) {
    sections.push({
      key: 'decisions',
      title: 'Key Decisions',
      content: brain.decisions,
      tokens: estimateTokens(brain.decisions),
      priority: budget.sections.decisions.priority,
    });
  }

  const patterns = getVerifiedPatterns(projectId);
  if (patterns) {
    sections.push({
      key: 'verified_patterns',
      title: 'Verified Patterns',
      content: patterns,
      tokens: estimateTokens(patterns),
      priority: budget.sections.verified_patterns.priority,
    });
  }

  const serverInfo = getServerInfo(projectId);
  if (serverInfo) {
    sections.push({
      key: 'server_info',
      title: 'Server & Deployment',
      content: serverInfo,
      tokens: estimateTokens(serverInfo),
      priority: budget.sections.server_info.priority,
    });
  }

  if (brain?.dependenciesNotes) {
    sections.push({
      key: 'dependencies',
      title: 'Dependencies',
      content: brain.dependenciesNotes,
      tokens: estimateTokens(brain.dependenciesNotes),
      priority: budget.sections.dependencies.priority,
    });
  }

  const debugSolutions = getDebugSolutions(projectId);
  if (debugSolutions) {
    sections.push({
      key: 'debug_solutions',
      title: 'Known Debug Solutions',
      content: debugSolutions,
      tokens: estimateTokens(debugSolutions),
      priority: 5,
    });
  }

  // Check if masterpiece mode is enabled
  let masterpieceEnabled = false;
  try {
    const db2 = getDb();
    const masterpieceSetting = db2.prepare(
      "SELECT value FROM settings WHERE key = 'masterpiece_mode'"
    ).get() as { value: string } | undefined;
    masterpieceEnabled = masterpieceSetting?.value === 'true';
  } catch {
    // settings table may not exist yet
  }

  if (masterpieceEnabled) {
    const mpContext = getMasterpieceContext();
    sections.push({
      key: 'masterpiece',
      title: 'Masterpiece Design Rules',
      content: mpContext,
      tokens: estimateTokens(mpContext),
      priority: 8, // High priority — between architecture and conventions
    });
  }

  // Sort by priority (highest first), then fit within budget
  sections.sort((a, b) => b.priority - a.priority);

  let tokenCount = 0;
  const includedSections: ContextSection[] = [];

  for (const section of sections) {
    const sectionBudget = budget.sections[section.key]?.maxTokens ?? 500;
    const truncatedContent = truncateToTokens(section.content, sectionBudget);
    const truncatedTokens = estimateTokens(truncatedContent);

    if (tokenCount + truncatedTokens > budget.total) {
      // Try to fit with remaining budget
      const remaining = budget.total - tokenCount;
      if (remaining > 50) {
        section.content = truncateToTokens(section.content, remaining);
        section.tokens = estimateTokens(section.content);
        includedSections.push(section);
        tokenCount += section.tokens;
      }
      break;
    }

    section.content = truncatedContent;
    section.tokens = truncatedTokens;
    includedSections.push(section);
    tokenCount += truncatedTokens;
  }

  // Build markdown document
  const lines: string[] = [
    '# Cortex Project Intelligence',
    `> Auto-generated context. Budget: ~${tokenCount}/${budget.total} tokens`,
    '',
  ];

  for (const section of includedSections) {
    lines.push(`## ${section.title}`);
    lines.push(section.content);
    lines.push('');
  }

  const content = lines.join('\n');
  return { content, tokenCount };
}

/**
 * Write .cortex-context.md to the project directory.
 * Called before every session spawn.
 */
export function injectContext(projectId: string, projectPath: string): { written: boolean; tokenCount: number } {
  try {
    const { content, tokenCount } = assembleContext(projectId);

    if (tokenCount === 0) {
      return { written: false, tokenCount: 0 };
    }

    const contextPath = path.join(projectPath, '.cortex-context.md');
    fs.writeFileSync(contextPath, content, 'utf-8');

    return { written: true, tokenCount };
  } catch (err) {
    console.error('[context-injector] Failed to inject context:', err);
    return { written: false, tokenCount: 0 };
  }
}
