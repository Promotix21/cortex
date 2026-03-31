export type TaskStatus = 'pending' | 'doing' | 'done' | 'blocked';

export interface Task {
  id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface Note {
  content: string;
  updated_at: string;
}

export interface GitStatus {
  branch: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  not_added: string[];
  created: string[];
  deleted: string[];
  renamed: string[];
  conflicted: string[];
  isClean: boolean;
}

export interface GitCommit {
  hash: string;
  hashShort: string;
  message: string;
  author: string;
  date: string;
}

export interface RenderJob {
  id: string;
  projectId: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  outputPath: string | null;
  progress: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface DocumentInfo {
  name: string;
  path: string;
  relativePath: string;
  ext: string;
  size: number;
  modified: string;
}

export interface ProjectSnapshot {
  id: string;
  projectId: string;
  branch: string;
  commitHash: string;
  diff: string;
  createdAt: string;
}

export interface SessionHistoryEntry {
  id: string;
  sessionId: string;
  type: 'prompt' | 'response' | 'command' | 'error';
  content: string;
  timestamp: string;
}
