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
  updateProjectIcon: (id: string, icon: string) =>
    request<{ project: any }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ icon }),
    }),
  deleteProject: (id: string) =>
    request<{ success: boolean }>(`/api/projects/${id}`, {
      method: 'DELETE',
    }),
  scanProject: (id: string) =>
    request<{ scan: any }>(`/api/projects/${id}/scan`, { method: 'POST' }),
  browseFolder: () =>
    request<{ path: string | null; name?: string; cancelled?: boolean }>('/api/projects/browse', { method: 'POST' }),
  getProjectDocuments: (id: string) =>
    request<{ documents: any[]; total: number }>(`/api/projects/${id}/documents`),
  readDocument: (id: string, filePath: string) =>
    request<{ content: string; type: string }>(`/api/projects/${id}/documents/read?path=${encodeURIComponent(filePath)}`),

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
  resizeSession: (id: string, cols: number, rows: number) =>
    request<{ success: boolean }>(`/api/sessions/${id}/resize`, {
      method: 'POST',
      body: JSON.stringify({ cols, rows }),
    }),
  stopSession: (id: string) =>
    request<{ success: boolean }>(`/api/sessions/${id}/stop`, { method: 'POST' }),
  killSession: (id: string) =>
    request<{ success: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  deleteSession: (id: string) =>
    request<{ success: boolean }>(`/api/sessions/${id}/permanent`, { method: 'DELETE' }),
  resumeSession: (id: string) =>
    request<{ session: any; terminalId: string }>(`/api/sessions/${id}/resume`, { method: 'POST' }),
  getUsageSummary: () =>
    request<{ today: any; byProject: any[] }>('/api/sessions/usage'),
  getSnapshots: (projectId: string) =>
    request<{ snapshots: any[] }>(`/api/sessions/snapshots/${projectId}`),
  getSessionHandoff: (sessionId: string) =>
    request<{ handoff: string | null }>(`/api/sessions/${sessionId}/handoff`),
  generateHandoff: (sessionId: string) =>
    request<{ written: boolean; path: string }>(`/api/sessions/${sessionId}/handoff`, { method: 'POST' }),

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

  // Intelligence
  getPatterns: (projectId?: string, search?: string) =>
    request<{ patterns: any[] }>(`/api/intelligence/patterns?${projectId ? `project_id=${projectId}&` : ''}${search ? `search=${encodeURIComponent(search)}` : ''}`),
  createPattern: (data: any) =>
    request<{ pattern: any }>('/api/intelligence/patterns', { method: 'POST', body: JSON.stringify(data) }),
  updatePattern: (id: string, data: any) =>
    request<{ pattern: any }>(`/api/intelligence/patterns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePattern: (id: string) =>
    request<{ success: boolean }>(`/api/intelligence/patterns/${id}`, { method: 'DELETE' }),
  getDebugMemory: (projectId?: string, search?: string) =>
    request<{ debug: any[] }>(`/api/intelligence/debug?${projectId ? `project_id=${projectId}&` : ''}${search ? `search=${encodeURIComponent(search)}` : ''}`),
  createDebug: (data: any) =>
    request<{ debug: any }>('/api/intelligence/debug', { method: 'POST', body: JSON.stringify(data) }),
  updateDebug: (id: string, data: any) =>
    request<{ debug: any }>(`/api/intelligence/debug/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDebug: (id: string) =>
    request<{ success: boolean }>(`/api/intelligence/debug/${id}`, { method: 'DELETE' }),
  matchError: (signature: string, message: string) =>
    request<{ match: any }>('/api/intelligence/debug/match', { method: 'POST', body: JSON.stringify({ error_signature: signature, error_message: message }) }),
  searchIntelligence: (q: string) =>
    request<{ results: any[] }>(`/api/intelligence/search?q=${encodeURIComponent(q)}`),
  globalSearch: (q: string) =>
    request<{ results: { projects: any[]; brains: any[]; sessions: any[]; patterns: any[]; debug: any[] }; total: number }>(
      `/api/intelligence/global-search?q=${encodeURIComponent(q)}`
    ),
  getLearningQueue: (projectId: string) =>
    request<{ patterns: any[]; debug: any[] }>(`/api/intelligence/learning-queue/${projectId}`),
  reviewLearningItem: (id: string, type: 'pattern' | 'debug', action: 'approve' | 'dismiss') =>
    request<{ success: boolean }>('/api/intelligence/learning-queue/review', {
      method: 'POST',
      body: JSON.stringify({ id, type, action }),
    }),

  // Notes
  getNote: (projectId: string) => request<{ note: any }>(`/api/notes/${projectId}`),
  saveNote: (projectId: string, content: string) =>
    request<{ success: boolean }>(`/api/notes/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  // Tasks
  getTasks: (projectId: string) => request<{ tasks: any[] }>(`/api/tasks/${projectId}`),
  createTask: (projectId: string, title: string) =>
    request<{ task: any }>(`/api/tasks/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  updateTask: (id: string, fields: any) =>
    request<{ task: any }>(`/api/tasks/item/${id}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    }),
  deleteTask: (id: string) =>
    request<{ success: boolean }>(`/api/tasks/item/${id}`, { method: 'DELETE' }),

  // Git
  getGitStatus: (projectId: string) => request<any>(`/api/git/${projectId}/status`),
  getGitLog: (projectId: string, limit = 20) => request<{ commits: any[] }>(`/api/git/${projectId}/log?limit=${limit}`),
  getGitDiff: (projectId: string) => request<{ diff: string; stagedDiff: string }>(`/api/git/${projectId}/diff`),
  getGitBranches: (projectId: string) => request<{ current: string; branches: string[] }>(`/api/git/${projectId}/branches`),
  gitPull: (projectId: string) => request<any>(`/api/git/${projectId}/pull`, { method: 'POST' }),
  gitPush: (projectId: string) => request<any>(`/api/git/${projectId}/push`, { method: 'POST' }),

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

  // Budget
  getBudgetStatus: () => request<{ limits: any[]; alerts: any[] }>('/api/budget/status'),
  updateBudgetLimit: (id: string, fields: any) =>
    request<{ success: boolean }>(`/api/budget/limits/${id}`, { method: 'PUT', body: JSON.stringify(fields) }),
  canSpawnSession: () => request<{ allowed: boolean; reason?: string }>('/api/budget/can-spawn'),
  acknowledgeBudgetAlert: (id: string) =>
    request<{ success: boolean }>(`/api/budget/alerts/${id}/ack`, { method: 'POST' }),
  acknowledgeBudgetAlertAll: () =>
    request<{ success: boolean }>('/api/budget/alerts/ack-all', { method: 'POST' }),

  // Remotion
  startRender: (projectId: string) =>
    request<{ job: any }>('/api/remotion/render', { method: 'POST', body: JSON.stringify({ project_id: projectId }) }),
  getRenderStatus: (jobId: string) =>
    request<{ job: any }>(`/api/remotion/status/${jobId}`),
  getLatestRender: (projectId: string) =>
    request<{ job: any }>(`/api/remotion/latest/${projectId}`),
  listRenders: () =>
    request<{ jobs: any[] }>('/api/remotion/list'),

  // Health
  health: () => request<{ status: string; activeSessions: number; activeTerminals: number }>('/api/health'),

  // MCP status
  mcpStatus: () =>
    fetch('http://localhost:4710', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }).then(r => r.json()).then(d => ({ running: true, tools: d.result?.tools || [] }))
      .catch(() => ({ running: false, tools: [] })),

  // Bridge status (Chrome extension connection)
  bridgeStatus: () =>
    request<{ connected: boolean; errors: number; network: number }>('/api/bridge/status')
      .catch(() => ({ connected: false, errors: 0, network: 0 })),

  // Settings
  getSettings: () => request<{ settings: Record<string, string> }>('/api/settings'),
  saveSetting: (key: string, value: string) =>
    request<{ success: boolean }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ key, value }),
    }),
  checkClaudeStatus: () =>
    request<{ installed: boolean; authenticated: boolean; version: string | null }>('/api/settings/claude-status'),
  validateApiKey: (apiKey: string) =>
    request<{ valid: boolean; error?: string }>('/api/settings/validate-key', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),
};
