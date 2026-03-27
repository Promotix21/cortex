import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { SCHEMA_SQL } from './schema.js';

const DB_DIR = path.join(os.homedir(), '.cortex');
const DB_PATH = path.join(DB_DIR, 'cortex.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): Database.Database {
  // Ensure directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for concurrent reads + single writer performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Run schema creation
  db.exec(SCHEMA_SQL);

  console.log(`[db] SQLite initialized at ${DB_PATH}`);
  console.log(`[db] Tables created/verified`);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    console.log('[db] Connection closed');
  }
}
