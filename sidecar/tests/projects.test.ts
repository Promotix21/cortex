import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, apiFetch } from './helpers.js';

describe('Projects API', () => {
  beforeAll(async () => { await setupTestApp(); });
  afterAll(async () => { await teardownTestApp(); });

  it('GET /api/health returns ok', async () => {
    const { status, body } = await apiFetch('/api/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('GET /api/projects returns empty list initially', async () => {
    const { status, body } = await apiFetch('/api/projects');
    expect(status).toBe(200);
    expect(body.projects).toEqual([]);
  });

  it('POST /api/projects creates a project', async () => {
    const { status, body } = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Project', path: '/tmp' }),
    });
    expect(status).toBe(201);
    expect(body.project).toBeDefined();
    expect(body.project.name).toBe('Test Project');
    expect(body.project.path).toBe('/tmp');
    expect(body.project.id).toBeTruthy();
  });

  it('GET /api/projects returns created project', async () => {
    const { body } = await apiFetch('/api/projects');
    expect(body.projects.length).toBe(1);
    expect(body.projects[0].name).toBe('Test Project');
  });

  it('PUT /api/projects/:id updates a project', async () => {
    const { body: list } = await apiFetch('/api/projects');
    const id = list.projects[0].id;
    const { status, body } = await apiFetch(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Project' }),
    });
    expect(status).toBe(200);
    expect(body.project.name).toBe('Updated Project');
  });

  it('DELETE /api/projects/:id deletes a project', async () => {
    const { body: list } = await apiFetch('/api/projects');
    const id = list.projects[0].id;
    const { status } = await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
    expect(status).toBe(200);
    const { body: after } = await apiFetch('/api/projects');
    expect(after.projects.length).toBe(0);
  });

  it('POST /api/projects rejects missing name', async () => {
    const { status } = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp' }),
    });
    expect(status).toBe(400);
  });
});
