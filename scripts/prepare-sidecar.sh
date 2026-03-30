#!/bin/bash
# Prepare a self-contained sidecar bundle for Tauri production builds.
# Resolves pnpm symlinks into a flat node_modules that Tauri can bundle.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SIDECAR_SRC="$PROJECT_DIR/sidecar"
BUNDLE_DIR="$PROJECT_DIR/sidecar-bundle"

echo "[prepare-sidecar] Building sidecar..."
cd "$SIDECAR_SRC"
pnpm build

echo "[prepare-sidecar] Creating clean bundle at $BUNDLE_DIR..."
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/dist"

# Copy built JS
cp "$SIDECAR_SRC/dist/index.js" "$BUNDLE_DIR/dist/"

# Copy package.json for module resolution
cp "$SIDECAR_SRC/package.json" "$BUNDLE_DIR/"

# Install production deps without symlinks (npm, not pnpm) so Tauri can bundle them
cd "$BUNDLE_DIR"
npm install --production --ignore-scripts 2>/dev/null || true

# Rebuild native addons in the bundle dir
npm rebuild better-sqlite3 node-pty 2>/dev/null || true

BUNDLE_SIZE=$(du -sh "$BUNDLE_DIR" | cut -f1)
echo "[prepare-sidecar] Bundle ready: $BUNDLE_SIZE"
