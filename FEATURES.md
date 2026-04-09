# Cortex Features

Cortex is an AI-native developer command center designed to eliminate context loss and streamline multi-project management.

## 1. AI Orchestrator Layer
The central nervous system of Cortex. It unifies context assembly, safety policies, and AI provider routing into a single, predictable pipeline.

- **Context Assembly:** Automatically gathers project brain, recent errors, and code patterns.
- **Provider Routing:** Seamlessly switches between the Anthropic SDK, the `claude` CLI, and **Native Google Gemini API**.
- **Safety Policies:** Enforces restricted patterns (e.g., `rm -rf`) before any AI interaction.
- **OpenRouter Fallback:** Automatically switches to OpenRouter or Gemini Pro when Claude Max rate limits (from Budget Guard) are reached, ensuring zero downtime.
- **Native Gemini Pro:** Direct integration with Google AI Studio (Gemini 1.5 Pro) for high-performance fallback.
- **Implementation:** `sidecar/src/orchestrator/index.ts`

## 2. Playbook Execution Engine
Automate repetitive workflows with step-by-step AI-guided recipes.

- **Step Types:** Supports `command` (shell), `ai_prompt` (Claude interaction), `checkpoint` (approval), and `manual`.
- **Progress Tracking:** Real-time status updates and execution history.
- **Resume Capability:** Pause at checkpoints and resume after manual verification.
- **Implementation:** `sidecar/src/intelligence/playbook-manager.ts`

## 3. Real-Time Error Intelligence
Never solve the same bug twice. Cortex captures errors and matches them to your past solutions.

- **Chrome Extension:** Intercepts browser errors and network failures.
- **Fuzzy Normalization:** Strips dynamic data (UUIDs, timestamps) from errors to create stable signatures.
- **Auto-Matching:** Instantly surfaces known solutions from Debug Memory.
- **Implementation:** `sidecar/src/intelligence/error-normalizer.ts`

## 4. Persistent Project Brain
Every project has a unique, persistent intelligence profile.

- **Auto-Scanning:** Detects tech stacks, ports, auth patterns, and documentation on project add.
- **Deep Indexing:** Lightweight map of your codebase (controllers, models, routes).
- **Conventions:** Stores project-specific coding standards for AI injection.
- **Implementation:** `sidecar/src/intelligence/project-scanner.ts`

## 5. Live File Watcher
The AI's knowledge of your project structure stays up-to-date automatically.

- **Event-Driven:** Uses `fs.watch` to detect file creation, deletion, and modification.
- **Debounced Re-indexing:** Updates the `file_index` efficiently without hammering performance.
- **Implementation:** `sidecar/src/intelligence/file-indexer.ts`

## 6. Named Claude Code Sessions
Infrastructure for `claude-code` users.

- **Named Identity:** Assign meaningful names like `refactor-auth` to your AI sessions.
- **Session Resume:** `claude --resume` integration with automatic context restoration.
- **Usage Tracking:** Precise tracking of prompts and tokens per project for billing.

## 7. Enhanced Command Palette
A productivity-first `Ctrl+K` interface for navigating your entire workspace.

- **Quick Actions:** Jump to Terminal, AI Chat, Git, or Settings instantly.
- **Global Search:** Find projects, sessions, patterns, and debug memories in one place.
- **Intelligent Filtering:** Prioritizes relevant actions based on your current project.
- **Implementation:** `src/components/CommandPalette.tsx`

## 8. Document Builder (MCP)
Generate professional documentation directly via AI.

- **Tool-Based:** Claude can invoke tools to create `.docx`, `.pdf`, and `.xlsx` files.
- **No Local Deps:** Generates complex documents without requiring project-specific installs.
- **Implementation:** `sidecar/src/mcp/document-builder.ts`

## 9. Budget Guard
Stay within your Claude Max subscription limits.

- **Rate Monitoring:** Tracks messages per 5h, tokens per day, and session counts.
- **Visual Alerts:** Warning banners and blocking when limits are exceeded.
- **Implementation:** `sidecar/src/intelligence/budget-guard.ts`

## 10. Remotion Studio
Programmatic video rendering for project demos.

- **Video-as-Code:** Render `.mp4` walkthroughs using React-based Remotion templates.
- **Prop Injection:** Project brain data flows directly into video assets.
- **Implementation:** `sidecar/src/intelligence/remotion-renderer.ts`
