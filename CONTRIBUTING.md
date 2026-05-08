# Contributing to Cortex

First off, thank you for considering contributing to Cortex! It's people like you that make Cortex a great tool for the AI-native developer community.

## Our Philosophy
Cortex is built with **Masterpiece Design Standards**. We value:
- **Local-first security:** Data never leaves the machine.
- **High performance:** Minimal latency in AI orchestration.
- **Visual Polish:** Award-worthy UI and animations.

## How to Contribute

### 1. Setting Up Development Environment
Cortex is a monorepo consisting of a React frontend, an Express sidecar, and a Tauri Rust shell.

```bash
# Clone the repo
git clone https://github.com/Promotix21/cortex.git
cd cortex

# Install frontend dependencies
pnpm install

# Install sidecar dependencies
cd sidecar && pnpm install && cd ..
```

### 2. Running the App in Dev Mode
You need to run the sidecar and the Tauri shell separately during development.

```bash
# Terminal 1: Sidecar
cd sidecar && pnpm dev

# Terminal 2: Tauri
pnpm tauri dev
```

### 3. Coding Standards
- **TypeScript:** We use strict mode. No `any` types.
- **State Management:** We use Zustand. Keep stores focused and modular.
- **Styling:** Vanilla CSS or Tailwind 4. Follow the Catppuccin Mocha color palette.
- **AI-Assisted:** If you use Claude Code, follow the guidelines in `CLAUDE.md`.

### 4. Pull Request Process
1. Create a new branch for your feature or bugfix.
2. Ensure `pnpm exec tsc --noEmit` passes in both the root and `sidecar/` directories.
3. Write a clear PR description detailing what you changed and why.
4. One of the maintainers will review your PR within 48 hours.

## Areas Looking for Help
- **macOS Support:** Testing and fixing PTY/Binary discovery for Mac.
- **New AI Providers:** Adding support for OpenRouter, Ollama, etc.
- **Documentation:** Improving the setup guide for various Linux distros.

## Questions?
Open an issue or contact the lead maintainer at `rajesh_kumar@hiraya.digital`.
