export type ProjectStatus = 'active' | 'paused' | 'planning' | 'maintenance';

export type ProjectType =
  | 'node' | 'react' | 'nextjs' | 'nestjs' | 'express'
  | 'rust' | 'go' | 'python' | 'php' | 'laravel'
  | 'ruby' | 'java' | 'unknown';

export interface Project {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  git_enabled: boolean;
  status: ProjectStatus;
  last_opened: string;
  dev_server_port: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  path: string;
  status?: ProjectStatus;
  dev_server_port?: number | null;
}

export interface UpdateProjectInput {
  name?: string;
  status?: ProjectStatus;
  dev_server_port?: number | null;
}
