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
  icon?: string;
  git_enabled: boolean;
  status: ProjectStatus;
  last_opened: string;
  dev_server_port: number | null;
  completion_estimate: number | null;
  completion_indicators: string | null;
  cli_tools: string | null;
  ssh_configured: boolean;
  ssh_hosts: string | null;
  deploy_method: string | null;
  company: string | null;
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
  icon?: string;
}
