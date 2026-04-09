import { getDb } from '../db/index.js';
import { detectRoomFromContent } from './room-detector.js';
import { parseDecisionToTriples } from './temporal-service.js';

/**
 * Contradiction Detection Service
 *
 * Prevents stale or conflicting information from entering the Project Brain.
 * Before new intelligence is committed, checks existing knowledge graph facts
 * for logical conflicts.
 */

export interface Conflict {
  type: 'direct_contradiction' | 'stale_reference' | 'superseded_decision';
  existingFact: {
    id: string;
    subject: string;
    predicate: string;
    object: string;
    validFrom: string;
    roomTag: string | null;
  };
  newFact: {
    subject: string;
    predicate: string;
    object: string;
  };
  message: string;
}

export interface ConsistencyResult {
  safe: boolean;
  conflicts: Conflict[];
  suggestions: string[];
}

/**
 * Check consistency of a new fact against existing knowledge.
 */
export function checkConsistency(projectId: string, newFactText: string, roomTag?: string): ConsistencyResult {
  const conflicts: Conflict[] = [];
  const suggestions: string[] = [];

  // Parse the new fact text into triples
  const triples = parseDecisionToTriples(newFactText);
  if (triples.length === 0) {
    return { safe: true, conflicts: [], suggestions: [] };
  }

  const db = getDb();
  const detectedRoom = roomTag || detectRoomFromContent(newFactText);

  for (const triple of triples) {
    // Check 1: Direct contradictions — same subject+predicate, different object
    const directConflicts = findDirectContradictions(db, projectId, triple.subject, triple.predicate, triple.object);
    conflicts.push(...directConflicts);

    // Check 2: Stale references — does the fact reference files/functions that no longer exist?
    const staleRefs = findStaleReferences(db, projectId, triple.object);
    conflicts.push(...staleRefs.map(ref => ({
      type: 'stale_reference' as const,
      existingFact: {
        id: ref.id,
        subject: ref.subject,
        predicate: ref.predicate,
        object: ref.object,
        validFrom: ref.valid_from,
        roomTag: ref.room_tag,
      },
      newFact: { subject: triple.subject, predicate: triple.predicate, object: triple.object },
      message: `References "${ref.object}" which no longer exists in the file index`,
    })));

    // Check 3: Superseded decisions in the same room
    if (detectedRoom) {
      const superseded = findSupersededDecisions(db, projectId, triple.subject, detectedRoom);
      for (const existing of superseded) {
        // Only flag if the objects differ
        if (existing.object.toLowerCase() !== triple.object.toLowerCase()) {
          conflicts.push({
            type: 'superseded_decision',
            existingFact: {
              id: existing.id,
              subject: existing.subject,
              predicate: existing.predicate,
              object: existing.object,
              validFrom: existing.valid_from,
              roomTag: existing.room_tag,
            },
            newFact: { subject: triple.subject, predicate: triple.predicate, object: triple.object },
            message: `Existing decision in room "${detectedRoom}": "${existing.subject} ${existing.predicate} ${existing.object}" — new fact would supersede it`,
          });
        }
      }
    }
  }

  // Generate suggestions
  if (conflicts.length > 0) {
    const directCount = conflicts.filter(c => c.type === 'direct_contradiction').length;
    const staleCount = conflicts.filter(c => c.type === 'stale_reference').length;
    const supersededCount = conflicts.filter(c => c.type === 'superseded_decision').length;

    if (directCount > 0) {
      suggestions.push('Direct contradictions found. The new fact will automatically retire conflicting facts when saved.');
    }
    if (staleCount > 0) {
      suggestions.push('Some referenced items may no longer exist. Consider verifying before saving.');
    }
    if (supersededCount > 0) {
      suggestions.push('This will update an existing decision. The old decision will be preserved in history.');
    }
  }

  return {
    safe: conflicts.length === 0,
    conflicts,
    suggestions,
  };
}

/**
 * Find direct contradictions: active facts with same subject+predicate but different object.
 */
function findDirectContradictions(
  db: ReturnType<typeof getDb>,
  projectId: string,
  subject: string,
  predicate: string,
  newObject: string
): Conflict[] {
  const existing = db.prepare(`
    SELECT id, subject, predicate, object, valid_from, room_tag
    FROM knowledge_graph
    WHERE project_id = ? AND subject = ? AND predicate = ? AND valid_until IS NULL
      AND object != ?
  `).all(projectId, subject, predicate, newObject) as Array<{
    id: string; subject: string; predicate: string; object: string; valid_from: string; room_tag: string | null;
  }>;

  return existing.map(fact => ({
    type: 'direct_contradiction' as const,
    existingFact: {
      id: fact.id,
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      validFrom: fact.valid_from,
      roomTag: fact.room_tag,
    },
    newFact: { subject, predicate, object: newObject },
    message: `Active fact "${fact.subject} ${fact.predicate} ${fact.object}" (since ${fact.valid_from}) contradicts new fact "${subject} ${predicate} ${newObject}"`,
  }));
}

/**
 * Find stale references: check if referenced file paths exist in file_index.
 */
function findStaleReferences(
  db: ReturnType<typeof getDb>,
  projectId: string,
  objectText: string
): Array<{ id: string; subject: string; predicate: string; object: string; valid_from: string; room_tag: string | null }> {
  // Extract potential file paths from the object text
  const pathPattern = /(?:[\w./]+\.\w{1,4})/g;
  const paths = objectText.match(pathPattern);

  if (!paths || paths.length === 0) return [];

  const stale: Array<{ id: string; subject: string; predicate: string; object: string; valid_from: string; room_tag: string | null }> = [];

  for (const filePath of paths) {
    // Check if this looks like a real file path (has directory separator or extension)
    if (!filePath.includes('/') && !filePath.includes('.')) continue;

    const exists = db.prepare(
      'SELECT 1 FROM file_index WHERE project_id = ? AND file_path LIKE ?'
    ).get(projectId, `%${filePath}%`);

    if (!exists) {
      // This path doesn't exist in the file index — could be stale
      stale.push({
        id: '',
        subject: 'file',
        predicate: 'references',
        object: filePath,
        valid_from: new Date().toISOString(),
        room_tag: null,
      });
    }
  }

  return stale;
}

/**
 * Find existing decisions in the same room that could be superseded.
 */
function findSupersededDecisions(
  db: ReturnType<typeof getDb>,
  projectId: string,
  subject: string,
  roomTag: string
): Array<{ id: string; subject: string; predicate: string; object: string; valid_from: string; room_tag: string | null }> {
  return db.prepare(`
    SELECT id, subject, predicate, object, valid_from, room_tag
    FROM knowledge_graph
    WHERE project_id = ? AND subject = ? AND room_tag = ? AND valid_until IS NULL
    ORDER BY valid_from DESC
    LIMIT 5
  `).all(projectId, subject, roomTag) as Array<{
    id: string; subject: string; predicate: string; object: string; valid_from: string; room_tag: string | null;
  }>;
}
