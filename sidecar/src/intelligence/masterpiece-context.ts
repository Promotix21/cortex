/**
 * Masterpiece Mode — Design philosophy rules injected into AI suggestions.
 * When enabled, these guidelines are appended to the system prompt and context.
 */
export const MASTERPIECE_RULES = `
## Masterpiece Mode — Design Philosophy

### Core Principles
- **Light-First Aesthetic:** Premium, award-worthy design with high-contrast typography, generous whitespace, and sophisticated corporate palettes.
- **Award-Worthy Motion:** UI must feel alive — use smooth scroll (Lenis), GSAP + ScrollTrigger for animations, staggered text entrances, WebGL/Three.js for depth.
- **Desktop-Quality UI:** VSCode/Cursor-level polish. Minimum 14px body text, proper padding (cards: 16px 20px, buttons: 10px 20px).
- **Dark Theme Excellence:** Catppuccin Mocha color palette via CSS custom properties.

### Animation Stack
- Lenis for ultra-smooth scrolling (duration: 1.5, cubic-out easing)
- GSAP + ScrollTrigger for scroll-bound storytelling
- Staggered character reveals via SplitText
- Blur-reveal spring transitions (Framer Motion: damping 12, stiffness 100)
- Clip-path and mask transitions for section changes

### Layout Rules
- Bento grids for feature sections
- Bold, clean corporate typography (no generic startup fonts)
- High-signal visual assets with cinematic quality
- Mobile-first responsive with app-like bottom nav on mobile

### Code Quality
- Structured 8-12 phase build plans
- Tech stack lock (no alternative suggestions once stack is chosen)
- Pre-commit hard gates (Conventional Commits, ESLint, Prettier)
- Process isolation for heavy tasks (BullMQ workers separate from API)
- Shape-only assertions for E2E tests (minimize context usage)

### AI Interaction Rules
- Context budget: ~11k tokens max
- Source priority: Project Brain > Captured Errors > Pattern Memory
- Human-in-the-loop gating for high-impact suggestions
- Solution scripts alongside bug fixes (educational value)
`.trim();

/**
 * Get the masterpiece context block for injection
 */
export function getMasterpieceContext(): string {
  return MASTERPIECE_RULES;
}
