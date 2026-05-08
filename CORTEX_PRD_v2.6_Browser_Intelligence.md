# Cortex v2.6 — Browser Intelligence

**Version:** 2.6 (builds on v2.5 Orchestration Layer)
**Status:** Draft
**Scope:** Narrow. One feature line: embedded browser control via Chrome DevTools Protocol (CDP), exposed as segregated MCP tools.

---

## Guiding Principles (inherited from v2.5)

- **Claude-Code-native.** Browser tools are exposed via MCP — Claude calls them directly, no paid API in the path.
- **Local-first.** No cloud browser services (BrowserBase, Browserless, etc.). Everything runs on the user's machine.
- **Human-gated autonomy.** Destructive browser actions (form submission, click on elements with side effects, navigation to `about:` URLs) require the same Plan/Reflect gating as orchestrator writes.
- **Lean.** Use the system Chromium/Chrome via CDP — no bundled browser binary, no Playwright download.

Violates any of the above ⇒ out of scope.

---

## Why CDP-direct (not Playwright)

Decision locked in. Reasons:

| Criterion | CDP-direct | Playwright |
|-----------|------------|------------|
| **Capability segregation** | Natural — one tool per CDP domain (`DOM`, `Console`, `Network`, `Runtime`, `Page`) | Fake — everything through one `Page` object |
| **Install footprint** | 0 MB (uses system browser) | +200 MB Chromium per OS |
| **Failure signals** | Raw — "element not found" / "network timeout" | Smoothed by auto-wait/auto-retry — hides state |
| **Observability into Shadow Terminal** | Direct — WebSocket frames map 1:1 to events | Client/server abstraction muddies the path |
| **Match with MCP tool model** | Perfect — each domain = one or two tools | Awkward — Playwright's fluent API ≠ tool calls |

---

## 1. Feature: Browser Intelligence Layer

A sidecar-managed Chromium instance, controlled via CDP over WebSocket, exposed to Claude Code as a set of **segregated** MCP tools. Each tool is one scoped capability — never a God-object.

### MCP Tool Surface (initial)

Grouped by CDP domain. Each tool = one clear verb on one clear capability.

**Page lifecycle**
- `browser.session_open({ url?, headless? })` — start or reuse a browser, optionally navigate
- `browser.session_close()` — shut down the browser session
- `browser.goto({ url, waitUntil? })` — navigate current page
- `browser.reload()` — reload current page
- `browser.screenshot({ selector?, fullPage? })` — capture as base64 PNG

**DOM (read-only by default)**
- `browser.dom_query({ selector })` — return matched element count + outerHTML for up to N nodes (bounded)
- `browser.dom_text({ selector })` — text content for selector
- `browser.dom_attributes({ selector, attrs? })` — named or all attributes
- `browser.dom_snapshot({ depth? })` — accessibility tree snapshot (structured, not raw HTML)

**Runtime (eval — write-capable, gated)**
- `browser.eval({ expression, awaitPromise? })` — evaluate JS in page context. **This is the one tool that needs human gating** — flagged as write-intent in the orchestrator's Plan phase.

**Console**
- `browser.console_tail({ sinceTs?, limit? })` — return console entries since a timestamp, newest first, bounded
- `browser.console_clear()` — clear in-memory ring buffer (does NOT clear the page's console)

**Network**
- `browser.network_list({ sinceTs?, filter? })` — list requests (method, URL, status, duration, size). `filter` is a URL substring
- `browser.network_response({ requestId })` — fetch response body + headers for a specific request
- `browser.network_failures({ sinceTs? })` — failed requests only (status >= 400 or network error)

**Input (write-capable, gated)**
- `browser.click({ selector })` — gated
- `browser.type({ selector, text, delay? })` — gated
- `browser.submit({ formSelector })` — gated

---

## 2. Technical Architecture

### Process model

```
┌─────────────────┐    spawn     ┌────────────────────┐
│ Cortex sidecar  │─────────────▶│ Chromium --remote  │
│ (Node, port 4700│              │ -debugging-port    │
│ + MCP port 4710)│              │ =9222              │
└────────┬────────┘              └──────────┬─────────┘
         │                                  │
         │         CDP over WebSocket       │
         └──────────────────────────────────┘
```

### Sidecar modules (new files)

```
sidecar/src/browser/
├── cdp-client.ts          # WebSocket + JSON-RPC envelope (send/receive, subscribe)
├── chromium-launcher.ts   # Find system Chromium, spawn with right flags, health check
├── session-manager.ts     # One-browser-at-a-time lifecycle + tab tracking
├── buffers.ts             # Ring buffers for console + network (bounded)
├── tools/
│   ├── dom.ts             # dom_query / dom_text / dom_attributes / dom_snapshot
│   ├── runtime.ts         # eval (gated)
│   ├── console.ts         # console_tail / console_clear
│   ├── network.ts         # network_list / network_response / network_failures
│   ├── input.ts           # click / type / submit (gated)
│   └── page.ts            # goto / reload / screenshot / session_open|close
└── index.ts               # Public exports + tool registry
```

### MCP wiring

`sidecar/src/mcp/mcp-server.ts` already registers tools. Add a `browser.*` namespace and register each tool defined above. Each MCP tool handler is a thin wrapper over the CDP domain functions in `browser/tools/*.ts`.

### Safety gates (re-use v2.5 infra)

- Every tool call emits a `tool` event to the **Shadow Terminal** event bus (already built in v2.5).
- Write-capable tools (`eval`, `click`, `type`, `submit`, `goto` to non-http URLs) emit a `plan` event with `writeIntent: true` **before** dispatching to CDP. If the project's `execution_policies` table has a restrict rule matching the URL or selector, the tool aborts with `action restricted`.
- A new **Impact Event** appears in Shadow Terminal for every browser write: "Click on `<button#pay>` at https://checkout.example.com" — so the user can see what Claude did.

### System Chromium discovery

`chromium-launcher.ts` probes in order:
1. `$CHROME_PATH` (user override)
2. `/usr/bin/google-chrome`, `/usr/bin/chromium`, `/usr/bin/chromium-browser` (Linux)
3. `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (macOS)
4. `%ProgramFiles%\Google\Chrome\Application\chrome.exe` (Windows)

If none found ⇒ tool call returns a clear error: "Install Chromium or set CHROME_PATH."

### Launch flags

```
--remote-debugging-port=9222
--user-data-dir=~/.cortex/browser-profile      # isolated profile; survives restarts
--no-first-run --no-default-browser-check
--disable-features=IsolateOrigins,site-per-process   # per-origin off for DOM reads
--window-size=1280,800
```

Headless mode toggled via `session_open({ headless: true })`. Default headed for debuggability.

---

## 3. UI: Browser Activity in Cortex

New ActivityBar entry (Globe icon) → **Browser Panel**.

### Layout

```
┌──────────────────────────────────────────┐
│ [🌐] URL input    [Reload] [DevTools] [×]│  ← toolbar
├───────────────────┬──────────────────────┤
│                   │  Tabs:               │
│   Screenshot /    │  [Console] [Network] │
│   live preview    │  [Elements][Activity]│
│   (fits panel)    │──────────────────────│
│                   │  Streams from        │
│                   │  buffers.ts          │
│                   │  (scoped per tool    │
│                   │   call OR global)    │
└───────────────────┴──────────────────────┘
```

- **Left pane (60%):** latest screenshot; refreshes when Claude calls `screenshot` or user clicks Reload.
- **Right pane (40%):** four tabs mirroring the MCP tool surface. Each tab pulls from its CDP buffer — this IS the "AI mode browser view" Antigravity shows, except built on your infra.
- **Activity tab:** every browser MCP tool call with its Plan/Reflect, piped from the Shadow Terminal event bus filtered to `type: 'tool' && payload.name.startsWith('browser.')`.

No embedded Chromium inside the Tauri WebView — too fragile. The real browser runs as a separate window, Cortex's panel shows a screenshot + introspection.

---

## 4. Success Metrics

- **Tool-call latency.** p50 for `dom_query` < 50ms; p50 for `screenshot` < 400ms (local Chromium).
- **Selectivity.** % of Claude's browser tool calls that use domain-specific tools (dom_text, network_failures, etc.) vs generic `eval`. Higher = better segregation working.
- **Shadow visibility.** 100% of browser tool calls must appear in Shadow Terminal with payload. Missing events = regression.

Explicitly NOT measured:
- "Browser usage rate" — don't incentivize Claude to use the browser when it doesn't need to.

---

## 5. Roadmap

**Phase 1 — CDP client + Chromium launcher (foundation).**
- `cdp-client.ts`, `chromium-launcher.ts`, `session-manager.ts`, `buffers.ts`
- No MCP tools yet. Prove CDP round-trip works: send `Runtime.evaluate`, get result.
- Smoke test: Node REPL in sidecar can navigate + screenshot.

**Phase 2 — Read-only MCP tools (no gating needed).**
- `dom_*`, `console_*`, `network_*`, `screenshot`, `goto`
- Register via existing `mcp-server.ts`.
- Acceptance: Claude Code sees these tools via MCP; can call `browser.dom_query` and get a result.

**Phase 3 — Write-capable tools (gated).**
- `eval`, `click`, `type`, `submit`
- Hook into the orchestrator Plan phase (v2.5): if plan detects these calls, emit `impact` event with target URL + selector before dispatch.
- Add `execution_policies` rows for dangerous defaults (ban `eval` on banking domains, etc.).

**Phase 4 — Browser Panel UI.**
- New 'browser' activity in `navigation-store.ts`
- `<BrowserPanel />` with split-pane + 4 tabs
- EventSource subscription to shadow stream, filtered to `browser.*` tools
- Screenshot auto-refresh on tool calls

**Phase 5 — Dogfood.**
- Use it to debug Cortex's own frontend (live screenshot of Vite dev server, console errors, network failures).
- Measure tool-call latency and tighten hot paths.

---

## 6. Out of Scope (explicitly)

Listed so future proposals don't drift scope:

- **Multiple concurrent browsers.** One session at a time. Tabs yes, multiple browsers no.
- **Persistent logged-in state / cookies.** Comes in v2.7; for v2.6 the profile is scratch-and-isolated.
- **Input recording / playback.** This is a test framework, not what we're building.
- **Visual regression / screenshot diffing.** Separate concern; maybe v2.8.
- **Mobile device emulation.** Out of scope — if Claude needs mobile DOM, it can pass `Emulation.setDeviceMetricsOverride` via `eval`.
- **Proxy support / network interception for modification.** Read-only network in v2.6. Modification = v2.8.
- **Cloud browsers (Browserless, BrowserBase).** Violates local-first principle.
- **Playwright or Puppeteer as deps.** Decision is CDP-direct.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| User has no system Chromium | Clear tool-call error + link to install. Don't auto-download. |
| CDP API changes between Chrome versions | Pin to stable CDP domains (DOM, Runtime, Console, Network, Page). Avoid experimental ones. |
| `eval` tool is a foot-gun | Gated via Plan phase; emits write-intent event; bannable via `execution_policies`. |
| Screenshot size bloat into SSE | Base64 PNGs go over the MCP channel directly, NOT the Shadow Terminal stream. Stream only gets `{name, bytes, dimensions}` metadata. |
| Chromium zombie on sidecar crash | `chromium-launcher.ts` registers SIGCHLD; sidecar startup kills any previous browser tied to the old PID. |

---

## 8. File Impact (preview)

New:
- `sidecar/src/browser/**` (~8 files, ~600-800 lines total)
- `src/components/browser/BrowserPanel.tsx`
- `src/components/browser/ScreenshotView.tsx`
- `src/components/browser/BrowserEventTabs.tsx`

Modified:
- `sidecar/src/mcp/mcp-server.ts` — register browser.* tools
- `sidecar/src/index.ts` — mount new browser router (for UI REST endpoints)
- `sidecar/src/db/schema.ts` — optional `browser_sessions` table for persistence
- `src/stores/navigation-store.ts` — add 'browser' activity
- `src/components/workspace/WorkspaceTabs.tsx` — route 'browser' → `<BrowserPanel />`
- `src/components/ActivityBar.tsx` — Globe icon for Browser activity

---

## 9. What ships at the end of v2.6

A Cortex user can:
1. Open the Browser activity → see a headed Chromium launch.
2. Chat with Claude: *"go to our staging site, click login, report any console errors."*
3. Claude calls `browser.goto`, `browser.click` (gated — user sees impact card in Shadow Terminal), `browser.console_tail`.
4. Each step streams into Shadow Terminal. Screenshot updates live. Console/Network tabs show what Claude saw.
5. The user never has to open Chrome DevTools manually.

That is the Antigravity pattern — delivered on Cortex's own infrastructure, segregated by design, local-first, Claude-native.
