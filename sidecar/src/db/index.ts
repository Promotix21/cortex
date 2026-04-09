import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { SCHEMA_SQL } from './schema.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): Database.Database {
  const dbDir = process.env.CORTEX_DB_DIR || path.join(os.homedir(), '.cortex');
  const dbPath = path.join(dbDir, 'cortex.db');

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for concurrent reads + single writer performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Checkpoint WAL on startup to recover from dirty shutdowns (hibernation, crash, battery loss).
  // This forces any uncommitted WAL transactions to be flushed into the main DB file,
  // preventing corruption and reclaiming the WAL file space.
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('[db] WAL checkpoint completed (crash recovery)');
  } catch (err) {
    console.warn('[db] WAL checkpoint failed (non-fatal):', err);
  }

  // Run schema creation
  db.exec(SCHEMA_SQL);

  // Migrations — add columns that may be missing from older schemas
  const migrations = [
    "ALTER TABLE projects ADD COLUMN company TEXT DEFAULT NULL",
    // MemPalace: temporal columns on project_brain
    "ALTER TABLE project_brain ADD COLUMN valid_from TEXT DEFAULT (datetime('now'))",
    "ALTER TABLE project_brain ADD COLUMN valid_until TEXT DEFAULT NULL",
    // MemPalace: room tags on intelligence tables
    "ALTER TABLE pattern_memory ADD COLUMN room_tag TEXT",
    "ALTER TABLE debug_memory ADD COLUMN room_tag TEXT",
    "ALTER TABLE notes ADD COLUMN room_tag TEXT",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  console.log(`[db] SQLite initialized at ${dbPath}`);
  console.log(`[db] Tables created/verified`);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    (db as any) = undefined;
    console.log('[db] Connection closed');
  }
}
