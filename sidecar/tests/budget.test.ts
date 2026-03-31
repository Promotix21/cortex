import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, apiFetch } from './helpers.js';

describe('Budget API', () => {
  beforeAll(async () => { await setupTestApp(); });
  afterAll(async () => { await teardownTestApp(); });

  it('GET /api/budget/status returns limits and alerts', async () => {
    const { status, body } = await apiFetch('/api/budget/status');
    expect(status).toBe(200);
    expect(body.limits).toBeDefined();
    expect(body.alerts).toBeDefined();
    expect(Array.isArray(body.limits)).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  it('GET /api/budget/can-spawn returns allowed status', async () => {
    const { status, body } = await apiFetch('/api/budget/can-spawn');
    expect(status).toBe(200);
    expect(typeof body.allowed).toBe('boolean');
  });

  it('PUT /api/budget/limits/:id updates a limit if it exists', async () => {
    const { body } = await apiFetch('/api/budget/status');
    if (body.limits.length > 0) {
      const limit = body.limits[0];
      const { status } = await apiFetch(`/api/budget/limits/${limit.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: true, warn_at_pct: 0.9 }),
      });
      expect(status).toBe(200);
    }
  });
});
