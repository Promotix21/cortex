import fs from 'fs';
import path from 'path';
import net from 'net';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { indexProject, getProjectStructureSummary } from './file-indexer.js';
import simpleGit from 'simple-git';
import { claudeAnalyze } from '../utils/binaries.js';

/** Check if a port is currently listening on localhost */
function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(300);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

interface CompletionEstimate {
  score: number;          // 0-100
  todoCount: number;
  fixmeCount: number;
  emptyHandlers: number;
  testRatio: number;      // test files / source files
  hasReadme: boolean;
  hasLicense: boolean;
  hasCi: boolean;
  hasTests: boolean;
  indicators: string[];   // human-readable reasons
}

interface ToolchainInfo {
  cliTools: string[];     // e.g. ['shopify-cli', 'wp-cli', 'docker']
  sshConfigured: boolean;
  sshHosts: string[];     // e.g. ['217.21.76.22', 'umang.digitaldadi.in']
  deployMethod: string | null; // 'ssh', 'vercel', 'netlify', 'docker', 'github-actions'
}

interface ScanResult {
  filesIndexed: number;
  brainPopulated: boolean;
  subProjects: string[];
  detectedStacks: string[];
  ports: number[];
  urls: string[];
  summary: string;
  completion: CompletionEstimate | null;
  toolchain: ToolchainInfo | null;
}

// ============================================================
// CONFIG FILE READERS — detect what a project IS
// ============================================================

interface ProjectSignature {
  stack: string;
  language: string;
  framework: string | null;
  subPath: string; // '' = root, or relative path for sub-projects
}

/** Config files that identify a project type */
const PROJECT_MARKERS: [string, string, string][] = [
  // [file, stack, framework]
  ['package.json', 'node', ''],
  ['composer.json', 'php', ''],
  ['requirements.txt', 'python', ''],
  ['pyproject.toml', 'python', ''],
  ['Pipfile', 'python', ''],
  ['Cargo.toml', 'rust', ''],
  ['go.mod', 'go', ''],
  ['Gemfile', 'ruby', ''],
  ['pom.xml', 'java', ''],
  ['build.gradle', 'java', ''],
  ['pubspec.yaml', 'dart', 'flutter'],
  ['wp-config.php', 'php', 'wordpress'],
  ['wp-cli.yml', 'php', 'wordpress'],
  ['wp-cli.phar', 'php', 'wordpress'],
  ['style.css', 'php', 'wordpress-theme'], // WP theme if has "Theme Name:" header
  ['functions.php', 'php', 'wordpress-theme'],
  ['shopify.theme.toml', 'liquid', 'shopify'],
  ['.shopifyignore', 'liquid', 'shopify'],
  ['config/settings_schema.json', 'liquid', 'shopify'],
  ['layout/theme.liquid', 'liquid', 'shopify'],
];

/** Node framework detectors — read package.json deps */
const NODE_FRAMEWORK_DETECTORS: [string, string][] = [
  ['next', 'nextjs'],
  ['nuxt', 'nuxt'],
  ['@nestjs/core', 'nestjs'],
  ['express', 'express'],
  ['fastify', 'fastify'],
  ['koa', 'koa'],
  ['hapi', 'hapi'],
  ['react', 'react'],
  ['vue', 'vue'],
  ['svelte', 'svelte'],
  ['@angular/core', 'angular'],
  ['gatsby', 'gatsby'],
  ['astro', 'astro'],
  ['remix', 'remix'],
  ['electron', 'electron'],
  ['@tauri-apps/api', 'tauri'],
  ['react-native', 'react-native'],
  ['expo', 'expo'],
];

// ============================================================
// DEEP CODE SCANNER — read actual source files
// ============================================================

/** Patterns to extract from source code */
const CODE_PATTERNS = {
  // Port detection
  ports: [
    /(?:port|PORT)\s*[=:]\s*(\d{2,5})/g,
    /listen\(\s*(\d{2,5})/g,
    /localhost:(\d{2,5})/g,
    /127\.0\.0\.1:(\d{2,5})/g,
    /0\.0\.0\.0:(\d{2,5})/g,
    /--port\s+(\d{2,5})/g,
  ],
  // URL detection
  urls: [
    /https?:\/\/(?!localhost|127\.0\.0\.1|example\.com|placeholder)[a-zA-Z0-9][\w\-\.]+\.[a-z]{2,}[^\s'"\)>]*/g,
  ],
  // API routes
  routes: [
    /(?:app|router|server)\.(get|post|put|delete|patch|all|use)\s*\(\s*['"`]([^'"`]+)/g,
    /Route\s*\(\s*['"`]([^'"`]+)/g,
    /@(?:Get|Post|Put|Delete|Patch)\s*\(\s*['"`]([^'"`]+)/g,
    /path\s*[:=]\s*['"`]\/([^'"`]+)/g,
  ],
  // Database connections
  databases: [
    /(?:mysql|postgres|postgresql|mongodb|redis|sqlite|mariadb|mssql)/gi,
    /DATABASE_URL/g,
    /mongoose\.connect/g,
    /createConnection/g,
    /new\s+Sequelize/g,
    /prisma/gi,
    /typeorm/gi,
    /better-sqlite3/gi,
    /knex/gi,
  ],
  // Environment variables (feature hints)
  envVars: [
    /process\.env\.([A-Z_][A-Z0-9_]+)/g,
    /os\.environ\[['"]([A-Z_]+)['"]\]/g,
    /\$_ENV\[['"]([A-Z_]+)['"]\]/g,
  ],
  // Auth patterns
  auth: [
    /jwt|jsonwebtoken|passport|oauth|auth0|clerk|nextauth|lucia/gi,
    /bcrypt|argon2|scrypt/gi,
    /session|cookie.*auth|token.*verify/gi,
  ],
  // Payment
  payments: [
    /stripe|razorpay|paypal|paddle|lemonsqueezy/gi,
  ],
  // Email
  email: [
    /nodemailer|sendgrid|mailgun|resend|postmark|ses/gi,
  ],
  // Storage
  storage: [
    /s3|cloudinary|uploadthing|supabase.*storage|firebase.*storage/gi,
  ],
};

/** WordPress-specific patterns */
const WP_PATTERNS = {
  plugins: /^\s*\*\s*Plugin Name:\s*(.+)/m,
  theme: /^\s*Theme Name:\s*(.+)/m,
  version: /^\s*Version:\s*(.+)/m,
  hooks: /(?:add_action|add_filter|do_action|apply_filters)\s*\(\s*['"]([^'"]+)/g,
  shortcodes: /add_shortcode\s*\(\s*['"]([^'"]+)/g,
  postTypes: /register_post_type\s*\(\s*['"]([^'"]+)/g,
  taxonomies: /register_taxonomy\s*\(\s*['"]([^'"]+)/g,
  restRoutes: /register_rest_route\s*\(\s*['"]([^'"]+)/g,
};

/** Shopify-specific patterns */
const SHOPIFY_PATTERNS = {
  sections: /\{%\s*section\s+['"]([^'"]+)/g,
  snippets: /\{%\s*render\s+['"]([^'"]+)/g,
  schemaSettings: /"type"\s*:\s*"([^"]+)"/g,
  appBlocks: /\{%\s*app_block/g,
};

/** WordPress REST API / app password patterns */
const WP_API_PATTERNS = {
  restRoutes: /register_rest_route\s*\(\s*['"]([^'"]+)/g,
  appPasswords: /application_passwords|wp_authenticate_application_password|Authorization.*Basic/gi,
  wpRemote: /wp_remote_(?:get|post|request)\s*\(\s*['"]([^'"]+)/g,
  wpJsonUrl: /\/wp-json\/([^\s'"]+)/g,
  cloudflareApi: /api\.cloudflare\.com/g,
  wpCron: /wp_schedule_event|wp_cron/g,
};

// ============================================================
// MAIN SCANNER
// ============================================================

/**
 * Full project scan — reads actual code, not just config files.
 * Generates fresh intelligence from source analysis.
 */
export async function scanProject(projectId: string, projectPath: string): Promise<ScanResult> {
  const result: ScanResult = {
    filesIndexed: 0,
    brainPopulated: false,
    subProjects: [],
    detectedStacks: [],
    ports: [],
    urls: [],
    summary: '',
    completion: null,
    toolchain: null,
  };

  // 1. Index all files
  const { indexed, byType } = indexProject(projectId, projectPath);
  result.filesIndexed = indexed;

  // 2. Detect project signatures (root + sub-projects)
  const signatures = detectProjectSignatures(projectPath);
  result.detectedStacks = signatures.map(s => s.framework || s.stack);
  result.subProjects = signatures.filter(s => s.subPath).map(s => s.subPath);

  // Smart type resolution: if root is generic "node" but sub-projects have specific frameworks,
  // promote the most specific sub-project type as primary
  const SPECIFIC_TYPES = ['wordpress', 'wordpress-theme', 'shopify', 'nextjs', 'nestjs', 'laravel', 'flutter'];
  if (signatures.length > 1 && signatures[0] && !SPECIFIC_TYPES.includes(signatures[0].framework || '')) {
    const specificSub = signatures.find(s => s.subPath && SPECIFIC_TYPES.includes(s.framework || ''));
    if (specificSub) {
      // Move the specific sub-project to front so it becomes the detected type
      result.detectedStacks = [specificSub.framework || specificSub.stack, ...result.detectedStacks.filter(s => s !== (specificSub.framework || specificSub.stack))];
    }
  }

  // 3. Deep scan source files
  const codeIntel = deepScanCode(projectPath);
  result.ports = codeIntel.ports;
  result.urls = codeIntel.urls;

  // 4. Build brain from code scan (raw data collection)
  const brain = buildBrainFromCode(projectPath, signatures, codeIntel, byType);

  // 5. Estimate project completion
  const completion = estimateCompletion(projectPath, byType, codeIntel);
  result.completion = completion;

  // Append completion to brain summary
  brain.summary += `\n\nCompletion estimate: ~${completion.score}%`;
  if (completion.indicators.length > 0) {
    brain.summary += ` (${completion.indicators.slice(0, 4).join(', ')})`;
  }

  // 6. Detect toolchain (CLI tools, SSH, deploy method)
  const toolchain = detectToolchain(projectPath, signatures, codeIntel);
  result.toolchain = toolchain;

  // 6.5. AI Enhancement — send raw scan data to Claude for intelligent brain analysis
  const aiBrain = await enhanceBrainWithClaude(brain, path.basename(projectPath), completion, toolchain);
  if (aiBrain) {
    brain.summary = aiBrain.summary;
    brain.architecture = aiBrain.architecture;
    brain.knownIssues = aiBrain.knownIssues;
    brain.decisions = aiBrain.decisions;
    console.log('[scanProject] Brain enhanced by Claude AI');
  } else {
    console.log('[scanProject] Using raw scan brain (Claude unavailable)');
  }

  // 7. Write to DB — REPLACE existing brain (fresh scan = fresh intelligence)
  const db = getDb();
  const existing = db.prepare('SELECT id FROM project_brain WHERE project_id = ?').get(projectId) as any;

  if (existing) {
    db.prepare(`
      UPDATE project_brain SET
        summary = ?, architecture_notes = ?, conventions = ?,
        dependencies_notes = ?, known_issues = ?, decisions = ?,
        updated_at = ?
      WHERE project_id = ?
    `).run(
      brain.summary, brain.architecture, brain.conventions,
      brain.dependencies, brain.knownIssues, brain.decisions,
      new Date().toISOString(), projectId
    );
  }

  // 7. Store server info
  if (codeIntel.ports.length > 0 || codeIntel.urls.length > 0) {
    storeServerInfo(projectId, codeIntel, signatures);
  }

  // 8. Store completion estimate + toolchain info
  try {
    db.prepare(`
      UPDATE projects SET completion_estimate = ?, completion_indicators = ?,
        cli_tools = ?, ssh_configured = ?, ssh_hosts = ?, deploy_method = ?
      WHERE id = ?
    `).run(
      completion.score, JSON.stringify(completion.indicators),
      JSON.stringify(toolchain.cliTools), toolchain.sshConfigured ? 1 : 0,
      JSON.stringify(toolchain.sshHosts), toolchain.deployMethod,
      projectId
    );
  } catch {
    // Columns may not exist yet — add them
    try {
      db.exec('ALTER TABLE projects ADD COLUMN completion_estimate INTEGER DEFAULT NULL');
      db.exec('ALTER TABLE projects ADD COLUMN completion_indicators TEXT DEFAULT NULL');
      db.exec('ALTER TABLE projects ADD COLUMN cli_tools TEXT DEFAULT NULL');
      db.exec('ALTER TABLE projects ADD COLUMN ssh_configured INTEGER DEFAULT 0');
      db.exec('ALTER TABLE projects ADD COLUMN ssh_hosts TEXT DEFAULT NULL');
      db.exec('ALTER TABLE projects ADD COLUMN deploy_method TEXT DEFAULT NULL');
      db.prepare(`
        UPDATE projects SET completion_estimate = ?, completion_indicators = ?,
          cli_tools = ?, ssh_configured = ?, ssh_hosts = ?, deploy_method = ?
        WHERE id = ?
      `).run(
        completion.score, JSON.stringify(completion.indicators),
        JSON.stringify(toolchain.cliTools), toolchain.sshConfigured ? 1 : 0,
        JSON.stringify(toolchain.sshHosts), toolchain.deployMethod,
        projectId
      );
    } catch { /* */ }
  }

  // 9. Git info
  if (fs.existsSync(path.join(projectPath, '.git'))) {
    try {
      const git = simpleGit(projectPath);
      const status = await git.status();
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
      if (project) {
        db.prepare('UPDATE projects SET git_enabled = 1 WHERE id = ?').run(projectId);
      }
    } catch { /* */ }
  }

  // 10. Live port detection — check if detected ports are actually listening
  const livePorts: number[] = [];
  const portsToCheck = [...new Set(codeIntel.ports)].slice(0, 10); // max 10 ports
  for (const port of portsToCheck) {
    if (await isPortListening(port)) livePorts.push(port);
  }
  // Also check common dev ports if not already detected
  for (const port of [3000, 3001, 5173, 8080, 8000, 4200, 5000]) {
    if (!portsToCheck.includes(port) && await isPortListening(port)) {
      livePorts.push(port);
    }
  }

  // Auto-set dev_server_port if we found exactly one live port
  if (livePorts.length >= 1) {
    const port = livePorts[0];
    const proj = db.prepare('SELECT dev_server_port FROM projects WHERE id = ?').get(projectId) as any;
    if (proj && !proj.dev_server_port) {
      db.prepare('UPDATE projects SET dev_server_port = ? WHERE id = ?').run(port, projectId);
    }
    // Add live port info to brain
    const livePortNote = `\n\nLive ports detected: ${livePorts.join(', ')}`;
    if (!brain.architecture.includes('Live ports')) {
      brain.architecture += livePortNote;
      db.prepare('UPDATE project_brain SET architecture_notes = ? WHERE project_id = ?')
        .run(brain.architecture, projectId);
    }
  }

  result.brainPopulated = true;
  result.summary = `Scanned ${indexed} files. Stacks: ${result.detectedStacks.join(', ') || 'unknown'}. Ports: ${result.ports.join(', ') || 'none'}${livePorts.length ? ` (${livePorts.length} live)` : ''}. Sub-projects: ${result.subProjects.length}. Completion: ~${completion.score}%`;

  return result;
}

// ============================================================
// AI BRAIN ENHANCEMENT — Send raw scan to Claude for analysis
// ============================================================

interface BrainFields {
  summary: string;
  architecture: string;
  conventions: string;
  dependencies: string;
  knownIssues: string;
  decisions: string;
}

async function enhanceBrainWithClaude(
  rawBrain: BrainFields,
  projectName: string,
  completion: CompletionEstimate,
  toolchain: ToolchainInfo,
): Promise<{ summary: string; architecture: string; knownIssues: string; decisions: string } | null> {
  const prompt = `You are Cortex, an AI development workspace intelligence engine. Analyze this raw project scan data and produce a clear, actionable project brain.

PROJECT: ${projectName}

=== RAW SCAN DATA ===

SUMMARY:
${rawBrain.summary}

ARCHITECTURE:
${rawBrain.architecture}

CONVENTIONS:
${rawBrain.conventions}

DEPENDENCIES:
${rawBrain.dependencies}

KNOWN ISSUES:
${rawBrain.knownIssues}

DECISIONS/DOCS:
${rawBrain.decisions.slice(0, 3000)}

COMPLETION: ${completion.score}% — ${completion.indicators.join(', ')}
TOOLCHAIN: CLI=${toolchain.cliTools.join(',')} SSH=${toolchain.sshConfigured} Deploy=${toolchain.deployMethod || 'unknown'}

=== YOUR TASK ===

Produce a JSON object with exactly these 4 fields. Be concise but insightful. Focus on what a developer needs to know to work on this project effectively.

{
  "summary": "A 3-5 sentence executive summary: what this project IS, what it does, its tech stack, current state, and key distinguishing characteristics. Not a list — write prose.",
  "architecture": "Describe the actual architecture: how components connect, data flow, deployment topology, ports, APIs, databases. Include specific details from the scan (ports, routes, services). Organize with clear sections.",
  "knownIssues": "List real issues, risks, and tech debt you can identify from the scan data. Include TODO/FIXME counts, empty handlers, missing tests, security concerns, dependency issues. Be specific — don't invent issues not supported by the data.",
  "decisions": "Summarize key technical decisions visible in the codebase: framework choices, package manager, CI/CD setup, deployment strategy, env var patterns, CLAUDE.md rules. Explain WHY each matters for future development."
}

IMPORTANT: Return ONLY the JSON object. No markdown fences, no explanation. Keep each field under 2000 characters.`;

  try {
    const response = await claudeAnalyze(prompt, { timeoutMs: 90_000 });
    if (!response) return null;

    // Extract JSON from response (handle potential markdown fencing)
    let jsonStr = response.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    if (parsed.summary && parsed.architecture) {
      return {
        summary: String(parsed.summary).slice(0, 3000),
        architecture: String(parsed.architecture).slice(0, 4000),
        knownIssues: String(parsed.knownIssues || '').slice(0, 2000),
        decisions: String(parsed.decisions || rawBrain.decisions).slice(0, 4000),
      };
    }
    console.warn('[enhanceBrainWithClaude] Invalid response structure');
    return null;
  } catch (err: any) {
    console.warn('[enhanceBrainWithClaude] Failed:', err.message);
    return null;
  }
}

// ============================================================
// SIGNATURE DETECTION
// ============================================================

const SKIP_SIGNATURE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__', 'vendor', 'target', '.cache', '.next', 'coverage',
]);

function detectProjectSignatures(projectPath: string, maxDepth = 3): ProjectSignature[] {
  const signatures: ProjectSignature[] = [];

  // Check root first
  const rootSig = detectSignatureAt(projectPath, '');
  if (rootSig) signatures.push(rootSig);

  // Recursively check subdirectories for sub-projects
  function scanSubDirs(dir: string, relPrefix: string, depth: number) {
    if (depth >= maxDepth) return;
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (!item.isDirectory()) continue;
        if (SKIP_SIGNATURE_DIRS.has(item.name)) continue;

        const fullPath = path.join(dir, item.name);
        const relPath = relPrefix ? `${relPrefix}/${item.name}` : item.name;
        const sig = detectSignatureAt(fullPath, relPath);
        if (sig) signatures.push(sig);

        scanSubDirs(fullPath, relPath, depth + 1);
      }
    } catch { /* permission errors etc */ }
  }

  scanSubDirs(projectPath, '', 0);
  return signatures;
}

function detectSignatureAt(dirPath: string, relPath: string): ProjectSignature | null {
  for (const [file, stack, framework] of PROJECT_MARKERS) {
    if (fs.existsSync(path.join(dirPath, file))) {
      let detectedFramework = framework;

      // Special: WordPress theme detection
      if (framework === 'wordpress-theme' && file === 'style.css') {
        try {
          const css = fs.readFileSync(path.join(dirPath, 'style.css'), 'utf-8').slice(0, 500);
          if (!css.includes('Theme Name:')) continue;
        } catch { continue; }
      }

      // Special: Node framework detection from package.json
      if (stack === 'node' && file === 'package.json') {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(dirPath, 'package.json'), 'utf-8'));
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          for (const [dep, fw] of NODE_FRAMEWORK_DETECTORS) {
            if (allDeps[dep]) { detectedFramework = fw; break; }
          }
        } catch { /* */ }
      }

      return {
        stack,
        language: stack === 'node' ? 'typescript/javascript' : stack === 'liquid' ? 'liquid' : stack,
        framework: detectedFramework || null,
        subPath: relPath,
      };
    }
  }
  return null;
}

// ============================================================
// DEEP CODE SCAN
// ============================================================

interface DocsIntel {
  servers: string[];          // IP addresses, hostnames
  sshDetails: string[];       // SSH connection strings
  deployUrls: string[];       // deployment/staging/prod URLs
  installSteps: string[];     // installation/setup commands
  apiKeys: string[];          // API key names (not values)
  claudeMdContent: string;    // raw CLAUDE.md content
  readmeContent: string;      // raw README.md summary
  deployDocs: string;         // deployment doc content
}

interface CodeIntel {
  ports: number[];
  urls: string[];
  routes: string[];
  databases: string[];
  features: string[];
  envVars: string[];
  wpIntel: WPIntel | null;
  shopifyIntel: ShopifyIntel | null;
  docsIntel: DocsIntel | null;
}

interface WPIntel {
  themes: string[];
  plugins: string[];
  customPostTypes: string[];
  hooks: string[];
  shortcodes: string[];
  restRoutes: string[];
  hasAppPasswords: boolean;
  wpJsonEndpoints: string[];
  externalApis: string[];
  hasCron: boolean;
}

interface ShopifyIntel {
  sections: string[];
  snippets: string[];
  settingTypes: string[];
}

/** Patterns to extract from documentation files */
const DOCS_PATTERNS = {
  // IP addresses (v4)
  ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
  // SSH connection strings
  ssh: /ssh\s+(?:-[a-zA-Z]\s+\S+\s+)*\S+@\S+/g,
  // Hostnames/domains
  domains: /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|io|dev|app|in|co|ai|cloud|xyz|me|live|tech)\b/gi,
  // Deployment/staging/prod URLs
  deployUrls: /https?:\/\/(?:staging|prod|production|deploy|api|admin|dashboard|app|dev|www)\.[^\s'"\)>]+/gi,
  // Shell commands (installation steps)
  shellCommands: /(?:^|\n)\s*(?:\$|>)\s*(.+?)(?:\n|$)/g,
  // Code blocks with commands
  codeBlockCommands: /```(?:bash|sh|shell|zsh)?\n([\s\S]*?)```/g,
  // API key variable names (not values)
  apiKeyNames: /\b([A-Z_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS)[A-Z_]*)\b/g,
  // SCP/rsync patterns
  scp: /(?:scp|rsync)\s+.*\S+@\S+:\S+/g,
  // Server references in prose
  serverRefs: /(?:server|host|instance|VPS|droplet|EC2)\s*[:=]?\s*(\S+)/gi,
};

/**
 * Scan markdown and documentation files for server info, deploy details, etc.
 */
function scanDocsFiles(projectPath: string): DocsIntel {
  const docs: DocsIntel = {
    servers: [],
    sshDetails: [],
    deployUrls: [],
    installSteps: [],
    apiKeys: [],
    claudeMdContent: '',
    readmeContent: '',
    deployDocs: '',
  };

  const serversSet = new Set<string>();
  const sshSet = new Set<string>();
  const deployUrlsSet = new Set<string>();
  const installStepsSet = new Set<string>();
  const apiKeysSet = new Set<string>();

  // Priority doc files to scan (in order)
  const docFiles = [
    'CLAUDE.md',
    'README.md',
    'readme.md',
    'NEXT_SESSION_PROMPT.md',
    'NEXT-SESSION-PROMPT.md',
    'DEPLOYMENT.md',
    'DEPLOY.md',
    'SETUP.md',
    'INSTALL.md',
    'CONTRIBUTING.md',
    'docs/deployment.md',
    'docs/setup.md',
    'docs/README.md',
    '.claude/settings.json',
    'docker-compose.yml',
    'docker-compose.yaml',
    'Makefile',
    'Procfile',
  ];

  // Also scan any .md files in the root and docs/ directory
  try {
    const rootItems = fs.readdirSync(projectPath);
    for (const item of rootItems) {
      if (item.endsWith('.md') && !docFiles.includes(item)) {
        docFiles.push(item);
      }
    }
  } catch { /* */ }

  try {
    const docsDir = path.join(projectPath, 'docs');
    if (fs.existsSync(docsDir)) {
      const docsItems = fs.readdirSync(docsDir);
      for (const item of docsItems) {
        if (item.endsWith('.md')) {
          const rel = `docs/${item}`;
          if (!docFiles.includes(rel)) docFiles.push(rel);
        }
      }
    }
  } catch { /* */ }

  function extractFromContent(content: string, fileName: string) {
    // IP addresses
    const ips = content.match(DOCS_PATTERNS.ipv4);
    if (ips) {
      for (const ip of ips) {
        // Skip common non-server IPs
        if (!ip.startsWith('0.') && !ip.startsWith('127.') && !ip.startsWith('255.') && ip !== '0.0.0.0') {
          serversSet.add(ip);
        }
      }
    }

    // SSH connections
    DOCS_PATTERNS.ssh.lastIndex = 0;
    let m;
    while ((m = DOCS_PATTERNS.ssh.exec(content))) sshSet.add(m[0].trim());

    // SCP/rsync
    DOCS_PATTERNS.scp.lastIndex = 0;
    while ((m = DOCS_PATTERNS.scp.exec(content))) sshSet.add(m[0].trim());

    // Domains (filter out common non-server domains)
    const domains = content.match(DOCS_PATTERNS.domains);
    if (domains) {
      const skipDomains = ['github.com', 'npmjs.com', 'example.com', 'google.com', 'fonts.googleapis.com', 'cdn.jsdelivr.net', 'unpkg.com'];
      for (const d of domains) {
        if (!skipDomains.some(s => d.includes(s)) && d.includes('.')) {
          serversSet.add(d);
        }
      }
    }

    // Deploy URLs
    const dUrls = content.match(DOCS_PATTERNS.deployUrls);
    if (dUrls) dUrls.forEach(u => deployUrlsSet.add(u));

    // Shell commands from code blocks
    DOCS_PATTERNS.codeBlockCommands.lastIndex = 0;
    while ((m = DOCS_PATTERNS.codeBlockCommands.exec(content))) {
      const commands = m[1].split('\n').filter(l => l.trim()).map(l => l.trim());
      commands.forEach(c => installStepsSet.add(c));
    }

    // Inline shell commands
    DOCS_PATTERNS.shellCommands.lastIndex = 0;
    while ((m = DOCS_PATTERNS.shellCommands.exec(content))) {
      if (m[1].trim()) installStepsSet.add(m[1].trim());
    }

    // API key names
    const keys = content.match(DOCS_PATTERNS.apiKeyNames);
    if (keys) keys.forEach(k => apiKeysSet.add(k));

    // Server references in prose
    DOCS_PATTERNS.serverRefs.lastIndex = 0;
    while ((m = DOCS_PATTERNS.serverRefs.exec(content))) {
      const ref = m[1].trim().replace(/[,;.\)]+$/, '');
      if (ref.length > 3 && !ref.startsWith('(') && !ref.startsWith('#')) {
        serversSet.add(ref);
      }
    }
  }

  for (const docFile of docFiles) {
    const fullPath = path.join(projectPath, docFile);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > 500 * 1024) continue; // Skip files > 500KB
      const content = fs.readFileSync(fullPath, 'utf-8');

      extractFromContent(content, docFile);

      // Store key file contents
      const baseName = path.basename(docFile).toLowerCase();
      if (baseName === 'claude.md') {
        docs.claudeMdContent = content.slice(0, 5000); // first 5K chars
      } else if (baseName === 'readme.md') {
        docs.readmeContent = content.slice(0, 3000);
      } else if (['deployment.md', 'deploy.md', 'setup.md', 'install.md', 'next_session_prompt.md', 'next-session-prompt.md'].includes(baseName)) {
        docs.deployDocs += `\n--- ${docFile} ---\n` + content.slice(0, 3000);
      }
    } catch { /* */ }
  }

  // Also scan Claude's memory files if they exist
  const claudeMemoryDirs = ['.claude', '.claude/memory'];
  for (const memDir of claudeMemoryDirs) {
    const memPath = path.join(projectPath, memDir);
    if (!fs.existsSync(memPath)) continue;
    try {
      const items = fs.readdirSync(memPath);
      for (const item of items) {
        if (!item.endsWith('.md') && !item.endsWith('.json')) continue;
        const fullPath = path.join(memPath, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 100 * 1024) continue;
          const content = fs.readFileSync(fullPath, 'utf-8');
          extractFromContent(content, `${memDir}/${item}`);
        } catch { /* */ }
      }
    } catch { /* */ }
  }

  docs.servers = [...serversSet].slice(0, 20);
  docs.sshDetails = [...sshSet].slice(0, 10);
  docs.deployUrls = [...deployUrlsSet].slice(0, 10);
  docs.installSteps = [...installStepsSet].slice(0, 20);
  docs.apiKeys = [...apiKeysSet].slice(0, 20);

  return docs;
}

function deepScanCode(projectPath: string): CodeIntel {
  const intel: CodeIntel = {
    ports: [],
    urls: [],
    routes: [],
    databases: [],
    features: [],
    envVars: [],
    wpIntel: null,
    shopifyIntel: null,
    docsIntel: null,
  };

  // --- SCAN MARKDOWN/DOCS FILES FIRST (CLAUDE.md, README, deploy docs) ---
  intel.docsIntel = scanDocsFiles(projectPath);

  const portsSet = new Set<number>();
  const urlsSet = new Set<string>();
  const routesSet = new Set<string>();
  const dbSet = new Set<string>();
  const featuresSet = new Set<string>();
  const envSet = new Set<string>();

  // WordPress intel
  const wpThemes: Set<string> = new Set();
  const wpPlugins: Set<string> = new Set();
  const wpPostTypes: Set<string> = new Set();
  const wpHooks: Set<string> = new Set();
  const wpShortcodes: Set<string> = new Set();
  const wpRestRoutes: Set<string> = new Set();
  let wpHasAppPasswords = false;
  const wpJsonEndpoints: Set<string> = new Set();
  const wpExternalApis: Set<string> = new Set();
  let wpHasCron = false;

  // Shopify intel
  const shopSections: Set<string> = new Set();
  const shopSnippets: Set<string> = new Set();
  const shopSettings: Set<string> = new Set();

  const scanExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.php', '.rb', '.go', '.rs',
    '.java', '.env', '.toml', '.yaml', '.yml', '.json', '.liquid', '.html',
    '.css', '.sh',
  ]);

  let filesScanned = 0;
  const maxFilesToScan = 500;
  const maxFileSize = 100 * 1024; // 100KB per file

  function scanDir(dir: string, depth: number) {
    if (depth > 10 || filesScanned >= maxFilesToScan) return;

    let items: fs.Dirent[];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const item of items) {
      if (filesScanned >= maxFilesToScan) break;

      if (item.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '__pycache__', 'vendor', 'target', '.cache', '.next', 'coverage'].includes(item.name)) continue;
        scanDir(path.join(dir, item.name), depth + 1);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (!scanExtensions.has(ext) && item.name !== '.env') continue;

        const fullPath = path.join(dir, item.name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > maxFileSize) continue;

          const content = fs.readFileSync(fullPath, 'utf-8');
          filesScanned++;

          // .env files — extract vars and ports
          if (item.name === '.env' || item.name.startsWith('.env.')) {
            const lines = content.split('\n');
            for (const line of lines) {
              if (line.startsWith('#') || !line.includes('=')) continue;
              const [key, val] = line.split('=', 2);
              if (key) envSet.add(key.trim());
              if (val && /^\d{2,5}$/.test(val.trim())) portsSet.add(parseInt(val.trim()));
              if (val && /https?:\/\//.test(val)) {
                const urlMatch = val.match(/https?:\/\/[^\s'"]+/);
                if (urlMatch) urlsSet.add(urlMatch[0]);
              }
            }
            continue;
          }

          // Scan for patterns
          for (const re of CODE_PATTERNS.ports) {
            re.lastIndex = 0;
            let m; while ((m = re.exec(content))) { const p = parseInt(m[1]); if (p > 999 && p < 65536) portsSet.add(p); }
          }
          for (const re of CODE_PATTERNS.urls) {
            re.lastIndex = 0;
            let m; while ((m = re.exec(content))) urlsSet.add(m[0].slice(0, 200));
          }
          for (const re of CODE_PATTERNS.routes) {
            re.lastIndex = 0;
            let m; while ((m = re.exec(content))) routesSet.add(m[2] || m[1]);
          }
          for (const re of CODE_PATTERNS.databases) {
            re.lastIndex = 0;
            let m; while ((m = re.exec(content))) {
              const matched = m[0].toLowerCase().trim();
              // Normalize common aliases
              const normalized = matched === 'postgresql' ? 'postgres' : matched;
              if (normalized.length > 1) dbSet.add(normalized);
            }
          }
          for (const re of CODE_PATTERNS.auth) {
            re.lastIndex = 0;
            if (re.test(content)) featuresSet.add('Authentication');
          }
          for (const re of CODE_PATTERNS.payments) {
            re.lastIndex = 0;
            if (re.test(content)) featuresSet.add('Payments');
          }
          for (const re of CODE_PATTERNS.email) {
            re.lastIndex = 0;
            if (re.test(content)) featuresSet.add('Email');
          }
          for (const re of CODE_PATTERNS.storage) {
            re.lastIndex = 0;
            if (re.test(content)) featuresSet.add('File Storage');
          }
          for (const re of CODE_PATTERNS.envVars) {
            re.lastIndex = 0;
            let m; while ((m = re.exec(content))) envSet.add(m[1]);
          }

          // WordPress-specific scanning
          if (ext === '.php') {
            const themeMatch = content.match(WP_PATTERNS.theme);
            if (themeMatch) wpThemes.add(themeMatch[1].trim());
            const pluginMatch = content.match(WP_PATTERNS.plugins);
            if (pluginMatch) wpPlugins.add(pluginMatch[1].trim());

            WP_PATTERNS.hooks.lastIndex = 0;
            let m; while ((m = WP_PATTERNS.hooks.exec(content))) wpHooks.add(m[1]);
            WP_PATTERNS.shortcodes.lastIndex = 0;
            while ((m = WP_PATTERNS.shortcodes.exec(content))) wpShortcodes.add(m[1]);
            WP_PATTERNS.postTypes.lastIndex = 0;
            while ((m = WP_PATTERNS.postTypes.exec(content))) wpPostTypes.add(m[1]);
            WP_PATTERNS.restRoutes.lastIndex = 0;
            while ((m = WP_PATTERNS.restRoutes.exec(content))) wpRestRoutes.add(m[1]);

            // WP REST API / App Password detection
            if (WP_API_PATTERNS.appPasswords.test(content)) wpHasAppPasswords = true;
            WP_API_PATTERNS.appPasswords.lastIndex = 0;

            WP_API_PATTERNS.wpJsonUrl.lastIndex = 0;
            while ((m = WP_API_PATTERNS.wpJsonUrl.exec(content))) wpJsonEndpoints.add(m[1]);

            WP_API_PATTERNS.wpRemote.lastIndex = 0;
            while ((m = WP_API_PATTERNS.wpRemote.exec(content))) wpExternalApis.add(m[1].slice(0, 80));

            if (WP_API_PATTERNS.wpCron.test(content)) wpHasCron = true;
            WP_API_PATTERNS.wpCron.lastIndex = 0;

            if (WP_API_PATTERNS.cloudflareApi.test(content)) wpExternalApis.add('Cloudflare API');
            WP_API_PATTERNS.cloudflareApi.lastIndex = 0;
          }

          // Shopify-specific scanning
          if (ext === '.liquid') {
            SHOPIFY_PATTERNS.sections.lastIndex = 0;
            let m; while ((m = SHOPIFY_PATTERNS.sections.exec(content))) shopSections.add(m[1]);
            SHOPIFY_PATTERNS.snippets.lastIndex = 0;
            while ((m = SHOPIFY_PATTERNS.snippets.exec(content))) shopSnippets.add(m[1]);
          }
          if (item.name.endsWith('.json') && dir.includes('sections')) {
            SHOPIFY_PATTERNS.schemaSettings.lastIndex = 0;
            let m; while ((m = SHOPIFY_PATTERNS.schemaSettings.exec(content))) shopSettings.add(m[1]);
          }

        } catch { /* skip unreadable files */ }
      }
    }
  }

  scanDir(projectPath, 0);

  intel.ports = [...portsSet].sort();
  intel.urls = [...urlsSet].slice(0, 20);
  intel.routes = [...routesSet].slice(0, 50);
  intel.databases = [...dbSet];
  intel.features = [...featuresSet];
  intel.envVars = [...envSet].slice(0, 30);

  if (wpThemes.size > 0 || wpPlugins.size > 0 || wpPostTypes.size > 0 || wpHasAppPasswords || wpJsonEndpoints.size > 0) {
    intel.wpIntel = {
      themes: [...wpThemes],
      plugins: [...wpPlugins],
      customPostTypes: [...wpPostTypes],
      hooks: [...wpHooks].slice(0, 30),
      shortcodes: [...wpShortcodes],
      restRoutes: [...wpRestRoutes],
      hasAppPasswords: wpHasAppPasswords,
      wpJsonEndpoints: [...wpJsonEndpoints].slice(0, 20),
      externalApis: [...wpExternalApis].slice(0, 10),
      hasCron: wpHasCron,
    };
  }

  if (shopSections.size > 0 || shopSnippets.size > 0) {
    intel.shopifyIntel = {
      sections: [...shopSections],
      snippets: [...shopSnippets],
      settingTypes: [...shopSettings],
    };
  }

  return intel;
}

// ============================================================
// BRAIN BUILDER
// ============================================================

function buildBrainFromCode(
  projectPath: string,
  signatures: ProjectSignature[],
  codeIntel: CodeIntel,
  byType: Record<string, number>,
): {
  summary: string; architecture: string; conventions: string;
  dependencies: string; knownIssues: string; decisions: string;
} {
  const brain = { summary: '', architecture: '', conventions: '', dependencies: '', knownIssues: '', decisions: '' };
  const projectName = path.basename(projectPath);

  // --- SUMMARY ---
  const summaryParts: string[] = [`Project: ${projectName}`];

  // Read package.json for description
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.description) summaryParts.push(pkg.description);
      if (pkg.version) summaryParts.push(`v${pkg.version}`);
    } catch { /* */ }
  }

  const mainStack = signatures[0];
  if (mainStack) {
    summaryParts.push(`Stack: ${mainStack.framework || mainStack.stack} (${mainStack.language})`);
  }

  if (signatures.length > 1) {
    summaryParts.push(`Sub-projects: ${signatures.filter(s => s.subPath).map(s => `${s.subPath} (${s.framework || s.stack})`).join(', ')}`);
  }

  if (codeIntel.features.length > 0) {
    summaryParts.push(`Features: ${codeIntel.features.join(', ')}`);
  }

  brain.summary = summaryParts.join('\n');

  // --- ARCHITECTURE ---
  const archParts: string[] = [];

  // Stacks
  for (const sig of signatures) {
    const label = sig.subPath ? `[${sig.subPath}]` : '[root]';
    archParts.push(`${label} ${sig.framework || sig.stack} (${sig.language})`);
  }

  // File structure
  const totalFiles = Object.values(byType).reduce((s, c) => s + c, 0);
  archParts.push(`\nFiles: ${totalFiles} total`);
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of typeEntries.slice(0, 12)) {
    archParts.push(`  ${type}: ${count}`);
  }

  // Ports & URLs
  if (codeIntel.ports.length > 0) {
    archParts.push(`\nPorts: ${codeIntel.ports.join(', ')}`);
  }
  if (codeIntel.urls.length > 0) {
    archParts.push(`URLs: ${codeIntel.urls.slice(0, 5).join(', ')}`);
  }

  // Routes
  if (codeIntel.routes.length > 0) {
    archParts.push(`\nAPI Routes (${codeIntel.routes.length}):`);
    for (const r of codeIntel.routes.slice(0, 20)) archParts.push(`  ${r}`);
    if (codeIntel.routes.length > 20) archParts.push(`  ... +${codeIntel.routes.length - 20} more`);
  }

  // Databases
  if (codeIntel.databases.length > 0) {
    archParts.push(`\nDatabases: ${[...new Set(codeIntel.databases)].join(', ')}`);
  }

  // WordPress
  if (codeIntel.wpIntel) {
    const wp = codeIntel.wpIntel;
    archParts.push('\n--- WordPress ---');
    if (wp.themes.length) archParts.push(`Themes: ${wp.themes.join(', ')}`);
    if (wp.plugins.length) archParts.push(`Plugins: ${wp.plugins.join(', ')}`);
    if (wp.customPostTypes.length) archParts.push(`Custom Post Types: ${wp.customPostTypes.join(', ')}`);
    if (wp.shortcodes.length) archParts.push(`Shortcodes: ${wp.shortcodes.join(', ')}`);
    if (wp.restRoutes.length) archParts.push(`REST Routes: ${wp.restRoutes.join(', ')}`);
    if (wp.wpJsonEndpoints.length) archParts.push(`WP JSON Endpoints: ${wp.wpJsonEndpoints.join(', ')}`);
    if (wp.hasAppPasswords) archParts.push(`Application Passwords: ENABLED (WP REST API auth)`);
    if (wp.externalApis.length) archParts.push(`External APIs: ${wp.externalApis.join(', ')}`);
    if (wp.hasCron) archParts.push(`WP-Cron: active`);
    if (wp.hooks.length) archParts.push(`Hooks (${wp.hooks.length}): ${wp.hooks.slice(0, 10).join(', ')}${wp.hooks.length > 10 ? '...' : ''}`);
  }

  // Shopify
  if (codeIntel.shopifyIntel) {
    const sh = codeIntel.shopifyIntel;
    archParts.push('\n--- Shopify ---');
    if (sh.sections.length) archParts.push(`Sections: ${sh.sections.join(', ')}`);
    if (sh.snippets.length) archParts.push(`Snippets: ${sh.snippets.join(', ')}`);
    if (sh.settingTypes.length) archParts.push(`Setting Types: ${[...new Set(sh.settingTypes)].join(', ')}`);
  }

  // Git
  if (fs.existsSync(path.join(projectPath, '.git'))) {
    try {
      const git = simpleGit(projectPath);
      // sync check for branch
      archParts.push('\nGit: enabled');
    } catch { /* */ }
  }

  // Documentation intelligence (servers, SSH, deploy, etc.)
  if (codeIntel.docsIntel) {
    const di = codeIntel.docsIntel;
    if (di.servers.length > 0 || di.sshDetails.length > 0 || di.deployUrls.length > 0) {
      archParts.push('\n--- Servers & Deployment ---');
      if (di.servers.length) archParts.push(`Servers/Hosts: ${di.servers.join(', ')}`);
      if (di.sshDetails.length) archParts.push(`SSH Access:\n${di.sshDetails.map(s => `  ${s}`).join('\n')}`);
      if (di.deployUrls.length) archParts.push(`Deploy URLs: ${di.deployUrls.join(', ')}`);
    }
    if (di.apiKeys.length > 0) {
      archParts.push(`\nAPI Keys Required: ${di.apiKeys.join(', ')}`);
    }
    if (di.installSteps.length > 0) {
      archParts.push(`\nSetup Commands (${di.installSteps.length}):`);
      for (const cmd of di.installSteps.slice(0, 10)) archParts.push(`  $ ${cmd}`);
    }
  }

  brain.architecture = archParts.join('\n');

  // --- DECISIONS / DOCS CONTEXT ---
  // Store CLAUDE.md and deploy docs content in decisions field
  if (codeIntel.docsIntel) {
    const di = codeIntel.docsIntel;
    const decParts: string[] = [];

    if (codeIntel.envVars.length > 0) {
      decParts.push(`Environment variables detected:\n${codeIntel.envVars.map(v => `  ${v}`).join('\n')}`);
    }
    if (di.claudeMdContent) {
      decParts.push(`\n--- CLAUDE.md ---\n${di.claudeMdContent}`);
    }
    if (di.deployDocs) {
      decParts.push(`\n--- Deploy/Setup Docs ---\n${di.deployDocs.slice(0, 2000)}`);
    }
    if (di.readmeContent) {
      decParts.push(`\n--- README (summary) ---\n${di.readmeContent.slice(0, 1500)}`);
    }
    brain.decisions = decParts.join('\n');
  }

  // --- CONVENTIONS --- (check root + each sub-project)
  const convParts: string[] = [];

  function detectConventionsAt(dir: string, label: string) {
    const parts: string[] = [];
    if (fs.existsSync(path.join(dir, 'tsconfig.json'))) {
      try {
        const tsconfig = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf-8'));
        if (tsconfig.compilerOptions?.strict) parts.push('TypeScript: strict mode');
        if (tsconfig.compilerOptions?.target) parts.push(`Target: ${tsconfig.compilerOptions.target}`);
      } catch { /* */ }
    }
    if (fs.existsSync(path.join(dir, '.eslintrc.js')) || fs.existsSync(path.join(dir, 'eslint.config.mjs')) || fs.existsSync(path.join(dir, '.eslintrc.json'))) parts.push('Linting: ESLint');
    if (fs.existsSync(path.join(dir, '.prettierrc')) || fs.existsSync(path.join(dir, '.prettierrc.json'))) parts.push('Formatting: Prettier');
    if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) parts.push('Package manager: pnpm');
    else if (fs.existsSync(path.join(dir, 'yarn.lock'))) parts.push('Package manager: yarn');
    else if (fs.existsSync(path.join(dir, 'package-lock.json'))) parts.push('Package manager: npm');
    else if (fs.existsSync(path.join(dir, 'composer.lock'))) parts.push('Package manager: composer');
    else if (fs.existsSync(path.join(dir, 'Pipfile.lock'))) parts.push('Package manager: pipenv');

    if (fs.existsSync(path.join(dir, '.husky'))) parts.push('Git hooks: Husky');
    if (fs.existsSync(path.join(dir, 'docker-compose.yml')) || fs.existsSync(path.join(dir, 'docker-compose.yaml'))) parts.push('Containers: Docker Compose');
    if (fs.existsSync(path.join(dir, '.github/workflows'))) parts.push('CI/CD: GitHub Actions');

    if (parts.length > 0) {
      if (label) convParts.push(`[${label}]`);
      convParts.push(...parts);
    }
  }

  // Check root first
  detectConventionsAt(projectPath, '');
  // Check each sub-project
  for (const sig of signatures) {
    if (!sig.subPath) continue;
    detectConventionsAt(path.join(projectPath, sig.subPath), sig.subPath);
  }

  brain.conventions = convParts.join('\n');

  // --- DEPENDENCIES --- (check root + each sub-project)
  const depParts: string[] = [];

  function detectDepsAt(dir: string, label: string) {
    const prefix = label ? `${label} — ` : '';

    // Node (package.json)
    const nodePkg = path.join(dir, 'package.json');
    if (fs.existsSync(nodePkg)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(nodePkg, 'utf-8'));
        const deps = Object.entries(pkg.dependencies || {}).filter(([k]) => !k.startsWith('@types/'));
        if (deps.length > 0) {
          depParts.push(`${prefix}Node dependencies (${deps.length}):`);
          for (const [name, ver] of deps.slice(0, 20)) depParts.push(`  ${name}: ${ver}`);
          if (deps.length > 20) depParts.push(`  ... +${deps.length - 20} more`);
        }
      } catch { /* */ }
    }

    // Composer (PHP)
    const composerFile = path.join(dir, 'composer.json');
    if (fs.existsSync(composerFile)) {
      try {
        const composer = JSON.parse(fs.readFileSync(composerFile, 'utf-8'));
        const deps = Object.entries(composer.require || {});
        if (deps.length > 0) {
          depParts.push(`\n${prefix}PHP dependencies (${deps.length}):`);
          for (const [name, ver] of deps.slice(0, 15)) depParts.push(`  ${name}: ${ver}`);
        }
      } catch { /* */ }
    }

    // Requirements.txt (Python)
    const reqFile = path.join(dir, 'requirements.txt');
    if (fs.existsSync(reqFile)) {
      try {
        const lines = fs.readFileSync(reqFile, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
        if (lines.length > 0) {
          depParts.push(`\n${prefix}Python dependencies (${lines.length}):`);
          for (const line of lines.slice(0, 15)) depParts.push(`  ${line.trim()}`);
        }
      } catch { /* */ }
    }
  }

  // Check root first
  detectDepsAt(projectPath, '');
  // Check each sub-project
  for (const sig of signatures) {
    if (!sig.subPath) continue;
    detectDepsAt(path.join(projectPath, sig.subPath), sig.subPath);
  }

  brain.dependencies = depParts.join('\n');

  // Environment vars — only if docsIntel didn't already set decisions
  if (!brain.decisions && codeIntel.envVars.length > 0) {
    brain.decisions = `Environment variables detected:\n${codeIntel.envVars.map(v => `  ${v}`).join('\n')}`;
  }

  return brain;
}

// ============================================================
// TOOLCHAIN DETECTION
// ============================================================

import { execSync } from 'child_process';

/**
 * Detect CLI tools, SSH connections, and deploy methods for a project.
 */
function detectToolchain(projectPath: string, signatures: ProjectSignature[], codeIntel: CodeIntel): ToolchainInfo {
  const info: ToolchainInfo = {
    cliTools: [],
    sshConfigured: false,
    sshHosts: [],
    deployMethod: null,
  };

  const stacks = signatures.map(s => s.framework || s.stack);
  const hasStack = (name: string) => stacks.some(s => s?.toLowerCase().includes(name));

  // --- CLI TOOL DETECTION ---

  // Shopify CLI
  if (hasStack('shopify') || fs.existsSync(path.join(projectPath, 'shopify.theme.toml')) ||
      fs.existsSync(path.join(projectPath, '.shopifyignore'))) {
    try {
      execSync('shopify version', { timeout: 3000, stdio: 'pipe' });
      info.cliTools.push('shopify-cli');
    } catch {
      // Shopify project but CLI not installed
      if (hasStack('shopify')) info.cliTools.push('shopify-cli (project detected)');
    }
  }

  // WP-CLI
  if (hasStack('wordpress') || hasStack('wordpress-theme') ||
      fs.existsSync(path.join(projectPath, 'wp-cli.yml')) ||
      fs.existsSync(path.join(projectPath, 'wp-cli.phar'))) {
    try {
      execSync('wp --version', { timeout: 3000, stdio: 'pipe' });
      info.cliTools.push('wp-cli');
    } catch {
      if (hasStack('wordpress') || hasStack('wordpress-theme')) info.cliTools.push('wp-cli (project detected)');
    }
  }

  // Docker
  if (fs.existsSync(path.join(projectPath, 'Dockerfile')) ||
      fs.existsSync(path.join(projectPath, 'docker-compose.yml')) ||
      fs.existsSync(path.join(projectPath, 'docker-compose.yaml'))) {
    info.cliTools.push('docker');
  }

  // Vercel
  if (fs.existsSync(path.join(projectPath, 'vercel.json')) || fs.existsSync(path.join(projectPath, '.vercel'))) {
    info.cliTools.push('vercel');
    info.deployMethod = 'vercel';
  }

  // Netlify
  if (fs.existsSync(path.join(projectPath, 'netlify.toml'))) {
    info.cliTools.push('netlify');
    info.deployMethod = 'netlify';
  }

  // --- SSH / DEPLOYMENT DETECTION ---

  // Check docs intelligence for SSH details
  if (codeIntel.docsIntel) {
    const di = codeIntel.docsIntel;
    if (di.sshDetails.length > 0) {
      info.sshConfigured = true;
      // Extract hosts from SSH details
      for (const ssh of di.sshDetails) {
        const hostMatch = ssh.match(/@([\w\.\-]+)/);
        if (hostMatch) info.sshHosts.push(hostMatch[1]);
      }
    }
    // Also check servers for IPs that look like SSH hosts
    for (const server of di.servers) {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(server) && !info.sshHosts.includes(server)) {
        info.sshConfigured = true;
        info.sshHosts.push(server);
      }
    }
  }

  // Deploy method detection
  if (!info.deployMethod) {
    if (info.sshConfigured) info.deployMethod = 'ssh';
    else if (fs.existsSync(path.join(projectPath, '.github/workflows'))) info.deployMethod = 'github-actions';
    else if (fs.existsSync(path.join(projectPath, '.gitlab-ci.yml'))) info.deployMethod = 'gitlab-ci';
    else if (info.cliTools.includes('docker')) info.deployMethod = 'docker';
  }

  return info;
}

// ============================================================
// COMPLETION ESTIMATION
// ============================================================

/** Patterns that indicate incomplete work */
const INCOMPLETE_PATTERNS = {
  todo: /\b(?:TODO|FIXME|HACK|XXX|PLACEHOLDER|TEMP)\b/g,
  emptyHandler: /(?:=>\s*\{\s*\}|{\s*(?:\/\/.*\n\s*)*\s*}|(?:pass\s*$))/gm,
};

/**
 * Estimate how "complete" a project is based on code heuristics.
 * Returns a score 0-100 and human-readable indicators.
 */
function estimateCompletion(projectPath: string, byType: Record<string, number>, codeIntel: CodeIntel): CompletionEstimate {
  const result: CompletionEstimate = {
    score: 50, // start neutral
    todoCount: 0,
    fixmeCount: 0,
    emptyHandlers: 0,
    testRatio: 0,
    hasReadme: false,
    hasLicense: false,
    hasCi: false,
    hasTests: false,
    indicators: [],
  };

  // --- Scan source files for TODOs and empty handlers ---
  const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.php', '.rb', '.go', '.rs', '.java']);
  let sourceFileCount = 0;
  let filesChecked = 0;
  const maxCheck = 300;

  function checkDir(dir: string, depth: number) {
    if (depth > 10 || filesChecked >= maxCheck) return;
    let items: fs.Dirent[];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const item of items) {
      if (filesChecked >= maxCheck) break;
      if (item.isDirectory()) {
        if (SKIP_SIGNATURE_DIRS.has(item.name)) continue;
        checkDir(path.join(dir, item.name), depth + 1);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (!sourceExts.has(ext)) continue;
        sourceFileCount++;
        const fullPath = path.join(dir, item.name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 100 * 1024) continue;
          const content = fs.readFileSync(fullPath, 'utf-8');
          filesChecked++;

          // Count TODOs
          const todoMatches = content.match(INCOMPLETE_PATTERNS.todo);
          if (todoMatches) result.todoCount += todoMatches.length;

          // Count empty handlers/functions
          INCOMPLETE_PATTERNS.emptyHandler.lastIndex = 0;
          const emptyMatches = content.match(INCOMPLETE_PATTERNS.emptyHandler);
          if (emptyMatches) result.emptyHandlers += emptyMatches.length;
        } catch { /* skip */ }
      }
    }
  }

  checkDir(projectPath, 0);

  // --- Shipping indicators ---
  result.hasReadme = fs.existsSync(path.join(projectPath, 'README.md')) || fs.existsSync(path.join(projectPath, 'readme.md'));
  result.hasLicense = fs.existsSync(path.join(projectPath, 'LICENSE')) || fs.existsSync(path.join(projectPath, 'LICENSE.md'));
  result.hasCi = fs.existsSync(path.join(projectPath, '.github/workflows')) || fs.existsSync(path.join(projectPath, '.gitlab-ci.yml'));
  result.hasTests = (byType['test'] || 0) > 0;

  // Test ratio
  const testFiles = byType['test'] || 0;
  const totalSource = Object.entries(byType)
    .filter(([t]) => !['asset', 'config', 'style', 'test'].includes(t))
    .reduce((s, [, c]) => s + c, 0);
  result.testRatio = totalSource > 0 ? Math.round((testFiles / totalSource) * 100) / 100 : 0;

  // --- Calculate score ---
  let score = 50; // baseline

  // TODOs and FIXMEs reduce score
  if (result.todoCount === 0) { score += 15; result.indicators.push('No TODO/FIXME comments'); }
  else if (result.todoCount <= 5) { score += 5; result.indicators.push(`${result.todoCount} TODO/FIXME comments`); }
  else if (result.todoCount <= 20) { score -= 5; result.indicators.push(`${result.todoCount} TODO/FIXME comments`); }
  else { score -= 15; result.indicators.push(`${result.todoCount} TODO/FIXME comments (many)`); }

  // Empty handlers reduce score
  if (result.emptyHandlers === 0) { score += 10; result.indicators.push('No empty handlers'); }
  else if (result.emptyHandlers <= 3) { score -= 5; result.indicators.push(`${result.emptyHandlers} empty handlers/stubs`); }
  else { score -= 15; result.indicators.push(`${result.emptyHandlers} empty handlers/stubs`); }

  // Shipping indicators boost score
  if (result.hasReadme) { score += 5; result.indicators.push('README present'); }
  else { result.indicators.push('No README'); }

  if (result.hasLicense) { score += 3; result.indicators.push('LICENSE present'); }

  if (result.hasCi) { score += 5; result.indicators.push('CI/CD configured'); }

  if (result.hasTests) {
    score += 7;
    result.indicators.push(`Tests present (${testFiles} files, ratio ${result.testRatio})`);
  } else {
    score -= 5;
    result.indicators.push('No test files found');
  }

  // Features indicate a more complete project
  if (codeIntel.features.length >= 3) { score += 5; result.indicators.push(`${codeIntel.features.length} features detected`); }
  else if (codeIntel.features.length >= 1) { score += 2; }

  // Routes indicate implementation work
  if (codeIntel.routes.length >= 10) { score += 5; result.indicators.push(`${codeIntel.routes.length} API routes`); }
  else if (codeIntel.routes.length >= 3) { score += 2; }

  // Clamp to 0-100
  result.score = Math.max(0, Math.min(100, score));

  return result;
}

// ============================================================
// SERVER INFO STORAGE
// ============================================================

function storeServerInfo(projectId: string, codeIntel: CodeIntel, signatures: ProjectSignature[]): void {
  const db = getDb();

  // Don't duplicate
  const existing = db.prepare(`
    SELECT s.id FROM servers s
    JOIN project_servers ps ON ps.server_id = s.id
    WHERE ps.project_id = ?
  `).get(projectId);
  if (existing) return;

  // Create server entry from detected ports/URLs
  const serverId = uuid();
  const mainStack = signatures[0]?.framework || signatures[0]?.stack || 'unknown';
  const primaryPort = codeIntel.ports[0] || null;
  const primaryUrl = codeIntel.urls[0] || null;

  const notes = [
    `Stack: ${mainStack}`,
    codeIntel.ports.length > 0 ? `Ports: ${codeIntel.ports.join(', ')}` : '',
    codeIntel.databases.length > 0 ? `DB: ${codeIntel.databases.join(', ')}` : '',
    codeIntel.features.length > 0 ? `Features: ${codeIntel.features.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  db.prepare(`
    INSERT INTO servers (id, name, host, deploy_url, notes) VALUES (?, ?, ?, ?, ?)
  `).run(serverId, `${mainStack} dev server`, primaryPort ? `localhost:${primaryPort}` : null, primaryUrl, notes);

  db.prepare(`
    INSERT INTO project_servers (project_id, server_id) VALUES (?, ?)
  `).run(projectId, serverId);

  // Update project dev_server_port if detected
  if (primaryPort) {
    db.prepare('UPDATE projects SET dev_server_port = ? WHERE id = ? AND dev_server_port IS NULL')
      .run(primaryPort, projectId);
  }
}
