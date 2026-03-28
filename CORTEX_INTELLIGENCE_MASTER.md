# CORTEX MASTER INTELLIGENCE: The "Masterpiece" Patterns
> **Confidential & Local-Only** | Gathered from: TIA, Umang Boards, Saie Paranjape, Ruthambhara, Velaro.

This document serves as the high-signal intelligence layer for **Cortex**. It captures the architectural, design, and AI-interaction patterns that define a "Masterpiece" project.

---

## 1. Core Philosophy: The "Masterpiece" Standard
*   **Light-First Aesthetic:** Always prioritize a premium, "Light Theme First" approach. Use high-contrast typography, generous whitespace, and sophisticated corporate palettes (e.g., Navy Blue #0B1F3A, White #FFFFFF, Gold #C8A84B).
*   **Award-Worthy Motion:** UI must feel "alive" through high-end animations (Three.js, WebGL) and silky-smooth scrolling (Lenis + GSAP).
*   **AI-Native Orchestration:** Don't just chat with AI; build multi-agent pipelines (Orchestrator -> Agents -> Runner -> Analyzer).

---

## 2. Development Process Intelligence
### A. Phase-Based Lifecycle
*   Every project MUST follow a structured 8-12 phase build plan (e.g., TIA's Phase 1: Infrastructure -> Phase 8: Hardening).
*   **Cortex Implementation:** Track "Current Phase" in the Project Brain. Prevent AI from suggesting out-of-phase features.

### B. The Handoff Protocol
*   **Next Session Prompt:** Every session must end with a `NEXT_SESSION_PROMPT.md` containing:
    1.  File read order (CLAUDE.md first).
    2.  Context: "Where We Are."
    3.  Step-by-step next goals.
    4.  "If Something Breaks" troubleshooting guide.
*   **Cortex Implementation:** Automate the generation of this handoff file at the end of every active AI session.

### C. The "Hard Rules" (Project Guardrails)
*   **Tech Stack Lock:** Once a stack is chosen (e.g., NestJS, TypeORM, BullMQ, Tailwind 4), AI is forbidden from suggesting alternatives.
*   **Multi-Tenancy:** Every query must be scoped to `org_id` or `project_id`.
*   **Security:** AES-256 encryption for all project secrets (VCS tokens, API keys).
*   **Cortex Implementation:** Inject these rules into the system prompt for every AI interaction.

---

## 3. Frontend Design Engine: "Award-Worthy" UI
### A. The Animation Stack
*   **Smooth Scroll:** Lenis for non-native feeling, ultra-smooth scrolling.
*   **Motion Framework:** GSAP + ScrollTrigger for scroll-bound storytelling.
*   **Signature Effects:**
    *   Staggered text entrances (character-by-character).
    *   WebGL/Three.js shaders for image transitions and background depth.
    *   Clip-path/Mask transitions for section changes.

### B. Layout & Styling
*   **Bento Grids:** Use modern, industrial bento-style layouts for feature/value sections.
*   **Typography:** Bold, clean corporate fonts (avoid generic "startup" looks).
*   **Visual Assets:** Use high-signal AI prompts for "Cinematic industrial" visuals (e.g., "Golden hour lighting," "Deep depth of field," "Blue and gold color grading").

---

## 4. AI Interaction & Prompt Strategy
### A. The "Multi-Model Mix"
*   **Claude:** Primary for complex logic, code architecture, and multi-file refactoring.
*   **Gemini:** Secondary for creative context, "out-of-the-box" design ideas, and deep codebase scanning.
*   **ChatGPT:** Tertiary for final text polishing and micro-optimizations.
*   **Cortex Implementation:** Add a "Model Selector" or "Model Hybrid" mode where different tasks are routed to the model best suited for them based on these traits.

### B. Structured Prompting
*   **Context Budgets:** Limit context to ~11k tokens to prevent "hallucination noise."
*   **Source Weighting:** Prioritize (Project Brain > Captured Errors > Pattern Memory) in the context window.

---

## 5. Security & GitHub Exclusion
*   **Local Intelligence:** This master file and the resulting Cortex "Brain" data MUST NOT be pushed to public repos.
*   **Gitignore Mandate:** Always exclude:
    *   `intelligence/` (The pattern memory folder)
    *   `*.db`, `*.db-wal` (The local brain)
    *   `NEXT_SESSION_PROMPT.md` (Contains transient session context)

---

## 6. Actionable "Cortex" Features to Add
1.  **"Masterpiece Mode":** A toggle that injects the GSAP/Lenis/Light-First rules into every prompt.
2.  **"Handoff Generator":** A button to export the current state into a `NEXT_SESSION_PROMPT.md`.
3.  **"Hard Rule Guard":** A feature that scans AI output and flags any violation of the locked tech stack or security rules.
4.  **"Prompt Composer":** A library of your high-signal image/video prompts for industrial and luxury aesthetics.
