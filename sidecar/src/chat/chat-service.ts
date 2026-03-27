import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';

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
  const parts: string[] = [
    `You are an AI assistant embedded in Cortex, helping with the project "${projectName}".`,
    'Be concise, technical, and direct. Reference specific files and code when possible.',
  ];

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
 * Send a message and get streaming response
 * Returns an async generator yielding text chunks
 */
export async function* sendMessage(
  projectId: string,
  projectName: string,
  userMessage: string,
  apiKey?: string
): AsyncGenerator<{ type: 'chunk' | 'done' | 'error'; content: string }> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    yield { type: 'error', content: 'No API key configured. Set ANTHROPIC_API_KEY environment variable or provide it in settings.' };
    return;
  }

  const client = new Anthropic({ apiKey: key });
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

  // Build messages for API (last 20 messages to stay within context)
  const recentHistory = session.history.slice(-20);
  const apiMessages = recentHistory.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: apiMessages,
    });

    let fullResponse = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullResponse += text;
        yield { type: 'chunk', content: text };
      }
    }

    // Save assistant message to history
    const assistantMsg: ChatMessage = {
      id: uuid(),
      role: 'assistant',
      content: fullResponse,
      timestamp: new Date().toISOString(),
    };
    session.history.push(assistantMsg);
    saveHistory(projectId, session.history);

    yield { type: 'done', content: fullResponse };
  } catch (err: any) {
    // Still save the user message even if API fails
    saveHistory(projectId, session.history);

    const errorMsg = err.message || 'Unknown error';
    if (errorMsg.includes('authentication') || errorMsg.includes('api_key')) {
      yield { type: 'error', content: 'Invalid API key. Check your ANTHROPIC_API_KEY.' };
    } else if (errorMsg.includes('rate_limit')) {
      yield { type: 'error', content: 'Rate limited. Please wait a moment and try again.' };
    } else {
      yield { type: 'error', content: `API error: ${errorMsg}` };
    }
  }
}
