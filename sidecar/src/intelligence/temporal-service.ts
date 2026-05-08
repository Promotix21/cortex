import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import { detectRoomFromContent } from './room-detector.js';
import { claudeAnalyze } from '../utils/binaries.js';

/**
 * Temporal Knowledge Graph Service
 *
 * Manages subject-predicate-object triples with temporal validity windows.
 * Facts have valid_from/valid_until timestamps — when a fact is superseded,
 * the old one is retired (valid_until set) and a new one created.
 *
 * This gives Cortex the ability to answer "what did we use before?" and
 * "why did we switch?" — not just "what do we use now?"
 */

export interface Fact {
  id: string;
  projectId: string;
  subject: string;
  predicate: string;
  object: string;
  roomTag: string | null;
  confidence: string;
  source: string;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
}

export interface FactInput {
  subject: string;
  predicate: string;
  object: string;
  roomTag?: string;
  confidence?: string;
  source?: string;
}

/**
 * Add a new fact to the knowledge graph.
 * Automatically retires any conflicting active facts with the same subject+predicate.
 */
export function addFact(projectId: string, input: FactInput): Fact {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuid();
  const roomTag = input.roomTag || detectRoomFromContent(`${input.subject} ${input.predicate} ${input.object}`) || null;

  // Auto-expire conflicting facts (same subject + predicate, different object)
  const conflicting = db.prepare(`
    SELECT id FROM knowledge_graph
    WHERE project_id = ? AND subject = ? AND predicate = ? AND valid_until IS NULL
      AND object != ?
  `).all(projectId, input.subject, input.predicate, input.object) as Array<{ id: string }>;

  if (conflicting.length > 0) {
    const retireStmt = db.prepare(
      "UPDATE knowledge_graph SET valid_until = ? WHERE id = ?"
    );
    for (const { id: oldId } of conflicting) {
      retireStmt.run(now, oldId);
    }
  }

  // Check if this exact fact already exists (idempotent)
  const existing = db.prepare(`
    SELECT id FROM knowledge_graph
    WHERE project_id = ? AND subject = ? AND predicate = ? AND object = ? AND valid_until IS NULL
  `).get(projectId, input.subject, input.predicate, input.object) as { id: string } | undefined;

  if (existing) {
    return getFactById(existing.id)!;
  }

  db.prepare(`
    INSERT INTO knowledge_graph (id, project_id, subject, predicate, object, room_tag, confidence, source, valid_from, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, input.subject, input.predicate, input.object, roomTag,
    input.confidence || 'probable', input.source || 'auto', now, now);

  return getFactById(id)!;
}

/**
 * Retire a fact by setting its valid_until timestamp.
 */
export function retireFact(factId: string): void {
  const db = getDb();
  db.prepare("UPDATE knowledge_graph SET valid_until = datetime('now') WHERE id = ? AND valid_until IS NULL")
    .run(factId);
}

/**
 * Supersede a fact: retire old + create new atomically.
 */
export function supersedeFact(oldFactId: string, newFact: FactInput & { projectId: string }): Fact {
  const db = getDb();
  const txn = db.transaction(() => {
    retireFact(oldFactId);
    return addFact(newFact.projectId, newFact);
  });
  return txn();
}

/**
 * Get all active (non-expired) facts for a project.
 */
export function getActiveFacts(projectId: string, roomTag?: string): Fact[] {
  const db = getDb();
  let sql = `
    SELECT id, project_id, subject, predicate, object, room_tag, confidence, source, valid_from, valid_until, created_at
    FROM knowledge_graph
    WHERE project_id = ? AND valid_until IS NULL
  `;
  const params: string[] = [projectId];

  if (roomTag) {
    sql += ' AND room_tag = ?';
    params.push(roomTag);
  }

  sql += ' ORDER BY valid_from DESC';

  return (db.prepare(sql).all(...params) as any[]).map(rowToFact);
}

/**
 * Get fact history for a project (including expired facts).
 */
export function getFactHistory(
  projectId: string,
  options?: { subject?: string; roomTag?: string; startDate?: string; endDate?: string; limit?: number }
): Fact[] {
  const db = getDb();
  let sql = `
    SELECT id, project_id, subject, predicate, object, room_tag, confidence, source, valid_from, valid_until, created_at
    FROM knowledge_graph
    WHERE project_id = ?
  `;
  const params: (string | number)[] = [projectId];

  if (options?.subject) {
    sql += ' AND subject LIKE ?';
    params.push(`%${options.subject}%`);
  }

  if (options?.roomTag) {
    sql += ' AND room_tag = ?';
    params.push(options.roomTag);
  }

  if (options?.startDate) {
    sql += ' AND valid_from >= ?';
    params.push(options.startDate);
  }

  if (options?.endDate) {
    sql += ' AND valid_from <= ?';
    params.push(options.endDate);
  }

  sql += ' ORDER BY valid_from DESC LIMIT ?';
  params.push(options?.limit || 50);

  return (db.prepare(sql).all(...params) as any[]).map(rowToFact);
}

/**
 * Parse a natural-language decision into subject-predicate-object triples.
 * Simple heuristic parser for common decision patterns.
 */
export function parseDecisionToTriples(content: string): FactInput[] {
  const triples: FactInput[] = [];
  const lower = content.toLowerCase();

  // Pattern: "switched/changed/migrated from X to Y"
  const switchPattern = /(?:switched|changed|migrated|moved|upgraded|downgraded)\s+from\s+(.+?)\s+to\s+(.+?)(?:\s+(?:for|because|due|since|as)|[.,;]|$)/gi;
  let match;
  while ((match = switchPattern.exec(content)) !== null) {
    const oldThing = match[1].trim();
    const newThing = match[2].trim();
    triples.push({
      subject: extractSubject(oldThing, newThing),
      predicate: 'uses',
      object: newThing,
    });
  }

  // Pattern: "using/use X for Y" or "chose X"
  const usePattern = /(?:using|use|chose|selected|adopted|picked)\s+(.+?)(?:\s+(?:for|as|to)|[.,;]|$)/gi;
  while ((match = usePattern.exec(content)) !== null) {
    if (!triples.some(t => t.object.toLowerCase().includes(match![1].trim().toLowerCase()))) {
      triples.push({
        subject: 'tool',
        predicate: 'uses',
        object: match[1].trim(),
      });
    }
  }

  // Pattern: "X depends on Y" or "X requires Y"
  const depPattern = /(.+?)\s+(?:depends on|requires|needs)\s+(.+?)(?:[.,;]|$)/gi;
  while ((match = depPattern.exec(content)) !== null) {
    triples.push({
      subject: match[1].trim(),
      predicate: 'depends_on',
      object: match[2].trim(),
    });
  }

  // Pattern: "decided to X" or "will X"
  const decisionPattern = /(?:decided to|will|going to|plan to)\s+(.+?)(?:[.,;]|$)/gi;
  while ((match = decisionPattern.exec(content)) !== null) {
    triples.push({
      subject: 'project',
      predicate: 'decided',
      object: match[1].trim(),
    });
  }

  // If no patterns matched, create a generic decision triple
  if (triples.length === 0 && content.length > 10) {
    triples.push({
      subject: 'project',
      predicate: 'noted',
      object: content.slice(0, 200),
    });
  }

  return triples;
}

/**
 * Build the full memory for a project using Claude AI analysis.
 * Sends project brain data to Claude to extract meaningful, validated knowledge graph facts.
 * Falls back to basic extraction if Claude is unavailable.
 */
export async function buildMemory(projectId: string): Promise<{ factsCreated: number; factsRetired: number; errors: string[] }> {
  const db = getDb();
  const errors: string[] = [];
  let factsCreated = 0;
  let factsRetired = 0;

  const brain = db.prepare(`
    SELECT summary, architecture_notes, known_issues, decisions, conventions, dependencies_notes
    FROM project_brain WHERE project_id = ?
  `).get(projectId) as any;

  const project = db.prepare(`SELECT name, path, type, company FROM projects WHERE id = ?`).get(projectId) as any;

  if (!brain) {
    return { factsCreated: 0, factsRetired: 0, errors: ['No project brain found — run Scan & Build Brain first'] };
  }

  function emit(input: FactInput): void {
    const obj = input.object || '';
    if (!obj || obj.length > 300 || /^[^a-zA-Z]*$/.test(obj)) return;

    try {
      input.source = 'auto';
      addFact(projectId, input);
      factsCreated++;
    } catch (err: any) {
      errors.push(`Failed to add fact: ${err.message}`);
    }
  }

  // ── Try Claude AI extraction first ──
  const aiFacts = await extractFactsWithClaude(brain, project);

  if (aiFacts && aiFacts.length > 0) {
    console.log(`[buildMemory] Claude extracted ${aiFacts.length} facts for ${project?.name || projectId}`);
    for (const fact of aiFacts) {
      emit(fact);
    }
  } else {
    // ── Fallback: basic extraction without AI ──
    console.log(`[buildMemory] Claude unavailable, using basic extraction for ${project?.name || projectId}`);
    const basicFacts = extractFactsBasic(brain, project);
    for (const fact of basicFacts) {
      emit(fact);
    }
  }

  return { factsCreated, factsRetired, errors };
}

/**
 * Use Claude to intelligently extract knowledge graph facts from project brain data.
 */
async function extractFactsWithClaude(brain: any, project: any): Promise<FactInput[] | null> {
  const brainContent = [
    brain.summary && `SUMMARY:\n${brain.summary}`,
    brain.architecture_notes && `ARCHITECTURE:\n${brain.architecture_notes}`,
    brain.conventions && `CONVENTIONS:\n${brain.conventions}`,
    brain.dependencies_notes && `DEPENDENCIES:\n${brain.dependencies_notes}`,
    brain.known_issues && `KNOWN ISSUES:\n${brain.known_issues}`,
    brain.decisions && `DECISIONS:\n${brain.decisions.slice(0, 2000)}`,
  ].filter(Boolean).join('\n\n');

  if (!brainContent.trim()) return null;

  const prompt = `You are a knowledge graph builder for a developer workspace called Cortex. Analyze this project intelligence data and extract structured facts.

PROJECT: ${project?.name || 'unknown'} (type: ${project?.type || 'unknown'})

=== PROJECT BRAIN DATA ===
${brainContent}

=== YOUR TASK ===

Extract meaningful facts as a JSON array. Each fact is a triple: { subject, predicate, object, roomTag, confidence }.

Rules:
- subject: what the fact is about (e.g., "project", "database", "framework", "auth", "api", "deployment", "testing", "dependency")
- predicate: the relationship (e.g., "uses", "deployed_at", "runs_on_port", "requires", "configured_with", "has_issue", "follows_convention")
- object: the value (keep under 150 chars, be specific)
- roomTag: categorize into one of: "build", "api", "database", "auth", "config", "deploy", "testing", "intelligence"
- confidence: "verified" (directly from config files/code), "probable" (inferred from patterns), "speculative" (educated guess)

Focus on facts that would help a developer understand:
1. What technologies/frameworks are used and WHY
2. How the project is deployed (ports, servers, SSH, URLs)
3. Database and storage setup
4. Authentication approach
5. Key dependencies and their roles
6. Known issues and risks
7. Development conventions and rules
8. API structure

Do NOT extract:
- Generic/obvious facts ("project uses JavaScript" for a Node project)
- Raw dependency version numbers without context
- Duplicate facts
- Speculative facts with no supporting evidence

Return ONLY a JSON array. No markdown fences, no explanation. Aim for 15-40 high-quality facts.`;

  try {
    const response = await claudeAnalyze(prompt, { timeoutMs: 90_000 });
    if (!response) return null;

    let jsonStr = response.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;

    // Validate and clean each fact
    return parsed
      .filter((f: any) => f.subject && f.predicate && f.object)
      .map((f: any) => ({
        subject: String(f.subject).slice(0, 100),
        predicate: String(f.predicate).slice(0, 100),
        object: String(f.object).slice(0, 300),
        roomTag: f.roomTag || undefined,
        confidence: ['verified', 'probable', 'speculative'].includes(f.confidence) ? f.confidence : 'probable',
      }));
  } catch (err: any) {
    console.warn('[extractFactsWithClaude] Failed:', err.message);
    return null;
  }
}

/**
 * Basic fact extraction without AI — fallback when Claude CLI is unavailable.
 * Extracts obvious facts from structured brain fields using simple parsing.
 */
function extractFactsBasic(brain: any, project: any): FactInput[] {
  const facts: FactInput[] = [];

  // Project type
  if (project?.type && project.type !== 'unknown') {
    facts.push({ subject: 'project', predicate: 'type', object: project.type, confidence: 'verified' });
  }

  // Stack from summary
  const stackMatch = (brain.summary || '').match(/Stack:\s*(\S+)\s*\(([^)]+)\)/);
  if (stackMatch) {
    facts.push({ subject: 'framework', predicate: 'uses', object: stackMatch[1], roomTag: 'build' });
  }

  // Conventions
  for (const line of (brain.conventions || '').split('\n')) {
    const kv = line.trim().match(/^([^:]+):\s*(.+)/);
    if (kv && kv[2].length > 2 && kv[2].length < 100) {
      facts.push({ subject: 'convention', predicate: 'follows', object: `${kv[1].trim()}: ${kv[2].trim()}`, roomTag: 'config', confidence: 'verified' });
    }
  }

  // Ports
  const portMatch = (brain.architecture_notes || '').match(/Ports?:\s*(.+)/);
  if (portMatch) {
    facts.push({ subject: 'infrastructure', predicate: 'ports', object: portMatch[1].trim(), roomTag: 'deploy' });
  }

  // Databases
  const dbMatch = (brain.architecture_notes || '').match(/Databases?:\s*(.+)/);
  if (dbMatch) {
    for (const d of dbMatch[1].split(',')) {
      if (d.trim()) facts.push({ subject: 'database', predicate: 'uses', object: d.trim(), roomTag: 'database', confidence: 'verified' });
    }
  }

  return facts;
}

// ---- Helpers ----

function getFactById(id: string): Fact | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, project_id, subject, predicate, object, room_tag, confidence, source, valid_from, valid_until, created_at
    FROM knowledge_graph WHERE id = ?
  `).get(id) as any;
  return row ? rowToFact(row) : null;
}

function rowToFact(row: any): Fact {
  return {
    id: row.id,
    projectId: row.project_id,
    subject: row.subject,
    predicate: row.predicate,
    object: row.object,
    roomTag: row.room_tag,
    confidence: row.confidence,
    source: row.source,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.created_at,
  };
}

function extractSubject(oldThing: string, newThing: string): string {
  // Try to extract a category from the things being compared
  const categories: Record<string, string[]> = {
    framework: ['express', 'fastify', 'koa', 'hono', 'nest', 'next', 'nuxt', 'svelte', 'react', 'vue', 'angular', 'django', 'flask', 'rails'],
    database: ['postgres', 'postgresql', 'mysql', 'sqlite', 'mongo', 'mongodb', 'redis', 'dynamodb', 'supabase', 'firebase'],
    language: ['typescript', 'javascript', 'python', 'rust', 'go', 'java', 'ruby', 'php'],
    bundler: ['webpack', 'vite', 'esbuild', 'rollup', 'parcel', 'turbopack'],
    runtime: ['node', 'deno', 'bun'],
    package_manager: ['npm', 'yarn', 'pnpm', 'bun'],
    hosting: ['vercel', 'netlify', 'aws', 'gcp', 'azure', 'heroku', 'railway', 'fly'],
    auth: ['jwt', 'oauth', 'passport', 'clerk', 'auth0', 'supabase auth'],
    orm: ['prisma', 'drizzle', 'typeorm', 'sequelize', 'knex', 'kysely'],
    css: ['tailwind', 'css modules', 'styled-components', 'sass', 'scss', 'less'],
  };

  const combined = `${oldThing} ${newThing}`.toLowerCase();
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => combined.includes(kw))) {
      return category;
    }
  }

  return 'tool';
}
