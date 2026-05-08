# Cortex — Next Session Handoff

## Read These Files First
1. `CLAUDE.md` — Project rules, architecture, conventions
2. `.cortex-context.md` — Auto-generated intelligence (if exists)
3. This file — Session context and task list

---

## What Cortex Is
AI Development Workspace — Tauri 2 desktop app (React 19 + Express 5 sidecar + SQLite) that wraps Claude Code with persistent project intelligence. 22 projects onboarded, 33 DB tables, 70+ API endpoints, 12 MCP tools.

## Architecture
- **Frontend**: React 19 + TypeScript + Tailwind v4 + Zustand → port 1420 (Vite)
- **Sidecar**: Express 5 + better-sqlite3 + node-pty → port 4700
- **MCP Server**: Port 4710 — 6 intelligence tools + 5 document builder tools + 1 save_intelligence tool
- **Desktop**: Tauri 2 (Rust shell, WebView)
- **DB**: SQLite at ~/.cortex/cortex.db (33 tables, WAL mode)

---

## What Was Done This Session (March 29-30, 2026)

### Major Features Built
1. **Deep Project Scanner** — reads CLAUDE.md, README, deploy docs, Claude memory files, NEXT_SESSION_PROMPT.md. Extracts server IPs, SSH details, deployment URLs, setup commands, API key names. Recursive 3-level signature detection for monorepos.
2. **Project Completion Estimation** — 0-100% score based on TODO/FIXME count, empty handlers, test ratio, README/LICENSE/CI presence. Displayed as ring in dashboard.
3. **Toolchain Detection** — auto-detects CLI tools (Shopify CLI, WP-CLI, Docker), SSH connections, deploy methods (SSH, Vercel, GitHub Actions). Shows in dashboard info cards.
4. **Document Builder MCP** — `create_docx`, `create_pdf`, `create_spreadsheet`, `read_docx`, `read_pdf`. Global tools, no per-project install. Dependencies in sidecar: docx, pdfkit, exceljs, adm-zip.
5. **Session Terminal Fix** — Sessions now use XTerminal (same as working shell terminals) via terminal manager. Fixed input issues in Tauri WebView.
6. **Auto Context Injection** — Project intelligence sent as Claude's FIRST prompt when session starts (5s delay after Claude boots). No more "read the file" needed.
7. **Session Resume** — POST /api/sessions/:id/resume. Injects handoff + last 10 prompts + last 3000 chars output into new session.
8. **Claude Session Import** — Imported 115 sessions, 1,874 prompts, 48 memory files from ~/.claude/projects/ into Cortex DB.
9. **Documents Panel** — New activity tab showing .md, .docx, .xlsx, .pdf files per project with inline viewer and download.
10. **Remotion Studio Pipeline** — 4-tab UI: Ideas → Discuss → Storyboard → Render. Ideas persist per project.
11. **Intelligence Capture API** — POST /api/intelligence/capture + MCP tool save_intelligence. Claude can save decisions/issues/server info to brain during sessions.
12. **WordPress Detection** — App passwords, wp-json endpoints, external APIs, WP-Cron, REST routes.
13. **Nested .gitignore** — GitignoreChecker class supports .gitignore at each directory level.
14. **Convention/Dependency scanning in sub-projects** — Not just root anymore.
15. **Auto CLAUDE.md generation** — Creates/appends cortex intelligence reference block.
16. **Browse button browser fallback** — Uses zenity for native file picker when running outside Tauri.
17. **Active project persistence** — localStorage, auto-select first project on load.
18. **Green dot only for active sessions** — Not all projects.
19. **Session delete** — DELETE /api/sessions/:id/permanent with CASCADE.
20. **Session output persistence** — Saved to DB on stop/kill (50KB, ANSI stripped).
21. **Copy terminal selection** — Auto-copy to clipboard on text select in xterm.js.

### Git Commits (this session)
```
8fa8cd4 docs: Remove OpenRouter reference from roadmap
4b59347 feat: Documents panel
80295ff feat: Import Claude Code session history
4aaacc1 fix: Fetch all sessions on app start
90e383a feat: Real session resume with previous context injection
eba4b6d fix: Green dot only for active sessions
089e0f2 fix: Delete sessions, save session output, dashboard navigation
6a366c6 fix: Session switching, dashboard navigation, auto-context injection
e9fb0f1 feat: Auto-inject context, manual intelligence capture API
80fc435 fix: Auto-copy terminal selection to clipboard
dc48956 feat: Delete sessions, resume sessions, session history persistence
5ce714f feat: Remotion Studio creative pipeline, WordPress app password detection
69226fe feat: Deep project intelligence, Document Builder MCP, session terminals, completion estimation
48ab1a1 Revert "feat: OpenRouter multi-model integration"
```

---

## What Needs To Be Done (Priority Order)

### P0 — Critical
1. **Fix production Tauri build** — App installs via .deb but closes immediately on launch. Only `pnpm tauri dev` works. Check `src-tauri/tauri.conf.json` — likely the `devUrl` vs `frontendDist` config. The production build bundles frontend but sidecar isn't started.
2. **Sidebar company grouping** — Group 22 projects under WebXExpert / Hiraya Digital / DigitalDadi headers. Add `company` column to projects table. Company mapping in memory file: `~/.claude/projects/-home-rajthecypher-webXExpert-projects-enterprise-apps-cortex/memory/project_company_mapping.md`

### P1 — High Impact
3. **Cross-project search** — Global search across all project brains, session history, patterns, debug memory. Searchable from a Ctrl+K command palette.
4. **Session grid view** — Show all active sessions in 2x2 grid with pagination. 1 session=full, 2=1x2, 3-4=2x2, 5+=paginated. Already exists for terminals in TerminalPanel.tsx — adapt for sessions.
5. **Keyboard shortcuts** — Ctrl+N (new session), Ctrl+T (terminal), Ctrl+D (dashboard), Ctrl+K (search), Ctrl+B (brain).
6. **Better onboarding flow** — Setup wizard should guide: install CLI → auth → add project → scan → first session in one coherent flow.

### P2 — Polish
7. **Per-client billing view** — Usage grouped by company with CSV export for invoicing.
8. **Remotion video rendering** — Actual Remotion compositions. The UI pipeline works but no real video generation.
9. **Chrome extension integration** — Bundle or auto-connect to claude-console-bridge.
10. **MCP client** — Connect to external MCP servers (tools discovery, registry).
11. **WebSocket for real-time** — Replace HTTP polling with WebSocket for terminal output and session updates.
12. **Tests** — At least API endpoint tests and scanner tests.

---

## Key File Locations
```
src/                          → React frontend
  components/
    workspace/WorkspaceTabs.tsx  → Main workspace router + OverviewPanel (dashboard)
    workspace/DocumentsPanel.tsx → Documents viewer
    sessions/SessionTerminal.tsx → Session terminal (uses XTerminal for live, CompletedSessionView for done)
    sessions/SessionCard.tsx     → Session card with Resume/Delete/Handoff buttons
    sessions/ProjectSessions.tsx → Sessions list per project
    sidebar/ProjectItem.tsx      → Sidebar project item (green dot logic)
    sidebar/AddProjectDialog.tsx → Add project dialog
    terminal/XTerminal.tsx       → xterm.js terminal (THE working terminal component)
    terminal/TerminalPanel.tsx   → Terminal tab with grid/tab views
    remotion/RemotionStudio.tsx  → 4-tab creative pipeline
    ActivityBar.tsx              → Left sidebar with activity icons
    intelligence/               → Brain editor, patterns, debug, learning queue
  stores/
    project-store.ts    → Projects + active project (localStorage persisted)
    session-store.ts    → Sessions + delete/resume
    navigation-store.ts → Active tab + viewing session
    terminal-store.ts   → Terminals
  lib/api.ts            → All API calls to sidecar
  types/project.ts      → Project interface (includes completion, cli_tools, ssh, deploy)
  App.tsx               → Root component, fetches sessions on mount

sidecar/src/
  db/schema.ts                    → 33-table SQLite schema
  routes/sessions.ts              → Session CRUD, spawn, resume, import, delete
  routes/projects.ts              → Project CRUD, scan, browse, documents
  routes/intelligence.ts          → Patterns, debug, learning queue, capture
  intelligence/project-scanner.ts → Deep scanner (1200+ lines): signatures, code, docs, completion, toolchain
  intelligence/file-indexer.ts    → File walker with nested .gitignore
  intelligence/context-injector.ts → Assembles .cortex-context.md, auto CLAUDE.md
  intelligence/handoff-generator.ts → NEXT_SESSION_PROMPT.md generation
  intelligence/session-analyzer.ts → Auto-learning from session output
  intelligence/claude-session-importer.ts → Import from ~/.claude/projects/
  intelligence/budget-guard.ts    → Claude Max rate limits
  sessions/session-manager.ts     → Session lifecycle, PTY, metrics
  terminals/terminal-manager.ts   → Terminal lifecycle, ring buffer polling
  mcp/mcp-server.ts              → 12 MCP tools (intelligence + documents + capture)
  mcp/document-builder.ts        → docx/pdf/xlsx generation
  index.ts                        → Express app, route mounting, cleanup
```

## Company Mapping
- **WebXExpert**: rankops, revops, nexara-saas, velaro-domain-checker, vtest-tia, drishti, cortex
- **Hiraya Digital**: hiraya-digital-synergy-hub, growth-agent, wordpress-seo-optimization, honest-fermont, celebrate-festival, celebrate-festival-emailer, content-intelligence-planner, project-aura, realEsgran
- **DigitalDadi**: umang-boards, ninara, ninara-new-design, saie-paranjape, vellaro

## Known Issues
- Production Tauri build closes immediately (dev mode works)
- Session terminal input: xterm.js direct typing may not work in some Tauri WebView contexts (XTerminal component works)
- Token estimates use rough 4-char heuristic, not actual API counts
- Express 5 routing: specific routes MUST come before /:param routes
- Vite warns about Google Fonts @import in CSS — non-blocking

## Git Info
- Remote: https://github.com/Promotix21/cortex.git
- Branch: main
- Co-Author: `Co-Authored-By: WebXExpert <Promotix21@users.noreply.github.com>` — NEVER use "Claude" or AI names
- OpenRouter was REVERTED — do not re-add. App uses Claude Code CLI via Max subscription only.
