import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, apiFetch } from './helpers.js';

describe('Bridge API', () => {
  beforeAll(async () => { await setupTestApp(); });
  afterAll(async () => { await teardownTestApp(); });

  // Create a project with a known dev port for bridge matching
  let projectId: string;
  it('creates a test project with dev port', async () => {
    const { body } = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bridge Test', path: '/usr', dev_server_port: 3000 }),
    });
    projectId = body.project.id;
    expect(projectId).toBeTruthy();
  });

  it('GET /api/bridge/status returns connection state', async () => {
    const { status, body } = await apiFetch('/api/bridge/status');
    expect(status).toBe(200);
    expect(typeof body.connected).toBe('boolean');
  });

  it('POST /api/bridge/errors accepts error data', async () => {
    const { status, body } = await apiFetch('/api/bridge/errors', {
      method: 'POST',
      body: JSON.stringify({
        error_type: 'TypeError',
        message: 'Cannot read property of null',
        stack: 'at foo.js:1:1',
        url: 'http://localhost:3000/app',   // matches project dev_server_port: 3000
        tab_url: 'http://localhost:3000/app',
      }),
    });
    expect(status).toBe(200);
    expect(body.saved).toBe(true);
  });

  it('POST /api/bridge/errors rejects missing message', async () => {
    const { status } = await apiFetch('/api/bridge/errors', {
      method: 'POST',
      body: JSON.stringify({ error_type: 'Error' }),
    });
    expect(status).toBe(400);
  });

  it('POST /api/bridge/network accepts network data', async () => {
    const { status, body } = await apiFetch('/api/bridge/network', {
      method: 'POST',
      body: JSON.stringify({
        method: 'POST',
        url: 'http://localhost:3000/api/users',   // matches project dev_server_port: 3000
        status_code: 500,
        duration_ms: 234,
        failed: 1,
      }),
    });
    expect(status).toBe(200);
    expect(body.saved).toBe(true);
  });
});
