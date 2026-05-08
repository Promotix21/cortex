import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

// ── Types ──

export interface GlobalFact {
  id: string;
  projectId: string | null;
  projectName: string | null;
  company: string | null;
  subject: string;
  predicate: string;
  object: string;
  roomTag: string | null;
  confidence: string;
  source: string;
  sourceFactId: string | null;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
}

export interface CompanyInsight {
  id: string;
  company: string;
  insightType: string;
  title: string;
  description: string;
  projectIds: string[];
  confidence: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrossProjectPattern {
  id: string;
  patternType: string;
  title: string;
  description: string;
  projectIds: string[];
  projectNames: string[];
  roomTag: string | null;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface GlobalOverview {
  totalFacts: number;
  totalProjects: number;
  totalCompanies: number;
  factsByCompany: { company: string; count: number }[];
  factsByRoom: { room: string; count: number }[];
  topSubjects: { subject: string; count: number }[];
  crossProjectPatterns: number;
  companyInsights: number;
  lastSyncedAt: string | null;
}

// ── Sync: Aggregate per-project facts into global knowledge ──

export function syncGlobalKnowledge(): {
  factsCreated: number;
  factsRetired: number;
  patternsFound: number;
  insightsGenerated: number;
} {
  const db = getDb();
  let factsCreated = 0;
  let factsRetired = 0;

  // Get all projects with their companies
  const projects = db.prepare(`
    SELECT p.id, p.name, p.company FROM projects p
  `).all() as { id: string; name: string; company: string | null }[];

  // Get all active per-project facts
  const projectFacts = db.prepare(`
    SELECT kg.*, p.name as project_name, p.company
    FROM knowledge_graph kg
    JOIN projects p ON p.id = kg.project_id
    WHERE kg.valid_until IS NULL
  `).all() as any[];

  // Retire global facts whose source facts are now retired
  const retired = db.prepare(`
    UPDATE global_knowledge SET valid_until = datetime('now')
    WHERE source_fact_id IS NOT NULL
    AND valid_until IS NULL
    AND source_fact_id NOT IN (
      SELECT id FROM knowledge_graph WHERE valid_until IS NULL
    )
  `).run();
  factsRetired = retired.changes;

  // Upsert each project fact into global knowledge
  const existingGlobal = db.prepare(`
    SELECT source_fact_id FROM global_knowledge
    WHERE source_fact_id IS NOT NULL AND valid_until IS NULL
  `).all() as { source_fact_id: string }[];
  const existingSet = new Set(existingGlobal.map(g => g.source_fact_id));

  const insertStmt = db.prepare(`
    INSERT INTO global_knowledge (id, project_id, project_name, company, subject, predicate, object, room_tag, confidence, source, source_fact_id, valid_from)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aggregated', ?, ?)
  `);

  for (const fact of projectFacts) {
    if (existingSet.has(fact.id)) continue; // Already synced
    insertStmt.run(
      uuid(), fact.project_id, fact.project_name, fact.company,
      fact.subject, fact.predicate, fact.object, fact.room_tag,
      fact.confidence, fact.id, fact.valid_from,
    );
    factsCreated++;
  }

  // Also pull in brain summaries as high-level facts
  const brains = db.prepare(`
    SELECT pb.project_id, pb.summary, pb.architecture_notes, p.name, p.company, p.type
    FROM project_brain pb
    JOIN projects p ON p.id = pb.project_id
    WHERE pb.summary IS NOT NULL AND pb.summary != ''
  `).all() as any[];

  for (const brain of brains) {
    // Check if we already have a summary fact for this project
    const exists = db.prepare(`
      SELECT id FROM global_knowledge
      WHERE project_id = ? AND subject = 'project' AND predicate = 'summary'
      AND valid_until IS NULL
    `).get(brain.project_id);

    if (!exists) {
      insertStmt.run(
        uuid(), brain.project_id, brain.name, brain.company,
        'project', 'summary', (brain.summary || '').slice(0, 500),
        null, 'probable', null, new Date().toISOString(),
      );
      factsCreated++;
    }

    // Add project type fact
    const typeExists = db.prepare(`
      SELECT id FROM global_knowledge
      WHERE project_id = ? AND subject = 'project' AND predicate = 'type'
      AND valid_until IS NULL
    `).get(brain.project_id);

    if (!typeExists && brain.type) {
      insertStmt.run(
        uuid(), brain.project_id, brain.name, brain.company,
        'project', 'type', brain.type,
        null, 'verified', null, new Date().toISOString(),
      );
      factsCreated++;
    }
  }

  // Detect cross-project patterns
  const patternsFound = detectCrossProjectPatterns();
  const insightsGenerated = generateCompanyInsights(projects);

  return { factsCreated, factsRetired, patternsFound, insightsGenerated };
}

// ── Cross-Project Pattern Detection ──

function detectCrossProjectPatterns(): number {
  const db = getDb();
  let found = 0;

  // Find shared technologies: same subject+predicate+object across multiple projects
  const sharedTech = db.prepare(`
    SELECT subject, predicate, object, room_tag,
      GROUP_CONCAT(DISTINCT project_id) as project_ids,
      GROUP_CONCAT(DISTINCT project_name) as project_names,
      COUNT(DISTINCT project_id) as project_count,
      MIN(valid_from) as first_seen,
      MAX(valid_from) as last_seen
    FROM global_knowledge
    WHERE valid_until IS NULL AND project_id IS NOT NULL
    AND predicate IN ('uses', 'depends_on', 'type')
    GROUP BY subject, predicate, object
    HAVING COUNT(DISTINCT project_id) >= 2
  `).all() as any[];

  const upsertPattern = db.prepare(`
    INSERT INTO cross_project_patterns (id, pattern_type, title, description, project_ids, project_names, room_tag, occurrence_count, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pattern_type, title) DO UPDATE SET
      project_ids = excluded.project_ids,
      project_names = excluded.project_names,
      occurrence_count = excluded.occurrence_count,
      last_seen = excluded.last_seen
  `);

  for (const tech of sharedTech) {
    const pids = tech.project_ids.split(',');
    const pnames = tech.project_names.split(',');
    const title = `${tech.object} (${tech.subject})`;
    const desc = `${pnames.join(', ')} all ${tech.predicate} ${tech.object}`;

    upsertPattern.run(
      uuid(), 'shared_tech', title, desc,
      JSON.stringify(pids), JSON.stringify(pnames),
      tech.room_tag, tech.project_count,
      tech.first_seen, tech.last_seen,
    );
    found++;
  }

  // Find recurring issues: same error patterns across projects
  const sharedIssues = db.prepare(`
    SELECT subject, object, room_tag,
      GROUP_CONCAT(DISTINCT project_id) as project_ids,
      GROUP_CONCAT(DISTINCT project_name) as project_names,
      COUNT(DISTINCT project_id) as project_count
    FROM global_knowledge
    WHERE valid_until IS NULL AND project_id IS NOT NULL
    AND predicate IN ('noted', 'issue', 'bug')
    GROUP BY subject, object
    HAVING COUNT(DISTINCT project_id) >= 2
  `).all() as any[];

  for (const issue of sharedIssues) {
    const pids = issue.project_ids.split(',');
    const pnames = issue.project_names.split(',');
    const title = `${issue.object.slice(0, 100)}`;
    const desc = `Issue found in ${pnames.join(', ')}: ${issue.object}`;

    upsertPattern.run(
      uuid(), 'recurring_issue', title, desc,
      JSON.stringify(pids), JSON.stringify(pnames),
      issue.room_tag, issue.project_count,
      new Date().toISOString(), new Date().toISOString(),
    );
    found++;
  }

  return found;
}

// ── Company Insights Generation ──

function generateCompanyInsights(
  projects: { id: string; name: string; company: string | null }[],
): number {
  const db = getDb();
  let generated = 0;

  // Group projects by company
  const companiesMap = new Map<string, typeof projects>();
  for (const p of projects) {
    const company = p.company || 'Unassigned';
    if (!companiesMap.has(company)) companiesMap.set(company, []);
    companiesMap.get(company)!.push(p);
  }

  const upsertInsight = db.prepare(`
    INSERT INTO company_insights (id, company, insight_type, title, description, project_ids, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'probable', datetime('now'))
    ON CONFLICT(company, insight_type, title) DO UPDATE SET
      description = excluded.description,
      project_ids = excluded.project_ids,
      updated_at = datetime('now')
  `);

  for (const [company, companyProjects] of companiesMap) {
    const pids = companyProjects.map(p => p.id);
    const pnames = companyProjects.map(p => p.name);

    // Tech stack insight: what technologies does this company use
    const techFacts = db.prepare(`
      SELECT object, COUNT(DISTINCT project_id) as count
      FROM global_knowledge
      WHERE company = ? AND valid_until IS NULL
      AND predicate = 'uses' AND subject IN ('framework', 'database', 'language', 'tool', 'orm', 'css', 'bundler')
      GROUP BY object
      ORDER BY count DESC
      LIMIT 15
    `).all(company) as { object: string; count: number }[];

    if (techFacts.length > 0) {
      const techList = techFacts.map(t => `${t.object} (${t.count} projects)`).join(', ');
      upsertInsight.run(
        uuid(), company, 'tech_stack', 'Technology Stack',
        `Technologies across ${pnames.length} projects: ${techList}`,
        JSON.stringify(pids),
      );
      generated++;
    }

    // Project types summary
    const types = db.prepare(`
      SELECT object as type, COUNT(*) as count
      FROM global_knowledge
      WHERE company = ? AND valid_until IS NULL
      AND subject = 'project' AND predicate = 'type'
      GROUP BY object
    `).all(company) as { type: string; count: number }[];

    if (types.length > 0) {
      const typeList = types.map(t => `${t.type} (${t.count})`).join(', ');
      upsertInsight.run(
        uuid(), company, 'summary', 'Project Types',
        `${pnames.length} projects: ${typeList}`,
        JSON.stringify(pids),
      );
      generated++;
    }

    // Common conventions across company projects
    const conventions = db.prepare(`
      SELECT object, COUNT(DISTINCT project_id) as count
      FROM global_knowledge
      WHERE company = ? AND valid_until IS NULL
      AND predicate IN ('convention', 'standard', 'decided')
      GROUP BY object
      HAVING COUNT(DISTINCT project_id) >= 2
    `).all(company) as { object: string; count: number }[];

    for (const conv of conventions) {
      upsertInsight.run(
        uuid(), company, 'convention', conv.object.slice(0, 100),
        `Shared across ${conv.count} projects: ${conv.object}`,
        JSON.stringify(pids),
      );
      generated++;
    }
  }

  return generated;
}

// ── Query Functions ──

export function getGlobalOverview(): GlobalOverview {
  const db = getDb();

  const totalFacts = (db.prepare(`SELECT COUNT(*) as c FROM global_knowledge WHERE valid_until IS NULL`).get() as any).c;
  const totalProjects = (db.prepare(`SELECT COUNT(DISTINCT project_id) as c FROM global_knowledge WHERE valid_until IS NULL AND project_id IS NOT NULL`).get() as any).c;
  const totalCompanies = (db.prepare(`SELECT COUNT(DISTINCT company) as c FROM global_knowledge WHERE valid_until IS NULL AND company IS NOT NULL`).get() as any).c;

  const factsByCompany = db.prepare(`
    SELECT COALESCE(company, 'Unassigned') as company, COUNT(*) as count
    FROM global_knowledge WHERE valid_until IS NULL
    GROUP BY company ORDER BY count DESC
  `).all() as { company: string; count: number }[];

  const factsByRoom = db.prepare(`
    SELECT COALESCE(room_tag, 'general') as room, COUNT(*) as count
    FROM global_knowledge WHERE valid_until IS NULL AND room_tag IS NOT NULL
    GROUP BY room_tag ORDER BY count DESC
  `).all() as { room: string; count: number }[];

  const topSubjects = db.prepare(`
    SELECT subject, COUNT(*) as count
    FROM global_knowledge WHERE valid_until IS NULL
    GROUP BY subject ORDER BY count DESC LIMIT 10
  `).all() as { subject: string; count: number }[];

  const crossProjectPatterns = (db.prepare(`SELECT COUNT(*) as c FROM cross_project_patterns`).get() as any).c;
  const companyInsights = (db.prepare(`SELECT COUNT(*) as c FROM company_insights`).get() as any).c;

  const lastSync = db.prepare(`SELECT MAX(created_at) as t FROM global_knowledge`).get() as any;

  return {
    totalFacts, totalProjects, totalCompanies,
    factsByCompany, factsByRoom, topSubjects,
    crossProjectPatterns, companyInsights,
    lastSyncedAt: lastSync?.t || null,
  };
}

export function getGlobalFacts(options?: {
  company?: string;
  room?: string;
  subject?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): { facts: GlobalFact[]; total: number } {
  const db = getDb();
  const conditions: string[] = ['valid_until IS NULL'];
  const params: any[] = [];

  if (options?.company) { conditions.push('company = ?'); params.push(options.company); }
  if (options?.room) { conditions.push('room_tag = ?'); params.push(options.room); }
  if (options?.subject) { conditions.push('subject = ?'); params.push(options.subject); }
  if (options?.search) {
    conditions.push('(subject LIKE ? OR predicate LIKE ? OR object LIKE ? OR project_name LIKE ?)');
    const q = `%${options.search}%`;
    params.push(q, q, q, q);
  }

  const where = conditions.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) as c FROM global_knowledge WHERE ${where}`).get(...params) as any).c;

  const limit = options?.limit || 100;
  const offset = options?.offset || 0;
  const rows = db.prepare(`
    SELECT * FROM global_knowledge WHERE ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];

  const facts: GlobalFact[] = rows.map(r => ({
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    company: r.company,
    subject: r.subject,
    predicate: r.predicate,
    object: r.object,
    roomTag: r.room_tag,
    confidence: r.confidence,
    source: r.source,
    sourceFactId: r.source_fact_id,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    createdAt: r.created_at,
  }));

  return { facts, total };
}

export function getCompanyInsights(company?: string): CompanyInsight[] {
  const db = getDb();
  const rows = company
    ? db.prepare('SELECT * FROM company_insights WHERE company = ? ORDER BY insight_type, title').all(company)
    : db.prepare('SELECT * FROM company_insights ORDER BY company, insight_type, title').all();

  return (rows as any[]).map(r => ({
    id: r.id,
    company: r.company,
    insightType: r.insight_type,
    title: r.title,
    description: r.description,
    projectIds: JSON.parse(r.project_ids || '[]'),
    confidence: r.confidence,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getCrossProjectPatterns(type?: string): CrossProjectPattern[] {
  const db = getDb();
  const rows = type
    ? db.prepare('SELECT * FROM cross_project_patterns WHERE pattern_type = ? ORDER BY occurrence_count DESC').all(type)
    : db.prepare('SELECT * FROM cross_project_patterns ORDER BY occurrence_count DESC').all();

  return (rows as any[]).map(r => ({
    id: r.id,
    patternType: r.pattern_type,
    title: r.title,
    description: r.description,
    projectIds: JSON.parse(r.project_ids || '[]'),
    projectNames: JSON.parse(r.project_names || '[]'),
    roomTag: r.room_tag,
    occurrenceCount: r.occurrence_count,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
  }));
}

export function globalSearch(query: string): {
  facts: GlobalFact[];
  patterns: CrossProjectPattern[];
  insights: CompanyInsight[];
} {
  const db = getDb();
  const q = `%${query}%`;

  const factRows = db.prepare(`
    SELECT * FROM global_knowledge
    WHERE valid_until IS NULL
    AND (subject LIKE ? OR predicate LIKE ? OR object LIKE ? OR project_name LIKE ? OR company LIKE ?)
    ORDER BY created_at DESC LIMIT 30
  `).all(q, q, q, q, q) as any[];

  const patternRows = db.prepare(`
    SELECT * FROM cross_project_patterns
    WHERE title LIKE ? OR description LIKE ?
    ORDER BY occurrence_count DESC LIMIT 15
  `).all(q, q) as any[];

  const insightRows = db.prepare(`
    SELECT * FROM company_insights
    WHERE title LIKE ? OR description LIKE ? OR company LIKE ?
    ORDER BY updated_at DESC LIMIT 15
  `).all(q, q, q) as any[];

  return {
    facts: factRows.map(r => ({
      id: r.id, projectId: r.project_id, projectName: r.project_name, company: r.company,
      subject: r.subject, predicate: r.predicate, object: r.object, roomTag: r.room_tag,
      confidence: r.confidence, source: r.source, sourceFactId: r.source_fact_id,
      validFrom: r.valid_from, validUntil: r.valid_until, createdAt: r.created_at,
    })),
    patterns: patternRows.map(r => ({
      id: r.id, patternType: r.pattern_type, title: r.title, description: r.description,
      projectIds: JSON.parse(r.project_ids || '[]'), projectNames: JSON.parse(r.project_names || '[]'),
      roomTag: r.room_tag, occurrenceCount: r.occurrence_count,
      firstSeen: r.first_seen, lastSeen: r.last_seen,
    })),
    insights: insightRows.map(r => ({
      id: r.id, company: r.company, insightType: r.insight_type, title: r.title,
      description: r.description, projectIds: JSON.parse(r.project_ids || '[]'),
      confidence: r.confidence, createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  };
}
