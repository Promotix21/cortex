<p align="center">
  <img src="assets/cortex-demo.gif" alt="Cortex Demo" width="800" />
</p>

<h1 align="center">Cortex</h1>

<p align="center">
  <strong>AI Development Workspace for developers who ship with AI, not just chat with it.</strong>
</p>

<p align="center">
  Every project gets a persistent AI brain. Every Claude Code session has a name.<br/>
  Every bug you've solved is remembered. Every context switch is instant.
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/status-alpha-1D9E75?style=flat-square" alt="Status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/platform-Linux-FCC624?style=flat-square&logo=linux&logoColor=black" alt="Platform"></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/built_with-Tauri_2_%2B_React_19-7C5CFC?style=flat-square" alt="Stack"></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/AI-Claude_%2B_OpenAI-D97706?style=flat-square" alt="AI"></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/database-SQLite_(local)-003B57?style=flat-square" alt="DB"></a>
</p>

<p align="center">
  <a href="#-the-problem">Why</a> &middot;
  <a href="#-features">Features</a> &middot;
  <a href="#-quick-start">Quick Start</a> &middot;
  <a href="#-architecture">Architecture</a> &middot;
  <a href="#-contributing">Contributing</a> &middot;
  <a href="#-roadmap">Roadmap</a>
</p>

---

## The Problem

You're an agency dev running Claude Code across 8 client projects. Here's your reality:

- **No session identity** — "Terminal 3" is running a refactor, but you forgot which project
- **No memory** — Claude doesn't know your auth module uses JWT, not sessions. Again.
- **No usage tracking** — client asks "how much AI did you use?" and you shrug
- **No error intelligence** — you solved that `null ref` bug last month. Now it's back. You solve it again.
- **Context switch = context loss** — switch projects, lose everything

**You're paying for the most powerful AI coding assistant and managing it with `Ctrl+Tab` and hope.**

## The Solution

Cortex is a desktop app that wraps Claude Code (and any AI provider) with persistent project intelligence. It doesn't replace your editor. It manages the AI layer your editor doesn't have.

```
You today:                          You with Cortex:

Terminal 1: claude (which project?) ──► refactor-auth (client-portal) Running
Terminal 2: claude (what context?)  ──► debug-api (saas-backend) Idle
Terminal 3: claude (what did it do?)──► setup-ci (mobile-app) Done ✓

"How much AI did I use?"            ──► Today: 47 prompts · ~35k tokens · $0.42
"What was that bug fix?"            ──► Auto-matched: JWT expiry race condition
"What's the architecture?"          ──► Brain: NestJS + Prisma + Redis, deployed on Fly.io
```

---

## Features

### Named Claude Code Sessions

The feature that doesn't exist anywhere else.

Every Claude Code session gets a name, a project, and a persistent identity. See all running sessions across all projects in one dashboard. Monitor what AI is doing in Project A while you work in Project B.

| What | How |
|---|---|
| Named sessions | `refactor-auth`, not "Terminal 3" |
| Cross-project dashboard | See every active AI session at a glance |
| Usage tracking | Prompts, tokens, cost — per session, per project, per day |
| CSV export | Bill clients for exact AI usage |
| Session resume | Reopen project, pick up where Claude left off |

### Per-Project AI Brain

When you add a project, Cortex **automatically scans it** — reads your package.json, detects the framework, maps the file structure, and populates the project brain. AI knows your architecture before you type a single prompt.

| Brain Field | Auto-Populated From |
|---|---|
| Summary | package.json name, description, version |
| Architecture | Framework detection, language, file structure breakdown |
| Conventions | tsconfig strict mode, linter configs, package manager |
| Dependencies | Key deps with versions (not `@types/*` noise) |
| File Index | 80+ files classified: controllers, routes, models, components, tests |

Brain fields are auto-filled on project add, but **never overwritten** — your manual notes always take priority.

### Intelligence That Compounds

The more you use Cortex, the smarter it gets.

- **Pattern Memory** — save reusable code patterns with tags and confidence scoring. Search across all projects. `Verified` / `Probable` / `Unverified` tiers based on usage + rating.
- **Debug Memory** — store bug solutions with error signatures. When the same error appears again (in any project), the solution surfaces automatically. Zero manual lookup.
- **Background Worker** — runs on idle: prunes old snapshots, compresses history, auto-promotes patterns based on usage data.

### Real-Time Error Intelligence

Powered by [claude-console-bridge](https://github.com/AetheriumDev/claude-console-bridge):

- Browser errors captured via Chrome extension, auto-routed to the correct project by port
- Known errors instantly surface existing solutions from debug memory
- Error context injected into your active Claude Code session
- Error signatures normalized for fuzzy matching across projects

### AI Execution Policy

Not all AI actions are safe. Cortex blocks dangerous commands by default.

| Tier | Actions | Behavior |
|---|---|---|
| **Allowed** | `git status`, `pnpm test`, file reads | Executes immediately |
| **Restricted** | `rm -rf`, `sudo`, `DROP TABLE`, `chmod 777` | Blocked. Always. |
| **Approval** | `git push`, package installs, DB migrations | Paused. User confirms. |

Per-project overrides supported. Every policy decision is logged.

### Playbooks

Reusable step-by-step workflows for repetitive tasks:

```json
{
  "name": "New Feature Setup",
  "steps": [
    { "type": "command", "action": "git checkout -b feature/{{name}}" },
    { "type": "ai_prompt", "action": "Create the boilerplate for {{description}}" },
    { "type": "checkpoint", "action": "Review generated code before continuing" },
    { "type": "command", "action": "pnpm test" }
  ]
}
```

### Context Budget Manager

AI context windows aren't infinite. Cortex assembles context intelligently:

- Priority-weighted source selection (brain > errors > patterns)
- ~11,500 token default budget with per-project tuning
- Transparency panel: see exactly what AI knows and what was excluded
- Prevents token waste from irrelevant context flooding

### Everything Else

- **Terminal Engine** — node-pty + xterm.js, tabbed, 4 types (shell / AI session / dev server / git)
- **Git Panel** — live branch, status, diff viewer, commit log, pull/push
- **Markdown Notes** — per-project with 1s debounced autosave
- **Task Tracker** — click-to-cycle: Pending → Doing → Done → Blocked
- **Reference Intelligence** — version-pinned tool commands, breaking change log, deprecated API tracking
- **Workspace Resume** — close Cortex, reopen, everything is exactly where you left it
- **8 workspace tabs** — Overview, Terminal, Git, Notes, Brain, Reference, Errors, AI Chat

---

## Quick Start

> Cortex is in alpha. These instructions are for contributors and early testers.

### Prerequisites

- Linux (Ubuntu 22.04+, Pop!_OS, Fedora 38+)
- Node.js 20+ (recommend 22 LTS)
- Rust (latest stable via [rustup](https://rustup.rs))
- pnpm 9+

### Install & Run

```bash
# Clone
git clone https://github.com/Promotix21/cortex.git
cd cortex

# Install frontend dependencies
pnpm install

# Install sidecar dependencies
cd sidecar && pnpm install && cd ..

# Start development (sidecar + Tauri + Vite)
cd sidecar && pnpm dev &     # Starts Express on :4700
cd .. && pnpm tauri dev       # Starts Tauri desktop app
```

### Build for Distribution

```bash
pnpm tauri build
# Outputs: .deb, .rpm, .AppImage in src-tauri/target/release/bundle/
```

### Project Structure

```
cortex/
├── src/                          # React frontend (25 components)
│   ├── components/
│   │   ├── sidebar/              # Project list, search, add dialog
│   │   ├── workspace/            # Tabs: Overview, Git, Notes, Reference
│   │   ├── terminal/             # xterm.js terminal with tabs
│   │   ├── sessions/             # Session dashboard, cards, usage
│   │   ├── chat/                 # AI chat panel with streaming
│   │   ├── intelligence/         # Brain editor, patterns, debug memory
│   │   └── bridge/               # Error capture panel
│   ├── stores/                   # Zustand state (project, session, terminal, chat)
│   ├── lib/                      # API client, utilities
│   └── types/                    # TypeScript interfaces
├── sidecar/                      # Express backend
│   └── src/
│       ├── db/                   # SQLite schema (31 tables) + connection
│       ├── routes/               # 12 route files, 60+ API endpoints
│       ├── sessions/             # Session manager, snapshots, execution history
│       ├── terminals/            # Terminal manager (node-pty)
│       ├── chat/                 # Claude SDK integration
│       ├── intelligence/         # File indexer, project scanner, background worker
│       └── bridge/               # Console bridge client
├── src-tauri/                    # Tauri (Rust) shell
└── assets/                       # Demo GIF, screenshots
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           TAURI SHELL (Rust)                          │
│                          Linux / WebView2                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌───────────────────────┐   HTTP :4700   ┌──────────────────────┐  │
│   │    React Frontend     │ ◄────────────► │   Express Sidecar    │  │
│   │                       │                │                      │  │
│   │  Sidebar              │                │  SQLite (31 tables)  │  │
│   │  8 Workspace Tabs     │                │  Session Manager     │  │
│   │  Session Dashboard    │                │  Terminal Manager    │  │
│   │  xterm.js Terminals   │                │  Claude SDK/CLI      │  │
│   │  AI Chat (streaming)  │                │  File Indexer        │  │
│   │  Brain/Pattern Editor │                │  Background Worker   │  │
│   │  Error Panel          │                │  Policy Engine       │  │
│   └───────────────────────┘                │  Bridge Client       │  │
│                                            └──────────┬───────────┘  │
│                                                       │              │
│   ┌───────────────────────────────────────────────────▼───────────┐  │
│   │                Console Bridge (child process)                 │  │
│   │   WebSocket :9876 ◄── Chrome Extension (browser errors)      │  │
│   │   HTTP API  :9877 ◄── Server middleware (backend errors)     │  │
│   └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Database: 31 SQLite Tables

| Group | Tables | Purpose |
|---|---|---|
| **Core** | projects, terminals, notes, tasks, workspace, ai_sessions | Project management |
| **Sessions** | claude_sessions, session_metrics, session_history, usage_daily | Session tracking + billing |
| **Intelligence** | project_brain, pattern_memory, debug_memory, file_index | AI memory layer |
| **Reference** | tools, tool_versions, commands, api_changes, project_tools | Version-aware docs |
| **Snapshots** | project_snapshots, execution_history, execution_groups | State capture + recovery |
| **Playbooks** | playbooks, playbook_runs | Reusable workflows |
| **Bridge** | captured_errors, captured_network | Error intelligence |
| **Policy** | execution_policies, context_priorities | Safety + context control |
| **System** | background_jobs, file_locks, agent_tasks | Background processing |

No ORM. No migrations. No cloud. All data lives in `~/.cortex/cortex.db`.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Desktop Shell | [Tauri 2](https://tauri.app) | Native Linux app, ~5MB binary, no Electron bloat |
| Frontend | React 19 + TypeScript + Vite 7 + Tailwind 4 + Zustand | Fast, typed, minimal bundle |
| Backend | Express 5 + better-sqlite3 + node-pty | Sidecar process, zero network exposure |
| Terminals | xterm.js + node-pty | Real PTY, not a web terminal emulator pretending |
| Git | simple-git | No shelling out, proper async git operations |
| AI | Claude SDK (primary), extensible for OpenAI/Ollama | Provider-agnostic architecture |
| Theme | Catppuccin Mocha | Dark, easy on the eyes, VSCode-familiar |

---

## Who This Is For

**Agency developers** managing 5-10 client projects who need per-project AI usage tracking for billing.

**Freelancers** tired of losing Claude Code context every time they switch between clients.

**AI-native developers** who want their AI to remember architecture, past bugs, and coding patterns across sessions.

**Multi-repo engineers** who need one command center instead of 20 terminal tabs with anonymous AI sessions.

**Linux developers** who've been waiting for a proper AI development workspace that isn't Electron-based.

---

## What Cortex Is Not

- **Not a code editor** — it manages AI sessions and project intelligence, not editing. Use it alongside VSCode/Neovim.
- **Not cloud-based** — everything is local. No accounts. No telemetry. Your code never leaves your machine.
- **Not an AI wrapper** — it doesn't compete with Claude or GPT. It makes them remember.

---

## Contributing

We welcome contributions. Cortex is MIT-licensed.

```bash
# Development workflow
pnpm install && cd sidecar && pnpm install && cd ..

# Run sidecar (backend)
cd sidecar && pnpm dev

# Run frontend (separate terminal)
pnpm tauri dev

# Type check
cd sidecar && pnpm exec tsc --noEmit   # Backend
pnpm exec tsc --noEmit                  # Frontend

# Build
pnpm exec vite build                    # Frontend only
pnpm tauri build                        # Full app
```

### Areas Looking for Help

- **Terminal reliability** — node-pty edge cases, Unicode handling, large output buffering
- **Context assembly optimization** — smarter token budgeting and source scoring
- **macOS / Windows ports** — Tauri supports them, we just haven't tested
- **Plugin API** — extension system for custom intelligence sources
- **UI polish** — animations, transitions, responsive layout tuning

---

## Roadmap

### Now (Alpha)
- [x] 12-phase core implementation (Foundation through Polish)
- [x] 60+ API endpoints, 31 database tables
- [x] 8 workspace tabs fully functional
- [x] Project auto-scan with brain population
- [x] Background intelligence worker
- [x] AI execution policy engine

### Next
- [ ] Tauri desktop app launch and system tray
- [ ] File watcher for live index updates
- [ ] Chat summarization (condense long conversations)
- [ ] AI-generated file summaries in file index
- [ ] Keyboard shortcuts and command palette

### Later
- [ ] Vector search (ChromaDB) for semantic pattern matching
- [ ] Local model support via Ollama
- [ ] Auto pattern extraction from AI conversations
- [ ] Community playbook sharing
- [ ] macOS + Windows support
- [ ] Plugin API

---

## Design Constraints (by design)

| Constraint | Reason |
|---|---|
| **Local only** | Your code, your data, your machine. No cloud dependency. |
| **No microservices** | One Express sidecar. One SQLite file. Ship fast, debug easy. |
| **No Electron** | Tauri is 10x lighter. Native performance matters for a tool you run all day. |
| **Linux first** | That's where the serious AI-assisted development is happening. |
| **SQLite, not Postgres** | Zero setup. Copy one file to back up everything. |
| **Express 5, not tRPC** | REST is debuggable with curl. When you're building infrastructure, simplicity wins. |

---

## Stats

```
Source files:    61 (.ts + .tsx)
Total lines:    ~7,900
API endpoints:  60+
DB tables:      31
React components: 25
Zustand stores:   4
Build time:     2.3s (Vite)
```

---

## License

MIT. Use it, fork it, ship it.

---

<p align="center">
  <strong>Cortex — the AI development workspace that remembers everything.</strong>
  <br/><br/>
  Built by <a href="https://github.com/Promotix21">Rajesh Kumar</a>
  <br/>
  <sub>If this is useful, star the repo. It helps others find it.</sub>
</p>
