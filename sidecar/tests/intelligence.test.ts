import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, apiFetch } from './helpers.js';

describe('Intelligence API', () => {
  beforeAll(async () => { await setupTestApp(); });
  afterAll(async () => { await teardownTestApp(); });

  // Create a project first for intelligence tests
  let projectId: string;

  it('creates a test project', async () => {
    const { body } = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Intel Test', path: '/var/tmp' }),
    });
    projectId = body.project.id;
    expect(projectId).toBeTruthy();
  });

  describe('Pattern Memory', () => {
    let patternId: string;

    it('GET /patterns returns empty initially', async () => {
      const { body } = await apiFetch(`/api/intelligence/patterns?project_id=${projectId}`);
      expect(body.patterns).toEqual([]);
    });

    it('POST /patterns creates a pattern', async () => {
      const { status, body } = await apiFetch('/api/intelligence/patterns', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Auth Middleware',
          description: 'JWT validation middleware',
          code: 'app.use(validateJWT)',
          tags: ['auth', 'middleware'],
          source_project_id: projectId,
        }),
      });
      expect(status).toBe(201);
      expect(body.pattern.title).toBe('Auth Middleware');
      expect(body.pattern.tags).toEqual(['auth', 'middleware']);
      patternId = body.pattern.id;
    });

    it('GET /patterns returns created pattern', async () => {
      const { body } = await apiFetch(`/api/intelligence/patterns?project_id=${projectId}`);
      expect(body.patterns.length).toBe(1);
      expect(body.patterns[0].title).toBe('Auth Middleware');
    });

    it('PUT /patterns/:id updates confidence', async () => {
      const { body } = await apiFetch(`/api/intelligence/patterns/${patternId}`, {
        method: 'PUT',
        body: JSON.stringify({ confidence: 'verified' }),
      });
      expect(body.pattern.confidence).toBe('verified');
    });

    it('DELETE /patterns/:id removes it', async () => {
      const { status } = await apiFetch(`/api/intelligence/patterns/${patternId}`, { method: 'DELETE' });
      expect(status).toBe(200);
      const { body } = await apiFetch(`/api/intelligence/patterns?project_id=${projectId}`);
      expect(body.patterns.length).toBe(0);
    });
  });

  describe('Debug Memory', () => {
    let debugId: string;

    it('POST /debug creates a debug entry', async () => {
      const { status, body } = await apiFetch('/api/intelligence/debug', {
        method: 'POST',
        body: JSON.stringify({
          problem: 'JWT expires during long requests',
          root_cause: 'Token TTL too short',
          solution: 'Increase TTL to 1h and add refresh',
          error_signature: 'TokenExpiredError',
          source_project_id: projectId,
        }),
      });
      expect(status).toBe(201);
      expect(body.debug.problem).toBe('JWT expires during long requests');
      debugId = body.debug.id;
    });

    it('POST /debug/match finds matching solution', async () => {
      const { body } = await apiFetch('/api/intelligence/debug/match', {
        method: 'POST',
        body: JSON.stringify({
          error_signature: 'TokenExpiredError',
          error_message: 'Token has expired',
        }),
      });
      expect(body.match).toBeTruthy();
      expect(body.match.problem).toContain('JWT');
    });

    it('DELETE /debug/:id removes it', async () => {
      await apiFetch(`/api/intelligence/debug/${debugId}`, { method: 'DELETE' });
      const { body } = await apiFetch(`/api/intelligence/debug?project_id=${projectId}`);
      expect(body.debug.length).toBe(0);
    });
  });
});
