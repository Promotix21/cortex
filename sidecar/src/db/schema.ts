export const SCHEMA_SQL = `
-- ============================================================
-- CORTEX DATABASE SCHEMA v2.1 — 33 tables
-- ============================================================

-- Core Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'unknown',
  icon TEXT NOT NULL DEFAULT '',
  git_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','planning','maintenance')),
  last_opened TEXT NOT NULL DEFAULT (datetime('now')),
  dev_server_port INTEGER,
  completion_estimate INTEGER DEFAULT NULL,
  completion_indicators TEXT DEFAULT NULL,
  cli_tools TEXT DEFAULT NULL,
  ssh_configured INTEGER DEFAULT 0,
  ssh_hosts TEXT DEFAULT NULL,
  deploy_method TEXT DEFAULT NULL,
  company TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  history_json TEXT NOT NULL DEFAULT '[]',
  last_summary TEXT,
  system_prompt TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS terminals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'shell' CHECK(type IN ('shell','ai_session','dev_server','git')),
  process_id INTEGER,
  status TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('running','stopped','error')),
  scrollback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','doing','done','blocked')),
  linked_chat_msg_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspace (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Claude Code Session Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS claude_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','idle','completed','error')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active TEXT NOT NULL DEFAULT (datetime('now')),
  terminal_id TEXT REFERENCES terminals(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS session_metrics (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES claude_sessions(id) ON DELETE CASCADE,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  token_usage_input INTEGER NOT NULL DEFAULT 0,
  token_usage_output INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_history (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES claude_sessions(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  response_summary TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage_daily (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  token_total INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, date)
);

-- Intelligence Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS project_brain (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  architecture_notes TEXT NOT NULL DEFAULT '',
  known_issues TEXT NOT NULL DEFAULT '',
  decisions TEXT NOT NULL DEFAULT '',
  conventions TEXT NOT NULL DEFAULT '',
  dependencies_notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pattern_memory (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  source_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project','reusable')),
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.0,
  user_rating INTEGER,
  confidence TEXT NOT NULL DEFAULT 'unverified' CHECK(confidence IN ('verified','probable','unverified','deprecated')),
  last_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS debug_memory (
  id TEXT PRIMARY KEY,
  problem TEXT NOT NULL,
  root_cause TEXT NOT NULL DEFAULT '',
  solution TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  source_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project','reusable')),
  error_signature TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.0,
  user_rating INTEGER,
  confidence TEXT NOT NULL DEFAULT 'unverified' CHECK(confidence IN ('verified','probable','unverified','deprecated')),
  last_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reference Intelligence Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  doc_url TEXT,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tool_versions (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  release_notes TEXT,
  release_date TEXT,
  UNIQUE(tool_id, version)
);

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  os TEXT NOT NULL DEFAULT 'linux' CHECK(os IN ('linux','windows','mac','all')),
  command TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  deprecated INTEGER NOT NULL DEFAULT 0,
  replacement TEXT
);

CREATE TABLE IF NOT EXISTS api_changes (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK(change_type IN ('breaking','deprecation','addition','removal')),
  old_usage TEXT,
  new_usage TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_tools (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  pinned_version TEXT NOT NULL,
  PRIMARY KEY (project_id, tool_id)
);

-- Snapshot & Execution Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS project_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES claude_sessions(id) ON DELETE SET NULL,
  git_commit TEXT,
  active_branch TEXT,
  uncommitted_files TEXT NOT NULL DEFAULT '[]',
  open_terminals TEXT NOT NULL DEFAULT '[]',
  running_services TEXT NOT NULL DEFAULT '[]',
  env_hash TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS execution_history (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES claude_sessions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK(action_type IN ('file_edit','file_create','file_delete','command_run','git_operation')),
  file_changed TEXT,
  command_run TEXT,
  diff_summary TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Playbook Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tech_stack TEXT NOT NULL DEFAULT '[]',
  steps_json TEXT NOT NULL DEFAULT '[]',
  author TEXT NOT NULL DEFAULT 'user',
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playbook_runs (
  id TEXT PRIMARY KEY,
  playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES claude_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','completed','failed','aborted')),
  current_step INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Console Bridge Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS captured_errors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL DEFAULT 'unknown',
  message TEXT NOT NULL,
  stack TEXT,
  source TEXT,
  error_signature TEXT,
  matched_debug_id TEXT REFERENCES debug_memory(id) ON DELETE SET NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS captured_network (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  failed INTEGER NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI Policy Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS execution_policies (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  action_pattern TEXT NOT NULL,
  policy TEXT NOT NULL CHECK(policy IN ('allow','restrict','approve')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS context_priorities (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  priority_weight REAL NOT NULL DEFAULT 1.0,
  max_tokens INTEGER NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Background & Index Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  result TEXT,
  last_run TEXT,
  next_run TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS file_index (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'unknown',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  last_modified TEXT,
  summary TEXT,
  UNIQUE(project_id, file_path)
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  priority INTEGER NOT NULL DEFAULT 0,
  prompt TEXT,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS file_locks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES claude_sessions(id) ON DELETE CASCADE,
  locked_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  UNIQUE(project_id, file_path)
);

CREATE TABLE IF NOT EXISTS execution_groups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES claude_sessions(id) ON DELETE CASCADE,
  operation_set_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','incomplete','rolled_back')),
  rollback_available INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Budget Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS budget_limits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  limit_type TEXT NOT NULL CHECK(limit_type IN ('messages_per_5h', 'hours_per_7d', 'tokens_per_day', 'sessions_per_day')),
  limit_value REAL NOT NULL,
  warn_at_pct REAL NOT NULL DEFAULT 0.8,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_alerts (
  id TEXT PRIMARY KEY,
  limit_id TEXT NOT NULL REFERENCES budget_limits(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('warning', 'exceeded', 'reset')),
  current_value REAL NOT NULL,
  limit_value REAL NOT NULL,
  message TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_limit ON budget_alerts(limit_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_ack ON budget_alerts(acknowledged);

-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects(last_opened DESC);
CREATE INDEX IF NOT EXISTS idx_claude_sessions_project ON claude_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_claude_sessions_status ON claude_sessions(status);
CREATE INDEX IF NOT EXISTS idx_session_history_session ON session_history(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_daily_project_date ON usage_daily(project_id, date);
CREATE INDEX IF NOT EXISTS idx_pattern_memory_tags ON pattern_memory(tags);
CREATE INDEX IF NOT EXISTS idx_pattern_memory_confidence ON pattern_memory(confidence);
CREATE INDEX IF NOT EXISTS idx_debug_memory_signature ON debug_memory(error_signature);
CREATE INDEX IF NOT EXISTS idx_debug_memory_confidence ON debug_memory(confidence);
CREATE INDEX IF NOT EXISTS idx_captured_errors_project ON captured_errors(project_id);
CREATE INDEX IF NOT EXISTS idx_captured_errors_signature ON captured_errors(error_signature);
CREATE INDEX IF NOT EXISTS idx_execution_history_session ON execution_history(session_id);
CREATE INDEX IF NOT EXISTS idx_project_snapshots_project ON project_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_file_index_project ON file_index(project_id);
CREATE INDEX IF NOT EXISTS idx_file_locks_project ON file_locks(project_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);

-- Additional indexes for common query patterns (Phase 3B)
CREATE INDEX IF NOT EXISTS idx_session_metrics_session ON session_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_session_history_timestamp ON session_history(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_captured_network_project ON captured_network(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_terminals_project ON terminals(project_id);
CREATE INDEX IF NOT EXISTS idx_playbook_runs_playbook ON playbook_runs(playbook_id);
CREATE INDEX IF NOT EXISTS idx_playbook_runs_project ON playbook_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_project ON agent_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_execution_policies_project ON execution_policies(project_id);
CREATE INDEX IF NOT EXISTS idx_context_priorities_project ON context_priorities(project_id);
CREATE INDEX IF NOT EXISTS idx_captured_errors_timestamp ON captured_errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_captured_network_timestamp ON captured_network(timestamp DESC);
`;
