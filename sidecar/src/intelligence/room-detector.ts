import { getDb } from '../db/index.js';

/**
 * MemPalace Room Detector — maps file paths and directories to semantic "rooms"
 * (technical domains) for hierarchical context injection.
 *
 * Rooms are the finest granularity in the Palace hierarchy:
 *   Wing (project) → Hall (Facts/Events/Patterns/Decisions) → Room (auth, db, ui, etc.)
 */

/** Room definitions: room name → path segment keywords that indicate this room */
const ROOM_MAP: Record<string, string[]> = {
  auth:       ['auth', 'login', 'signup', 'register', 'session', 'jwt', 'oauth', 'credential', 'password', 'token', 'passport', 'clerk'],
  database:   ['db', 'database', 'migration', 'schema', 'model', 'query', 'sql', 'sqlite', 'postgres', 'prisma', 'drizzle', 'knex', 'sequelize'],
  ui:         ['component', 'components', 'view', 'views', 'page', 'pages', 'layout', 'layouts', 'style', 'styles', 'css', 'theme', 'widget', 'ui'],
  api:        ['route', 'routes', 'endpoint', 'controller', 'controllers', 'handler', 'handlers', 'middleware', 'api', 'rest', 'graphql'],
  testing:    ['test', 'tests', 'spec', 'specs', 'mock', 'mocks', 'fixture', 'fixtures', 'e2e', 'cypress', 'jest', 'vitest', 'playwright'],
  deploy:     ['docker', 'ci', 'cd', 'deploy', 'deployment', 'infra', 'terraform', 'k8s', 'kubernetes', 'nginx', 'caddy', 'ansible'],
  config:     ['config', 'configs', 'configuration', 'env', 'setting', 'settings', 'constant', 'constants'],
  state:      ['store', 'stores', 'state', 'reducer', 'reducers', 'context', 'hook', 'hooks', 'zustand', 'redux', 'recoil', 'jotai'],
  build:      ['build', 'bundle', 'bundler', 'webpack', 'vite', 'esbuild', 'turbo', 'rollup', 'parcel', 'tsconfig'],
  intelligence: ['intelligence', 'brain', 'mcp', 'ai', 'claude', 'llm', 'memory', 'context'],
  chat:       ['chat', 'message', 'conversation', 'prompt', 'assistant'],
  terminal:   ['terminal', 'shell', 'pty', 'console', 'cli', 'command'],
};

/** All known room names */
export const ROOM_NAMES = Object.keys(ROOM_MAP);

export interface RoomContext {
  room: string;
  patterns: Array<{ id: string; title: string; description: string; code: string; confidence: string }>;
  debugSolutions: Array<{ id: string; problem: string; rootCause: string; solution: string; confidence: string }>;
  facts: Array<{ id: string; subject: string; predicate: string; object: string; validFrom: string }>;
  factCount: number;
}

/**
 * Detect the room for a single file path.
 * Matches path segments (directories and filename) against room keywords.
 */
export function detectRoom(filePath: string): string | null {
  if (!filePath) return null;

  // Normalize: lowercase, split on / and common separators
  const normalized = filePath.toLowerCase().replace(/\\/g, '/');
  const segments = normalized.split('/').flatMap(s =>
    s.replace(/\.[^.]+$/, '') // strip file extension
      .split(/[-_.]/) // split on separators within segments
  );

  let bestRoom: string | null = null;
  let bestScore = 0;

  for (const [room, keywords] of Object.entries(ROOM_MAP)) {
    let score = 0;
    for (const keyword of keywords) {
      for (const segment of segments) {
        if (segment === keyword) {
          score += 3; // exact match
        } else if (segment.includes(keyword)) {
          score += 1; // partial match
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRoom = room;
    }
  }

  return bestRoom;
}

/**
 * Detect rooms relevant to a working directory by scanning its file index.
 * Returns rooms sorted by file count (most files = most relevant).
 */
export function detectRoomsFromCwd(projectId: string, cwd?: string): string[] {
  const db = getDb();

  let files: Array<{ file_path: string }>;
  if (cwd) {
    // Get files under the cwd
    files = db.prepare(
      'SELECT file_path FROM file_index WHERE project_id = ? AND file_path LIKE ?'
    ).all(projectId, `${cwd}%`) as Array<{ file_path: string }>;
  } else {
    files = db.prepare(
      'SELECT file_path FROM file_index WHERE project_id = ? LIMIT 500'
    ).all(projectId) as Array<{ file_path: string }>;
  }

  // Count room occurrences
  const roomCounts: Record<string, number> = {};
  for (const { file_path } of files) {
    const room = detectRoom(file_path);
    if (room) {
      roomCounts[room] = (roomCounts[room] || 0) + 1;
    }
  }

  // Sort by count descending
  return Object.entries(roomCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([room]) => room);
}

/**
 * Get all intelligence tagged with a specific room.
 */
export function getRoomContext(projectId: string, room: string): RoomContext {
  const db = getDb();

  // Room-tagged patterns
  const patterns = db.prepare(`
    SELECT id, title, description, code, confidence
    FROM pattern_memory
    WHERE (source_project_id = ? OR scope = 'reusable')
      AND room_tag = ?
      AND confidence != 'deprecated'
    ORDER BY usage_count DESC LIMIT 10
  `).all(projectId, room) as RoomContext['patterns'];

  // Room-tagged debug solutions
  const debugSolutions = db.prepare(`
    SELECT id, problem, root_cause as rootCause, solution, confidence
    FROM debug_memory
    WHERE (source_project_id = ? OR scope = 'reusable')
      AND room_tag = ?
      AND confidence != 'deprecated'
    ORDER BY usage_count DESC LIMIT 10
  `).all(projectId, room) as RoomContext['debugSolutions'];

  // Active knowledge graph facts for this room
  const facts = db.prepare(`
    SELECT id, subject, predicate, object, valid_from as validFrom
    FROM knowledge_graph
    WHERE project_id = ? AND room_tag = ? AND valid_until IS NULL
    ORDER BY valid_from DESC LIMIT 20
  `).all(projectId, room) as RoomContext['facts'];

  return {
    room,
    patterns,
    debugSolutions,
    facts,
    factCount: patterns.length + debugSolutions.length + facts.length,
  };
}

/**
 * List all rooms that have intelligence data for a project.
 */
export function listProjectRooms(projectId: string): Array<{ room: string; factCount: number }> {
  const db = getDb();

  // Count facts per room from knowledge_graph
  const kgRooms = db.prepare(`
    SELECT room_tag as room, COUNT(*) as cnt
    FROM knowledge_graph
    WHERE project_id = ? AND valid_until IS NULL AND room_tag IS NOT NULL
    GROUP BY room_tag
  `).all(projectId) as Array<{ room: string; cnt: number }>;

  // Count from pattern_memory
  const pmRooms = db.prepare(`
    SELECT room_tag as room, COUNT(*) as cnt
    FROM pattern_memory
    WHERE source_project_id = ? AND room_tag IS NOT NULL AND confidence != 'deprecated'
    GROUP BY room_tag
  `).all(projectId) as Array<{ room: string; cnt: number }>;

  // Count from debug_memory
  const dmRooms = db.prepare(`
    SELECT room_tag as room, COUNT(*) as cnt
    FROM debug_memory
    WHERE source_project_id = ? AND room_tag IS NOT NULL AND confidence != 'deprecated'
    GROUP BY room_tag
  `).all(projectId) as Array<{ room: string; cnt: number }>;

  // Merge counts
  const merged: Record<string, number> = {};
  for (const { room, cnt } of [...kgRooms, ...pmRooms, ...dmRooms]) {
    merged[room] = (merged[room] || 0) + cnt;
  }

  return Object.entries(merged)
    .map(([room, factCount]) => ({ room, factCount }))
    .sort((a, b) => b.factCount - a.factCount);
}

/**
 * Auto-detect room tag from content text (for intelligence capture).
 */
export function detectRoomFromContent(content: string): string | null {
  if (!content) return null;

  const lower = content.toLowerCase();
  let bestRoom: string | null = null;
  let bestScore = 0;

  for (const [room, keywords] of Object.entries(ROOM_MAP)) {
    let score = 0;
    for (const keyword of keywords) {
      // Word boundary match
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = lower.match(regex);
      if (matches) score += matches.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRoom = room;
    }
  }

  // Only return if we have a meaningful match (at least 2 keyword hits)
  return bestScore >= 2 ? bestRoom : null;
}
