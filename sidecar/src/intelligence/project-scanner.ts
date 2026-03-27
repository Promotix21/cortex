import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index.js';
import { indexProject, getProjectStructureSummary } from './file-indexer.js';
import simpleGit from 'simple-git';

interface ScanResult {
  filesIndexed: number;
  brainPopulated: boolean;
  summary: string;
}

/**
 * Full project scan: index files + auto-populate brain
 */
export async function scanProject(projectId: string, projectPath: string): Promise<ScanResult> {
  // 1. Index files
  const { indexed, byType } = indexProject(projectId, projectPath);

  // 2. Read project metadata
  const brain = await buildBrainFromScan(projectPath, byType);

  // 3. Populate brain (only fill empty fields — don't overwrite user data)
  const db = getDb();
  const existing = db.prepare('SELECT * FROM project_brain WHERE project_id = ?').get(projectId) as any;

  if (existing) {
    const updates: string[] = [];
    const params: any[] = [];

    if (!existing.summary && brain.summary) {
      updates.push('summary = ?');
      params.push(brain.summary);
    }
    if (!existing.architecture_notes && brain.architecture) {
      updates.push('architecture_notes = ?');
      params.push(brain.architecture);
    }
    if (!existing.conventions && brain.conventions) {
      updates.push('conventions = ?');
      params.push(brain.conventions);
    }
    if (!existing.dependencies_notes && brain.dependencies) {
      updates.push('dependencies_notes = ?');
      params.push(brain.dependencies);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(projectId);
      db.prepare(`UPDATE project_brain SET ${updates.join(', ')} WHERE project_id = ?`).run(...params);
    }
  }

  const structureSummary = getProjectStructureSummary(projectId);

  return {
    filesIndexed: indexed,
    brainPopulated: true,
    summary: `Indexed ${indexed} files. ${structureSummary.split('\n')[0]}`,
  };
}

async function buildBrainFromScan(
  projectPath: string,
  byType: Record<string, number>
): Promise<{ summary: string; architecture: string; conventions: string; dependencies: string }> {
  const parts = {
    summary: '',
    architecture: '',
    conventions: '',
    dependencies: '',
  };

  // --- Summary from package.json / Cargo.toml / etc ---
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const desc = pkg.description ? ` — ${pkg.description}` : '';
      parts.summary = `${pkg.name || path.basename(projectPath)}${desc}`;
      if (pkg.version) parts.summary += ` (v${pkg.version})`;
    } catch { /* */ }
  }

  const cargoPath = path.join(projectPath, 'Cargo.toml');
  if (!parts.summary && fs.existsSync(cargoPath)) {
    try {
      const content = fs.readFileSync(cargoPath, 'utf-8');
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      const descMatch = content.match(/description\s*=\s*"([^"]+)"/);
      if (nameMatch) parts.summary = nameMatch[1];
      if (descMatch) parts.summary += ` — ${descMatch[1]}`;
    } catch { /* */ }
  }

  if (!parts.summary) {
    parts.summary = `Project: ${path.basename(projectPath)}`;
  }

  // --- Architecture from file structure ---
  const archLines: string[] = [];

  // Detect framework
  if (fs.existsSync(path.join(projectPath, 'next.config.js')) || fs.existsSync(path.join(projectPath, 'next.config.ts'))) {
    archLines.push('Framework: Next.js');
  } else if (fs.existsSync(path.join(projectPath, 'nest-cli.json'))) {
    archLines.push('Framework: NestJS');
  } else if (fs.existsSync(path.join(projectPath, 'angular.json'))) {
    archLines.push('Framework: Angular');
  } else if (fs.existsSync(path.join(projectPath, 'src-tauri'))) {
    archLines.push('Framework: Tauri (desktop app)');
  }

  // Detect language
  if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
    archLines.push('Language: TypeScript');
  }
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
    archLines.push('Language: Rust');
  }
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
    archLines.push('Language: Go');
  }
  if (fs.existsSync(path.join(projectPath, 'requirements.txt')) || fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
    archLines.push('Language: Python');
  }

  // File structure breakdown
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (typeEntries.length > 0) {
    archLines.push(`\nFile structure: ${typeEntries.reduce((s, [, c]) => s + c, 0)} files`);
    for (const [type, count] of typeEntries.slice(0, 10)) {
      archLines.push(`  ${type}: ${count}`);
    }
  }

  // Detect patterns
  if (fs.existsSync(path.join(projectPath, 'docker-compose.yml')) || fs.existsSync(path.join(projectPath, 'docker-compose.yaml'))) {
    archLines.push('\nInfra: Docker Compose');
  }
  if (fs.existsSync(path.join(projectPath, '.github'))) {
    archLines.push('CI: GitHub Actions');
  }
  if (byType['test'] > 0) {
    archLines.push(`Testing: ${byType['test']} test files`);
  }

  // Git info
  if (fs.existsSync(path.join(projectPath, '.git'))) {
    try {
      const git = simpleGit(projectPath);
      const status = await git.status();
      const log = await git.log({ maxCount: 1 });
      archLines.push(`\nGit: branch ${status.current}, last commit: ${log.latest?.message?.slice(0, 60) || 'none'}`);
    } catch { /* */ }
  }

  parts.architecture = archLines.join('\n');

  // --- Conventions from config files ---
  const convLines: string[] = [];

  // Check for linting
  const lintConfigs = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs'];
  for (const cfg of lintConfigs) {
    if (fs.existsSync(path.join(projectPath, cfg))) {
      convLines.push('Linting: ESLint configured');
      break;
    }
  }
  if (fs.existsSync(path.join(projectPath, '.prettierrc')) || fs.existsSync(path.join(projectPath, 'prettier.config.js'))) {
    convLines.push('Formatting: Prettier configured');
  }
  if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(path.join(projectPath, 'tsconfig.json'), 'utf-8'));
      if (tsconfig.compilerOptions?.strict) convLines.push('TypeScript: strict mode enabled');
      if (tsconfig.compilerOptions?.paths) convLines.push('Path aliases configured');
    } catch { /* */ }
  }

  // Package manager
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) convLines.push('Package manager: pnpm');
  else if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) convLines.push('Package manager: yarn');
  else if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) convLines.push('Package manager: npm');

  parts.conventions = convLines.join('\n');

  // --- Dependencies ---
  const depLines: string[] = [];
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});

      if (deps.length > 0) {
        depLines.push(`Dependencies (${deps.length}):`);
        // Show key deps, not all
        const keyDeps = deps.filter(d =>
          !d.startsWith('@types/') &&
          !['tslib'].includes(d)
        ).slice(0, 15);
        for (const d of keyDeps) {
          depLines.push(`  ${d}: ${pkg.dependencies[d]}`);
        }
        if (deps.length > 15) depLines.push(`  ... and ${deps.length - 15} more`);
      }

      if (devDeps.length > 0) {
        depLines.push(`\nDev dependencies (${devDeps.length}):`);
        const keyDevDeps = devDeps.filter(d => !d.startsWith('@types/')).slice(0, 10);
        for (const d of keyDevDeps) {
          depLines.push(`  ${d}: ${pkg.devDependencies[d]}`);
        }
      }
    } catch { /* */ }
  }

  parts.dependencies = depLines.join('\n');

  return parts;
}
