import { Router } from 'express';
import {
  listCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
  revealCredential,
  getAuditLog,
  type CredentialKind,
} from '../vault/vault-service.js';
import { isVaultAvailable } from '../vault/crypto.js';

export const vaultRouter: ReturnType<typeof Router> = Router();

const VALID_KINDS: CredentialKind[] = [
  'ssh', 'wordpress', 'shopify', 'smtp', 'backend_panel',
  'api_key', 'db', 'app_user', 'github', 'other',
];

// ── Health / availability ──
vaultRouter.get('/status', (_req, res) => {
  res.json(isVaultAvailable());
});

// ── List ── (specific path BEFORE :id parameterized)
vaultRouter.get('/list', (req, res) => {
  const projectId = req.query.project_id;
  let scope: string | null | undefined;
  if (projectId === undefined) scope = undefined;
  else if (projectId === 'global' || projectId === '') scope = null;
  else scope = String(projectId);
  res.json({ credentials: listCredentials(scope) });
});

// ── Audit ──
vaultRouter.get('/audit', (req, res) => {
  const credentialId = req.query.credential_id;
  res.json({ entries: getAuditLog(credentialId ? String(credentialId) : undefined, 100) });
});

// ── Create ──
vaultRouter.post('/credentials', (req, res) => {
  const { project_id, kind, name, description, fields } = req.body || {};
  if (!kind || !VALID_KINDS.includes(kind)) {
    res.status(400).json({ error: `kind must be one of: ${VALID_KINDS.join(', ')}` });
    return;
  }
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!fields || typeof fields !== 'object') {
    res.status(400).json({ error: 'fields object is required (e.g. {host, user, password})' });
    return;
  }
  try {
    const summary = createCredential({
      projectId: project_id ?? null,
      kind,
      name,
      description,
      fields,
    });
    res.status(201).json({ credential: summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ── Update ──
vaultRouter.put('/credentials/:id', (req, res) => {
  try {
    const summary = updateCredential(req.params.id, req.body || {});
    if (!summary) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    res.json({ credential: summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ── Delete ──
vaultRouter.delete('/credentials/:id', (req, res) => {
  const removed = deleteCredential(req.params.id);
  res.json({ success: removed });
});

// ── Reveal (UI) ──
vaultRouter.post('/credentials/:id/reveal', (req, res) => {
  const { reason, session_id } = req.body || {};
  try {
    const result = revealCredential({
      id: req.params.id,
      reason: String(reason || ''),
      caller: 'ui',
      sessionId: session_id,
    });
    if (!result) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});
