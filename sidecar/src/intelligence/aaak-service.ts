import { getDb } from '../db/index.js';
import { v4 as uuid } from 'uuid';

/**
 * AAAK (AI-to-AI Knowledge) Compression Service
 *
 * Compresses verbose English intelligence text into a dense, LLM-readable shorthand.
 * Adapted from MemPalace's dialect for Cortex's technical intelligence use case.
 *
 * NOT a lossless codec — it's a lossy summarization that preserves meaning for LLMs
 * while reducing token count by 40-70%.
 */

/** Technical abbreviation map: full word → compressed form */
const ABBREVIATIONS: Record<string, string> = {
  // Architecture & patterns
  architecture: 'arch', authentication: 'auth', authorization: 'authz',
  configuration: 'config', component: 'comp', components: 'comps',
  database: 'db', databases: 'dbs', dependency: 'dep', dependencies: 'deps',
  environment: 'env', environments: 'envs', framework: 'fw',
  implementation: 'impl', implementations: 'impls', infrastructure: 'infra',
  middleware: 'mw', repository: 'repo', repositories: 'repos',
  application: 'app', applications: 'apps',

  // Languages & tools
  typescript: 'TS', javascript: 'JS', python: 'PY',
  function: 'fn', functions: 'fns',
  variable: 'var', variables: 'vars',
  parameter: 'param', parameters: 'params',
  argument: 'arg', arguments: 'args',
  directory: 'dir', directories: 'dirs',
  document: 'doc', documentation: 'docs',

  // Web & API
  endpoint: 'EP', endpoints: 'EPs',
  request: 'req', response: 'res',
  frontend: 'FE', backend: 'BE',
  server: 'srv', client: 'cli',
  websocket: 'WS', websockets: 'WSs',

  // Data
  table: 'tbl', column: 'col', columns: 'cols',
  migration: 'migr', migrations: 'migrs',
  transaction: 'txn', transactions: 'txns',
  validation: 'valid', validator: 'valid',

  // Process
  development: 'dev', production: 'prod', staging: 'stg',
  deployment: 'deploy', integration: 'integ',
  performance: 'perf', optimization: 'optim',
  management: 'mgmt', manager: 'mgr',
  notification: 'notif', notifications: 'notifs',
  operation: 'op', operations: 'ops',
  specification: 'spec', specifications: 'specs',
  requirement: 'req', requirements: 'reqs',
  version: 'ver', versions: 'vers',
  package: 'pkg', packages: 'pkgs',
  library: 'lib', libraries: 'libs',
  utility: 'util', utilities: 'utils',
  template: 'tmpl', templates: 'tmpls',
  interface: 'iface', interfaces: 'ifaces',
  exception: 'exc', exceptions: 'excs',
  connection: 'conn', connections: 'conns',
  container: 'ctnr', containers: 'ctnrs',
  certificate: 'cert', certificates: 'certs',
  property: 'prop', properties: 'props',
  attribute: 'attr', attributes: 'attrs',
  element: 'elem', elements: 'elems',
  maximum: 'max', minimum: 'min',
  boolean: 'bool', string: 'str', number: 'num', integer: 'int',
  approximately: '~', approximately_: '~',
};

/** Filler words to strip (articles, linking verbs, demonstratives) */
const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'has', 'have', 'had',
  'been', 'being', 'this', 'that', 'these', 'those', 'which', 'there',
  'here', 'also', 'just', 'very', 'really', 'quite', 'rather',
  'basically', 'essentially', 'currently', 'actually', 'simply',
  'generally', 'typically', 'usually', 'specifically', 'particularly',
  'obviously', 'clearly', 'indeed', 'certainly', 'definitely',
]);

/** Structural markers for AAAK format */
const MARKERS = {
  critical: '!',
  pending: '?',
  flow: '>',
  approx: '~',
  convention: '*',
  decision: '#',
} as const;

/** Compact relationship patterns */
const RELATIONSHIP_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\buses\b/gi, replacement: '→' },
  { pattern: /\busing\b/gi, replacement: '→' },
  { pattern: /\bdepends on\b/gi, replacement: '>' },
  { pattern: /\brequires\b/gi, replacement: '>' },
  { pattern: /\bchanged from (.+?) to (.+)/gi, replacement: '$1>>$2' },
  { pattern: /\bswitched from (.+?) to (.+)/gi, replacement: '$1>>$2' },
  { pattern: /\bmigrated from (.+?) to (.+)/gi, replacement: '$1>>$2' },
  { pattern: /\breplaced (.+?) with (.+)/gi, replacement: '$1>>$2' },
  { pattern: /\breturns\b/gi, replacement: '→ret:' },
  { pattern: /\bfor example\b/gi, replacement: 'e.g.' },
  { pattern: /\bsuch as\b/gi, replacement: 'e.g.' },
  { pattern: /\bin order to\b/gi, replacement: 'to' },
  { pattern: /\bas well as\b/gi, replacement: '+' },
  { pattern: /\band also\b/gi, replacement: '+' },
];

/** Priority keyword markers — prepend structural marker to lines containing these */
const PRIORITY_KEYWORDS: Array<{ keywords: string[]; marker: string }> = [
  { keywords: ['critical', 'important', 'must', 'required', 'breaking', 'never', 'always', 'danger', 'warning'], marker: '!' },
  { keywords: ['todo', 'fixme', 'pending', 'planned', 'future', 'later', 'eventually'], marker: '?' },
  { keywords: ['decided', 'chose', 'decision', 'agreed', 'settled on', 'went with'], marker: '#' },
  { keywords: ['convention', 'standard', 'rule', 'pattern', 'practice', 'guideline'], marker: '*' },
];

/** Rough token estimation: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compress a text block into AAAK format.
 */
export function compress(text: string): { compressed: string; ratio: number; originalTokens: number; compressedTokens: number } {
  if (!text || text.trim().length === 0) {
    return { compressed: '', ratio: 1, originalTokens: 0, compressedTokens: 0 };
  }

  const originalTokens = estimateTokens(text);
  let result = text;

  // Step 1: Apply relationship pattern replacements
  for (const { pattern, replacement } of RELATIONSHIP_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  // Step 2: Apply abbreviations (word-boundary aware)
  for (const [full, abbr] of Object.entries(ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    result = result.replace(regex, abbr);
  }

  // Step 3: Strip filler words (preserve sentence structure)
  const words = result.split(/\s+/);
  const filtered = words.filter(word => {
    const lower = word.toLowerCase().replace(/[^a-z]/g, '');
    return !FILLER_WORDS.has(lower);
  });
  result = filtered.join(' ');

  // Step 4: Add structural markers to lines
  const lines = result.split('\n');
  const markedLines = lines.map(line => {
    const lower = line.toLowerCase();
    for (const { keywords, marker } of PRIORITY_KEYWORDS) {
      if (keywords.some(kw => lower.includes(kw))) {
        // Don't double-mark
        if (!line.startsWith(marker) && !line.startsWith(`${marker} `)) {
          return `${marker} ${line.trim()}`;
        }
      }
    }
    return line;
  });
  result = markedLines.join('\n');

  // Step 5: Collapse whitespace
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/  +/g, ' ');
  result = result.trim();

  const compressedTokens = estimateTokens(result);
  const ratio = originalTokens > 0 ? compressedTokens / originalTokens : 1;

  return { compressed: result, ratio, originalTokens, compressedTokens };
}

/**
 * Compress a specific brain field and cache the result.
 */
export function compressBrainField(projectId: string, field: string, text: string, roomTag?: string): string {
  if (!text || text.trim().length === 0) return '';

  const db = getDb();
  const effectiveRoom = roomTag || '_global';

  // Check cache validity
  const cached = db.prepare(`
    SELECT compressed_text, valid_from FROM aaak_cache
    WHERE project_id = ? AND source_field = ? AND room_tag = ?
  `).get(projectId, field, effectiveRoom) as { compressed_text: string; valid_from: string } | undefined;

  const brain = db.prepare('SELECT updated_at FROM project_brain WHERE project_id = ?')
    .get(projectId) as { updated_at: string } | undefined;

  // Use cache if brain hasn't been updated since compression
  if (cached && brain && cached.valid_from >= brain.updated_at) {
    return cached.compressed_text;
  }

  // Compress and cache
  const { compressed, originalTokens, compressedTokens } = compress(text);

  db.prepare(`
    INSERT INTO aaak_cache (id, project_id, source_field, original_tokens, compressed_text, compressed_tokens, room_tag, valid_from)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(project_id, source_field, room_tag) DO UPDATE SET
      original_tokens = excluded.original_tokens,
      compressed_text = excluded.compressed_text,
      compressed_tokens = excluded.compressed_tokens,
      valid_from = excluded.valid_from,
      valid_until = NULL
  `).run(uuid(), projectId, field, originalTokens, compressed, compressedTokens, effectiveRoom);

  return compressed;
}

/**
 * Invalidate AAAK cache for a project (called when brain is updated).
 */
export function invalidateCache(projectId: string, field?: string): void {
  const db = getDb();
  if (field) {
    db.prepare("UPDATE aaak_cache SET valid_until = datetime('now') WHERE project_id = ? AND source_field = ?")
      .run(projectId, field);
  } else {
    db.prepare("UPDATE aaak_cache SET valid_until = datetime('now') WHERE project_id = ?")
      .run(projectId);
  }
}

/**
 * Get compression stats for a project.
 */
export function getCompressionStats(projectId: string): {
  totalOriginalTokens: number;
  totalCompressedTokens: number;
  overallRatio: number;
  fields: Array<{ field: string; originalTokens: number; compressedTokens: number; ratio: number }>;
} {
  const db = getDb();
  const rows = db.prepare(`
    SELECT source_field, original_tokens, compressed_tokens
    FROM aaak_cache
    WHERE project_id = ? AND valid_until IS NULL
  `).all(projectId) as Array<{ source_field: string; original_tokens: number; compressed_tokens: number }>;

  const fields = rows.map(r => ({
    field: r.source_field,
    originalTokens: r.original_tokens,
    compressedTokens: r.compressed_tokens,
    ratio: r.original_tokens > 0 ? r.compressed_tokens / r.original_tokens : 1,
  }));

  const totalOriginalTokens = fields.reduce((sum, f) => sum + f.originalTokens, 0);
  const totalCompressedTokens = fields.reduce((sum, f) => sum + f.compressedTokens, 0);

  return {
    totalOriginalTokens,
    totalCompressedTokens,
    overallRatio: totalOriginalTokens > 0 ? totalCompressedTokens / totalOriginalTokens : 1,
    fields,
  };
}

/** Expose abbreviation map for reference */
export function getAbbreviationMap(): Record<string, string> {
  return { ...ABBREVIATIONS };
}
