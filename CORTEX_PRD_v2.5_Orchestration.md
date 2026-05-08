# Cortex v2.5 — Orchestration Layer

**Version:** 2.5 (increment on v2.1)
**Status:** Shipped (2026-04-13) — all three feature pillars live in the installed app.
**Scope:** Narrow. Three features. Ships on top of v2.1 foundations (Session Manager, MemPalace, Rooms, Playbooks).

---

## Guiding Principles (non-negotiable)

- **Claude-Code-native.** All LLM work goes through the Claude Code CLI on the user's Max subscription. No paid API keys.
- **Local-first.** All reasoning/graphing/indexing uses existing sidecar infra (`file-indexer.ts`, `project-scanner.ts`, MemPalace, AAAK).
- **Human-gated autonomy.** The orchestrator may *propose* and *verify*; it does not execute destructive or cross-file changes without an explicit user approval.

Anything that violates these principles is out of scope for v2.5, regardless of how compelling it sounds.

---

## 1. Shadow Terminal (read-only agent transparency panel)

**Problem.** Users can't see *why* the sidecar/orchestrator took an action. Debugging agent behavior requires tailing logs outside the app.

**Solution.** A dedicated, read-only UI panel that streams:
- Orchestrator plan/reflection steps
- Tool calls issued by the agent (file reads, grep, git, shell)
- `bridge-client.ts` interactions with the Claude Code CLI
- MemPalace retrievals (which rooms/chunks were loaded for a prompt)

**Not in scope.** Editing or replaying from the Shadow Terminal. It is read-only v1.

**Acceptance.**
- Toggleable panel in the sessions workspace (not always-on — opt-in for deep work).
- Streams in real time; old entries scroll out of view.
- Entries are grouped by session so users can scope to one task.

---

## 2. Orchestrator Planning & Reflection Phases

**Problem.** The orchestrator today runs in a request-response loop. It can issue a bad tool call and only notice after failure.

**Solution.** Introduce two explicit phases around every tool-using action:

- **Plan.** Before any multi-step action, the orchestrator produces a short plan: what tools it will call, in what order, what it expects back.
- **Reflect.** After execution, the orchestrator summarizes what actually happened vs. the plan, and decides whether to continue, retry, or abort.

Both phases emit structured events consumed by the Shadow Terminal.

**Not in scope.** Autonomous retries on destructive failures (git push, file delete). Those still require a user prompt.

**Acceptance.**
- `sidecar/src/orchestrator/index.ts` has typed `Plan` and `Reflection` records persisted per orchestrator run.
- Shadow Terminal renders plan/reflect entries inline with tool calls.

---

## 3. Local Impact Graph (the Verification Step)

**Problem.** When the agent is about to edit a file, the user has no cheap way to see what else depends on it — especially in a multi-package repo. This is the single biggest safety gap before any autonomy.

**Solution.** Before any multi-file change, the orchestrator computes an **Impact Graph** from the local symbol/file index:
- "This change touches `schema.ts` → 14 imports in `sidecar/`, 3 in `src/stores/`, 1 in `src-tauri/`."
- Rendered as a compact diff preview in the Shadow Terminal and/or a modal.
- User approves → orchestrator executes. User rejects → orchestrator aborts.

**Implementation.**
- Extend `sidecar/src/intelligence/file-indexer.ts` to emit an importer list per symbol.
- New endpoint: `GET /intelligence/impact?file=...&symbol=...` → returns affected file paths with relevance scores.
- Frontend component: `<ImpactPreview />` rendered inside Shadow Terminal entries tagged as "write intent."

**Not in scope.** Cross-repo impact. Runtime/dynamic dependency tracking. These are v3 territory.

**Acceptance.**
- Impact graph resolves in <500ms for files with ≤50 dependents.
- User can click a dependent file to open it in a preview tab.
- Orchestrator does not proceed with multi-file writes until the graph has been acknowledged.

---

## Success Metrics (replaces v3's "Autonomy Ratio")

- **Time-to-trust.** How many sessions before a user enables orchestrator write actions? Lower = better UX.
- **Plan accuracy.** % of orchestrator plans that match actual execution trace (captured via Reflection phase).
- **Impact graph usefulness.** % of impact previews that surfaced at least one file the user didn't expect.

We explicitly do *not* measure "% of changes initiated by agent" — that incentivizes noise.

---

## Roadmap

1. **Phase 1 — Shadow Terminal (read-only).** ✅ **Shipped 2026-04-13.** Event bus (`sidecar/src/orchestrator/event-bus.ts`), SSE at `/api/shadow/stream`, and `<ShadowTerminalPanel />` live under a new Activity icon.
2. **Phase 2 — Plan/Reflect.** ✅ **Shipped 2026-04-13.** `orchestrator/plan.ts` runs heuristic intent analysis + reflection; events stream into Shadow Terminal.
3. **Phase 3 — Impact Graph.** ✅ **Shipped 2026-04-13.** `intelligence/impact-graph.ts` parses ESM/CJS/dynamic imports; `file_imports` table indexed; `/api/shadow/impact` resolves dependents. Rendered in Shadow Terminal when Plan detects write intent + mentioned files.
4. **Phase 4 — Dogfood.** In progress. Impact accuracy and plan-accuracy metrics will be captured from real usage over the next 2 weeks.

---

## Explicitly Out of Scope (for v2.5)

- Gemini or any other paid LLM API integration.
- Autonomous PR creation / "Gap-Filler" bots.
- Multi-repo refactoring.
- Agent-initiated background changes without user presence.

These are not "not now" — they are "not here." Revisit only after v2.5 ships and dogfooding produces real data on what's actually needed.
