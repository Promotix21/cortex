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

### Claude CLI Detection (sidecar/src/routes/settings.ts)
NEVER use `process.env.HOME` to build paths for the Claude binary check. When Cortex is launched from the app menu (not terminal), Tauri may strip the environment, leaving `HOME` undefined — making all `${process.env.HOME}/.local/bin/claude` checks silently fail.

**Always use `os.homedir()`** which reads from `/etc/passwd` and is immune to missing env:
```ts
import os from 'os';
const HOME = process.env.HOME || os.homedir();
```

Also: run the binary directly via `spawnSync(claudePath, ['--version'])` rather than through a shell command. Claude installs to `~/.local/share/claude/versions/<version>` (the `~/.local/bin/claude` symlink points there) — scan that directory as the last fallback in `findClaudeBinary()`.

### Sidecar Hot-Swap (no Tauri recompile needed)
After any sidecar change (no new npm deps):
```bash
cd sidecar && pnpm build
sudo cp dist/index.js /usr/lib/Cortex/sidecar-bundle/dist/index.js
```

If you **added a new npm dependency**, also sync it to the install location:
```bash
sudo cp sidecar/package.json /usr/lib/Cortex/sidecar-bundle/package.json
cd /usr/lib/Cortex/sidecar-bundle && sudo npm install --omit=dev
```
The install has its own `node_modules` — new packages not installed there will cause `ERR_MODULE_NOT_FOUND` on startup.

Tauri bundles the sidecar at `/usr/lib/Cortex/sidecar-bundle/dist/index.js`. No Rust recompile needed. Restart Cortex after.

## Known Issues
- Token estimates use rough 4-char heuristic, not actual API counts
- Console bridge polling assumes localhost:9877
- Session terminal input may not work if sidecar restarted (PTY reference lost)
- Express 5 `app.use()` with routers doesn't match exact paths — use `app.all()` for exact
- Vite warns about Google Fonts @import in CSS — non-blocking

## Scheduled Sanity Checks

### 2026-05-09 — Hook-consult counter check (2 weeks after install)
The hook installer + brain panel shipped 2026-04-25. Two weeks later, verify it's actually being consulted — that's the only honest signal the work paid off.

Run locally and inspect:
```bash
for id in $(sqlite3 ~/.cortex/cortex.db 'select id from projects'); do
  curl -s "http://localhost:4700/api/intelligence/brain-panel/$id" \
    | jq '{name: .project.name, hooks: .hookStats.total, byType: .hookStats.byType, observations: (.observations|length)}'
done
```

Interpretation:
- **total = 0 across all projects** → hooks never fired. Check `~/.claude/settings.json` for the three Cortex hook entries; check sidecar logs for inbound POSTs to `/api/intelligence/prime|hint|session-end`.
- **prime/hint > 0 but session_end = 0** → Stop hook isn't firing. Verify `cortex-session-end.sh` exists in `~/.claude/cortex-hooks/` and is executable.
- **Healthy** = double-digit `prime` calls and at least one `session_end` per active project per week.

If healthy: move on to phase 2 (typed-observation schema migration, sqlite-vec embeddings).
If cold: don't add features — debug the consult pipeline first.

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
