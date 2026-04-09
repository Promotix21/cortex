import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getDb } from '../db/index.js';
import { getProjectBrain } from '../chat/chat-service.js';
import { getMasterpieceContext } from './masterpiece-context.js';
import { compress, compressBrainField } from './aaak-service.js';
import { detectRoom, detectRoomsFromCwd, getRoomContext } from './room-detector.js';
import { getActiveFacts } from './temporal-service.js';

/**
 * MemPalace Context Injector — Layered Memory Stack (L0–L3)
 *
 * L0 (Identity):     Project name, core tech stack (~100 tokens, always included)
 * L1 (Critical):     AAAK-compressed brain summary + verified facts (~500 tokens, always included)
 * L2 (Room Recall):  Context for detected room (~800 tokens, loaded if room detected)
 * L3 (Deep Search):  On-demand via MCP tools (NOT included in .cortex-context.md)
 *
 * Legacy budget system preserved for backwards compatibility but now secondary to layers.
 */

/** Layer token budgets */
const LAYER_BUDGETS = {
  L0: 150,    // Identity — tiny, always fits
  L1: 600,    // Critical facts — compressed
  L2: 1000,   // Room recall — targeted context
  extras: 800, // Errors, patterns, MCP info, masterpiece
} as const;

const TOTAL_BUDGET = 11500; // Same as legacy for backwards compat

interface LayerStats {
  L0: { tokens: number; included: boolean };
  L1: { tokens: number; included: boolean; compressionRatio: number };
  L2: { tokens: number; included: boolean; room: string | null };
  extras: { tokens: number; sections: string[] };
  totalTokens: number;
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

// ============================================================
// L0 — Identity Layer
// ============================================================

function assembleL0(projectId: string): { content: string; tokens: number } {
  const db = getDb();
  const project = db.prepare(
    'SELECT name, type, path, company FROM projects WHERE id = ?'
  ).get(projectId) as { name: string; type: string; path: string; company: string | null } | undefined;

  if (!project) return { content: '', tokens: 0 };

  // Get pinned tools
  let tools: string[] = [];
  try {
    const toolRows = db.prepare(`
      SELECT t.name, pt.pinned_version FROM project_tools pt
      JOIN tools t ON pt.tool_id = t.id
      WHERE pt.project_id = ?
    `).all(projectId) as Array<{ name: string; pinned_version: string }>;
    tools = toolRows.map(t => `${t.name}@${t.pinned_version}`);
  } catch { /* table may not exist */ }

  const lines = [
    `Project: ${project.name} (${project.type})`,
    `Path: ${project.path}`,
  ];
  if (project.company) lines.push(`Company: ${project.company}`);
  if (tools.length > 0) lines.push(`Stack: ${tools.join(', ')}`);

  const content = lines.join('\n');
  return { content: truncateToTokens(content, LAYER_BUDGETS.L0), tokens: estimateTokens(content) };
}

// ============================================================
// L1 — Critical Facts Layer (AAAK-compressed)
// ============================================================

function assembleL1(projectId: string): { content: string; tokens: number; compressionRatio: number } {
  const brain = getProjectBrain(projectId);
  if (!brain) return { content: '', tokens: 0, compressionRatio: 1 };

  const parts: string[] = [];
  let originalTokens = 0;

  // Compress summary
  if (brain.summary) {
    const compressed = compressBrainField(projectId, 'summary', brain.summary);
    parts.push(`[Summary] ${compressed}`);
    originalTokens += estimateTokens(brain.summary);
  }

  // Compress architecture
  if (brain.architectureNotes) {
    const compressed = compressBrainField(projectId, 'architecture', brain.architectureNotes);
    parts.push(`[Arch] ${compressed}`);
    originalTokens += estimateTokens(brain.architectureNotes);
  }

  // Compress conventions
  if (brain.conventions) {
    const compressed = compressBrainField(projectId, 'conventions', brain.conventions);
    parts.push(`[Conv] ${compressed}`);
    originalTokens += estimateTokens(brain.conventions);
  }

  // Add verified knowledge graph facts
  const verifiedFacts = getActiveFacts(projectId).filter(f => f.confidence === 'verified');
  if (verifiedFacts.length > 0) {
    const factLines = verifiedFacts.slice(0, 10).map(f =>
      `${f.subject} ${f.predicate} ${f.object}`
    );
    parts.push(`[Facts] ${factLines.join(' | ')}`);
  }

  const content = truncateToTokens(parts.join('\n'), LAYER_BUDGETS.L1);
  const compressedTokens = estimateTokens(content);
  const compressionRatio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

  return { content, tokens: compressedTokens, compressionRatio };
}

// ============================================================
// L2 — Room Recall Layer
// ============================================================

function assembleL2(projectId: string, room: string | null): { content: string; tokens: number; room: string | null } {
  if (!room) return { content: '', tokens: 0, room: null };

  const roomCtx = getRoomContext(projectId, room);
  if (roomCtx.factCount === 0) return { content: '', tokens: 0, room };

  const parts: string[] = [`[Room: ${room}]`];

  // Room-specific patterns
  if (roomCtx.patterns.length > 0) {
    parts.push('Patterns:');
    for (const p of roomCtx.patterns.slice(0, 5)) {
      const { compressed } = compress(p.description);
      parts.push(`- ${p.title}: ${compressed}`);
    }
  }

  // Room-specific debug solutions
  if (roomCtx.debugSolutions.length > 0) {
    parts.push('Debug:');
    for (const d of roomCtx.debugSolutions.slice(0, 5)) {
      const { compressed } = compress(`${d.problem} → ${d.solution}`);
      parts.push(`- ${compressed}`);
    }
  }

  // Room-specific knowledge graph facts
  if (roomCtx.facts.length > 0) {
    parts.push('Facts:');
    for (const f of roomCtx.facts.slice(0, 10)) {
      parts.push(`- ${f.subject} ${f.predicate} ${f.object}`);
    }
  }

  const content = truncateToTokens(parts.join('\n'), LAYER_BUDGETS.L2);
  return { content, tokens: estimateTokens(content), room };
}

// ============================================================
// Extras — errors, decisions, server info, MCP, masterpiece
// ============================================================

function assembleExtras(projectId: string, remainingBudget: number): { sections: ContextSection[] } {
  const brain = getProjectBrain(projectId);
  const sections: ContextSection[] = [];

  // Known issues (compressed)
  if (brain?.knownIssues) {
    const { compressed } = compress(brain.knownIssues);
    sections.push({
      key: 'known_issues', title: 'Known Issues', content: compressed,
      tokens: estimateTokens(compressed), priority: 7,
    });
  }

  // Recent errors
  const recentErrors = getRecentErrors(projectId);
  if (recentErrors) {
    sections.push({
      key: 'recent_errors', title: 'Recent Errors', content: recentErrors,
      tokens: estimateTokens(recentErrors), priority: 7,
    });
  }

  // Decisions (compressed)
  if (brain?.decisions) {
    const { compressed } = compress(brain.decisions);
    sections.push({
      key: 'decisions', title: 'Decisions', content: compressed,
      tokens: estimateTokens(compressed), priority: 6,
    });
  }

  // Verified patterns (not room-specific — those are in L2)
  const patterns = getVerifiedPatterns(projectId);
  if (patterns) {
    sections.push({
      key: 'verified_patterns', title: 'Verified Patterns', content: patterns,
      tokens: estimateTokens(patterns), priority: 5,
    });
  }

  // Debug solutions
  const debugSolutions = getDebugSolutions(projectId);
  if (debugSolutions) {
    sections.push({
      key: 'debug_solutions', title: 'Debug Solutions', content: debugSolutions,
      tokens: estimateTokens(debugSolutions), priority: 5,
    });
  }

  // Server info
  const serverInfo = getServerInfo(projectId);
  if (serverInfo) {
    sections.push({
      key: 'server_info', title: 'Server & Deployment', content: serverInfo,
      tokens: estimateTokens(serverInfo), priority: 4,
    });
  }

  // Dependencies (compressed)
  if (brain?.dependenciesNotes) {
    const { compressed } = compress(brain.dependenciesNotes);
    sections.push({
      key: 'dependencies', title: 'Dependencies', content: compressed,
      tokens: estimateTokens(compressed), priority: 3,
    });
  }

  // MCP tools info
  const mcpInfo = [
    'Cortex MCP @ http://127.0.0.1:4710 (JSON-RPC)',
    'Tools: get_project_brain, search_patterns, match_error, get_file_index, get_server_info, get_context, save_intelligence, recall_room, query_history, check_consistency',
    'Use save_intelligence to capture decisions/issues/patterns. Use recall_room for deep domain context. Use check_consistency to validate new facts.',
  ].join('\n');
  sections.push({
    key: 'mcp_tools', title: 'Cortex MCP', content: mcpInfo,
    tokens: estimateTokens(mcpInfo), priority: 3,
  });

  // Masterpiece mode
  try {
    const db2 = getDb();
    const masterpieceSetting = db2.prepare(
      "SELECT value FROM settings WHERE key = 'masterpiece_mode'"
    ).get() as { value: string } | undefined;
    if (masterpieceSetting?.value === 'true') {
      const mpContext = getMasterpieceContext();
      sections.push({
        key: 'masterpiece', title: 'Masterpiece Design Rules', content: mpContext,
        tokens: estimateTokens(mpContext), priority: 8,
      });
    }
  } catch { /* settings table may not exist */ }

  // Sort by priority and fit within remaining budget
  sections.sort((a, b) => b.priority - a.priority);

  let used = 0;
  const included: ContextSection[] = [];
  for (const section of sections) {
    if (used + section.tokens > remainingBudget) {
      const remaining = remainingBudget - used;
      if (remaining > 50) {
        section.content = truncateToTokens(section.content, remaining);
        section.tokens = estimateTokens(section.content);
        included.push(section);
        used += section.tokens;
      }
      break;
    }
    included.push(section);
    used += section.tokens;
  }

  return { sections: included };
}

// ============================================================
// Main Assembly
// ============================================================

/**
 * Assemble the full context document using layered memory stack.
 */
export function assembleContext(
  projectId: string,
  options?: { currentFile?: string; cwd?: string }
): { content: string; tokenCount: number; layers: LayerStats } {
  // L0: Identity (always)
  const l0 = assembleL0(projectId);

  // L1: Critical facts (always, AAAK-compressed)
  const l1 = assembleL1(projectId);

  // Detect room from current file or cwd
  let detectedRoom: string | null = null;
  if (options?.currentFile) {
    detectedRoom = detectRoom(options.currentFile);
  } else if (options?.cwd) {
    const rooms = detectRoomsFromCwd(projectId, options.cwd);
    detectedRoom = rooms[0] || null;
  }

  // L2: Room recall (if room detected)
  const l2 = assembleL2(projectId, detectedRoom);

  // Calculate remaining budget for extras
  const layerTokens = l0.tokens + l1.tokens + l2.tokens;
  const remainingBudget = TOTAL_BUDGET - layerTokens;

  // Extras: errors, patterns, server info, MCP
  const extras = assembleExtras(projectId, remainingBudget);
  const extrasTokens = extras.sections.reduce((sum, s) => sum + s.tokens, 0);

  // Build markdown document
  const lines: string[] = [
    '# Cortex Project Intelligence (MemPalace)',
    `> Layered memory stack. Budget: ~${layerTokens + extrasTokens}/${TOTAL_BUDGET} tokens`,
    '',
  ];

  // L0
  if (l0.content) {
    lines.push('## Identity');
    lines.push(l0.content);
    lines.push('');
  }

  // L1
  if (l1.content) {
    lines.push('## Critical Context (AAAK compressed)');
    lines.push(l1.content);
    lines.push('');
  }

  // L2
  if (l2.content) {
    lines.push(`## Room: ${l2.room}`);
    lines.push(l2.content);
    lines.push('');
  }

  // Extras
  for (const section of extras.sections) {
    lines.push(`## ${section.title}`);
    lines.push(section.content);
    lines.push('');
  }

  const content = lines.join('\n');
  const tokenCount = estimateTokens(content);

  const layers: LayerStats = {
    L0: { tokens: l0.tokens, included: l0.content.length > 0 },
    L1: { tokens: l1.tokens, included: l1.content.length > 0, compressionRatio: l1.compressionRatio },
    L2: { tokens: l2.tokens, included: l2.content.length > 0, room: l2.room },
    extras: { tokens: extrasTokens, sections: extras.sections.map(s => s.key) },
    totalTokens: tokenCount,
  };

  return { content, tokenCount, layers };
}

/**
 * Write .cortex-context.md to the project directory.
 * Called before every session spawn.
 */
export async function injectContext(
  projectId: string,
  projectPath: string,
  options?: { currentFile?: string; cwd?: string }
): Promise<{ written: boolean; tokenCount: number; layers?: LayerStats }> {
  try {
    const { content, tokenCount, layers } = assembleContext(projectId, options);

    if (tokenCount === 0) {
      return { written: false, tokenCount: 0 };
    }

    const contextPath = path.join(projectPath, '.cortex-context.md');
    await fsp.writeFile(contextPath, content, 'utf-8');

    // Ensure CLAUDE.md references the context file and gitignore entries exist
    await ensureClaudeMdReference(projectPath);
    await ensureGitignoreEntries(projectPath);

    return { written: true, tokenCount, layers };
  } catch (err) {
    console.error('[context-injector] Failed to inject context:', err);
    return { written: false, tokenCount: 0 };
  }
}

// ============================================================
// Helper functions (preserved from original)
// ============================================================

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

function getVerifiedPatterns(projectId: string): string {
  const db = getDb();
  const patterns = db.prepare(`
    SELECT title, description, code
    FROM pattern_memory
    WHERE (source_project_id = ? OR scope = 'reusable')
      AND confidence IN ('verified', 'probable')
      AND room_tag IS NULL
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

function getServerInfo(projectId: string): string {
  const db = getDb();
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
    return '';
  }
}

function getDebugSolutions(projectId: string): string {
  const db = getDb();
  const solutions = db.prepare(`
    SELECT problem, root_cause, solution
    FROM debug_memory
    WHERE (source_project_id = ? OR scope = 'reusable')
      AND confidence IN ('verified', 'probable')
      AND room_tag IS NULL
    ORDER BY usage_count DESC
    LIMIT 5
  `).all(projectId) as { problem: string; root_cause: string; solution: string }[];

  if (solutions.length === 0) return '';

  return solutions.map(s =>
    `- **${s.problem}**: ${s.root_cause} → ${s.solution}`
  ).join('\n');
}

const CORTEX_MARKER = '<!-- cortex-intelligence -->';
const CORTEX_CLAUDE_MD_BLOCK = `
${CORTEX_MARKER}
# Cortex Project Intelligence

This project is managed by [Cortex](https://github.com/user/cortex). Before starting work, read the auto-generated intelligence file:

**Read \`.cortex-context.md\` at the project root** — it contains:
- Project identity and tech stack (L0)
- AAAK-compressed brain summary and verified facts (L1)
- Room-specific context for current working area (L2)
- Known issues, debug solutions, and verified patterns
- MCP tools: recall_room, query_history, check_consistency

Also read \`NEXT_SESSION_PROMPT.md\` if it exists — it contains handoff context from the previous session.

> These files are auto-generated by Cortex and are gitignored. Do not edit them manually.
${CORTEX_MARKER}
`;

async function ensureGitignoreEntries(projectPath: string): Promise<void> {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const entries = ['.cortex-context.md', 'NEXT_SESSION_PROMPT.md', 'NEXT-SESSION-PROMPT.md', 'CORTEX_INTELLIGENCE_MASTER.md'];

  try {
    let content = '';
    try { content = await fsp.readFile(gitignorePath, 'utf-8'); } catch { /* no file */ }

    const missing = entries.filter(e => !content.includes(e));
    if (missing.length === 0) return;

    const block = '\n# Cortex intelligence files (auto-generated)\n' + missing.join('\n') + '\n';
    await fsp.writeFile(gitignorePath, content.trimEnd() + '\n' + block, 'utf-8');
  } catch {
    // Non-fatal
  }
}

async function ensureClaudeMdReference(projectPath: string): Promise<void> {
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');

  try {
    let existing = '';
    try { existing = await fsp.readFile(claudeMdPath, 'utf-8'); } catch { /* no file */ }

    if (existing && existing.includes(CORTEX_MARKER)) {
      return; // Already has our block
    }

    if (existing) {
      await fsp.writeFile(claudeMdPath, existing + '\n' + CORTEX_CLAUDE_MD_BLOCK, 'utf-8');
    } else {
      await fsp.writeFile(claudeMdPath, CORTEX_CLAUDE_MD_BLOCK.trim() + '\n', 'utf-8');
    }
  } catch {
    // Non-fatal — project dir may be read-only
  }
}
