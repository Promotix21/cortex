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
  room_tag TEXT,
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
  terminal_id TEXT REFERENCES terminals(id) ON DELETE SET NULL,
  claude_session_id TEXT DEFAULT NULL,
  session_output TEXT DEFAULT NULL
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
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until TEXT DEFAULT NULL,
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
  room_tag TEXT,
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
  room_tag TEXT,
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

-- Server & Deployment Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT,
  host TEXT,
  ssh_user TEXT,
  ssh_port INTEGER DEFAULT 22,
  deploy_url TEXT,
  notes TEXT,
  co_deployed_apps TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_servers (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  deploy_branch TEXT,
  deploy_command TEXT,
  env_file_path TEXT,
  deploy_docs_content TEXT,
  last_deployed TEXT,
  PRIMARY KEY (project_id, server_id)
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

-- v2.5: Import graph for Impact Preview
CREATE TABLE IF NOT EXISTS file_imports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  raw_specifier TEXT NOT NULL,
  UNIQUE(project_id, source_path, raw_specifier)
);
CREATE INDEX IF NOT EXISTS idx_file_imports_target ON file_imports(project_id, target_path);
CREATE INDEX IF NOT EXISTS idx_file_imports_source ON file_imports(project_id, source_path);
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

-- MemPalace: Knowledge Graph (Temporal Facts)
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_graph (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  room_tag TEXT,
  confidence TEXT NOT NULL DEFAULT 'probable' CHECK(confidence IN ('verified','probable','unverified','deprecated')),
  source TEXT NOT NULL DEFAULT 'auto' CHECK(source IN ('auto','user','scan','mcp')),
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kg_project ON knowledge_graph(project_id);
CREATE INDEX IF NOT EXISTS idx_kg_subject ON knowledge_graph(subject);
CREATE INDEX IF NOT EXISTS idx_kg_room ON knowledge_graph(room_tag);
CREATE INDEX IF NOT EXISTS idx_kg_valid ON knowledge_graph(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_kg_active ON knowledge_graph(project_id, valid_until);

-- MemPalace: AAAK Compression Cache
-- ============================================================

CREATE TABLE IF NOT EXISTS aaak_cache (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_field TEXT NOT NULL,
  original_tokens INTEGER NOT NULL DEFAULT 0,
  compressed_text TEXT NOT NULL,
  compressed_tokens INTEGER NOT NULL DEFAULT 0,
  room_tag TEXT,
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until TEXT DEFAULT NULL,
  UNIQUE(project_id, source_field, room_tag)
);

CREATE INDEX IF NOT EXISTS idx_aaak_project ON aaak_cache(project_id);

-- MemPalace: Global Knowledge (Cross-Project)
-- ============================================================

CREATE TABLE IF NOT EXISTS global_knowledge (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT,
  company TEXT,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  room_tag TEXT,
  confidence TEXT NOT NULL DEFAULT 'probable'
    CHECK(confidence IN ('verified','probable','unverified','deprecated')),
  source TEXT NOT NULL DEFAULT 'aggregated'
    CHECK(source IN ('aggregated','user','cross_project','manual')),
  source_fact_id TEXT,
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gk_company ON global_knowledge(company);
CREATE INDEX IF NOT EXISTS idx_gk_project ON global_knowledge(project_id);
CREATE INDEX IF NOT EXISTS idx_gk_subject ON global_knowledge(subject);
CREATE INDEX IF NOT EXISTS idx_gk_room ON global_knowledge(room_tag);
CREATE INDEX IF NOT EXISTS idx_gk_active ON global_knowledge(valid_until);

-- MemPalace: Company Insights (Aggregated per Company)
-- ============================================================

CREATE TABLE IF NOT EXISTS company_insights (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  insight_type TEXT NOT NULL
    CHECK(insight_type IN ('tech_stack','common_pattern','shared_issue','convention','summary')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  project_ids TEXT NOT NULL DEFAULT '[]',
  confidence TEXT NOT NULL DEFAULT 'probable',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company, insight_type, title)
);

CREATE INDEX IF NOT EXISTS idx_ci_company ON company_insights(company);
CREATE INDEX IF NOT EXISTS idx_ci_type ON company_insights(insight_type);

-- MemPalace: Cross-Project Patterns
-- ============================================================

CREATE TABLE IF NOT EXISTS cross_project_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL
    CHECK(pattern_type IN ('shared_tech','recurring_issue','common_convention','architecture_pattern')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  project_ids TEXT NOT NULL DEFAULT '[]',
  project_names TEXT NOT NULL DEFAULT '[]',
  room_tag TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(pattern_type, title)
);

CREATE INDEX IF NOT EXISTS idx_cpp_type ON cross_project_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_cpp_room ON cross_project_patterns(room_tag);

-- Hook telemetry: every time a Claude Code hook calls back into the sidecar
-- ============================================================

CREATE TABLE IF NOT EXISTS hook_consults (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT,
  hook_type TEXT NOT NULL CHECK(hook_type IN ('prime','hint','session_end')),
  tool_name TEXT,
  query TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  cwd TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hook_consults_project ON hook_consults(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hook_consults_type ON hook_consults(hook_type);

-- Typed session observations: structured "fixes / decisions / discoveries" per session
-- ============================================================

CREATE TABLE IF NOT EXISTS session_observations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('fix','decision','discovery','gotcha','feature','refactor')),
  title TEXT NOT NULL,
  before_state TEXT NOT NULL DEFAULT '',
  after_state TEXT NOT NULL DEFAULT '',
  files_touched TEXT NOT NULL DEFAULT '[]',
  room_tag TEXT,
  confidence TEXT NOT NULL DEFAULT 'probable' CHECK(confidence IN ('verified','probable','unverified','deprecated')),
  source TEXT NOT NULL DEFAULT 'auto' CHECK(source IN ('auto','user','backfill','session_end')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_session_obs_project ON session_observations(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_obs_kind ON session_observations(kind);
CREATE INDEX IF NOT EXISTS idx_session_obs_session ON session_observations(session_id);

-- Backfill marker on claude_sessions
-- ============================================================
-- Tracks whether a historical session has already been processed by the backfill worker.
-- Idempotent: rerunning backfill is a no-op for marked sessions.

-- (Adds backfilled_at column if missing — handled by ensureSchemaMigrations on boot)

-- Credential vault
-- ============================================================
-- Encrypted at rest with AES-256-GCM; key lives in OS keyring (libsecret).
-- The sidecar never writes the master key to disk — it's loaded once on boot.
-- Plaintext fields ARE NEVER stored.

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN (
    'ssh','wordpress','shopify','smtp','backend_panel',
    'api_key','db','app_user','github','other'
  )),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  last_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_credentials_project ON credentials(project_id);
CREATE INDEX IF NOT EXISTS idx_credentials_kind ON credentials(kind);

-- Audit log: every reveal is recorded so the user can see what Claude (or the UI) accessed.
CREATE TABLE IF NOT EXISTS credential_access (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  session_id TEXT,
  reason TEXT NOT NULL,
  caller TEXT NOT NULL CHECK(caller IN ('mcp','ui','hook','api')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cred_access_cred ON credential_access(credential_id, created_at DESC);

-- Live TodoWrite snapshots captured by the PostToolUse hook
-- ============================================================
-- The interactive Claude Code TUI renders TodoWrite as colored text, not JSON.
-- The PostToolUse hook captures the structured todos and posts them here so
-- the live tasks sidebar can render them in real time.

CREATE TABLE IF NOT EXISTS session_todos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  cwd TEXT,
  todos_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id)
);

CREATE INDEX IF NOT EXISTS idx_session_todos_session ON session_todos(session_id);

-- AI Provider Accounts
-- ============================================================
-- Stores registered Claude CLI accounts and Bedrock configs.
-- active_provider in settings table controls which one is in use.

CREATE TABLE IF NOT EXISTS ai_accounts (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL CHECK(provider_type IN ('claude-cli', 'bedrock')),
  display_name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Provider Usage Tracking
-- ============================================================
-- Tracks token counts and latency per Bedrock call for cost visibility.

CREATE TABLE IF NOT EXISTS provider_usage (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  model_id TEXT NOT NULL,
  session_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_provider_usage_provider ON provider_usage(provider_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_usage_project ON provider_usage(project_id, created_at DESC);
`;
