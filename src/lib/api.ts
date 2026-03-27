const SIDECAR_URL = 'http://localhost:4700';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${SIDECAR_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  // Projects
  getProjects: () => request<{ projects: any[] }>('/api/projects'),
  getProject: (id: string) => request<{ project: any }>(`/api/projects/${id}`),
  createProject: (data: any) =>
    request<{ project: any }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProject: (id: string, data: any) =>
    request<{ project: any }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) =>
    request<{ success: boolean }>(`/api/projects/${id}`, {
      method: 'DELETE',
    }),

  // Sessions
  getSessions: (projectId?: string) =>
    request<{ sessions: any[] }>(projectId ? `/api/sessions?project_id=${projectId}` : '/api/sessions'),
  getActiveSessions: () => request<{ sessions: any[] }>('/api/sessions/active'),
  getSession: (id: string) => request<{ session: any }>(`/api/sessions/${id}`),
  getSessionOutput: (id: string) => request<{ output: string }>(`/api/sessions/${id}/output`),
  getSessionHistory: (id: string) => request<{ history: any[] }>(`/api/sessions/${id}/history`),
  spawnSession: (projectId: string, name: string) =>
    request<{ session: any }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, name }),
    }),
  sendInput: (sessionId: string, input: string) =>
    request<{ success: boolean }>(`/api/sessions/${sessionId}/input`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    }),
  stopSession: (id: string) =>
    request<{ success: boolean }>(`/api/sessions/${id}/stop`, { method: 'POST' }),
  killSession: (id: string) =>
    request<{ success: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  getUsageSummary: () =>
    request<{ today: any; byProject: any[] }>('/api/sessions/usage'),
  getSnapshots: (projectId: string) =>
    request<{ snapshots: any[] }>(`/api/sessions/snapshots/${projectId}`),

  // Terminals
  getTerminals: (projectId?: string) =>
    request<{ terminals: any[] }>(projectId ? `/api/terminals?project_id=${projectId}` : '/api/terminals'),
  getTerminal: (id: string) => request<{ terminal: any }>(`/api/terminals/${id}`),
  getTerminalOutput: (id: string) => request<{ output: string }>(`/api/terminals/${id}/output`),
  pollTerminal: (id: string, sinceSeq: number) =>
    request<{ chunks: { seq: number; data: string }[]; nextSeq: number }>(`/api/terminals/${id}/poll?since=${sinceSeq}`),
  spawnTerminal: (projectId: string, name: string, type = 'shell', command?: string) =>
    request<{ terminal: any }>('/api/terminals', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, name, type, command }),
    }),
  writeTerminal: (id: string, data: string) =>
    request<{ success: boolean }>(`/api/terminals/${id}/write`, {
      method: 'POST',
      body: JSON.stringify({ data }),
    }),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    request<{ success: boolean }>(`/api/terminals/${id}/resize`, {
      method: 'POST',
      body: JSON.stringify({ cols, rows }),
    }),
  renameTerminal: (id: string, name: string) =>
    request<{ success: boolean }>(`/api/terminals/${id}/rename`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  clearTerminal: (id: string) =>
    request<{ success: boolean }>(`/api/terminals/${id}/clear`, { method: 'POST' }),
  restartTerminal: (id: string) =>
    request<{ terminal: any }>(`/api/terminals/${id}/restart`, { method: 'POST' }),
  killTerminal: (id: string) =>
    request<{ success: boolean }>(`/api/terminals/${id}`, { method: 'DELETE' }),

  // Chat
  getChatHistory: (projectId: string) =>
    request<{ history: any[] }>(`/api/chat/${projectId}`),
  clearChat: (projectId: string) =>
    request<{ success: boolean }>(`/api/chat/${projectId}`, { method: 'DELETE' }),
  getProjectBrain: (projectId: string) =>
    request<{ brain: any }>(`/api/chat/brain/${projectId}`),
  updateProjectBrain: (projectId: string, fields: any) =>
    request<{ brain: any }>(`/api/chat/brain/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    }),

  // Health
  health: () => request<{ status: string; activeSessions: number }>('/api/health'),
};
