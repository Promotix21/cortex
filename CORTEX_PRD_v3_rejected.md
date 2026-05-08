> **STATUS: REJECTED (2026-04-13)** — Superseded by `CORTEX_PRD_v2.5_Orchestration.md`.
>
> **Why rejected:** Introduces Gemini API dependency, which violates Cortex's core identity (Claude-Code-native, local-first, no API keys). "Codex" branding collides with OpenAI Codex and duplicates existing Rooms/MemPalace concepts. "Autonomy Ratio" is a bad incentive metric. Retained for historical reference — salvageable ideas (Shadow Terminal, Planning/Reflection, local Impact Graph) moved into v2.5.

---

# Product Requirements Document (PRD): Cortex v3.0 – The Agentic Evolution

**Version:** 3.0 (Codename: "Synthetic Partner")  
**Status:** Draft / Conceptual  
**Target:** Senior Developers & Software Architects  

---

## 1. Executive Summary
Cortex v3.0 transforms from a high-fidelity **developer workspace** into a **proactive agentic OS**. By integrating Gemini’s ultra-long context (2M+ tokens) and Codex-driven context switching, Cortex will no longer wait for user commands. It will autonomously identify implementation gaps, manage complex cross-repository refactors, and maintain a "persistent cognitive state" across sessions.

---

## 2. Strategic Objectives
*   **Transition to Proactivity:** Move the `Sidecar Orchestrator` from a request-response model to an autonomous agent loop.
*   **Contextual Infinity:** Leverage Gemini 1.5 Pro to eliminate RAG fragmentation, allowing the agent to "see" the entire codebase at once.
*   **Zero-Latency Switching:** Enable "Codex Snapshots" to instantly swap between complex feature contexts (e.g., switching from Tauri/Rust internals to React/Vite frontend).

---

## 3. Key Feature Pillars

### A. Autonomous Implementation Engine (Agentic Dev)
*   **Gap-Filler Bot:** The sidecar will periodically scan `IMPLEMENTATION_GAPS.txt` and `CORTEX_PRD_v2.md` to propose (and execute) PRs that align with project goals.
*   **Tool-Use Mastery:** Direct integration with `terminal-store.ts` and `git.ts` to allow the agent to run tests, debug failures, and self-correct code before presenting it to the user.
*   **Background "Janitor":** Automated background linting, type-checking, and documentation updates triggered by the `background-worker.ts`.

### B. Gemini "Infinite" Context Integration
*   **Project-Wide Reasoning:** Bypass traditional vector search (MemPalace) for high-level architectural questions. Gemini will ingest the entire `src/`, `sidecar/`, and `src-tauri/` directories simultaneously.
*   **Deep Logic Mapping:** Use Gemini to generate a "Logic Graph" that tracks how a change in `schema.ts` ripples through to `App.tsx` and the Chrome Extension.
*   **Multi-Modal Debugging:** Support for screenshots (via `take-screenshots.mjs`) to allow the agent to "see" UI bugs and correlate them with console logs.

### C. Codex Context Switching & "Room" Persistence
*   **Workspace Snapshots:** Ability to save the "Mental Model" of a specific task (open files, terminal history, active memory chunks, and Gemini's current thought-stream).
*   **Room-Aware Intelligence:** Enhanced `room-detector.ts` that adjusts the agent's behavior based on whether the user is in "Deep Work Mode" (no interruptions) or "Architectural Review" (proactive suggestions).
*   **State Telemetry:** Syncing the Chrome Extension's research state directly into the Sidecar's active "Room" so documentation is instantly available for code generation.

---

## 4. Technical Architecture Enhancements
*   **Orchestrator v2:** Upgrade `sidecar/src/orchestrator/index.ts` to support "Planning" and "Reflection" phases before execution.
*   **Native Gemini CLI Bridge:** A dedicated service to pipe project context into the Gemini API without exceeding token limits via intelligent "Context Pruning."
*   **Tauri Sidecar Expansion:** Enhanced permissions for the sidecar to perform low-level OS operations (file watchers, build triggers).

---

## 5. User Experience (UX) Evolution
*   **The "Shadow" Terminal:** A dedicated UI panel where users can watch the agent "think" and "act" in real-time without cluttering the primary terminal.
*   **Proactive Toast Notifications:** Instead of "Task Complete," the UI will show "I noticed a mismatch in the API types and fixed it in a new branch. Review?"
*   **Command Palette v3:** Integrated "Agent Commands" (e.g., `/implement-feature [feature_name]` or `/refactor-context-switching`).

---

## 6. Success Metrics
*   **Autonomy Ratio:** Percentage of code changes initiated by the Agent vs. the User.
*   **Context Recovery Time:** Speed at which a user can resume a complex task after a 24-hour break (measured by "Time to First Edit").
*   **Token Efficiency:** Accuracy of Gemini's architectural insights compared to manual code review.

---

## 7. Implementation Roadmap
1.  **Phase 1 (Foundations):** Integrate Gemini CLI and SDK into the `Sidecar` intelligence layer.
2.  **Phase 2 (Autonomy):** Enable write-access for the `Orchestrator` to the filesystem and git.
3.  **Phase 3 (Persistence):** Build the "Codex Room" UI for managing workspace snapshots.
4.  **Phase 4 (Validation):** Beta test with the "Gap-Filler" bot on the Cortex repo itself.
