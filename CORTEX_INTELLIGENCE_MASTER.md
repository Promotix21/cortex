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
### A. The "Multi-Model Mix" & Roadmap
*   **MVP (Current):** **Claude** is the primary driver and sole engine for the open-source MVP.
*   **Phase 2 (~1 Month):** Integrate **OpenRouter** as the gateway for personal/local development. This will allow toggling between:
    *   **Claude:** Complex logic and architecture (Standard).
    *   **Gemini:** Creative scanning and "out-of-the-box" design research.
    *   **ChatGPT:** Micro-polishing and text optimization.
*   **Strategic Intent:** Keep the MVP lightweight and focused on Claude, while preparing for a "Model-Agnostic" local power-user mode in Phase 2.

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

## 7. Implementation Logic: "Masterpiece" Code Blocks

### A. Lenis Smooth Scroll (Optimized)
```javascript
// Masterpiece configuration for Lenis
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const lenis = new Lenis({
  duration: 1.5,
  easing: (t) => 1 - Math.pow(1 - t, 3), // cubic-out
  smooth: true,
  sync: true,
  touchMultiplier: isTouch ? 3 : 1,
  friction: isTouch ? 0.05 : 0.1
});

// Integration with ScrollTrigger
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);
```

### B. GSAP Batch Initialization (Performance Pattern)
Used to initialize complex sections without freezing the main thread.
```javascript
function gsapSectionIntializationBatches() {
  let allSections = document.querySelectorAll('[mayaaThemeSection]');
  let batchSize = 3;
  let delayBetweenBatches = 50;
  
  function processBatch(startIndex) {
    requestAnimationFrame(() => {
      for (let i = startIndex; i < startIndex + batchSize && i < allSections.length; i++) {
        let section = allSections[i];
        let method = section.getAttribute('methodCalled');
        if (typeof animator[method] === 'function') {
          animator[method](section);
        }
      }
      if (startIndex + batchSize < allSections.length) {
        setTimeout(() => processBatch(startIndex + batchSize), delayBetweenBatches);
      } else {
        ScrollTrigger.refresh(true);
      }
    });
  }
  processBatch(0);
}
```

### C. Staggered Text Reveal (SplitText)
```javascript
// Staggered Lines Reveal
const text = document.querySelector(".media-sentence-lines");
const split = new SplitText(text, { type: "lines", linesClass: "reveal-line" });
gsap.from(split.lines, {
  y: 50,
  opacity: 0,
  stagger: 0.1,
  duration: 1,
  ease: "power4.out",
  scrollTrigger: {
    trigger: text,
    start: "top 85%",
    toggleActions: "play none none reverse"
  }
});
```

---

## 8. Advanced Orchestration: The "Drishti" Patterns
> **Source:** Drishti Intelligent Lead & Audit Engine

### A. Human-in-the-Loop (HITL) Intelligence
*   **Pattern:** AI enriches and proposes; Humans qualify and authorize.
*   **Cortex Implementation:** Every high-impact AI suggestion (e.g., "Refactor Auth Module") must be gated by a "Qualification Step" where the user reviews the intent before the "Execution Phase" begins.

### B. Value-Led "Bespoke" Auditing
*   **Pattern:** Don't just find flaws; provide immediate, usable solutions (e.g., custom scripts, optimized config files).
*   **Cortex Implementation:** When Cortex identifies a bug, it should generate a "Solution Script" or "Technical Insight" alongside the fix to provide educational value and immediate utility.

### C. Performance & Evasion Hardening
*   **Pattern:** Isolate heavy processes (Crawlers/Workers) from the API/UI to prevent memory-leak crashes. Use stealth/stealth-evasion for protected environments.
*   **Cortex Implementation:** Use **Process Isolation** for heavy tasks like full-repo indexing. Ensure the UI remains responsive by offloading intensive AI reasoning to isolated background workers.

---

## 9. Interactive Luxury: The "Ninara" Patterns
> **Source:** Ninara New Design (E-commerce / Luxury Fashion)

### A. The "Blur-Reveal" Spring (Framer Motion)
A softer, more premium text entrance compared to standard fades.
```tsx
const variants = {
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', damping: 12, stiffness: 100 },
  },
  hidden: {
    opacity: 0,
    y: 20,
    filter: 'blur(10px)',
  }
};
```
*   **Cortex Implementation:** Use this for hero headlines and "Masterpiece" intro sections to achieve a high-fashion aesthetic.

### B. "Watch & Buy" Shoppable Interactions
*   **Pattern:** Immersive 9:16 video/image cards with `backdrop-blur-md` overlays and hover-triggered CTAs.
*   **Code Signature:**
    *   `group-hover:scale-105` on media for depth.
    *   `translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100` for the CTA entrance.
*   **Cortex Implementation:** Suggest this for any "Discovery" or "Collection" section requiring high user engagement.

---

## 10. High-Scale Ecosystems: The "Synergy Hub" Patterns
> **Source:** Hiraya Digital Synergy Hub (Next.js + NestJS + React Native)

### A. "Triple-Process" Isolation
*   **Pattern:** Separate **API**, **Worker**, and **UI** processes to prevent memory leaks in one (e.g., Playwright) from crashing the others.
*   **Cortex Implementation:** For any project involving heavy background tasks or crawlers, Cortex should suggest a **"Worker Process Architecture"** using BullMQ to decouple execution from the main API.

### B. Pre-commit "Hard Gates"
*   **Pattern:** Enforced Conventional Commits (`feat:`, `fix:`) and automated Lint-Staged (`eslint --fix`, `prettier`) on every commit.
*   **Cortex Implementation:** Automatically suggest setting up **Husky + Commitlint** to ensure the project history remains "Masterpiece" quality without manual cleanup.

### C. Surgical Playwright Debugging
*   **Protocol:** Never dump full HTML. Instead, intercept specific endpoints and check **Response Shape** (status, data structure, length) to remain token-efficient.
*   **Cortex Implementation:** When generating E2E tests, Cortex should use "Shape-Only" assertions to minimize context usage while maintaining high test reliability.

---

## 11. Programmatic Video: The "Remotion Studio" Patterns
> **Source:** Remotion Demo (Programmatic Video for Developers)

### A. React-Based Video Logic (Remotion 4)
*   **Pattern:** Using React components to define 60fps video frames. Timeline-based composition using `Sequence` and `Composition`.
*   **Cortex Implementation:** Bake in a **"Promotion Engine"** that can programmatically generate `.mp4` walkthroughs of the project's current state.

### B. "Interactive Steps" Sequences
*   **Pattern:** Structured, step-by-step video sequences that sync with codebase milestones.
*   **Cortex Implementation:** Provide a "Generate Promo Video" button that takes the current `Project Brain` (Summary, Architecture, Features) and pipes it into a Remotion template to produce a professional feature reel.

---

## 12. E-Commerce Mastery: The "Shopify" Patterns
> **Source:** Vellaro & Celebrate Festival (Custom Theme & App Architecture)

### A. High-Performance Liquid Patterns
*   **B2B/Wholesale Logic (WCP/WPD):** Use custom snippets (\`wcp_render_discount.liquid\`) to handle complex pricing logic on the fly. Avoid heavy apps by baking pricing rules into Liquid logic.
*   **Hierarchical Hubs:** Implement AJAX-based collection hubs (\`collection-level2-hub-ajax.liquid\`) for extremely fast navigation through deep catalogs.
*   **Brand Mapping:** Use a flat-file (\`_brand-logo-mapping.txt\`) or dedicated snippets (\`cf-brand-*.liquid\`) to maintain highly customized, brand-specific landing pages without manual page creation.

### B. Custom Dashboard & API Helpers
*   **Pattern:** A dedicated PHP-based \`ShopifyAPI\` wrapper for pulling real-time stats (Revenue, Fulfilled vs. Pending, Daily Comparison) into external dashboards.
*   **Cortex Implementation:** Provide an "E-commerce Context" mode that understands Shopify's Liquid objects, Schema definitions, and REST/GraphQL API patterns.

### C. Mobile-App Aesthetic for Web
*   **Pattern:** Use a \`mobile-bottom-nav.liquid\` and dedicated \`mobile-app.js\` to make the Shopify store feel like a native mobile app on handheld devices.
*   **Cortex Implementation:** Include these "App-Like" Liquid snippets in the local Motion Library for instant e-commerce mobile optimization.

### D. Partner & Brand Integration
*   **Pattern:** Modular \`partner-section.liquid\` with automated logo grid generation for corporate and industrial brands (Umang Boards style).
*   **Cortex Implementation:** Store these "Brand Grid" templates in the Prompt Composer for generating high-end partner sections.
