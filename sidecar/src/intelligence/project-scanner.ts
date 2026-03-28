import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { indexProject, getProjectStructureSummary } from './file-indexer.js';
import simpleGit from 'simple-git';

interface ScanResult {
  filesIndexed: number;
  brainPopulated: boolean;
  claudeMdImported: boolean;
  deployDocsFound: string[];
  serverInfoDetected: boolean;
  summary: string;
}

// Files that contain deployment/server intelligence
const DEPLOY_DOC_PATTERNS = [
  'DEPLOY.md', 'deploy.md', 'DEPLOYMENT.md', 'deployment.md',
  'SERVER.md', 'server.md', 'INFRASTRUCTURE.md',
  'ops/runbook.md', 'ops/deploy.md', 'docs/deploy.md', 'docs/deployment.md',
  '.deploy', 'fly.toml', 'render.yaml', 'railway.json', 'vercel.json',
  'dokku/CHECKS', 'Procfile', 'app.yaml', 'appspec.yml',
  'docker-compose.yml', 'docker-compose.yaml', 'docker-compose.prod.yml',
  'Dockerfile', 'Dockerfile.prod',
  '.github/workflows/deploy.yml', '.github/workflows/deploy.yaml',
  '.github/workflows/cd.yml', '.github/workflows/cd.yaml',
];

/**
 * Full project scan: index files + read CLAUDE.md + detect deploy docs + populate brain
 */
export async function scanProject(projectId: string, projectPath: string): Promise<ScanResult> {
  // 1. Index files
  const { indexed, byType } = indexProject(projectId, projectPath);

  // 2. Read existing CLAUDE.md
  const claudeMd = readClaudeMd(projectPath);

  // 3. Detect deployment docs
  const deployDocs = detectDeployDocs(projectPath);

  // 4. Read deployment/server info
  const serverInfo = extractServerInfo(projectPath, deployDocs);

  // 5. Read project metadata from config files
  const brain = await buildBrainFromScan(projectPath, byType, claudeMd, deployDocs, serverInfo);

  // 6. Populate brain (only fill empty fields — don't overwrite user data)
  const db = getDb();
  const existing = db.prepare('SELECT * FROM project_brain WHERE project_id = ?').get(projectId) as any;

  if (existing) {
    const updates: string[] = [];
    const params: any[] = [];

    if (!existing.summary && brain.summary) {
      updates.push('summary = ?'); params.push(brain.summary);
    }
    if (!existing.architecture_notes && brain.architecture) {
      updates.push('architecture_notes = ?'); params.push(brain.architecture);
    }
    if (!existing.conventions && brain.conventions) {
      updates.push('conventions = ?'); params.push(brain.conventions);
    }
    if (!existing.dependencies_notes && brain.dependencies) {
      updates.push('dependencies_notes = ?'); params.push(brain.dependencies);
    }
    if (!existing.known_issues && brain.knownIssues) {
      updates.push('known_issues = ?'); params.push(brain.knownIssues);
    }
    if (!existing.decisions && brain.decisions) {
      updates.push('decisions = ?'); params.push(brain.decisions);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(projectId);
      db.prepare(`UPDATE project_brain SET ${updates.join(', ')} WHERE project_id = ?`).run(...params);
    }
  }

  // 7. Store server/deployment info if found
  if (serverInfo.deployUrl || serverInfo.provider || serverInfo.deployCommand) {
    storeServerInfo(projectId, serverInfo);
  }

  const structureSummary = getProjectStructureSummary(projectId);

  return {
    filesIndexed: indexed,
    brainPopulated: true,
    claudeMdImported: !!claudeMd,
    deployDocsFound: deployDocs,
    serverInfoDetected: !!(serverInfo.deployUrl || serverInfo.provider),
    summary: `Indexed ${indexed} files. ${claudeMd ? 'CLAUDE.md imported. ' : ''}${deployDocs.length > 0 ? `${deployDocs.length} deploy doc(s) found. ` : ''}${structureSummary.split('\n')[0]}`,
  };
}

/**
 * Read CLAUDE.md from project root
 */
function readClaudeMd(projectPath: string): string | null {
  const candidates = ['CLAUDE.md', 'claude.md', '.claude/settings.json'];
  for (const name of candidates) {
    const fullPath = path.join(projectPath, name);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (content.trim().length > 0) return content;
      } catch { /* permission issues */ }
    }
  }
  return null;
}

/**
 * Detect deployment documentation files
 */
function detectDeployDocs(projectPath: string): string[] {
  const found: string[] = [];
  for (const pattern of DEPLOY_DOC_PATTERNS) {
    const fullPath = path.join(projectPath, pattern);
    if (fs.existsSync(fullPath)) {
      found.push(pattern);
    }
  }
  return found;
}

interface ServerInfo {
  provider: string | null;
  deployUrl: string | null;
  deployCommand: string | null;
  deployBranch: string | null;
  sshHost: string | null;
  sshUser: string | null;
  coDeployedApps: string[];
  rawDeployContent: string;
}

/**
 * Extract server/deployment info from detected docs
 */
function extractServerInfo(projectPath: string, deployDocs: string[]): ServerInfo {
  const info: ServerInfo = {
    provider: null, deployUrl: null, deployCommand: null,
    deployBranch: null, sshHost: null, sshUser: null,
    coDeployedApps: [], rawDeployContent: '',
  };

  // Detect provider from config files
  if (fs.existsSync(path.join(projectPath, 'fly.toml'))) {
    info.provider = 'Fly.io';
    try {
      const content = fs.readFileSync(path.join(projectPath, 'fly.toml'), 'utf-8');
      const appMatch = content.match(/app\s*=\s*"([^"]+)"/);
      if (appMatch) info.deployUrl = `https://${appMatch[1]}.fly.dev`;
      info.deployCommand = 'fly deploy';
    } catch { /* */ }
  } else if (fs.existsSync(path.join(projectPath, 'vercel.json'))) {
    info.provider = 'Vercel';
    info.deployCommand = 'vercel --prod';
  } else if (fs.existsSync(path.join(projectPath, 'render.yaml'))) {
    info.provider = 'Render';
  } else if (fs.existsSync(path.join(projectPath, 'railway.json'))) {
    info.provider = 'Railway';
  } else if (fs.existsSync(path.join(projectPath, 'app.yaml'))) {
    info.provider = 'Google Cloud';
  } else if (fs.existsSync(path.join(projectPath, 'Procfile'))) {
    info.provider = 'Heroku';
    info.deployCommand = 'git push heroku main';
  }

  // Docker = likely self-hosted
  if (!info.provider && (fs.existsSync(path.join(projectPath, 'Dockerfile')) || fs.existsSync(path.join(projectPath, 'docker-compose.yml')))) {
    info.provider = 'Docker (self-hosted)';
  }

  // Read markdown deploy docs for rich info
  for (const doc of deployDocs) {
    if (!doc.endsWith('.md')) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, doc), 'utf-8');
      info.rawDeployContent += `\n--- ${doc} ---\n${content.slice(0, 3000)}\n`;

      // Extract URLs
      const urlMatches = content.match(/https?:\/\/[^\s\)]+/g);
      if (urlMatches && !info.deployUrl) {
        // Find likely deploy URL (not GitHub/npm links)
        const deployUrl = urlMatches.find(u =>
          !u.includes('github.com') && !u.includes('npmjs.com') &&
          !u.includes('shields.io') && !u.includes('googleapis.com')
        );
        if (deployUrl) info.deployUrl = deployUrl;
      }

      // Extract SSH info
      const sshMatch = content.match(/ssh\s+(\w+)@([\w\.\-]+)/i);
      if (sshMatch) {
        info.sshUser = sshMatch[1];
        info.sshHost = sshMatch[2];
      }

      // Extract deploy commands
      const deployCmdMatch = content.match(/(?:deploy|push|release).*?[`"]([^`"]+)[`"]/i);
      if (deployCmdMatch && !info.deployCommand) {
        info.deployCommand = deployCmdMatch[1];
      }
    } catch { /* */ }
  }

  // Detect deploy branch from CI/CD files
  for (const doc of deployDocs) {
    if (!doc.includes('.github/workflows')) continue;
    try {
      const content = fs.readFileSync(path.join(projectPath, doc), 'utf-8');
      const branchMatch = content.match(/branches:\s*\n\s*-\s*(\w+)/);
      if (branchMatch) info.deployBranch = branchMatch[1];
    } catch { /* */ }
  }

  return info;
}

/**
 * Store server info in DB
 */
function storeServerInfo(projectId: string, info: ServerInfo): void {
  const db = getDb();

  // Ensure server tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT,
      host TEXT,
      ssh_user TEXT,
      ssh_port INTEGER DEFAULT 22,
      deploy_url TEXT,
      notes TEXT,
      co_deployed_apps TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS project_servers (
      project_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      deploy_branch TEXT,
      deploy_command TEXT,
      env_file_path TEXT,
      deploy_docs_content TEXT,
      last_deployed TEXT,
      PRIMARY KEY (project_id, server_id)
    );
  `);

  // Check if server already exists for this project
  const existing = db.prepare(`
    SELECT s.id FROM servers s
    JOIN project_servers ps ON ps.server_id = s.id
    WHERE ps.project_id = ?
  `).get(projectId) as any;

  if (existing) return; // Don't duplicate

  const serverId = uuid();
  const serverName = info.provider
    ? `${info.provider} server`
    : info.sshHost || 'Server';

  db.prepare(`
    INSERT INTO servers (id, name, provider, host, ssh_user, deploy_url, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    serverId, serverName, info.provider, info.sshHost,
    info.sshUser, info.deployUrl,
    info.rawDeployContent.slice(0, 5000) || null
  );

  db.prepare(`
    INSERT INTO project_servers (project_id, server_id, deploy_branch, deploy_command, deploy_docs_content)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    projectId, serverId, info.deployBranch,
    info.deployCommand, info.rawDeployContent.slice(0, 10000) || null
  );
}

/**
 * Build brain from full project scan including CLAUDE.md and deploy docs
 */
async function buildBrainFromScan(
  projectPath: string,
  byType: Record<string, number>,
  claudeMd: string | null,
  deployDocs: string[],
  serverInfo: ServerInfo,
): Promise<{
  summary: string; architecture: string; conventions: string;
  dependencies: string; knownIssues: string; decisions: string;
}> {
  const parts = {
    summary: '', architecture: '', conventions: '',
    dependencies: '', knownIssues: '', decisions: '',
  };

  // --- Import from CLAUDE.md first (highest priority) ---
  if (claudeMd) {
    const sections = parseClaudeMdSections(claudeMd);
    if (sections.summary) parts.summary = sections.summary;
    if (sections.architecture) parts.architecture = sections.architecture;
    if (sections.conventions) parts.conventions = sections.conventions;
    if (sections.knownIssues) parts.knownIssues = sections.knownIssues;
    if (sections.decisions) parts.decisions = sections.decisions;
  }

  // --- Summary from package.json (if CLAUDE.md didn't provide one) ---
  if (!parts.summary) {
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

    if (!parts.summary) parts.summary = `Project: ${path.basename(projectPath)}`;
  }

  // --- Architecture (append to CLAUDE.md data) ---
  const archLines: string[] = parts.architecture ? [parts.architecture] : [];

  // Detect framework
  const frameworks: [string, string][] = [
    ['next.config.js', 'Next.js'], ['next.config.ts', 'Next.js'], ['next.config.mjs', 'Next.js'],
    ['nest-cli.json', 'NestJS'], ['angular.json', 'Angular'],
    ['src-tauri', 'Tauri'], ['nuxt.config.ts', 'Nuxt'],
  ];
  for (const [file, name] of frameworks) {
    if (fs.existsSync(path.join(projectPath, file))) {
      if (!archLines.some(l => l.includes(name))) archLines.push(`Framework: ${name}`);
      break;
    }
  }

  // Languages
  if (fs.existsSync(path.join(projectPath, 'tsconfig.json')) && !archLines.some(l => l.includes('TypeScript')))
    archLines.push('Language: TypeScript');
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) archLines.push('Language: Rust');
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) archLines.push('Language: Go');
  if (fs.existsSync(path.join(projectPath, 'requirements.txt')) || fs.existsSync(path.join(projectPath, 'pyproject.toml')))
    archLines.push('Language: Python');

  // File structure
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  if (typeEntries.length > 0) {
    archLines.push(`\nFile structure: ${typeEntries.reduce((s, [, c]) => s + c, 0)} files`);
    for (const [type, count] of typeEntries.slice(0, 10)) archLines.push(`  ${type}: ${count}`);
  }

  // Deployment info
  if (serverInfo.provider) archLines.push(`\nDeployment: ${serverInfo.provider}`);
  if (serverInfo.deployUrl) archLines.push(`URL: ${serverInfo.deployUrl}`);
  if (serverInfo.deployCommand) archLines.push(`Deploy: ${serverInfo.deployCommand}`);
  if (deployDocs.length > 0) archLines.push(`Deploy docs: ${deployDocs.join(', ')}`);

  // Docker
  if (fs.existsSync(path.join(projectPath, 'docker-compose.yml')) || fs.existsSync(path.join(projectPath, 'docker-compose.yaml')))
    archLines.push('Infra: Docker Compose');
  if (fs.existsSync(path.join(projectPath, '.github'))) archLines.push('CI: GitHub Actions');

  // Git
  if (fs.existsSync(path.join(projectPath, '.git'))) {
    try {
      const git = simpleGit(projectPath);
      const status = await git.status();
      const log = await git.log({ maxCount: 1 });
      archLines.push(`\nGit: branch ${status.current}, last commit: ${log.latest?.message?.slice(0, 60) || 'none'}`);
    } catch { /* */ }
  }

  parts.architecture = archLines.join('\n');

  // --- Conventions (append) ---
  const convLines: string[] = parts.conventions ? [parts.conventions] : [];
  const lintConfigs = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs'];
  for (const cfg of lintConfigs) {
    if (fs.existsSync(path.join(projectPath, cfg))) { convLines.push('Linting: ESLint'); break; }
  }
  if (fs.existsSync(path.join(projectPath, '.prettierrc'))) convLines.push('Formatting: Prettier');
  if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(path.join(projectPath, 'tsconfig.json'), 'utf-8'));
      if (tsconfig.compilerOptions?.strict) convLines.push('TypeScript: strict mode');
    } catch { /* */ }
  }
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) convLines.push('Package manager: pnpm');
  else if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) convLines.push('Package manager: yarn');
  else if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) convLines.push('Package manager: npm');
  parts.conventions = convLines.join('\n');

  // --- Dependencies ---
  const depLines: string[] = [];
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = Object.keys(pkg.dependencies || {});
      if (deps.length > 0) {
        depLines.push(`Dependencies (${deps.length}):`);
        const keyDeps = deps.filter(d => !d.startsWith('@types/') && !['tslib'].includes(d)).slice(0, 15);
        for (const d of keyDeps) depLines.push(`  ${d}: ${pkg.dependencies[d]}`);
        if (deps.length > 15) depLines.push(`  ... and ${deps.length - 15} more`);
      }
    } catch { /* */ }
  }
  parts.dependencies = depLines.join('\n');

  return parts;
}

/**
 * Parse CLAUDE.md into brain sections by looking for common headings
 */
function parseClaudeMdSections(content: string): {
  summary: string; architecture: string; conventions: string;
  knownIssues: string; decisions: string;
} {
  const result = { summary: '', architecture: '', conventions: '', knownIssues: '', decisions: '' };

  // If no headings, treat entire content as summary
  if (!content.includes('#')) {
    result.summary = content.slice(0, 2000);
    return result;
  }

  // Split by headings
  const sections: { heading: string; content: string }[] = [];
  const lines = content.split('\n');
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.match(/^#{1,3}\s+/)) {
      if (currentHeading || currentContent.length > 0) {
        sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
      }
      currentHeading = line.replace(/^#{1,3}\s+/, '').trim().toLowerCase();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentHeading || currentContent.length > 0) {
    sections.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
  }

  // Map sections to brain fields
  for (const section of sections) {
    const h = section.heading;
    const c = section.content.slice(0, 2000);

    if (!h && !result.summary) {
      result.summary = c; // Content before first heading = summary
    } else if (h.match(/overview|summary|about|description|project/i)) {
      result.summary += (result.summary ? '\n' : '') + c;
    } else if (h.match(/architect|stack|structure|tech|infra|deploy|server/i)) {
      result.architecture += (result.architecture ? '\n' : '') + c;
    } else if (h.match(/convention|style|rule|guideline|standard|format/i)) {
      result.conventions += (result.conventions ? '\n' : '') + c;
    } else if (h.match(/issue|bug|todo|fixme|problem|known|warning/i)) {
      result.knownIssues += (result.knownIssues ? '\n' : '') + c;
    } else if (h.match(/decision|choice|rationale|why|trade.?off/i)) {
      result.decisions += (result.decisions ? '\n' : '') + c;
    } else {
      // Unknown section — add to summary as extra context
      result.summary += (result.summary ? '\n\n' : '') + `## ${section.heading}\n${c}`;
    }
  }

  return result;
}
