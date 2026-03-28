# Cortex — Product Requirements Document v2.1

> **One brain. All your context. Zero switching costs.**

An AI-native desktop command center for developers managing multiple projects simultaneously. Cortex is the GUI layer that Claude Code never had — owning sessions, capturing errors, building intelligence, and eliminating context loss across every project you touch.

---

**Version:** 2.1 MVP+
**Platform:** Linux (AppImage / .deb / .rpm)
**Stack:** Tauri + React + Express Sidecar + SQLite
**License:** MIT (Open Source)
**Author:** Hiraya Digital

---

## Table of Contents

1. [Overview & Vision](#1-overview--vision)
2. [Target Users](#2-target-users)
3. [Technology Stack](#3-technology-stack)
4. [Core Features (MVP)](#4-core-features-mvp)
5. [Claude Code Session Manager](#5-claude-code-session-manager)
6. [Intelligence Builder](#6-intelligence-builder)
7. [Reference Intelligence](#7-reference-intelligence)
8. [Console Bridge Integration](#8-console-bridge-integration)
9. [AI Orchestrator Layer](#9-ai-orchestrator-layer)
10. [Project Playbooks](#10-project-playbooks)
11. [UI Architecture](#11-ui-architecture)
12. [Database Schema](#12-database-schema)
13. [Build Phases](#13-build-phases)
14. [Development Constraints](#14-development-constraints)
15. [Engineering Risks](#15-engineering-risks)
16. [Non-Goals (MVP)](#16-non-goals-mvp)
17. [Performance Limits](#17-performance-limits)
18. [Security Model](#18-security-model)
19. [AI Execution Policy](#19-ai-execution-policy)
20. [Context Construction Algorithm](#20-context-construction-algorithm)
21. [Acceptance Criteria](#21-acceptance-criteria)
22. [Post-MVP Roadmap](#22-post-mvp-roadmap)
23. [Remotion Studio Integration](#23-remotion-studio-integration)

---

## 1. Overview & Vision

### The Problem

Every developer using AI coding assistants in 2026 faces the same wall: **context fragmentation**. You're managing 5-10 active projects simultaneously — each with their own terminal sessions, AI conversation history, git state, task lists, and debugging context. Every switch costs you mental state.

Worse — if you're a Claude Code power user running hybrid workflows, you have:
- Anonymous Claude Code sessions with no ownership
- No visibility into what AI is doing across projects
- Context lost when you switch terminals
- No session history tied to a project
- Zero usage tracking per project (critical for agency billing)
- Errors captured in browser/server with no automatic flow into AI context

### The Solution

Cortex is the **missing command center**: a Tauri-based desktop app that gives every project its own persistent brain, terminal environment, AI chat, Claude Code session ownership, and real-time error intelligence — all resumable instantly.

### What Makes Cortex Different

| Capability | Current State | With Cortex |
|---|---|---|
| Claude Code sessions | Anonymous, unmanaged | Named, project-owned, resumable, tracked |
| AI context per project | Lost on terminal close | Persistent brain with patterns + debug memory |
| Error debugging | Manual copy-paste from browser | Auto-captured, injected into AI context |
| Project switching | Full context loss | Zero-cost instant resume |
| Usage tracking | None | Per-project quota tracking for billing |
| Cross-project patterns | Siloed in your head | Searchable pattern + debug memory |

### Strategic Position

Cortex becomes **infrastructure that Claude Code users depend on** — not just a nice tool. This targets the "ecosystem quietly depends on" exception clause for Anthropic Claude for Open Source eligibility. A Linux-first, Claude-native developer workspace with no existing equivalent in the OSS ecosystem.

---

## 2. Target Users

| Tier | Users |
|---|---|
| **Primary** | Agency developers, freelancers managing multiple client projects, AI-assisted coders, multi-repo engineers |
| **Secondary** | Startup engineers, DevOps, Claude Code power users, Linux developers |
| **Key Persona** | A developer at Hiraya Digital managing 8 client projects, needing per-project Claude usage tracking for billing, and tired of losing AI context every time they switch |

---

## 3. Technology Stack

| Layer | Technologies |
|---|---|
| **Desktop** | Tauri (Rust core), Tauri Shell Plugin, Tauri FS Plugin |
| **Frontend** | React, TypeScript, Vite, ShadCN UI, Zustand, xterm.js |
| **Backend (Sidecar)** | Node.js, Express, node-pty, simple-git, better-sqlite3 |
| **AI** | Claude CLI, Claude SDK (primary), OpenAI API (optional) |
| **Error Intelligence** | claude-console-bridge (WebSocket + HTTP + MCP), chrome-console-for-claude (Chrome extension) |
| **Packaging** | Linux AppImage, .deb, .rpm |

---

## 4. Core Features (MVP)

### 4.1 Project Management

- Add projects manually or auto-detect from folder path
- Auto-detect git repo and tech stack type (package.json, Cargo.toml, go.mod, etc.)
- Persist metadata: status (Active / Paused / Planning / Maintenance), last opened, notes
- Sidebar project list with search, recents, and status indicators
- Project health dashboard: git state, running terminals, active AI sessions, error count

### 4.2 Terminal Management

- Spawn multiple terminal sessions per project via node-pty + xterm.js
- Tab-based interface with rename, restart, kill, and clear
- Terminal types: **Shell**, **AI Session** (Claude Code), **Dev Server**, **Git**
- Terminals are project-bound and persist across app sessions
- Terminal output scrollback saved for resume

### 4.3 Per-Project AI Chat

- Each project has a dedicated Claude conversation with stored history
- Context notes and custom system prompt per project
- **Project Brain auto-injection**: AI receives project summary, architecture notes, known issues, and key decisions as context
- Chat interface with message history, scroll, export, and clear
- AI session data scoped per project — zero context bleed across projects

### 4.4 Project Notes & Tasks

- Plain markdown notes with autosave per project
- Task tracker with status: Pending / Doing / Done / Blocked
- Tasks linkable to AI chat messages (for traceability)

### 4.5 Git Integration

- Live fetch of git status, current branch, uncommitted files, last commit log via simple-git
- Git commands: status, branch, log, pull, push
- Visual indicators for dirty state and branch name in project header
- Diff viewer for uncommitted changes

### 4.6 Workspace Resume

- On launch, Cortex restores the last active project: open terminals, active tab, AI chat position, layout state
- Zero setup on restart — this is the core productivity promise
- Persisted in `workspace` table as JSON state

### 4.7 Remotion Studio (Promotion Engine)

- **Baked-in Video Generation**: Generate programmatic video assets directly within Cortex
- **Promotion Ideas**: AI-generated marketing angles and feature reels based on project milestones
- **Interactive Steps**: Videos that follow a structured, step-by-step sequence for technical walkthroughs
- **One-Click Render**: Export `.mp4` walkthroughs using the project's Remotion templates

### 4.8 Context Injector (Phase 0 — Implemented)

The foundation of Cortex intelligence. Before every Claude Code session spawn, `context-injector.ts` assembles a `.cortex-context.md` file in the project directory containing:
- **Project Brain** (summary, architecture, conventions, known issues, decisions, dependencies)
- **Verified Patterns** from pattern memory
- **Recent Errors** captured from dev tools / console bridge
- **Debug Solutions** from debug memory
- **Server/Deployment Info**
- **Masterpiece Design Rules** (if enabled)

All sections respect a configurable **token budget** (default: 11,500 tokens) with priority-based truncation. Custom budgets per project via `context_priorities` table.

### 4.9 Budget Guard (Phase 1 — Implemented)

Rate limit monitoring to prevent hitting Claude Max subscription caps:
- **4 default limits**: Messages/5h (45), Hours/7d (167), Tokens/day (500K), Sessions/day (20)
- **Warning at 80%**, session spawn blocked at 100%
- **BudgetGuard banner** — shows active warnings/exceeded limits at the top of the app
- **BudgetSettings** — toggle limits, adjust thresholds, per-limit progress bars
- **Background job** checks budgets every 5 minutes, creates timestamped alerts
- DB tables: `budget_limits`, `budget_alerts`

### 4.10 Handoff Generator (Phase 2 — Implemented)

Automatic handoff document generation when a session ends:
- Queries session_history, session_metrics, project_snapshots, debug_memory
- Outputs `NEXT_SESSION_PROMPT.md` with: file read order, context summary, session activity, git state, known issues, debug solutions, architecture, troubleshooting guide
- **HandoffViewer** component: markdown preview + copy to clipboard + regenerate button
- "Handoff" button on completed session cards in the dashboard

### 4.11 Auto-Learning Pipeline (Phase 3 — Implemented)

Automatically populates intelligence from session activity:
- **Session Analyzer** parses session output for error signatures (10+ regex patterns), file changes, and repeated code blocks
- Creates `unverified` entries in `debug_memory` and `pattern_memory`
- **LearningQueue UI**: Shows auto-detected entries with approve/dismiss buttons
- Approved entries promoted to `probable`; dismissed entries marked `deprecated`
- Background worker auto-analyzes recently completed sessions

### 4.12 Masterpiece Mode (Phase 4 — Implemented)

Design philosophy injection toggle:
- **masterpiece-context.ts** contains award-worthy design rules: Lenis scroll, GSAP animations, Catppuccin palette, desktop-quality UI, structured build phases, pre-commit gates
- Toggle in Settings panel — when enabled, rules injected into:
  - Chat system prompt (via `chat-service.ts`)
  - `.cortex-context.md` (via context-injector, priority 8)
- Stored in `settings` table as `masterpiece_mode = true/false`

### 4.13 MCP Server (Phase 5 — Implemented)

Bidirectional Model Context Protocol integration:
- **Cortex as MCP Server** (port 4710): JSON-RPC over HTTP with 6 tools:
  - `get_project_brain`, `search_patterns`, `match_error`, `get_file_index`, `get_server_info`, `get_context`
- **MCP Client**: Connects to external MCP servers (e.g., console-bridge)
- Claude Code can auto-discover Cortex intelligence via MCP

### 4.14 Chrome Extension (Phase 6 — Implemented)

`cortex-chrome-bridge` — Manifest V3 Chrome extension:
- **Content script**: Intercepts `console.error`, `console.warn`, unhandled errors, unhandled promise rejections, failed fetch/XHR
- **Background service worker**: WebSocket to sidecar (fallback: HTTP), network request monitoring for 4xx/5xx
- **Popup UI**: Connection status, error/network queue counts
- Auto-routes errors by matching tab URL to project's dev_server_port

### 4.15 Drag & Drop File Attachment (Phase 8 — Implemented)

- **FileDropZone** component in chat input: drag files to attach
- File pills with name, size, remove button
- File contents included in message (up to 50KB per file, 1MB max)
- Supports code files, text, and file path drops from system file explorer

### 4.16 Project Icons

- Per-project icon/emoji support (stored in `projects.icon` column)
- Emoji preset picker (20 common emojis) + custom URL/data URI input
- Displayed in sidebar ProjectItem and dashboard header
- Click-to-edit in dashboard overview

---

## 5. Claude Code Session Manager

> **The killer differentiator. The feature that makes Cortex infrastructure, not just a tool.**

### 5.1 Named Claude Code Sessions

Every project in Cortex spawns and **owns** named Claude Code sessions. Sessions are not anonymous terminal processes — they are first-class entities with identity.

| Property | Description |
|---|---|
| `session_id` | Unique identifier (UUID) |
| `project_id` | Owning project (foreign key) |
| `name` | User-assigned name (e.g., "refactor-auth", "debug-api") |
| `status` | Running / Paused / Completed / Error |
| `started_at` | Session start timestamp |
| `last_active` | Last interaction timestamp |
| `prompt_count` | Number of prompts sent |
| `token_usage` | Estimated tokens consumed (input + output) |
| `last_context` | Serialized context state for resume |
| `terminal_id` | Bound terminal session |

### 5.2 Session Dashboard

A unified view of **all Claude Code sessions across all projects**:

- Real-time status of every running session
- Which project each session belongs to
- Current activity indicator (idle / processing / waiting for input)
- Quick-switch: click a session to jump to its project + terminal
- Session history: completed sessions with summary of what was accomplished

### 5.3 Session Resume

When you reopen a project, Cortex restores the exact Claude Code session:

- **Warm resume**: If the Claude Code process is still alive, reconnect to it
- **Context resume**: If the process died, spawn a new session and inject the last conversation context + project brain as system prompt
- **Smart prompt**: On resume, Cortex sends a context-restoration prompt: _"You were working on [project]. Here's the project brain context and your last conversation summary. Continue from where we left off."_

### 5.4 Cross-Session Visibility

See what Claude Code is doing in Project A while you're working in Project B:

- **Activity feed**: Real-time stream of all session outputs across projects
- **Process monitor view**: CPU/memory/status of each Claude Code process
- **Alert system**: Get notified when a session in another project completes, errors out, or needs input

### 5.5 Project Context Snapshotting

Every time a session starts, pauses, or the user switches projects, Cortex captures a **project state snapshot** — so AI can say: _"Last time you worked here you were on branch X fixing Y with 3 uncommitted files."_

| Field | Description |
|---|---|
| `project_id` | Owning project |
| `session_id` | Associated Claude Code session (nullable) |
| `git_commit` | Current HEAD commit hash |
| `active_branch` | Current git branch |
| `uncommitted_files` | List of dirty files |
| `open_terminals` | Terminal names and types |
| `running_services` | Dev servers, watchers, etc. (detected via process list) |
| `env_hash` | Hash of .env file (not contents — for change detection) |
| `timestamp` | When snapshot was taken |

**How it flows:**
- On session resume, the latest snapshot is compared to current state
- AI receives a diff: "Since your last session: branch changed from X to Y, 2 new uncommitted files, dev server is not running"
- Dramatically improves resume intelligence — AI understands what changed while you were away

### 5.6 Execution History

Track what AI actually did — not just what was asked. Every action Claude Code takes through Cortex is logged:

| Field | Description |
|---|---|
| `session_id` | Which session performed the action |
| `action_type` | `file_edit`, `file_create`, `file_delete`, `command_run`, `git_operation` |
| `file_changed` | Path of affected file (nullable) |
| `command_run` | Shell command executed (nullable) |
| `diff_summary` | Condensed diff or command output |
| `timestamp` | When action occurred |

**Why this matters:**
- Answer "What did AI actually do?" after a session
- Audit trail for debugging when something breaks
- Execution history feeds into Pattern Memory (auto-detect reusable patterns post-MVP)
- Enables undo/rollback capabilities in future versions

### 5.7 Usage Tracking Per Project

Critical for agency billing and quota management:

| Metric | Tracked Per |
|---|---|
| Prompt count | Session, Project, Global |
| Estimated token usage | Session, Project, Global |
| Session duration | Session, Project |
| Active time vs idle time | Session |
| Daily/weekly/monthly aggregates | Project, Global |

- **Export**: CSV/JSON export of usage data per project for client billing
- **Budget alerts**: Set per-project token budgets with warnings at 80%/100%
- **Cost estimation**: Map token usage to approximate API cost

---

## 6. Intelligence Builder

> **Cortex gets smarter the more you use it. Per-project and cross-project.**

The Intelligence Builder is a structured learning layer so Cortex improves over time by remembering patterns, debugging knowledge, architecture decisions, and reusable solutions.

### 6.1 Project Brain (Project-Specific)

Each project has a dedicated brain that serves as persistent AI context:

| Field | Description |
|---|---|
| `summary` | One-paragraph project description (what it is, what it does) |
| `architecture_notes` | Tech stack, folder structure, key patterns, deployment model |
| `known_issues` | Active bugs, workarounds, technical debt |
| `decisions` | Key architectural decisions with rationale (ADR-lite) |
| `conventions` | Code style, naming conventions, commit message format |
| `dependencies_notes` | Critical dependencies, version constraints, known conflicts |

**How it flows into AI:**
- When chatting within a project, the Project Brain is **automatically injected** as system context
- When a Claude Code session starts, the brain is included in the initial prompt
- When the console bridge captures errors, they're matched against `known_issues` before creating new entries

### 6.2 Pattern Memory (Cross-Project)

Save reusable code patterns that transcend any single project:

| Field | Description |
|---|---|
| `title` | Pattern name (e.g., "NestJS guard with role-based access") |
| `description` | What it solves and when to use it |
| `code` | The actual pattern/snippet |
| `tags` | Searchable tags (e.g., `nestjs`, `auth`, `guard`) |
| `source_project` | Which project it originated from |
| `scope` | `project-specific` or `reusable` (cross-project) |
| `usage_count` | How many times it's been referenced |

**How it works:**
- Manual save from AI chat ("Save this as a pattern")
- Searchable across all projects by tag, title, or description
- AI can suggest relevant patterns when you're working on a similar problem
- Patterns marked `reusable` appear in suggestions across all projects

### 6.3 Debug Memory (Cross-Project)

Never solve the same bug twice:

| Field | Description |
|---|---|
| `problem` | Error message or symptom description |
| `root_cause` | What actually caused it |
| `solution` | How it was fixed (code, config change, etc.) |
| `source_project` | Where it was first encountered |
| `tags` | Searchable tags |
| `scope` | `project-specific` or `reusable` |
| `error_signature` | Normalized error pattern for auto-matching |

**How it works:**
- Manual save from AI chat or debug session
- **Auto-match**: When the console bridge captures a new error, Cortex checks `error_signature` against existing debug memories — if there's a match, it surfaces the known solution immediately
- Cross-project search: "Have I seen this error before in any project?"

### 6.4 Pattern Confidence Scoring

Not all patterns should be reused. A pattern saved once and never validated is not the same as one used 20 times successfully. Every pattern and debug solution carries a confidence score:

| Signal | Weight | Description |
|---|---|---|
| `usage_count` | High | How many times this pattern was applied |
| `success_rate` | High | Did projects using this pattern avoid re-encountering the problem? |
| `last_used` | Medium | Recency — stale patterns decay in confidence |
| `user_rating` | High | Explicit thumbs up/down from user |
| `auto_match_count` | Low | How often debug memory auto-matched this signature |

**Confidence tiers:**
- **Verified** (score > 0.8) — actively suggested by AI across projects
- **Probable** (0.5 - 0.8) — shown in search results, not auto-suggested
- **Unverified** (< 0.5) — stored but hidden from AI context unless explicitly searched
- **Deprecated** — user-flagged as outdated, excluded from all contexts

**How it applies:**
- AI only auto-injects Verified patterns into context
- Context Budget Manager (Section 20) uses confidence to prioritize what fits in the token window
- Prevents AI from reusing bad or outdated patterns

### 6.5 Intelligence Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        INTELLIGENCE FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐     auto-inject      ┌──────────────────┐        │
│  │ Project  │ ──────────────────► │ AI Chat /         │        │
│  │ Brain    │                      │ Claude Code       │        │
│  └──────────┘                      │ Session           │        │
│       ▲                            └────────┬─────────┘        │
│       │ update                              │ save              │
│       │                                     ▼                   │
│  ┌──────────┐     search           ┌──────────────────┐        │
│  │ Debug    │ ◄─────────────────── │ Pattern          │        │
│  │ Memory   │                      │ Memory           │        │
│  └──────────┘                      └──────────────────┘        │
│       ▲                                                         │
│       │ auto-match                                              │
│       │                                                         │
│  ┌──────────────────────────────────────────┐                   │
│  │ Console Bridge (real-time error capture) │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
│  ─ ─ ─ ─ ─ ─ CROSS-PROJECT BOUNDARY ─ ─ ─ ─ ─ ─               │
│                                                                  │
│  Patterns + Debug solutions marked "reusable"                   │
│  are searchable and suggestable across ALL projects             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.6 File Awareness Index

AI knows the project brain, patterns, and errors — but not the actual code structure. The file index provides a lightweight project map so AI can reference controllers, routes, configs without scanning every time.

| Field | Description |
|---|---|
| `project_id` | Owning project |
| `file_path` | Relative path from project root |
| `file_type` | Detected type: controller, route, config, model, test, migration, etc. |
| `size_bytes` | File size |
| `last_modified` | Filesystem timestamp |
| `summary` | One-line description (post-MVP: AI-generated) |

**How it works:**
- On project open, walk the file tree (respecting .gitignore)
- Classify files by path patterns (e.g., `src/controllers/*.ts` → controller)
- Store in `file_index` table
- File watcher updates index on changes
- AI context receives a condensed file map: "This project has 12 controllers, 8 models, 23 routes..."
- Specific files referenced in context when relevant to the query

**MVP scope:** File tree walk + classification by path patterns. AI-generated summaries are post-MVP.

### 6.7 Intelligence Scoping Rules

| Data Type | Default Scope | Cross-Project? |
|---|---|---|
| Project Brain | Project-only | Never — each project has its own |
| Pattern Memory | Project-specific | Yes, if marked `reusable` |
| Debug Memory | Project-specific | Yes, if marked `reusable` |
| AI Chat History | Project-only | Never — isolated per project |
| Claude Code Sessions | Project-only | Visible in dashboard, but context stays scoped |
| Console Errors | Project-only | Debug auto-match searches cross-project |

**Key principle:** Context never bleeds. Cross-project intelligence is opt-in (mark as reusable) and read-only (searching, not injecting). A project's AI never receives another project's brain.

---

## 7. Reference Intelligence

> **Eliminate the #1 source of AI hallucination: stale documentation.**

Maintain accurate, version-pinned reference data for APIs, SDKs, and CLI tools. AI retrieves only version-matching commands.

### 7.1 Tool Registry

Add tools manually with: name, category, doc URL, last updated. Track multiple versions per tool with release notes and dates.

### 7.2 Version-Aware Commands

Store commands per tool, per version, per OS (Linux / Windows / Mac):

- Mark deprecated commands with replacement
- AI context only receives commands matching the selected version
- Never stale suggestions

### 7.3 API Change Tracking

Log breaking changes per version: change type, old usage, new usage, migration notes. Prevents AI from suggesting removed APIs.

### 7.4 Project-Tool Binding

Each project can declare which tools + versions it uses:

- `project_tools` junction table: project_id → tool_id + pinned version
- When AI chats within a project, only version-matched commands are available
- Alerts when a tool has newer versions with breaking changes

---

## 8. Console Bridge Integration

> **Leverage existing Hiraya Digital infrastructure: claude-console-bridge + chrome-console-for-claude**

### 8.1 Architecture

```
┌───────────────────────────────────┐
│     Chrome Extension              │
│  (chrome-console-for-claude)      │
│  • Console errors (React/Next.js) │
│  • Network requests/responses     │
│  • Smart error cleaning           │
└──────────┬────────────────────────┘
           │ WebSocket (port 9876)
           ▼
┌───────────────────────────────────┐
│     Console Bridge Server         │
│  (claude-console-bridge)          │
│  • WebSocket receiver             │
│  • HTTP API (port 9877)           │
│  • MCP Server for Claude          │
│  • File persistence (.json)       │
└──────────┬────────────────────────┘
           │ HTTP API / File watch
           ▼
┌───────────────────────────────────┐
│     Cortex Sidecar (Express)      │
│  • Polls /errors and /network     │
│  • Routes errors to project by    │
│    matching URL → project path    │
│  • Auto-creates debug memory      │
│    entries for new errors          │
│  • Injects error context into     │
│    active AI chat / Claude Code   │
│    session                        │
└───────────────────────────────────┘
```

### 8.2 Project-Error Routing

The bridge captures errors from any tab/server. Cortex routes them to the correct project:

| Signal | Matching Strategy |
|---|---|
| Page URL | Match `localhost:PORT` → project dev server config |
| Server source | Match process CWD or `source` field → project path |
| Manual binding | User assigns bridge port → project in settings |

### 8.3 Error-to-Intelligence Pipeline

When a new error arrives:

1. **Route** to correct project
2. **Normalize** error signature (strip line numbers, hashes, dynamic values)
3. **Search** debug memory for matching `error_signature`
4. **If match found**: Surface known solution in project's error panel + AI chat
5. **If no match**: Create new debug memory entry (problem filled, solution blank)
6. **Inject** error context into active Claude Code session or AI chat as real-time context

### 8.4 Network Intelligence

Network requests captured by the Chrome extension flow into Cortex:

- Failed requests (4xx, 5xx) auto-surface in project error panel
- Slow requests (configurable threshold) flagged
- Request/response pairs stored for AI debugging context
- API endpoint patterns tracked for reference intelligence

### 8.5 Bridge Lifecycle Management

Cortex manages the console bridge as a child process:

- **Auto-start**: Bridge server starts when Cortex launches
- **Health check**: Periodic ping to bridge HTTP API
- **Auto-restart**: Restart bridge if it crashes
- **Port config**: Configurable WebSocket (9876) and HTTP (9877) ports
- **Status indicator**: Bridge connection status in Cortex status bar

### 8.6 Background Intelligence Worker

When Cortex is idle, a background worker runs low-priority intelligence jobs:

| Job Type | Trigger | What It Does |
|---|---|---|
| `summarize_chat` | Chat history exceeds 50 messages | Condense old messages into summaries |
| `extract_patterns` | Post-MVP (manual for MVP) | Analyze chat for reusable patterns |
| `update_confidence` | Every 24 hours | Recalculate pattern/debug confidence scores |
| `compress_history` | Execution history exceeds 1000 entries | Archive old entries, keep summaries |
| `prune_snapshots` | Snapshots exceed 50 per project | Delete oldest, keep most recent |
| `index_files` | Project opened or file watcher triggers | Update lightweight file index |

Tracked in `background_jobs` table: job_type, project_id, status (pending/running/completed/failed), result, last_run, next_run.

**MVP scope:** Snapshot pruning and history compression only. Chat summarization and pattern extraction are post-MVP.

---

## 9. AI Orchestrator Layer

> **One brain layer to rule them all. Without this, intelligence logic spreads everywhere.**

Right now AI Chat, Claude Code Sessions, Intelligence Builder, Reference Intelligence, and Console Bridge are separate systems. The AI Orchestrator is the **single coordination layer** that unifies them.

### 9.1 Why This Exists

Without an orchestrator:
- AI Chat builds its own context from brain + history
- Claude Code sessions build their own context separately
- Console bridge injects errors into... where exactly?
- Reference intelligence gets queried... by whom?
- Pattern suggestions happen... how?

**Result:** duplicated logic, inconsistent context, scattered responsibilities.

### 9.2 Orchestrator Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   AI ORCHESTRATOR                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Context     │  │   Session    │  │    Tool      │  │
│  │   Builder     │  │   Manager    │  │    Router    │  │
│  │              │  │              │  │              │  │
│  │ Assembles    │  │ Spawns,      │  │ Routes AI    │  │
│  │ token-budget │  │ tracks,      │  │ requests to  │  │
│  │ context from │  │ resumes      │  │ correct      │  │
│  │ all sources  │  │ Claude Code  │  │ provider     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐  │
│  │  Reference   │  │   Memory     │  │  Execution   │  │
│  │  Injector    │  │   Selector   │  │  Policy      │  │
│  │              │  │              │  │              │  │
│  │ Adds version-│  │ Picks which  │  │ Enforces     │  │
│  │ matched tool │  │ patterns,    │  │ safety       │  │
│  │ commands to  │  │ debug items, │  │ boundaries   │  │
│  │ context      │  │ brain fields │  │ on actions   │  │
│  │              │  │ fit budget   │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 9.3 Orchestrator Responsibilities

| Component | Input | Output | When |
|---|---|---|---|
| **Context Builder** | Project brain, patterns, debug memory, errors, reference data, chat history | Token-budgeted system prompt | Every AI interaction |
| **Session Manager** | User intent (start/resume/stop session) | Managed Claude Code process with injected context | Session lifecycle events |
| **Tool Router** | AI request | Routed to Claude CLI, Claude SDK, or OpenAI API based on config | Every AI call |
| **Reference Injector** | Project's pinned tool versions | Version-matched commands added to context | Context assembly |
| **Memory Selector** | All available intelligence data + token budget | Prioritized subset that fits context window | Context assembly |
| **Execution Policy** | Proposed AI action | Allow / Restrict / Require Approval | Before every execution |

### 9.4 MVP Scope

For MVP, the orchestrator is a **single TypeScript module** (`src/orchestrator/index.ts`) — not a framework. It's a function pipeline:

```
buildContext(projectId) → assemblePrompt() → routeToProvider() → enforcePolicy() → execute()
```

No over-engineering. The abstraction exists so logic has one home, not six.

### 9.5 AI Lifecycle Pipeline

Every AI interaction flows through a formalized pipeline:

```
┌─────────┐     ┌────────────┐     ┌─────────────┐     ┌──────────┐     ┌───────────┐     ┌──────────────┐
│  Input   │ ──► │ Classifier │ ──► │   Context   │ ──► │  Policy  │ ──► │ Execution │ ──► │   Learning   │
│          │     │            │     │   Builder   │     │  Check   │     │           │     │   Update     │
└─────────┘     └────────────┘     └─────────────┘     └──────────┘     └───────────┘     └──────────────┘
  User prompt     Determine:        Assemble from:      Enforce:         Route to:         After response:
  or playbook     - intent type      - project brain     - allow/         - Claude CLI      - Log execution
  step            - target files     - patterns          restrict/       - Claude SDK       - Update confidence
                  - relevant         - debug memory      approve         - OpenAI API       - Capture patterns
                    tools            - errors            - scope check                      - Update file index
                  - scope            - reference data                                       - Queue background
                                     - file index                                            jobs
```

**Classifier** determines what kind of interaction this is:
- `code_edit` — AI will modify files
- `code_review` — AI reads and analyzes
- `command_exec` — AI runs shell commands
- `question` — AI answers without side effects
- `playbook_step` — Part of a playbook execution

This classification drives which context sources are prioritized and which policies apply.

---

## 10. Project Playbooks

> **Reusable workflows. The agency productivity multiplier.**

A playbook is a named, ordered sequence of steps that AI can execute for a project. Think of it as a recipe: "Set up a new NestJS project with auth, DB, and deployment."

### 10.1 Playbook Structure

| Field | Description |
|---|---|
| `id` | Unique identifier |
| `name` | Playbook name (e.g., "New Laravel Project Setup") |
| `description` | What this playbook accomplishes |
| `tech_stack` | Target stack tags (e.g., `laravel`, `php`, `mysql`) |
| `steps_json` | Ordered array of step objects |
| `author` | Who created it (user or "community" post-MVP) |
| `usage_count` | How many times executed |
| `last_used` | Recency |

### 10.2 Step Definition

Each step in `steps_json`:

```json
{
  "order": 1,
  "name": "Initialize database",
  "type": "command | ai_prompt | manual | checkpoint",
  "action": "php artisan migrate --seed",
  "description": "Run migrations and seed initial data",
  "requires_approval": true,
  "rollback": "php artisan migrate:rollback",
  "timeout_seconds": 120
}
```

**Step types:**
- `command` — shell command to execute
- `ai_prompt` — prompt sent to Claude Code session (e.g., "Scaffold auth controllers")
- `manual` — instruction for the user with a "Done" button
- `checkpoint` — pause for user review before continuing

### 10.3 Example Playbooks

**New PHP/Laravel Project:**
1. `command` — `composer create-project laravel/laravel .`
2. `manual` — "Configure .env with database credentials"
3. `command` — `php artisan migrate --seed`
4. `ai_prompt` — "Set up authentication scaffolding with Laravel Breeze"
5. `command` — `php artisan route:list` (verify)
6. `ai_prompt` — "Configure SMTP mail driver in config/mail.php"
7. `checkpoint` — "Review setup before proceeding"

**Debug Production Issue:**
1. `command` — `git stash && git pull origin main`
2. `ai_prompt` — "Analyze the last 5 error logs and identify root cause"
3. `checkpoint` — "Review AI analysis"
4. `ai_prompt` — "Write a fix for the identified issue"
5. `command` — `pnpm test`
6. `manual` — "QA the fix locally"
7. `command` — `git add . && git commit -m "fix: [description]"`

### 10.4 Playbook Execution

- Playbooks execute within a Claude Code session (new or existing)
- Each step shows status: Pending / Running / Completed / Failed / Skipped
- Failed steps pause execution — user can retry, skip, or abort
- `requires_approval: true` steps wait for user confirmation
- Execution history logged to `execution_history` table
- AI receives playbook context: "You are executing step 3 of 'New Laravel Project'. Previous steps completed successfully."

### 10.5 MVP Scope

- Manual playbook creation (JSON editor or form UI)
- Execute playbooks within a project
- Step-by-step progress tracking
- Post-MVP: community playbook sharing, AI-generated playbooks, playbook templates

---

## 11. UI Architecture

VSCode-inspired layout. Dark theme. Minimal animations. Productivity-first.

### 9.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ◉ Cortex    [Session Dashboard ▾]     [⚡ Bridge: Connected] │
├────────┬─────────────────────────────────────┬───────────────┤
│        │  Overview │ Terminal │ Git │ Notes   │               │
│  P     │─────────────────────────────────────│   AI Chat     │
│  R     │                                     │   Project     │
│  O     │         CENTER WORKSPACE            │   Brain       │
│  J     │                                     │   Reference   │
│  E     │  (tab content area)                 │   Lookup      │
│  C     │                                     │               │
│  T     │                                     │   Tasks       │
│  S     │                                     │               │
│        ├─────────────────────────────────────│   Errors      │
│  260px │  BOTTOM: Terminal Tabs + xterm.js   │   (live)      │
│        │  260px                               │   320px       │
├────────┴─────────────────────────────────────┴───────────────┤
│  Status: Project A │ main │ 3 dirty │ Claude: processing...  │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Key Views

| View | Content |
|---|---|
| **Project Sidebar** (260px) | Project list, search, recents, add button, status badges |
| **Overview Tab** | Project health: git state, running sessions, error count, recent activity |
| **Terminal Tab** | Tabbed terminals (Shell, Claude Code, Dev Server, Git) |
| **Git Tab** | Branch, status, uncommitted files, diff viewer, basic commands |
| **Notes Tab** | Markdown editor with autosave |
| **AI Chat** (right sidebar) | Per-project Claude chat with brain context |
| **Session Dashboard** (modal/overlay) | All Claude Code sessions across all projects |
| **Errors Panel** (right sidebar section) | Live error feed from console bridge |
| **Bottom Panel** (260px) | Active terminal output |

### 9.3 Session Dashboard View

Accessible from top bar — shows all Claude Code sessions globally:

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code Sessions                          [⟳ Refresh]  │
├─────────────────────────────────────────────────────────────┤
│  ● Running    refactor-auth        Project: client-portal   │
│               12 prompts · ~8.2k tokens · 23 min            │
│                                                              │
│  ● Running    debug-api-routes     Project: saas-backend    │
│               5 prompts · ~3.1k tokens · 8 min              │
│                                                              │
│  ○ Idle       setup-ci             Project: mobile-app      │
│               2 prompts · ~1.4k tokens · 45 min ago         │
│                                                              │
│  ✓ Completed  fix-auth-middleware  Project: client-portal   │
│               28 prompts · ~22k tokens · 1 hour ago         │
├─────────────────────────────────────────────────────────────┤
│  Today: 47 prompts · ~34.7k tokens                          │
│  This Week: client-portal 62% · saas-backend 28% · other 10%│
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Database Schema

SQLite via better-sqlite3. Monolithic schema, no ORM for MVP. Stored at user-configurable path (default: `~/.cortex/cortex.db`).

### Core Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `projects` | id, name, path, type, git_enabled, status, last_opened, dev_server_port | Core project registry |
| `ai_sessions` | project_id, history_json, last_summary, system_prompt | Per-project AI conversation |
| `terminals` | project_id, name, type, process_id, status, scrollback | Terminal process tracking |
| `notes` | project_id, content, updated_at | Markdown notes per project |
| `tasks` | project_id, title, status, linked_chat_msg_id | Task tracker |
| `workspace` | project_id, state_json | Resume state |

### Claude Code Session Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `claude_sessions` | id, project_id, name, status, started_at, last_active, terminal_id | Session registry |
| `session_metrics` | session_id, prompt_count, token_usage_input, token_usage_output, duration_seconds | Usage tracking |
| `session_history` | session_id, prompt_text, response_summary, timestamp | Conversation log |
| `usage_daily` | project_id, date, prompt_count, token_total, session_count | Daily aggregates for billing |

### Intelligence Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `project_brain` | project_id, summary, architecture_notes, known_issues, decisions, conventions, dependencies_notes | Per-project AI context |
| `pattern_memory` | id, title, description, code, tags, source_project_id, scope, usage_count | Reusable code patterns |
| `debug_memory` | id, problem, root_cause, solution, tags, source_project_id, scope, error_signature | Bug solution database |

### Reference Intelligence Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `tools` | id, name, category, doc_url, last_updated | Tool registry |
| `tool_versions` | id, tool_id, version, release_notes, release_date | Version tracking |
| `commands` | id, tool_id, version, os, command, description, deprecated, replacement | Version-aware commands |
| `api_changes` | id, tool_id, version, change_type, old_usage, new_usage, notes | Breaking change log |
| `project_tools` | project_id, tool_id, pinned_version | Project-tool binding |

### Snapshot & Execution Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `project_snapshots` | id, project_id, session_id, git_commit, active_branch, uncommitted_files, open_terminals, running_services, env_hash, timestamp | State snapshots for resume intelligence |
| `execution_history` | id, session_id, action_type, file_changed, command_run, diff_summary, timestamp | Audit trail of AI actions |

### Playbook Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `playbooks` | id, name, description, tech_stack, steps_json, author, usage_count, last_used | Reusable workflow recipes |
| `playbook_runs` | id, playbook_id, project_id, session_id, status, current_step, started_at, completed_at | Execution tracking |

### Console Bridge Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `captured_errors` | id, project_id, error_type, message, stack, source, error_signature, matched_debug_id, timestamp | Error log from bridge |
| `captured_network` | id, project_id, method, url, status_code, duration_ms, failed, timestamp | Network request log |

### AI Policy Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `execution_policies` | id, project_id, action_pattern, policy (allow/restrict/approve), reason | Per-project safety rules |
| `context_priorities` | id, project_id, source_type, priority_weight, max_tokens | Context budget allocation |

### Background & Index Tables

| Table | Key Fields | Purpose |
|---|---|---|
| `background_jobs` | id, job_type, project_id, status, result, last_run, next_run | Background intelligence worker queue |
| `file_index` | id, project_id, file_path, file_type, size_bytes, last_modified, summary | Lightweight project code structure map |
| `agent_tasks` | id, project_id, task_type, status, priority, prompt, result, created_at, completed_at | Future: background AI task queue |
| `file_locks` | id, project_id, file_path, session_id, locked_at, expires_at | Concurrent session file conflict prevention |
| `execution_groups` | id, session_id, operation_set_json, status, rollback_available, created_at | Atomic operation grouping for failure recovery |

**Total: 33 tables**

---

## 13. Build Phases

### Phase 1 — Foundation (Database + Project CRUD)

- Initialize Tauri project with React/Vite/ShadCN/Zustand frontend
- Set up Express sidecar with better-sqlite3
- Create full SQLite schema (all 28 tables)
- Project CRUD API + REST endpoints
- Sidebar project list UI with search and status badges
- Auto-detect git and tech stack from folder path

### Phase 2 — Claude Code Session Manager

- Session spawning: start named Claude Code sessions from Cortex
- Session registry in `claude_sessions` table
- Session dashboard UI (all sessions across projects)
- Session status tracking (running/idle/completed/error)
- Cross-session activity feed
- Usage metrics collection (prompt count, token estimation)
- Per-project usage aggregation in `usage_daily`
- Project context snapshotting on session start/stop/switch
- Execution history logging (what AI actually changed)
- _This is the README screenshot feature — ship it right after foundation_

### Phase 3 — Terminal Engine

- node-pty process spawning in Express sidecar
- xterm.js integration in React
- Tabbed terminal UI: rename, restart, kill, clear
- Terminal types: Shell, AI Session, Dev Server, Git
- Project-bound terminal persistence

### Phase 4 — AI Chat Panel

- Claude SDK integration in Express sidecar
- Per-project isolated chat with stored history
- Project Brain auto-injection into system prompt
- Chat UI: message history, scroll, export, clear
- "Save as pattern" / "Save as debug solution" from chat messages

### Phase 5 — Notes, Tasks & Git

- Markdown notes editor with autosave
- Task list with status tracking (Pending/Doing/Done/Blocked)
- simple-git integration: status, branch, log, pull, push
- Git status indicators in project header
- Diff viewer

### Phase 6 — Intelligence Builder

- Project Brain editor UI (summary, architecture, issues, decisions, conventions)
- Pattern Memory: save, tag, search, scope (project vs reusable), confidence scoring
- Debug Memory: save, tag, search, error signature matching, confidence scoring
- Cross-project search for patterns and debug solutions
- Brain context injection into AI chat and Claude Code sessions
- AI Orchestrator module: context builder, memory selector, reference injector

### Phase 7 — Console Bridge Integration

- Embed claude-console-bridge as managed child process
- Bridge health monitoring and auto-restart
- Error routing: match captured errors to projects (by URL/port/path)
- Error-to-debug-memory pipeline (normalize → search → match or create)
- Live error panel in right sidebar
- Network request logging per project
- Error context injection into active AI sessions

### Phase 8 — Reference Intelligence

- Tool registry UI: add, edit, categorize
- Version management: multiple versions per tool
- Command storage: per version, per OS, deprecation tracking
- API change log: breaking changes with migration notes
- Project-tool binding: pin tool versions per project
- AI context filtering: only version-matched commands

### Phase 9 — AI Execution Policy & Playbooks

- Execution policy engine: allow/restrict/approve rules per project
- Default safety boundaries (restrict rm -rf, sudo, etc.)
- User approval flow for restricted actions
- Playbook CRUD: create, edit, delete playbooks
- Playbook execution engine: step-by-step with progress tracking
- Playbook-to-session binding

### Phase 10 — Workspace Resume & Session Resume

- Full workspace state persistence (terminals, tabs, chat position, layout)
- Claude Code session resume (warm reconnect or context-restoration prompt)
- Snapshot-based resume intelligence ("Since your last session...")
- Zero-setup app restart
- Session history browsing (completed sessions with summaries)

### Phase 11 — Context Budget Manager

- Context priority configuration per project
- Token budget allocation across sources (brain, patterns, errors, history, reference)
- Context scoring and selection algorithm
- Budget monitoring dashboard

### Phase 12 — Polish & Packaging

- Usage export (CSV/JSON) for client billing
- Budget alerts per project
- AI provider configuration (Claude API key, model selection)
- Shell configuration (default shell, env vars)
- Linux packaging: AppImage, .deb, .rpm
- Performance optimization (<3s launch, <300MB memory)

---

## 14. Development Constraints

- **No microservices, Docker, or Kubernetes.** Monolithic architecture. Express sidecar + SQLite only.
- **No premature abstraction.** Simple, readable TypeScript. Stable libraries only.
- **Performance targets:** Launch <3s, Memory <300MB, 10 active projects, 5 simultaneous terminals, 5 concurrent Claude Code sessions.
- **Security:** Local-only storage. No telemetry. No cloud transmission. Secure process spawning. API keys stored encrypted.
- **UI:** Dark theme, minimal animations, VSCode-familiar layout. Productivity over aesthetics.
- **Intelligence isolation:** Project brains never cross-contaminate. Cross-project search is opt-in and read-only.
- **Console bridge:** Runs as child process, not a separate install. Bundled with Cortex.

---

## 15. Engineering Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Terminal + AI session synchronization** | Critical | node-pty buffering, Claude CLI interaction timing, and session reconnect are the hardest engineering problems. Not UI. Budget 40% of Phase 2-3 time here. Build a robust PTY abstraction layer early. |
| **Claude CLI process lifecycle** | High | Claude Code sessions are external processes. They can crash, hang, or lose connection. Implement heartbeat monitoring, graceful timeout, and automatic session state capture before process death. |
| **Context window overflow** | High | As projects accumulate intelligence, context can exceed token limits. Context Budget Manager (Section 20) must be implemented before intelligence features are fully connected. |
| **SQLite write contention** | Medium | Multiple terminals + bridge + session tracking writing simultaneously. Use WAL mode, batch writes, and a write queue in the sidecar. |
| **xterm.js + node-pty encoding** | Medium | Unicode, ANSI escape sequences, and large output buffers cause rendering issues. Cap scrollback buffer, implement output throttling. |
| **Bridge reliability** | Medium | WebSocket disconnects, Chrome extension updates breaking protocol. Implement reconnect backoff and protocol versioning. |
| **Snapshot storage growth** | Low | Frequent snapshots accumulate. Implement retention policy: keep last 50 per project, prune on startup. |

---

## 16. Non-Goals (MVP)

These are explicitly out of scope for MVP. Not "nice-to-haves we ran out of time for" — genuinely not intended.

- **Code editor** — Cortex is not VSCode. It manages projects and AI, not editing.
- **Multi-user collaboration** — Single developer tool. No real-time sync.
- **Cloud sync** — Everything is local. No accounts, no servers.
- **Plugin marketplace** — No extension API in MVP.
- **Auto-pattern extraction** — Intelligence Builder is manual-save in MVP. ML-based extraction is post-MVP.
- **Mobile/tablet support** — Desktop only.
- **Windows/macOS** — Linux first. Other platforms post-MVP.
- **LLM fine-tuning** — Cortex uses AI providers as-is. No model training.
- **Team features** — No shared libraries, no team dashboards.
- **CI/CD integration** — No pipeline management. Git operations only.

---

## 17. Performance Limits

| Metric | Target | Hard Limit | Measured How |
|---|---|---|---|
| App launch | < 3 seconds | 5 seconds | Time from process start to interactive UI |
| Memory (idle) | < 150 MB | 300 MB | RSS with 5 projects loaded, no active terminals |
| Memory (active) | < 300 MB | 500 MB | RSS with 5 terminals + 3 Claude Code sessions |
| Active projects | 10 | 20 | Projects loaded in sidebar simultaneously |
| Simultaneous terminals | 5 | 10 | Active node-pty processes |
| Concurrent Claude Code sessions | 5 | 8 | Active Claude CLI processes |
| SQLite DB size | < 100 MB typical | 1 GB | After 6 months of active use |
| Snapshot retention | 50 per project | 200 | Before auto-prune |
| Execution history retention | 1000 per session | 5000 | Before archival |
| Context assembly time | < 500 ms | 2 seconds | Time to build full AI context from all sources |
| Terminal scrollback | 10,000 lines | 50,000 lines | Per terminal buffer |

---

## 18. Security Model

### 18.1 Principles

- **Local-only by default** — no data leaves the machine unless the user explicitly exports
- **No telemetry** — zero analytics, crash reports, or usage tracking sent externally
- **Process isolation** — each terminal and Claude Code session runs in its own process with project-scoped CWD
- **Minimal permissions** — Tauri's allowlist restricts IPC to only needed commands

### 18.2 Sensitive Data Handling

| Data Type | Storage | Protection |
|---|---|---|
| API keys (Claude, OpenAI) | SQLite `settings` table | Encrypted at rest using OS keyring (libsecret on Linux) |
| .env file contents | Never stored | Only `env_hash` captured in snapshots for change detection |
| Git credentials | Never touched | Delegated to system git credential manager |
| Chat history | SQLite, local | No encryption (local threat model) — user can purge per project |
| Terminal scrollback | Memory + SQLite | Cleared on terminal close, optional persistence |

### 18.3 Process Security

- Terminal spawning via node-pty uses `shell: true` only with user's default shell
- No `eval()` or dynamic code execution from AI output
- Claude Code sessions run with the same permissions as the user — no privilege escalation
- Bridge server binds to `localhost` only — no network exposure
- WebSocket and HTTP ports configurable to avoid conflicts

---

## 19. AI Execution Policy

> **Define what AI is allowed to do before it becomes dangerous.**

### 19.1 Default Policy Tiers

| Tier | Actions | Behavior |
|---|---|---|
| **Allowed** | Read files, list directories, git status, git log, git diff, run tests, lint, type-check, build | Execute immediately, log to execution history |
| **Restricted** | `rm -rf`, `sudo *`, `chmod 777`, `curl \| bash`, package upgrades (`npm update`, `pip install --upgrade`), dropping DB tables | Blocked. AI receives: "This action is restricted by execution policy." |
| **Requires Approval** | `git push`, `git force-push`, DB migrations, deployment commands, writing to files outside project directory, installing new packages | Paused. User sees approval dialog with command preview. |

### 19.2 Per-Project Overrides

Projects can customize policies via `execution_policies` table:

```json
{
  "project_id": "abc123",
  "action_pattern": "npm install *",
  "policy": "allow",
  "reason": "This project uses frequent dependency additions"
}
```

- Overrides only loosen or tighten the default — never remove the Restricted tier entirely
- Override audit trail logged

### 19.3 Implementation

- Policy engine is a function in the AI Orchestrator: `enforcePolicy(action) → allow | restrict | approve`
- Pattern matching uses glob-style rules against command strings
- For file operations, path matching ensures writes stay within project directory
- Approval dialog shows: command, project, session name, and a diff preview if applicable
- All policy decisions logged to `execution_history` with `policy_result` field

### 19.4 MVP Scope

- Default policy tiers active out of the box
- Per-project override UI (simple rule editor)
- Approval dialog for Requires Approval tier
- Post-MVP: AI-suggested policy adjustments, team-shared policies

### 19.5 Failure Recovery Strategy

When AI modifies multiple files and crashes mid-operation:

**Execution Groups:**
- Before a multi-file operation, Cortex creates an `execution_group`
- Each file modification is logged with before/after state
- If the session crashes mid-operation, the group is marked `incomplete`
- On next session resume, user is prompted: "Last session modified 3/5 files before failing. Rollback or continue?"

**File Locking:**
- When a Claude Code session edits a file, a lock is acquired in `file_locks`
- Other sessions see: "This file is being edited by session 'refactor-auth'"
- Locks expire after 30 minutes of session inactivity (configurable)
- Prevents corruption when multiple sessions operate on the same project

**Recovery flow:**
1. Session crashes or user force-quits
2. On next launch, Cortex scans for incomplete execution groups
3. Shows recovery dialog: files modified, files pending, git diff preview
4. User chooses: Rollback (git checkout affected files) / Accept (keep changes) / Review (open diff)

---

## 20. Context Construction Algorithm

> **The most important algorithm in Cortex. Gets it wrong and token waste explodes. Gets it right and AI feels omniscient.**

### 20.1 The Problem

For any AI interaction, Cortex must assemble context from multiple sources. Each source has different value. The total must fit within the model's context window (typically 100k-200k tokens for Claude, but effective prompting uses far less).

### 20.2 Context Sources & Default Priority

| Source | Priority | Default Max Tokens | Decay |
|---|---|---|---|
| System prompt (role + project name) | Critical | 200 | None |
| Project Brain: summary | Critical | 500 | None |
| Project Brain: architecture notes | High | 1,000 | None |
| Project Brain: known issues | High | 500 | None |
| Project Brain: conventions | High | 300 | None |
| Active errors (from bridge) | High | 800 | Recency — last 30 min only |
| Recent chat history | High | 4,000 | Sliding window — last 10 messages |
| Project Brain: decisions | Medium | 500 | None |
| Matched debug solutions | Medium | 600 | Confidence-weighted |
| Reference commands (version-matched) | Medium | 800 | Relevance to current query |
| Verified patterns | Medium | 600 | Confidence-weighted |
| Snapshot diff ("since last session") | Medium | 400 | Only on session resume |
| Execution history summary | Low | 300 | Last 5 actions only |
| Older chat history | Low | 1,000 | Summarized, not raw |
| Unverified patterns | Excluded | 0 | Never auto-included |

**Default total budget: ~11,500 tokens** for context assembly (configurable per project).

### 20.3 Assembly Algorithm

```
function buildContext(projectId, query, budget):
  1. Start with Critical sources (always included, non-negotiable)
  2. Score remaining sources by:
     - Priority weight
     - Relevance to current query (keyword match)
     - Recency (recent errors > old errors)
     - Confidence (verified patterns > unverified)
  3. Fill budget top-down by score until budget exhausted
  4. If over budget, truncate lowest-priority sources first
  5. Return assembled context + metadata (what was included, what was cut)
```

### 20.4 Configurability

Users can adjust per project via `context_priorities` table:
- Raise/lower priority weights for any source
- Set per-source max token limits
- Set total budget
- Disable sources entirely (e.g., "don't include patterns for this project")

### 20.5 Transparency

The AI Chat panel shows a collapsible "Context used" section:
- Which sources were included
- Token count per source
- What was excluded and why
- Total tokens used vs budget

This builds user trust and helps debugging when AI seems to "not know" something.

---

## 21. Acceptance Criteria

### Core
- [ ] Developer can add and manage multiple projects from one dashboard
- [ ] Terminal sessions spawn correctly, persist names, and are project-bound
- [ ] AI chat works per project with isolated history and brain context injection
- [ ] Notes and tasks persist correctly across restarts
- [ ] Git status, branch, and uncommitted files display correctly
- [ ] Workspace resumes correctly on app restart — zero re-setup

### Claude Code Session Manager
- [ ] Named Claude Code sessions can be spawned per project
- [ ] Session dashboard shows all sessions across all projects with real-time status
- [ ] Sessions resume context when reopening a project
- [ ] Cross-session visibility works (see Project A's session while in Project B)
- [ ] Usage tracking captures prompt count and token estimates per session
- [ ] Per-project usage aggregates are correct and exportable

### Intelligence
- [ ] Project Brain saves and auto-injects into AI context
- [ ] Pattern Memory is searchable across projects (reusable scope)
- [ ] Debug Memory matches error signatures and surfaces known solutions
- [ ] Intelligence scoping rules are enforced (no context bleed)

### Console Bridge
- [ ] Bridge starts automatically with Cortex
- [ ] Browser errors route to correct project
- [ ] New errors auto-create debug memory entries
- [ ] Known errors surface existing solutions
- [ ] Error context injects into active AI sessions

### Reference Intelligence
- [ ] Tool reference entries are retrievable by version and OS
- [ ] Project-tool bindings filter AI context to pinned versions
- [ ] Deprecated commands show replacements

### Snapshots & Execution History
- [ ] Snapshots captured on session start/stop/switch
- [ ] Resume shows diff: "Since your last session, branch changed, 2 new files..."
- [ ] Execution history answers "What did AI do?" for any session

### AI Safety & Policy
- [ ] Default execution policy blocks rm -rf, sudo, and other restricted commands
- [ ] Requires Approval tier pauses and shows approval dialog
- [ ] Per-project policy overrides work correctly
- [ ] All policy decisions logged to execution history

### Context & Orchestrator
- [ ] Context assembly fits within token budget
- [ ] Priority-weighted source selection works correctly
- [ ] "Context used" transparency panel shows what was included/excluded
- [ ] AI Orchestrator routes all AI interactions through single pipeline

### Playbooks
- [ ] Playbooks can be created, edited, and deleted
- [ ] Playbook execution tracks step-by-step progress
- [ ] Failed steps pause execution with retry/skip/abort options
- [ ] Approval steps wait for user confirmation

---

## 22. Server & Deployment Intelligence

> **Projects don't exist in isolation — they run on servers. Cortex should know where.**

### 22.1 Server Registry

Shared entities (not per-project) representing deployment targets:

| Field | Description |
|---|---|
| `id` | UUID |
| `name` | e.g., "prod-fly", "staging-do", "dev-local" |
| `provider` | e.g., "Fly.io", "DigitalOcean", "AWS", "Hetzner", "Local" |
| `host` | IP/hostname |
| `ssh_user` | SSH username (optional) |
| `ssh_port` | SSH port (default 22) |
| `deploy_url` | Production URL |
| `notes` | Free-form server notes |
| `co_deployed_apps` | JSON array of other project names on this server |

### 22.2 Project-Server Binding

| Field | Description |
|---|---|
| `project_id` | Which project |
| `server_id` | Which server |
| `deploy_branch` | e.g., "main" |
| `deploy_command` | e.g., "fly deploy", "git push dokku main" |
| `env_file_path` | Path to .env on server (for reference, not stored) |
| `last_deployed` | Timestamp |

### 22.3 Deployment Context Files

Projects often have deployment documentation in markdown files (e.g., `DEPLOY.md`, `SERVER.md`, `ops/runbook.md`). Cortex should:

1. **Auto-detect** deployment docs during project scan (pattern match `deploy*`, `server*`, `ops/*`, `runbook*`)
2. **Parse and index** key information (SSH commands, deploy steps, server URLs)
3. **Inject into AI context** when the user asks deployment-related questions
4. **Never push to GitHub** — server credentials and deployment details stay local-only

### 22.4 Server Dashboard

- View all servers and which projects are deployed where
- Quick SSH connect (opens terminal with `ssh user@host`)
- Deploy status per project-server binding
- Server health indicators (optional: ping check)

### 22.5 AI Context Injection for Deployments

When a Claude Code session or AI Chat interaction involves deployment topics, automatically include:
- Server name, provider, URL
- Deploy command and branch
- Co-deployed applications (to avoid conflicts)
- Relevant content from deployment docs

**Privacy:** Server details stored in local SQLite only. SSH keys never stored. Credentials never logged. `.env` contents never captured (only path reference).

---

## 23. Session Context Injection

> **The gap between Cortex's intelligence and Claude Code's context.**

### 23.1 The Problem

Currently, Cortex has project intelligence (brain, patterns, debug memory, file index) but doesn't inject it into Claude Code sessions. Claude Code only reads its own `CLAUDE.md` file.

### 23.2 Solution: Pre-Session Context Assembly

Before spawning a Claude Code session, Cortex should:

1. **Build a context document** from project brain + relevant patterns + recent errors
2. **Write it to a temporary `.cortex-context.md`** in the project directory
3. **Add `.cortex-context.md` to the project's CLAUDE.md** as an include/reference
4. **Clean up** the temp file when the session ends

### 23.3 Context Document Structure

```markdown
# Cortex Project Intelligence (auto-generated)

## Project Summary
{brain.summary}

## Architecture
{brain.architectureNotes}

## Conventions
{brain.conventions}

## Known Issues
{brain.knownIssues}

## Recent Errors (last 30 min)
{captured_errors}

## Verified Patterns
{patterns where confidence = 'verified'}

## Server/Deployment Context
{server details if bound}
```

### 23.4 Implementation

- Context is regenerated on each session start (not cached)
- Token budget from Context Budget Manager controls what's included
- `.cortex-context.md` added to `.gitignore` automatically
- Transparency: show in UI what context was injected

---

## 24. Post-MVP Roadmap

- Vector search via ChromaDB/LanceDB for semantic pattern matching
- Local model summarization (Ollama) for auto-generating project brain entries
- Auto pattern extraction from AI chat conversations
- Doc scraping ingestion for reference intelligence
- Tool intent routing (AI auto-selects the right tool version)
- Knowledge graph visualization across projects
- AI agents for autonomous background tasks
- macOS and Windows support
- Embedded code editor (Monaco)
- Plugin API for community extensions
- Cloud sync (opt-in, encrypted)
- Team features: shared pattern/debug libraries
- Anthropic Usage API integration for exact (not estimated) token tracking
- Community playbook sharing and marketplace
- AI-generated playbooks from natural language descriptions
- Automatic execution policy suggestions based on project type
- Knowledge graph visualization across projects
- Background intelligence jobs (chat summarization, auto pattern extraction)
- AI-generated file summaries for file awareness index
- Agent task queue for background AI operations
- Community playbook sharing and marketplace

---

## 23. Remotion Studio Integration

### 23.1 Programmatic Video Engine
Cortex leverages **Remotion 4** to allow the AI to "ship content, not just code." The AI Orchestrator can trigger video renders to generate project demos.

### 23.2 Feature Set
- **Auto-Promo Reels**: Generate an `.mp4` feature reel when a project phase is completed.
- **Interactive Walkthroughs**: Step-by-step video sequences (`remotion-demo` pattern) for onboarding or client demos.
- **Milestone Summaries**: A "Generate Update Video" button that summarizes git changes since the last session into a visual reel.

### 23.3 Technical Implementation
- **Sidecar logic**: Express backend triggers `remotion render` via CLI.
- **Template Library**: A set of React-based Remotion templates stored locally.
- **Asset Pipeline**: Screenshots captured by the Console Bridge flow directly into Remotion templates for real-time app demos.

---

> **Cortex — the missing GUI layer for Claude Code on Linux.**
>
> Built by Hiraya Digital. Open source. MIT licensed.
