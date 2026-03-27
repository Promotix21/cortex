<p align="center">
  <img src="assets/cortex-logo.png" alt="Cortex" width="80" />
</p>

<h1 align="center">Cortex</h1>

<p align="center">
  <strong>The missing GUI layer for Claude Code on Linux.</strong>
</p>

<p align="center">
  One brain. All your context. Zero switching costs.
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/status-active_development-1D9E75?style=flat-square" alt="Status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/platform-Linux-FCC624?style=flat-square&logo=linux&logoColor=black" alt="Platform"></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/built_with-Tauri%20%2B%20React-7C5CFC?style=flat-square" alt="Stack"></a>
  <a href="https://claude.ai"><img src="https://img.shields.io/badge/AI-Claude_Native-D97706?style=flat-square" alt="Claude"></a>
</p>

<br/>

<p align="center">
  <img src="assets/cortex-session-dashboard.png" alt="Cortex Session Dashboard" width="720" />
</p>

---

## The Problem

You're running Claude Code across 5 projects. Every session is anonymous. Every terminal switch loses context. There's no way to see what AI is doing across projects. No usage tracking. No session history. No brain.

**You're paying for Claude but managing it with `Ctrl+Tab` and hope.**

## The Solution

Cortex gives every project its own persistent AI brain, named Claude Code sessions, real-time error intelligence, and instant workspace resume — all from one desktop app.

```
┌──────────────────────────────────────────────────────────────┐
│  Cortex    [Session Dashboard]              [Bridge: Live]   │
├────────┬─────────────────────────────────┬───────────────────┤
│        │  Overview  Terminal  Git  Notes  │                   │
│  YOUR  │                                 │   AI Chat         │
│  PROJ  │   ● refactor-auth    Running    │   Project Brain   │
│  ECTS  │   ● debug-api        Running    │   Live Errors     │
│        │   ○ setup-ci         Idle       │   Tasks           │
│        │   ✓ fix-middleware   Done       │   Reference       │
│        ├─────────────────────────────────│                   │
│        │  $ Terminal · Claude Code · Dev │                   │
├────────┴─────────────────────────────────┴───────────────────┤
│  client-portal │ main │ 3 dirty │ Today: 47 prompts · ~35k  │
└──────────────────────────────────────────────────────────────┘
```

---

## Features

### Claude Code Session Manager

The feature that doesn't exist anywhere else.

| Capability | What It Does |
|---|---|
| **Named Sessions** | Every Claude Code session has an identity — "refactor-auth", not "Terminal 3" |
| **Session Dashboard** | See all running Claude Code sessions across all projects in one view |
| **Session Resume** | Reopen a project and pick up exactly where Claude left off — warm reconnect or context restoration |
| **Cross-Session Visibility** | Monitor what Claude is doing in Project A while you work in Project B |
| **Usage Tracking** | Prompt count, token estimates, and cost per project — export CSV for client billing |
| **Budget Alerts** | Set per-project token budgets. Get warned at 80%. Stop surprises. |

### Per-Project AI Brain

Every project remembers everything. Context never bleeds across projects.

- **Project Brain** — summary, architecture notes, known issues, key decisions. Auto-injected into every AI interaction.
- **Pattern Memory** — save reusable code patterns. Search across all projects. Never write the same solution twice.
- **Debug Memory** — store bug solutions with error signatures. When the same error appears again (in any project), the solution surfaces automatically.

### Real-Time Error Intelligence

Powered by [claude-console-bridge](https://github.com/AetheriumDev/claude-console-bridge) and [chrome-console-for-claude](https://github.com/AetheriumDev/chrome-console-for-claude):

- Browser errors captured via Chrome extension — auto-routed to the correct project
- Server errors captured via Express/NestJS/Prisma middleware
- New errors auto-create debug memory entries
- Known errors instantly surface existing solutions
- Error context injected into your active Claude Code session in real time

### Reference Intelligence

Eliminate stale API hallucinations — the #1 problem with AI coding assistants.

- Version-pinned command references per tool, per OS
- Deprecated commands flagged with replacements
- Breaking change log with old vs new usage
- AI only receives commands matching your pinned version — never stale suggestions

### Everything Else

- **Terminal Management** — node-pty + xterm.js, tabbed, project-bound, persistent across sessions
- **Git Integration** — live status, branch display, uncommitted files, basic commands via simple-git
- **Markdown Notes** — per-project with autosave
- **Task Tracker** — Pending / Doing / Done / Blocked
- **Workspace Resume** — close Cortex, reopen it, everything is exactly where you left it. Zero setup.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | [Tauri](https://tauri.app) (Rust) |
| Frontend | React + TypeScript + Vite + [ShadCN UI](https://ui.shadcn.com) + Zustand |
| Backend Sidecar | Node.js + Express + better-sqlite3 |
| Terminals | node-pty + xterm.js |
| Git | simple-git |
| AI | Claude CLI + Claude SDK (primary), OpenAI API (optional) |
| Error Capture | claude-console-bridge + chrome-console-for-claude |
| Database | SQLite (local, no cloud, no telemetry) |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        TAURI SHELL                           │
│                     (Rust + WebView)                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐    IPC    ┌──────────────────────┐  │
│  │    React Frontend   │ ◄──────► │   Express Sidecar    │  │
│  │                     │          │                      │  │
│  │  • Project Sidebar  │          │  • SQLite (20 tables)│  │
│  │  • Session Dashboard│          │  • node-pty spawner  │  │
│  │  • AI Chat Panel    │          │  • Claude CLI/SDK    │  │
│  │  • Terminal (xterm) │          │  • simple-git        │  │
│  │  • Brain Editor     │          │  • Bridge client     │  │
│  │  • Reference Lookup │          │  • Session manager   │  │
│  └─────────────────────┘          └──────────┬───────────┘  │
│                                              │               │
├──────────────────────────────────────────────┼───────────────┤
│                                              │               │
│  ┌───────────────────────────────────────────▼────────────┐  │
│  │              Console Bridge (child process)            │  │
│  │  WebSocket :9876 ◄── Chrome Extension                 │  │
│  │  HTTP API  :9877 ◄── Express/NestJS/Prisma middleware │  │
│  │  MCP Server       ──► Claude CLI native tools          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Database

20 SQLite tables. No ORM. No cloud. Everything lives on your machine.

| Group | Tables | Purpose |
|---|---|---|
| **Core** | projects, terminals, notes, tasks, workspace | Project management and state |
| **Claude Sessions** | claude_sessions, session_metrics, session_history, usage_daily | Session ownership and billing |
| **Intelligence** | project_brain, pattern_memory, debug_memory | Per-project and cross-project AI memory |
| **Reference** | tools, tool_versions, commands, api_changes, project_tools | Version-aware documentation |
| **Error Capture** | captured_errors, captured_network | Console bridge data |

---

## Quick Start

> **Note:** Cortex is in active development. Instructions below are for contributors.

### Prerequisites

- Linux (Ubuntu 22.04+, Fedora 38+, or equivalent)
- Node.js 20+
- Rust (latest stable)
- pnpm

### Development

```bash
# Clone
git clone https://github.com/Promotix21/cortex.git
cd cortex

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev
```

### Build

```bash
# Build for Linux
pnpm tauri build

# Outputs: AppImage, .deb, .rpm in src-tauri/target/release/bundle/
```

---

## Build Phases

| Phase | What | Status |
|---|---|---|
| 1 | Foundation — Tauri + SQLite + Project CRUD | In Progress |
| 2 | Claude Code Session Manager — the differentiator | Planned |
| 3 | Terminal Engine — node-pty + xterm.js | Planned |
| 4 | AI Chat Panel — per-project Claude conversations | Planned |
| 5 | Notes, Tasks & Git Integration | Planned |
| 6 | Intelligence Builder — Brain, Patterns, Debug Memory | Planned |
| 7 | Console Bridge Integration — real-time error capture | Planned |
| 8 | Reference Intelligence — version-aware commands | Planned |
| 9 | Workspace & Session Resume | Planned |
| 10 | Polish & Linux Packaging | Planned |

---

## Who This Is For

- **Agency developers** managing 5-10 client projects who need per-project AI usage tracking for billing
- **Freelancers** tired of losing Claude Code context every time they switch projects
- **AI-assisted coders** who want their AI to remember project architecture, past bugs, and coding patterns
- **Claude Code power users** on Linux who need a proper GUI layer
- **Multi-repo engineers** who want one command center instead of 20 terminal tabs

---

## Why Open Source

Cortex is MIT-licensed infrastructure for the Claude Code ecosystem. There is no existing open-source tool that manages Claude Code sessions, tracks per-project AI usage, or maintains persistent project intelligence for AI-assisted development on Linux.

We believe this should exist as a public good for the developer community.

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Run tests
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck
```

---

## Constraints (by design)

- **Local only** — no cloud, no telemetry, no data leaves your machine
- **Monolithic** — no microservices, no Docker, no Kubernetes
- **Fast** — launches in under 3 seconds, stays under 300MB RAM
- **Simple** — readable TypeScript, stable dependencies, no premature abstraction
- **Linux first** — macOS and Windows support planned post-MVP

---

## Roadmap (Post-MVP)

- Vector search via ChromaDB for semantic pattern matching
- Local model summarization (Ollama) for auto-generating brain entries
- Auto pattern extraction from AI conversations
- Doc scraping for reference intelligence
- Knowledge graph visualization
- macOS + Windows support
- Embedded code editor (Monaco)
- Plugin API
- Cloud sync (opt-in, encrypted)

---

<p align="center">
  <strong>Cortex — the missing GUI layer for Claude Code on Linux.</strong>
  <br/>
  Built by <a href="https://github.com/Promotix21">Hiraya Digital</a>
</p>
