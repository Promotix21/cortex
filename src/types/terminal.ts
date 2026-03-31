export type TerminalType = 'shell' | 'ai_session' | 'dev_server' | 'git';
export type TerminalStatus = 'running' | 'stopped' | 'error';

export interface Terminal {
  id: string;
  projectId: string;
  name: string;
  type: TerminalType;
  status: TerminalStatus;
  pid: number | null;
  createdAt: string;
}
