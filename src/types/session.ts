export type SessionStatus = 'running' | 'idle' | 'completed' | 'error';

export interface Session {
  id: string;
  projectId: string;
  name: string;
  status: SessionStatus;
  startedAt: string;
  lastActive: string;
  pid: number | null;
  promptCount: number;
  tokenUsageInput: number;
  tokenUsageOutput: number;
}

export interface UsageSummary {
  today: {
    promptCount: number;
    tokenTotal: number;
    sessionCount: number;
  };
  byProject: {
    projectId: string;
    promptCount: number;
    tokenTotal: number;
  }[];
}
