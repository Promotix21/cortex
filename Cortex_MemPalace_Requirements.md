# Requirements: Cortex High-Fidelity Memory Integration

## 0. Reference Materials
*   **Source Repository:** [https://github.com/milla-jovovich/mempalace](https://github.com/milla-jovovich/mempalace)
*   **Core Concepts:** AAAK Dialect, Method of Loci Hierarchy, Temporal Knowledge Graph, Layered Memory Stack.

## 1. Objective
Enhance Cortex's context management and long-term memory capabilities by implementing AAAK compression, a temporal knowledge graph, and a hierarchical memory structure. This will reduce token usage while increasing the depth and accuracy of the AI's "Project Brain."

## 2. Core Features to Implement

### A. AAAK (AI-to-AI Knowledge) Compression
*   **Goal:** Replace standard English summaries with a lossless, LLM-readable shorthand.
*   **Requirements:**
    *   Implement a `CompressionService` in `sidecar/src/intelligence/`.
    *   Convert `project_brain` summaries and `pattern_memory` into AAAK format.
    *   **Logic:** Use abbreviations (e.g., `arch` for architecture, `conv` for conventions), remove filler words, and use structural markers (e.g., `!` for critical, `?` for pending) to achieve up to 30x compression.
    *   Update `context-injector.ts` to prioritize AAAK-compressed blocks.

### B. Temporal Knowledge Graph (SQLite)
*   **Goal:** Track how facts and decisions evolve over time.
*   **Database Updates (`schema.ts`):**
    *   Add `valid_from` (DATETIME) and `valid_until` (DATETIME, nullable) to `project_brain` and `decisions`.
    *   Create a `knowledge_graph` table: `id, project_id, subject, predicate, object, valid_from, valid_until`.
*   **Service Logic:** When updating a project summary or decision, "end" the previous record by setting `valid_until` and create a new entry instead of overwriting.

### C. Hierarchical Memory Structure (The "Palace")
*   **Goal:** Move away from flat metadata to a Wing-Hall-Room hierarchy.
*   **Definitions:**
    *   **Wings:** `project_id`
    *   **Halls:** `Facts`, `Events`, `Patterns`, `Decisions`
    *   **Rooms:** Specific technical domains (e.g., `auth`, `database`, `ui-components`)
*   **Implementation:** Add a `room_tag` column to `pattern_memory`, `debug_memory`, and `notes`. Update the context injector to pull context based on the "Room" relevant to the current file path.

### D. Layered Memory Stack (L0–L3)
*   **L0 (Identity):** Project name, core tech stack (Always included).
*   **L1 (Critical Facts):** High-level AAAK-compressed brain summary (Always included).
*   **L2 (Room Recall):** Context specifically related to the current "Room" (Loaded if file path matches room tags).
*   **L3 (Deep Search):** Full history retrieval (Triggered via MCP tool).

### E. Contradiction Detection
*   **Goal:** Prevent stale or conflicting information from entering the Project Brain.
*   **Logic:** When `save_intelligence` is called via MCP, the system must first query existing AAAK facts for the relevant "Room" and check for logical conflicts.
*   **Action:** Flag contradictions to the user/agent before committing the update.

## 3. Technical Tasks

### Phase 1: Database & Model Refactoring
1.  Modify `sidecar/src/db/schema.ts` to include temporal columns (`valid_from`, `valid_until`) and hierarchical tags (`room_tag`).
2.  Update TypeScript types in `src/types/intelligence.ts`.

### Phase 2: Intelligence Services
1.  **`AAAKService`**: Create utility functions for `compress(text)` and `decompress(text)`.
2.  **`TemporalService`**: Logic for managing "active" vs "historic" facts in SQLite.
3.  **`ContradictionService`**: A small LLM-powered check to validate new intelligence against old.

### Phase 3: Context Injection Overhaul
1.  Update `sidecar/src/intelligence/context-injector.ts`:
    *   Change `assembleContext` to follow the L0–L3 priority.
    *   Implement "Room-aware" injection: Detect the current working directory/file and pull related L2 context.

### Phase 4: MCP Tool Expansion
1.  Add new tools to `sidecar/src/mcp/mcp-server.ts`:
    *   `recall_room(room_name)`: Get deep context for a specific domain.
    *   `query_history(query, date_range)`: Access the temporal graph.
    *   `check_consistency(fact)`: Explicitly check a new finding against memory.

## 4. Acceptance Criteria
*   `.cortex-context.md` size is reduced by at least 50% for the same amount of information.
*   The AI can correctly identify that a past decision was "overridden" by a newer one based on the temporal graph.
*   Context injected into a session is significantly more relevant to the specific files being edited.
*   No regressions in existing functionality.
