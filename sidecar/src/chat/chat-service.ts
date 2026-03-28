import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { getMasterpieceContext } from '../intelligence/masterpiece-context.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  id: string;
}

export interface ProjectBrain {
  summary: string;
  architectureNotes: string;
  knownIssues: string;
  decisions: string;
  conventions: string;
  dependenciesNotes: string;
}

/**
 * Build system prompt from project brain
 */
function buildSystemPrompt(projectName: string, brain: ProjectBrain | null): string {
  // Check if masterpiece mode is enabled
  let masterpieceEnabled = false;
  try {
    const db = getDb();
    const masterpieceSetting = db.prepare(
      "SELECT value FROM settings WHERE key = 'masterpiece_mode'"
    ).get() as { value: string } | undefined;
    masterpieceEnabled = masterpieceSetting?.value === 'true';
  } catch {
    // settings table may not exist yet
  }

  const parts: string[] = [
    `You are an AI assistant embedded in Cortex, helping with the project "${projectName}".`,
    'Be concise, technical, and direct. Reference specific files and code when possible.',
  ];

  if (masterpieceEnabled) {
    parts.push('\n' + getMasterpieceContext());
  }

  if (brain) {
    if (brain.summary) parts.push(`\n## Project Summary\n${brain.summary}`);
    if (brain.architectureNotes) parts.push(`\n## Architecture\n${brain.architectureNotes}`);
    if (brain.conventions) parts.push(`\n## Conventions\n${brain.conventions}`);
    if (brain.knownIssues) parts.push(`\n## Known Issues\n${brain.knownIssues}`);
    if (brain.decisions) parts.push(`\n## Key Decisions\n${brain.decisions}`);
    if (brain.dependenciesNotes) parts.push(`\n## Dependencies\n${brain.dependenciesNotes}`);
  }

  return parts.join('\n');
}

/**
 * Get or create the AI session for a project
 */
function getOrCreateSession(projectId: string): { id: string; history: ChatMessage[] } {
  const db = getDb();
  let row = db.prepare('SELECT * FROM ai_sessions WHERE project_id = ?').get(projectId) as any;

  if (!row) {
    const id = uuid();
    db.prepare(`
      INSERT INTO ai_sessions (id, project_id, history_json) VALUES (?, ?, '[]')
    `).run(id, projectId);
    return { id, history: [] };
  }

  let history: ChatMessage[];
  try {
    history = JSON.parse(row.history_json || '[]');
  } catch {
    history = [];
  }

  return { id: row.id, history };
}

/**
 * Save chat history to DB
 */
function saveHistory(projectId: string, history: ChatMessage[]): void {
  const db = getDb();
  db.prepare('UPDATE ai_sessions SET history_json = ?, updated_at = ? WHERE project_id = ?')
    .run(JSON.stringify(history), new Date().toISOString(), projectId);
}

/**
 * Get project brain fields
 */
export function getProjectBrain(projectId: string): ProjectBrain | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM project_brain WHERE project_id = ?').get(projectId) as any;
  if (!row) return null;

  return {
    summary: row.summary || '',
    architectureNotes: row.architecture_notes || '',
    knownIssues: row.known_issues || '',
    decisions: row.decisions || '',
    conventions: row.conventions || '',
    dependenciesNotes: row.dependencies_notes || '',
  };
}

/**
 * Update project brain fields
 */
export function updateProjectBrain(projectId: string, fields: Partial<ProjectBrain>): void {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM project_brain WHERE project_id = ?').get(projectId) as any;

  if (!existing) {
    db.prepare(`
      INSERT INTO project_brain (id, project_id, summary, architecture_notes, known_issues, decisions, conventions, dependencies_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(), projectId,
      fields.summary ?? '', fields.architectureNotes ?? '',
      fields.knownIssues ?? '', fields.decisions ?? '',
      fields.conventions ?? '', fields.dependenciesNotes ?? ''
    );
  } else {
    const sets: string[] = [];
    const params: any[] = [];

    if (fields.summary !== undefined) { sets.push('summary = ?'); params.push(fields.summary); }
    if (fields.architectureNotes !== undefined) { sets.push('architecture_notes = ?'); params.push(fields.architectureNotes); }
    if (fields.knownIssues !== undefined) { sets.push('known_issues = ?'); params.push(fields.knownIssues); }
    if (fields.decisions !== undefined) { sets.push('decisions = ?'); params.push(fields.decisions); }
    if (fields.conventions !== undefined) { sets.push('conventions = ?'); params.push(fields.conventions); }
    if (fields.dependenciesNotes !== undefined) { sets.push('dependencies_notes = ?'); params.push(fields.dependenciesNotes); }

    if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(projectId);
      db.prepare(`UPDATE project_brain SET ${sets.join(', ')} WHERE project_id = ?`).run(...params);
    }
  }
}

/**
 * Get chat history for a project
 */
export function getChatHistory(projectId: string): ChatMessage[] {
  const session = getOrCreateSession(projectId);
  return session.history;
}

/**
 * Clear chat history for a project
 */
export function clearChatHistory(projectId: string): void {
  saveHistory(projectId, []);
}

/**
 * Send a message using Claude CLI (Max subscription) and stream the response.
 * Uses `claude -p "prompt" --output-format stream-json` for streaming.
 * Falls back to non-streaming if stream format isn't available.
 */
export async function* sendMessage(
  projectId: string,
  projectName: string,
  userMessage: string,
): AsyncGenerator<{ type: 'chunk' | 'done' | 'error'; content: string }> {
  const brain = getProjectBrain(projectId);
  const systemPrompt = buildSystemPrompt(projectName, brain);
  const session = getOrCreateSession(projectId);

  // Add user message to history
  const userMsg: ChatMessage = {
    id: uuid(),
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  session.history.push(userMsg);

  // Build the full prompt with context
  const contextParts: string[] = [];
  if (systemPrompt) contextParts.push(systemPrompt);

  // Include recent chat history for continuity
  const recentHistory = session.history.slice(-10, -1); // exclude current message
  if (recentHistory.length > 0) {
    contextParts.push('\n## Recent conversation:');
    for (const msg of recentHistory) {
      contextParts.push(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`);
    }
  }

  contextParts.push(`\nUser: ${userMessage}`);
  const fullPrompt = contextParts.join('\n');

  try {
    // Use login shell to ensure claude is in PATH (nvm etc.)
    const shell = process.env.SHELL || '/bin/bash';
    const claude = spawn(shell, ['-lc', `claude -p ${JSON.stringify(fullPrompt)}`], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let fullResponse = '';
    let hasOutput = false;

    // Stream stdout
    for await (const chunk of claude.stdout) {
      const text = chunk.toString();
      fullResponse += text;
      hasOutput = true;
      yield { type: 'chunk', content: text };
    }

    // Capture stderr for errors
    let stderr = '';
    for await (const chunk of claude.stderr) {
      stderr += chunk.toString();
    }

    // Wait for process to exit
    await new Promise<void>((resolve, reject) => {
      claude.on('close', (code) => {
        if (code === 0 || hasOutput) {
          resolve();
        } else {
          reject(new Error(stderr || `Claude CLI exited with code ${code}`));
        }
      });
      claude.on('error', reject);
    });

    // Save assistant message to history
    if (fullResponse.trim()) {
      const assistantMsg: ChatMessage = {
        id: uuid(),
        role: 'assistant',
        content: fullResponse.trim(),
        timestamp: new Date().toISOString(),
      };
      session.history.push(assistantMsg);
    }

    saveHistory(projectId, session.history);
    yield { type: 'done', content: fullResponse.trim() };

  } catch (err: any) {
    // Save user message even if Claude fails
    saveHistory(projectId, session.history);

    const errorMsg = err.message || 'Unknown error';

    if (errorMsg.includes('ENOENT') || errorMsg.includes('not found')) {
      yield {
        type: 'error',
        content: 'Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code\nThen authenticate with: claude login',
      };
    } else if (errorMsg.includes('auth') || errorMsg.includes('login') || errorMsg.includes('unauthorized')) {
      yield {
        type: 'error',
        content: 'Claude CLI not authenticated. Run: claude login\nThis will open your browser to sign in with your Claude Max account.',
      };
    } else {
      yield { type: 'error', content: `Claude error: ${errorMsg}` };
    }
  }
}
