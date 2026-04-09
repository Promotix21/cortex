import type { Project, CreateProjectInput } from '@/types/project';
import type { Session, UsageSummary } from '@/types/session';
import type { Terminal } from '@/types/terminal';
import type { Pattern, CreatePatternInput, DebugEntry, CreateDebugInput, BrainData, ChatMessage, GlobalSearchResults, LearningQueueItem } from '@/types/intelligence';
import type { BudgetLimit, BudgetAlert } from '@/types/budget';
import type { Task, GitStatus, GitCommit, RenderJob, DocumentInfo, ProjectSnapshot, SessionHistoryEntry } from '@/types/workspace';

// Dynamic sidecar URL: in Tauri production, reads from env/config; in dev, uses localhost
const SIDECAR_PORT = (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__CORTEX_SIDECAR_PORT__) || 4700;
const SIDECAR_URL = `http://localhost:${SIDECAR_PORT}`;

/** Exported so other files don't hardcode localhost:4700 */
export const getSidecarUrl = () => SIDECAR_URL;

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
  // ── Projects ──────────────────────────────────────────────
  getProjects: () =>
    request<{ projects: Project[] }>('/api/projects'),
  getProject: (id: string) =>
    request<{ project: Project }>(`/api/projects/${id}`),
  createProject: (data: CreateProjectInput) =>
    request<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProject: (id: string, data: Partial<Project>) =>
    request<{ project: Project }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  updateProjectIcon: (id: string, icon: string) =>
    request<{ project: Project }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ icon }),
    }),
  deleteProject: (id: string) =>
    request<{ success: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  scanProject: (id: string) =>
    request<{ scan: Record<string, unknown> }>(`/api/projects/${id}/scan`, { method: 'POST' }),
  getProjectContextSummary: (id: string) =>
    request<{ project: { id: string; name: string; path: string; type: string }; context: string }>(`/api/projects/context-summary/${id}`),
  browseFolder: () =>
    request<{ path: string | null; name?: string; cancelled?: boolean }>('/api/projects/browse', { method: 'POST' }),
  getProjectDocuments: (id: string) =>
    request<{ documents: DocumentInfo[]; total: number }>(`/api/projects/${id}/documents`),
  readDocument: (id: string, filePath: string) =>
    request<{ content: string; type: string }>(`/api/projects/${id}/documents/read?path=${encodeURIComponent(filePath)}`),

  // ── Sessions ──────────────────────────────────────────────
  getSessions: (projectId?: string) =>
    request<{ sessions: Session[] }>(projectId ? `/api/sessions?project_id=${projectId}` : '/api/sessions'),
  getActiveSessions: () =>
    request<{ sessions: Session[] }>('/api/sessions/active'),
  getRecentSessions: (limit = 10) =>
    request<{ sessions: (Session & { projectName: string })[] }>(`/api/sessions/recent?limit=${limit}`),
  getSession: (id: string) =>
    request<{ session: Session }>(`/api/sessions/${id}`),
  getSessionOutput: (id: string) =>
    request<{ output: string }>(`/api/sessions/${id}/output`),
  getSessionHistory: (id: string) =>
    request<{ history: SessionHistoryEntry[] }>(`/api/sessions/${id}/history`),
  spawnSession: (projectId: string, name: string) =>
    request<{ session: Session }>('/api/sessions', {
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
    request<{ session: Session; terminalId: string }>(`/api/sessions/${id}/resume`, { method: 'POST' }),
  getUsageSummary: () =>
    request<UsageSummary>('/api/sessions/usage'),
  getSnapshots: (projectId: string) =>
    request<{ snapshots: ProjectSnapshot[] }>(`/api/sessions/snapshots/${projectId}`),
  getSessionHandoff: (sessionId: string) =>
    request<{ handoff: string | null }>(`/api/sessions/${sessionId}/handoff`),
  generateHandoff: (sessionId: string) =>
    request<{ written: boolean; path: string }>(`/api/sessions/${sessionId}/handoff`, { method: 'POST' }),

  // ── Terminals ─────────────────────────────────────────────
  getTerminals: (projectId?: string) =>
    request<{ terminals: Terminal[] }>(projectId ? `/api/terminals?project_id=${projectId}` : '/api/terminals'),
  getTerminal: (id: string) =>
    request<{ terminal: Terminal }>(`/api/terminals/${id}`),
  getTerminalOutput: (id: string) =>
    request<{ output: string }>(`/api/terminals/${id}/output`),
  pollTerminal: (id: string, sinceSeq: number) =>
    request<{ chunks: { seq: number; data: string }[]; nextSeq: number }>(`/api/terminals/${id}/poll?since=${sinceSeq}`),
  spawnTerminal: (projectId: string, name: string, type = 'shell', command?: string) =>
    request<{ terminal: Terminal }>('/api/terminals', {
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
    request<{ terminal: Terminal }>(`/api/terminals/${id}/restart`, { method: 'POST' }),
  killTerminal: (id: string) =>
    request<{ success: boolean }>(`/api/terminals/${id}`, { method: 'DELETE' }),
  saveClipboardImage: (data: string, mimeType: string) =>
    request<{ path: string; filename: string }>('/api/terminals/save-image', {
      method: 'POST',
      body: JSON.stringify({ data, mimeType }),
    }),
  /** Read image from system clipboard via wl-paste/xclip, save to temp file */
  getClipboardImage: () =>
    request<{ hasImage: boolean; path?: string; filename?: string }>('/api/terminals/clipboard-image', {
      method: 'POST',
    }),

  // ── Intelligence ──────────────────────────────────────────
  getPatterns: (projectId?: string, search?: string) =>
    request<{ patterns: Pattern[] }>(`/api/intelligence/patterns?${projectId ? `project_id=${projectId}&` : ''}${search ? `search=${encodeURIComponent(search)}` : ''}`),
  createPattern: (data: CreatePatternInput) =>
    request<{ pattern: Pattern }>('/api/intelligence/patterns', { method: 'POST', body: JSON.stringify(data) }),
  updatePattern: (id: string, data: Partial<Pattern>) =>
    request<{ pattern: Pattern }>(`/api/intelligence/patterns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePattern: (id: string) =>
    request<{ success: boolean }>(`/api/intelligence/patterns/${id}`, { method: 'DELETE' }),
  getDebugMemory: (projectId?: string, search?: string) =>
    request<{ debug: DebugEntry[] }>(`/api/intelligence/debug?${projectId ? `project_id=${projectId}&` : ''}${search ? `search=${encodeURIComponent(search)}` : ''}`),
  createDebug: (data: CreateDebugInput) =>
    request<{ debug: DebugEntry }>('/api/intelligence/debug', { method: 'POST', body: JSON.stringify(data) }),
  updateDebug: (id: string, data: Partial<DebugEntry>) =>
    request<{ debug: DebugEntry }>(`/api/intelligence/debug/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDebug: (id: string) =>
    request<{ success: boolean }>(`/api/intelligence/debug/${id}`, { method: 'DELETE' }),
  matchError: (signature: string, message: string) =>
    request<{ match: DebugEntry | null }>('/api/intelligence/debug/match', {
      method: 'POST',
      body: JSON.stringify({ error_signature: signature, error_message: message }),
    }),
  searchIntelligence: (q: string) =>
    request<{ results: Array<Pattern | DebugEntry> }>(`/api/intelligence/search?q=${encodeURIComponent(q)}`),
  globalSearch: (q: string) =>
    request<{ results: GlobalSearchResults; total: number }>(
      `/api/intelligence/global-search?q=${encodeURIComponent(q)}`
    ),
  getLearningQueue: (projectId: string) =>
    request<{ patterns: LearningQueueItem[]; debug: LearningQueueItem[] }>(`/api/intelligence/learning-queue/${projectId}`),
  reviewLearningItem: (id: string, type: 'pattern' | 'debug', action: 'approve' | 'dismiss') =>
    request<{ success: boolean }>('/api/intelligence/learning-queue/review', {
      method: 'POST',
      body: JSON.stringify({ id, type, action }),
    }),

  // ── Notes ─────────────────────────────────────────────────
  getNote: (projectId: string) =>
    request<{ note: { content: string; updated_at: string } }>(`/api/notes/${projectId}`),
  saveNote: (projectId: string, content: string) =>
    request<{ success: boolean }>(`/api/notes/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  // ── Tasks ─────────────────────────────────────────────────
  getTasks: (projectId: string) =>
    request<{ tasks: Task[] }>(`/api/tasks/${projectId}`),
  createTask: (projectId: string, title: string) =>
    request<{ task: Task }>(`/api/tasks/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  updateTask: (id: string, fields: Partial<Task>) =>
    request<{ task: Task }>(`/api/tasks/item/${id}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    }),
  deleteTask: (id: string) =>
    request<{ success: boolean }>(`/api/tasks/item/${id}`, { method: 'DELETE' }),

  // ── Git ───────────────────────────────────────────────────
  getGitStatus: (projectId: string) =>
    request<GitStatus>(`/api/git/${projectId}/status`),
  getGitLog: (projectId: string, limit = 20) =>
    request<{ commits: GitCommit[] }>(`/api/git/${projectId}/log?limit=${limit}`),
  getGitDiff: (projectId: string) =>
    request<{ diff: string; stagedDiff: string }>(`/api/git/${projectId}/diff`),
  getGitBranches: (projectId: string) =>
    request<{ current: string; branches: string[] }>(`/api/git/${projectId}/branches`),
  gitPull: (projectId: string) =>
    request<{ success: boolean; summary: string }>(`/api/git/${projectId}/pull`, { method: 'POST' }),
  gitPush: (projectId: string) =>
    request<{ success: boolean; summary: string }>(`/api/git/${projectId}/push`, { method: 'POST' }),

  // ── Chat / Brain ──────────────────────────────────────────
  getChatHistory: (projectId: string) =>
    request<{ history: ChatMessage[] }>(`/api/chat/${projectId}`),
  clearChat: (projectId: string) =>
    request<{ success: boolean }>(`/api/chat/${projectId}`, { method: 'DELETE' }),
  getProjectBrain: (projectId: string) =>
    request<{ brain: BrainData }>(`/api/chat/brain/${projectId}`),
  updateProjectBrain: (projectId: string, fields: Partial<BrainData>) =>
    request<{ brain: BrainData }>(`/api/chat/brain/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    }),

  // ── Budget ────────────────────────────────────────────────
  getBudgetStatus: () =>
    request<{ limits: BudgetLimit[]; alerts: BudgetAlert[] }>('/api/budget/status'),
  updateBudgetLimit: (id: string, fields: Partial<BudgetLimit>) =>
    request<{ success: boolean }>(`/api/budget/limits/${id}`, { method: 'PUT', body: JSON.stringify(fields) }),
  canSpawnSession: () =>
    request<{ allowed: boolean; reason?: string }>('/api/budget/can-spawn'),
  acknowledgeBudgetAlert: (id: string) =>
    request<{ success: boolean }>(`/api/budget/alerts/${id}/ack`, { method: 'POST' }),
  acknowledgeBudgetAlertAll: () =>
    request<{ success: boolean }>('/api/budget/alerts/ack-all', { method: 'POST' }),

  // ── Remotion ──────────────────────────────────────────────
  startRender: (projectId: string) =>
    request<{ job: RenderJob }>('/api/remotion/render', { method: 'POST', body: JSON.stringify({ project_id: projectId }) }),
  getRenderStatus: (jobId: string) =>
    request<{ job: RenderJob }>(`/api/remotion/status/${jobId}`),
  getLatestRender: (projectId: string) =>
    request<{ job: RenderJob | null }>(`/api/remotion/latest/${projectId}`),
  listRenders: () =>
    request<{ jobs: RenderJob[] }>('/api/remotion/list'),

  // ── Health ────────────────────────────────────────────────
  health: () =>
    request<{ status: string; activeSessions: number; activeTerminals: number }>('/api/health'),

  // ── MCP ───────────────────────────────────────────────────
  mcpStatus: () =>
    fetch(`http://localhost:${Number(SIDECAR_PORT) + 10}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }).then(r => r.json()).then((d: { result?: { tools?: { name: string; description: string }[] } }) => ({
      running: true,
      tools: d.result?.tools || [],
    })).catch(() => ({ running: false, tools: [] as { name: string; description: string }[] })),

  // ── Bridge ────────────────────────────────────────────────
  bridgeStatus: () =>
    request<{ connected: boolean; bridgeServer?: boolean; chromeExtension?: boolean }>('/api/bridge/status')
      .catch(() => ({ connected: false })),

  // ── Settings ──────────────────────────────────────────────
  getSettings: () =>
    request<{ settings: Record<string, string> }>('/api/settings'),
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
  clearAllData: () =>
    request<{ success: boolean; tablesCleared: number }>('/api/settings/clear-data', { method: 'POST' }),
};
