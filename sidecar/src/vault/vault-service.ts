import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { seal, unseal } from './crypto.js';

export type CredentialKind =
  | 'ssh' | 'wordpress' | 'shopify' | 'smtp' | 'backend_panel'
  | 'api_key' | 'db' | 'app_user' | 'github' | 'other';

export interface CredentialSummary {
  id: string;
  projectId: string | null;
  kind: CredentialKind;
  name: string;
  description: string;
  lastUsed: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialInput {
  projectId?: string | null;
  kind: CredentialKind;
  name: string;
  description?: string;
  fields: Record<string, unknown>;
}

interface CredentialRow {
  id: string;
  project_id: string | null;
  kind: CredentialKind;
  name: string;
  description: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  last_used: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSummary(row: CredentialRow): CredentialSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    lastUsed: row.last_used,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listCredentials(projectId?: string | null): CredentialSummary[] {
  const db = getDb();
  let rows: CredentialRow[];
  if (projectId === undefined) {
    rows = db.prepare('SELECT * FROM credentials ORDER BY kind, name').all() as CredentialRow[];
  } else if (projectId === null) {
    rows = db
      .prepare('SELECT * FROM credentials WHERE project_id IS NULL ORDER BY kind, name')
      .all() as CredentialRow[];
  } else {
    rows = db
      .prepare(
        'SELECT * FROM credentials WHERE project_id = ? OR project_id IS NULL ORDER BY kind, name',
      )
      .all(projectId) as CredentialRow[];
  }
  return rows.map(rowToSummary);
}

export function findCredentialByName(
  name: string,
  projectId?: string | null,
): CredentialSummary | null {
  const db = getDb();
  let row: CredentialRow | undefined;
  if (projectId) {
    row = db
      .prepare(
        'SELECT * FROM credentials WHERE name = ? AND (project_id = ? OR project_id IS NULL) LIMIT 1',
      )
      .get(name, projectId) as CredentialRow | undefined;
  } else {
    row = db
      .prepare('SELECT * FROM credentials WHERE name = ? LIMIT 1')
      .get(name) as CredentialRow | undefined;
  }
  return row ? rowToSummary(row) : null;
}

export function createCredential(input: CredentialInput): CredentialSummary {
  const db = getDb();
  const sealed = seal(input.fields);
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO credentials
       (id, project_id, kind, name, description, ciphertext, iv, auth_tag, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.projectId ?? null,
    input.kind,
    input.name,
    input.description ?? '',
    sealed.ciphertext,
    sealed.iv,
    sealed.authTag,
    now,
    now,
  );
  const row = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredentialRow;
  return rowToSummary(row);
}

export function updateCredential(
  id: string,
  patch: { name?: string; description?: string; kind?: CredentialKind; fields?: Record<string, unknown> },
): CredentialSummary | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredentialRow | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  if (patch.fields) {
    const sealed = seal(patch.fields);
    db.prepare(
      `UPDATE credentials SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         kind = COALESCE(?, kind),
         ciphertext = ?,
         iv = ?,
         auth_tag = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      patch.name ?? null,
      patch.description ?? null,
      patch.kind ?? null,
      sealed.ciphertext,
      sealed.iv,
      sealed.authTag,
      now,
      id,
    );
  } else {
    db.prepare(
      `UPDATE credentials SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         kind = COALESCE(?, kind),
         updated_at = ?
       WHERE id = ?`,
    ).run(patch.name ?? null, patch.description ?? null, patch.kind ?? null, now, id);
  }

  const row = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredentialRow;
  return rowToSummary(row);
}

export function deleteCredential(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
  return result.changes > 0;
}

export interface RevealedCredential {
  summary: CredentialSummary;
  fields: Record<string, unknown>;
}

export function revealCredential(opts: {
  id?: string;
  name?: string;
  projectId?: string | null;
  reason: string;
  caller: 'mcp' | 'ui' | 'hook' | 'api';
  sessionId?: string;
}): RevealedCredential | null {
  if (!opts.reason || opts.reason.length < 4) {
    throw new Error('A reason (≥4 chars) is required to reveal a credential');
  }
  const db = getDb();
  let row: CredentialRow | undefined;
  if (opts.id) {
    row = db.prepare('SELECT * FROM credentials WHERE id = ?').get(opts.id) as CredentialRow | undefined;
  } else if (opts.name) {
    if (opts.projectId) {
      row = db
        .prepare(
          'SELECT * FROM credentials WHERE name = ? AND (project_id = ? OR project_id IS NULL) LIMIT 1',
        )
        .get(opts.name, opts.projectId) as CredentialRow | undefined;
    } else {
      row = db
        .prepare('SELECT * FROM credentials WHERE name = ? LIMIT 1')
        .get(opts.name) as CredentialRow | undefined;
    }
  }

  if (!row) return null;

  const fields = unseal({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag });

  const now = new Date().toISOString();
  db.prepare('UPDATE credentials SET last_used = ? WHERE id = ?').run(now, row.id);
  db.prepare(
    `INSERT INTO credential_access (id, credential_id, session_id, reason, caller)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(uuid(), row.id, opts.sessionId ?? null, opts.reason, opts.caller);

  return { summary: rowToSummary(row), fields };
}

export function getAuditLog(credentialId?: string, limit = 50): Array<{
  id: string;
  credentialId: string;
  sessionId: string | null;
  reason: string;
  caller: string;
  createdAt: string;
}> {
  const db = getDb();
  const rows = credentialId
    ? db
        .prepare(
          'SELECT * FROM credential_access WHERE credential_id = ? ORDER BY created_at DESC LIMIT ?',
        )
        .all(credentialId, limit)
    : db.prepare('SELECT * FROM credential_access ORDER BY created_at DESC LIMIT ?').all(limit);
  return (rows as Array<{
    id: string;
    credential_id: string;
    session_id: string | null;
    reason: string;
    caller: string;
    created_at: string;
  }>).map(r => ({
    id: r.id,
    credentialId: r.credential_id,
    sessionId: r.session_id,
    reason: r.reason,
    caller: r.caller,
    createdAt: r.created_at,
  }));
}
