# Cortex — Development Rules

## What This Is
AI Development Workspace — desktop app (Tauri + React + Express sidecar) that wraps Claude Code with persistent project intelligence. NOT an IDE, NOT a code editor. Manages AI sessions, project memory, and developer workflows.

## Architecture
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Zustand → port 1420 (Vite)
- **Sidecar**: Express 5 + better-sqlite3 + node-pty → port 4700
- **Desktop**: Tauri 2 (Rust shell, WebView)
- **AI**: Claude Code CLI via Max subscription (no API keys)
- **DB**: SQLite at ~/.cortex/cortex.db (33 tables, WAL mode)

## Critical Rules

### Express 5 Routing
Specific routes MUST come before parameterized routes. Express 5 will match `POST /check` as `POST /:id` if `/:id` is defined first. Always put `/specific-path` routes above `/:param` routes in the same router.

### Package Manager
Use `pnpm`. Always. Add `onlyBuiltDependencies` for native modules (better-sqlite3, node-pty, esbuild).

### TypeScript
Strict mode. No `any` in new code (existing `any` is tech debt). Run `npx tsc --noEmit` before committing.

### Git Commits
Co-Author: `Co-Authored-By: WebXExpert <Promotix21@users.noreply.github.com>` — NEVER use "Claude" or any AI name.

### Intelligence Data
All intelligence (brain, patterns, debug memory, server info) is LOCAL ONLY. Never push to GitHub. Files like `.cortex-context.md`, `NEXT_SESSION_PROMPT.md`, `CORTEX_INTELLIGENCE_MASTER.md` are gitignored.

### UI Standards
- Minimum body text: 14px
- Minimum button padding: 10px 20px
- Minimum card padding: 16px 20px
- Use inline `style={{}}` for explicit sizing, not Tailwind utility classes
- Desktop-scale design (VSCode/Cursor quality, not web page)
- Dark theme: Catppuccin Mocha via CSS custom properties

### Session Management
- Sessions spawn shell → run `claude` command via node-pty
- On sidecar restart, mark all "running" sessions as "completed" (zombie cleanup)
- Sessions are in-memory (Map) — DB is persistence layer, not source of truth for live sessions

## Known Issues
- Token estimates use rough 4-char heuristic, not actual API counts
- Console bridge polling assumes localhost:9877
- Session terminal input may not work if sidecar restarted (PTY reference lost)
- Express 5 `app.use()` with routers doesn't match exact paths — use `app.all()` for exact
- Vite warns about Google Fonts @import in CSS — non-blocking

## File Structure
```
src/                    → React frontend (25+ components)
  components/           → ActivityBar, sidebar, workspace, sessions, chat, etc.
  stores/               → Zustand (project, session, terminal, chat, navigation, settings)
  lib/api.ts            → Single API client for all sidecar endpoints
sidecar/src/            → Express backend
  db/schema.ts          → 33-table SQLite schema
  routes/               → 13 route files, 60+ endpoints
  sessions/             → Session manager, snapshots, execution history
  intelligence/         → File indexer, project scanner, background worker
  chat/                 → Claude CLI integration
  bridge/               → Console bridge client
src-tauri/              → Tauri Rust shell
```
