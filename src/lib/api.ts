import type { Project, CreateProjectInput } from '@/types/project';
import type { Session, UsageSummary } from '@/types/session';
import type { Terminal } from '@/types/terminal';
import type { Pattern, CreatePatternInput, DebugEntry, CreateDebugInput, BrainData, ChatMessage, GlobalSearchResults, LearningQueueItem } from '@/types/intelligence';
import type { BudgetLimit, BudgetAlert } from '@/types/budget';
import type { Task, GitStatus, GitCommit, RenderJob, DocumentInfo, ProjectSnapshot, SessionHistoryEntry } from '@/types/workspace';

export interface MemPalaceOverview {
  totalFacts: number;
  totalProjects: number;
  totalCompanies: number;
  factsByCompany: { company: string; count: number }[];
  factsByRoom: { room: string; count: number }[];
  topSubjects: { subject: string; count: number }[];
  crossProjectPatterns: number;
  companyInsights: number;
  lastSyncedAt: string | null;
}

export interface MemPalaceFact {
  id: string;
  projectId: string | null;
  projectName: string | null;
  company: string | null;
  subject: string;
  predicate: string;
  object: string;
  roomTag: string | null;
  confidence: string;
  source: string;
  validFrom: string;
  createdAt: string;
}

export interface MemPalaceInsight {
  id: string;
  company: string;
  insightType: string;
  title: string;
  description: string;
  projectIds: string[];
  confidence: string;
  updatedAt: string;
}

export interface MemPalacePattern {
  id: string;
  patternType: string;
  title: string;
  description: string;
  projectIds: string[];
  projectNames: string[];
  roomTag: string | null;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface LiveWorkItem {
  kind: 'session' | 'terminal';
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  status: string;
  startedAt: string;
  lastActive: string;
  terminalId: string | null;
  type?: string;
  promptCount?: number;
}

export interface LiveProjectGroup {
  projectId: string;
  projectName: string;
  items: LiveWorkItem[];
  count: number;
}

export interface ExplorerTreeNode {
  name: string;
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
  ext?: string;
  size?: number;
  children?: ExplorerTreeNode[];
}

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
  buildMemory: (id: string) =>
    request<{ success: boolean; factsCreated: number; factsRetired: number; errors: string[]; compressionStats: Record<string, unknown> | null }>(`/api/intelligence/build-memory/${id}`, { method: 'POST' }),
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
  getLiveWork: () =>
    request<{ items: LiveWorkItem[]; projects: LiveProjectGroup[] }>('/api/sessions/live'),
  getRecentSessions: (limit = 10, projectId?: string) =>
    request<{ sessions: (Session & { projectName: string })[] }>(`/api/sessions/recent?limit=${limit}${projectId ? `&project_id=${projectId}` : ''}`),
  getSession: (id: string) =>
    request<{ session: Session }>(`/api/sessions/${id}`),
  getSessionOutput: (id: string) =>
    request<{ output: string }>(`/api/sessions/${id}/output`),
  getSessionHistory: (id: string) =>
    request<{ history: SessionHistoryEntry[] }>(`/api/sessions/${id}/history`),
  getSessionTodos: (id: string) =>
    request<{ todos: Array<{ id: string; content: string; status: string; priority: string }> }>(`/api/sessions/${id}/todos`),
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
  getLiveTasks: (projectId: string) =>
    request<{
      groups: Array<{
        sessionId: string;
        sessionName: string;
        sessionStatus: string;
        lastActive: string;
        todos: Array<{ id?: string; content: string; status: string; priority?: string }>;
      }>;
      todos: Array<{ id?: string; content: string; status: string; priority?: string; sessionId: string; sessionName: string; sessionStatus: string }>;
    }>(`/api/tasks/${projectId}/live`),
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
  getBriefStatus: (projectId: string) =>
    request<{ exists: boolean; size: number; path?: string }>(`/api/chat/${projectId}/brief`),
  saveBrief: (projectId: string, content: string) =>
    request<{ success: boolean; path: string }>(`/api/chat/${projectId}/brief`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  clearBrief: (projectId: string) =>
    request<{ success: boolean }>(`/api/chat/${projectId}/brief`, { method: 'DELETE' }),
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

  // ── Explorer ─────────────────────────────────────────────
  getFileTree: (projectId: string, depth?: number) =>
    request<{ tree: ExplorerTreeNode[]; projectPath: string }>(`/api/explorer/${projectId}/tree${depth ? `?depth=${depth}` : ''}`),
  readFile: (projectId: string, filePath: string) =>
    request<{ content: string | null; type: 'text' | 'binary'; language?: string; size?: number; ext?: string }>(`/api/explorer/${projectId}/read?path=${encodeURIComponent(filePath)}`),
  writeFile: (projectId: string, filePath: string, content: string) =>
    request<{ success: boolean }>(`/api/explorer/${projectId}/write`, {
      method: 'PUT',
      body: JSON.stringify({ filePath, content }),
    }),
  renameFile: (projectId: string, oldPath: string, newName: string) =>
    request<{ success: boolean; newPath: string }>(`/api/explorer/${projectId}/rename`, {
      method: 'POST',
      body: JSON.stringify({ oldPath, newName }),
    }),
  createFileOrFolder: (projectId: string, parentPath: string, name: string, type: 'file' | 'directory') =>
    request<{ success: boolean; path: string; relativePath: string }>(`/api/explorer/${projectId}/create`, {
      method: 'POST',
      body: JSON.stringify({ parentPath, name, type }),
    }),
  deleteFileOrFolder: (projectId: string, filePath: string) =>
    request<{ success: boolean }>(`/api/explorer/${projectId}/delete?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' }),
  searchFiles: (projectId: string, query: string) =>
    request<{ results: { name: string; path: string; relativePath: string; type: 'file' | 'directory' }[] }>(`/api/explorer/${projectId}/search?q=${encodeURIComponent(query)}`),
  getRawFileUrl: (projectId: string, filePath: string) =>
    `${SIDECAR_URL}/api/explorer/${projectId}/raw?path=${encodeURIComponent(filePath)}`,

  // ── MemPalace (Global) ────────────────────────────────────
  mempalaceOverview: () =>
    request<MemPalaceOverview>('/api/mempalace/overview'),
  mempalaceSync: () =>
    request<{ factsCreated: number; factsRetired: number; patternsFound: number; insightsGenerated: number }>('/api/mempalace/sync', { method: 'POST' }),
  mempalaceFacts: (options?: { company?: string; room?: string; subject?: string; search?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (options?.company) params.set('company', options.company);
    if (options?.room) params.set('room', options.room);
    if (options?.subject) params.set('subject', options.subject);
    if (options?.search) params.set('search', options.search);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    return request<{ facts: MemPalaceFact[]; total: number }>(`/api/mempalace/facts?${params}`);
  },
  mempalaceCompanies: (company?: string) =>
    request<{ insights: MemPalaceInsight[] }>(`/api/mempalace/companies${company ? `?company=${encodeURIComponent(company)}` : ''}`),
  mempalacePatterns: (type?: string) =>
    request<{ patterns: MemPalacePattern[] }>(`/api/mempalace/patterns${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  mempalaceSearch: (q: string) =>
    request<{ facts: MemPalaceFact[]; patterns: MemPalacePattern[]; insights: MemPalaceInsight[] }>(`/api/mempalace/search?q=${encodeURIComponent(q)}`),

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

  // ── Cortex Hooks (Claude Code integration) ───────────────
  getHookStatus: () =>
    request<{ installed: boolean; scriptsExist: boolean; settingsHasHooks: boolean; events: string[] }>(
      '/api/intelligence/hooks/status',
    ),
  installHooks: () =>
    request<{ installed: boolean; scripts: string[]; events: string[]; alreadyInstalled: boolean }>(
      '/api/intelligence/hooks/install',
      { method: 'POST' },
    ),
  uninstallHooks: () =>
    request<{ removed: number }>('/api/intelligence/hooks/uninstall', { method: 'POST' }),

  // ── Backfill ─────────────────────────────────────────────
  startBackfill: () =>
    request<{ state: string; sessionsTotal: number }>('/api/intelligence/backfill/start', { method: 'POST' }),
  getBackfillStatus: () =>
    request<{
      state: string;
      sessionsProcessed: number;
      sessionsTotal: number;
      observationsCreated: number;
      factsCreated: number;
      errors: string[];
      startedAt: string | null;
      finishedAt: string | null;
    }>('/api/intelligence/backfill/status'),

  // ── Vault ────────────────────────────────────────────────
  vaultStatus: () =>
    request<{ available: boolean; reason?: string }>('/api/vault/status'),
  listCredentials: (projectId?: string | null) => {
    const q = projectId === undefined ? '' :
      projectId === null ? '?project_id=global' : `?project_id=${encodeURIComponent(projectId)}`;
    return request<{
      credentials: Array<{
        id: string;
        projectId: string | null;
        kind: string;
        name: string;
        description: string;
        lastUsed: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/api/vault/list${q}`);
  },
  createCredential: (data: {
    project_id?: string | null;
    kind: string;
    name: string;
    description?: string;
    fields: Record<string, string>;
  }) =>
    request<{ credential: { id: string; name: string; kind: string } }>(
      '/api/vault/credentials',
      { method: 'POST', body: JSON.stringify(data) },
    ),
  updateCredential: (id: string, patch: {
    name?: string;
    description?: string;
    kind?: string;
    fields?: Record<string, string>;
  }) =>
    request<{ credential: { id: string; name: string; kind: string } }>(
      `/api/vault/credentials/${id}`,
      { method: 'PUT', body: JSON.stringify(patch) },
    ),
  deleteCredential: (id: string) =>
    request<{ success: boolean }>(`/api/vault/credentials/${id}`, { method: 'DELETE' }),
  revealCredential: (id: string, reason: string) =>
    request<{
      summary: { id: string; name: string; kind: string };
      fields: Record<string, string>;
    }>(`/api/vault/credentials/${id}/reveal`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  vaultAudit: (credentialId?: string) => {
    const q = credentialId ? `?credential_id=${encodeURIComponent(credentialId)}` : '';
    return request<{
      entries: Array<{
        id: string;
        credentialId: string;
        sessionId: string | null;
        reason: string;
        caller: string;
        createdAt: string;
      }>;
    }>(`/api/vault/audit${q}`);
  },

  // ── Brain Panel ──────────────────────────────────────────
  getBrainPanel: (projectId: string) =>
    request<{
      project: { id: string; name: string; path: string };
      brain: {
        summary: string;
        architecture_notes: string;
        conventions: string;
        decisions: string;
        known_issues: string;
        updated_at: string;
      } | null;
      observations: Array<{
        id: string;
        kind: string;
        title: string;
        before_state: string;
        after_state: string;
        files_touched: string[];
        room_tag: string | null;
        source: string;
        created_at: string;
      }>;
      rooms: Array<{ room: string; count?: number; factCount?: number }>;
      hookStats: {
        total: number;
        byType: Record<string, number>;
        recent: Array<{
          hook_type: string;
          tool_name: string | null;
          query: string | null;
          result_count: number;
          created_at: string;
        }>;
      };
    }>(`/api/intelligence/brain-panel/${projectId}`),

  // ── Providers ────────────────────────────────────────────
  getProviderStatus: () =>
    request<{
      activeProvider: 'claude-cli' | 'bedrock' | 'devstral' | 'kimi';
      activeModel: string;
      providers: Array<{
        id: string;
        displayName: string;
        isActive: boolean;
        models: Array<{ id: string; label: string }> | string[];
        region?: string;
      }>;
      usageStats?: any[];
    }>('/api/providers/status')
      .catch(() => ({ activeProvider: 'claude-cli' as const, activeModel: '', providers: [] })),

  switchProvider: (provider: 'claude-cli' | 'bedrock' | 'devstral' | 'kimi', model?: string) =>
    request<{ success: boolean; activeProvider: string; activeModel: string; message: string }>(
      '/api/providers/switch',
      { method: 'POST', body: JSON.stringify({ provider, model }) },
    ),

  testBedrock: () =>
    request<{ ok: boolean; region?: string; model?: string; error?: string; name?: string }>(
      '/api/providers/bedrock/test',
    ).catch(err => ({ ok: false, error: err.message })),
};
