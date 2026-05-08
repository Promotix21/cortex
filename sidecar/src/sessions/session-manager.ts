import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import os from 'os';

export interface SessionInfo {
  id: string;
  projectId: string;
  name: string;
  status: 'running' | 'idle' | 'completed' | 'error';
  startedAt: string;
  lastActive: string;
  pid: number | null;
  promptCount: number;
  tokenUsageInput: number;
  tokenUsageOutput: number;
  terminalId: string | null;
}

interface ManagedSession {
  id: string;
  projectId: string;
  name: string;
  pty: pty.IPty | null;  // null when terminal manager owns the PTY
  outputBuffer: string;
  lastOutput: string;
  status: 'running' | 'idle' | 'completed' | 'error';
  promptCount: number;
  tokenEstimateInput: number;
  tokenEstimateOutput: number;
  startedAt: string;
  lastActive: string;
  terminalId: string | null;
  inputBuffer: string;  // accumulates keystrokes until Enter
  flushedToDaily: boolean; // Prevent double-counting in usage_daily
}

// Rough token estimation: ~4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Parse token counts from Claude Code terminal output.
 * Returns { tokens, costUsd } when found, null otherwise.
 *
 * Patterns Claude Code emits:
 *  "This session is 5h 43m old and 380k tokens."  → cumulative session total
 *  "↓711tokens"  or  "↓ 1,234 tokens"             → per-response output tokens
 *  "Cost: $0.042"                                  → cost per response
 */
function parseTokensFromOutput(data: string): { tokens: number; costUsd: number } | null {
  // Strip ANSI before matching
  const clean = data
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b./g, '');

  let tokens = 0;
  let costUsd = 0;

  // "This session is X old and 380k tokens" — most reliable cumulative count
  const sessionTotalMatch = clean.match(/\bthis session is .+? and ([\d.,]+)(k?)\s*tokens/i);
  if (sessionTotalMatch) {
    const n = parseFloat(sessionTotalMatch[1].replace(/,/g, ''));
    tokens = sessionTotalMatch[2] === 'k' ? Math.round(n * 1000) : Math.round(n);
  }

  // "↓711tokens" or "↓ 1,234 tokens" — per-response streamed output count
  if (!tokens) {
    const streamMatch = clean.match(/↓\s*([\d,]+)\s*tokens?/i);
    if (streamMatch) {
      tokens = parseInt(streamMatch[1].replace(/,/g, ''), 10);
    }
  }

  // "Cost: $0.042" or "$0.042"
  const costMatch = clean.match(/cost:\s*\$([\d.]+)/i) || clean.match(/\$([\d]{1,3}\.[\d]{2,4})\b/);
  if (costMatch) {
    costUsd = parseFloat(costMatch[1]);
  }

  return tokens > 0 || costUsd > 0 ? { tokens, costUsd } : null;
}

/**
 * Strip ANSI/VT100 escape sequences and terminal control codes from raw PTY input.
 * Returns null if the cleaned string has no meaningful text content.
 */
function stripAnsiAndValidate(raw: string): string | null {
  const cleaned = raw
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')   // CSI sequences: ESC [ ... letter
    .replace(/\x1b\][^\x07]*\x07/g, '')         // OSC sequences: ESC ] ... BEL
    .replace(/\x1b[()][AB012]/g, '')             // Charset designation
    .replace(/\x1b./g, '')                       // Any remaining ESC + char
    .replace(/\[200~/g, '').replace(/\[201~/g, '') // Bracketed paste markers
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // Non-printable control chars
    .trim();

  // Reject if empty or contains no alphanumeric characters (pure symbols/noise)
  if (!cleaned || cleaned.length < 2 || !/[a-zA-Z0-9]/.test(cleaned)) return null;
  return cleaned;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, ManagedSession> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startHeartbeat();
  }

  /**
   * Spawn a new Claude Code session for a project
   */
  spawnSession(projectId: string, sessionName: string, projectPath: string, skipClaude = false): SessionInfo {
    const id = uuid();
    const now = new Date().toISOString();

    let ptyProcess: pty.IPty | null = null;

    // Only spawn our own PTY if we're managing claude directly.
    // When skipClaude=true, the terminal manager owns the PTY — we just track metrics.
    if (!skipClaude) {
      const shell = process.env.SHELL || '/bin/bash';
      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: projectPath,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          FORCE_COLOR: '3',
        } as Record<string, string>,
      });
    }

    const session: ManagedSession = {
      id,
      projectId,
      name: sessionName,
      pty: ptyProcess,
      outputBuffer: '',
      lastOutput: '',
      status: 'running',
      promptCount: 0,
      tokenEstimateInput: 0,
      tokenEstimateOutput: 0,
      startedAt: now,
      lastActive: now,
      terminalId: null,
      inputBuffer: '',
      flushedToDaily: false,
    };

    if (ptyProcess) {
      // Collect output
      ptyProcess.onData((data: string) => {
        session.outputBuffer += data;
        session.lastOutput = data;
        session.lastActive = new Date().toISOString();

        if (session.outputBuffer.length > 102400) {
          session.outputBuffer = session.outputBuffer.slice(-51200);
        }

        this.emit('session:output', { sessionId: id, data });
      });

      // Handle exit
      ptyProcess.onExit(({ exitCode }) => {
        session.status = exitCode === 0 ? 'completed' : 'error';
        this.updateSessionDb(session);
        this.emit('session:exit', { sessionId: id, exitCode });
      });
    }

    this.sessions.set(id, session);

    // Persist to DB
    const db = getDb();
    db.prepare(`
      INSERT INTO claude_sessions (id, project_id, name, status, started_at, last_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, sessionName, 'running', now, now);

    // Create metrics row
    const metricsId = uuid();
    db.prepare(`
      INSERT INTO session_metrics (id, session_id) VALUES (?, ?)
    `).run(metricsId, id);

    // Send the claude command to start Claude Code
    if (!skipClaude && ptyProcess) {
      ptyProcess.write('claude\r');
    }

    this.emit('session:spawned', { sessionId: id, projectId, name: sessionName });
    return this.getSessionInfo(id)!;
  }

  /**
   * Record input from terminal manager for session tracking.
   * Called when the frontend writes to a terminal linked to a session.
   */
  recordTerminalInput(terminalId: string, data: string): void {
    // Find session linked to this terminal
    let session: ManagedSession | undefined;
    for (const s of this.sessions.values()) {
      if (s.terminalId === terminalId) {
        session = s;
        break;
      }
    }
    if (!session || session.status !== 'running') return;

    session.lastActive = new Date().toISOString();
    session.inputBuffer += data;

    // Count as a prompt when Enter is pressed
    if (data.includes('\r') || data.includes('\n')) {
      const promptText = session.inputBuffer.replace(/[\r\n]+$/, '').trim();
      session.inputBuffer = '';

      // Skip empty prompts, control sequences, and pure ANSI noise
      const cleanPrompt = stripAnsiAndValidate(promptText);
      if (!cleanPrompt) return;

      session.promptCount++;
      session.tokenEstimateInput += estimateTokens(cleanPrompt);

      // Log to session_history
      const db = getDb();
      db.prepare(`
        INSERT INTO session_history (id, session_id, prompt_text, timestamp)
        VALUES (?, ?, ?, ?)
      `).run(uuid(), session.id, cleanPrompt, session.lastActive);

      this.updateMetrics(session);
      this.emit('session:prompt', { sessionId: session.id, promptText });
    }
  }

  /**
   * Record terminal output for session tracking (from terminal manager).
   */
  recordTerminalOutput(terminalId: string, data: string): void {
    let session: ManagedSession | undefined;
    for (const s of this.sessions.values()) {
      if (s.terminalId === terminalId) {
        session = s;
        break;
      }
    }
    if (!session) return;

    session.outputBuffer += data;
    session.lastOutput = data;
    session.lastActive = new Date().toISOString();
    session.tokenEstimateOutput += estimateTokens(data);

    if (session.outputBuffer.length > 102400) {
      session.outputBuffer = session.outputBuffer.slice(-51200);
    }

    // Parse actual token counts from Claude Code output
    const parsed = parseTokensFromOutput(data);
    if (parsed) {
      const db = getDb();
      // "session total" pattern gives cumulative — store directly
      // "per-response" pattern gives incremental — accumulate
      if (parsed.tokens > 100) { // session total is always large
        db.prepare(`
          UPDATE session_metrics SET tokens_actual = MAX(tokens_actual, ?), cost_usd = cost_usd + ?, updated_at = ?
          WHERE session_id = ?
        `).run(parsed.tokens, parsed.costUsd, session.lastActive, session.id);
      } else {
        db.prepare(`
          UPDATE session_metrics SET tokens_actual = tokens_actual + ?, cost_usd = cost_usd + ?, updated_at = ?
          WHERE session_id = ?
        `).run(parsed.tokens, parsed.costUsd, session.lastActive, session.id);
      }
    }
  }

  /**
   * Mark session as completed (called when linked terminal exits).
   */
  markSessionCompleted(terminalId: string, exitCode: number): void {
    for (const session of this.sessions.values()) {
      if (session.terminalId === terminalId) {
        session.status = exitCode === 0 ? 'completed' : 'error';
        this.saveSessionOutput(session);
        this.updateSessionDb(session);
        this.emit('session:exit', { sessionId: session.id, exitCode });
        break;
      }
    }
  }

  /**
   * Send input to a session (raw terminal data from xterm.js)
   */
  sendInput(sessionId: string, input: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') return false;

    // If session has its own PTY, write directly
    if (session.pty) {
      session.pty.write(input);
    }

    session.lastActive = new Date().toISOString();
    session.inputBuffer += input;

    // Only count as a "prompt" when Enter is pressed (contains \r or \n)
    if (input.includes('\r') || input.includes('\n')) {
      const promptText = session.inputBuffer.replace(/[\r\n]+$/, '').trim();
      session.inputBuffer = '';

      const cleanPrompt2 = stripAnsiAndValidate(promptText);
      if (cleanPrompt2) {
        session.promptCount++;
        session.tokenEstimateInput += estimateTokens(cleanPrompt2);

        // Log to session_history
        const db = getDb();
        db.prepare(`
          INSERT INTO session_history (id, session_id, prompt_text, timestamp)
          VALUES (?, ?, ?, ?)
        `).run(uuid(), sessionId, cleanPrompt2, session.lastActive);

        // Update metrics
        this.updateMetrics(session);
      }
    }

    this.emit('session:input', { sessionId, input });
    return true;
  }

  /**
   * Resize session terminal
   */
  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.pty) return false;
    session.pty.resize(cols, rows);
    return true;
  }

  /**
   * Stop a session gracefully
   */
  stopSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.pty) {
      // Send Ctrl+C then exit
      session.pty.write('\x03');
      setTimeout(() => {
        try {
          session.pty?.write('exit\r');
        } catch {
          // Process may already be dead
        }
      }, 500);
    }

    session.status = 'completed';
    this.updateSessionDb(session);
    this.saveSessionOutput(session);
    this.emit('session:stopped', { sessionId });
    return true;
  }

  /**
   * Kill a session forcefully
   */
  killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.saveSessionOutput(session);

    if (session.pty) {
      try {
        session.pty.kill();
      } catch {
        // Already dead
      }
    }

    session.status = 'completed';
    this.updateSessionDb(session);
    this.sessions.delete(sessionId);
    this.emit('session:killed', { sessionId });
    return true;
  }

  /**
   * Save session terminal output to DB for later viewing
   */
  private saveSessionOutput(session: ManagedSession): void {
    if (!session.outputBuffer) return;
    const db = getDb();

    // Save last 50KB of output (strip ANSI escape codes for readability)
    const cleanOutput = session.outputBuffer
      .slice(-51200)
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // strip color codes
      .replace(/\x1b\].*?\x07/g, '')            // strip OSC sequences
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ''); // strip control chars

    db.prepare('UPDATE claude_sessions SET session_output = ? WHERE id = ?')
      .run(cleanOutput, session.id);
  }

  /**
   * Get info for a single session
   */
  getSessionInfo(sessionId: string): SessionInfo | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Check DB for completed sessions
      const db = getDb();
      const row = db.prepare(`
        SELECT cs.*, sm.prompt_count, sm.token_usage_input, sm.token_usage_output,
               sm.tokens_actual, sm.cost_usd
        FROM claude_sessions cs
        LEFT JOIN session_metrics sm ON sm.session_id = cs.id
        WHERE cs.id = ?
      `).get(sessionId) as any;

      if (!row) return null;
      return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        status: row.status,
        startedAt: row.started_at,
        lastActive: row.last_active,
        pid: null,
        promptCount: row.prompt_count || 0,
        tokenUsageInput: row.token_usage_input || 0,
        tokenUsageOutput: row.token_usage_output || 0,
        terminalId: row.terminal_id || null,
      };
    }

    return {
      id: session.id,
      projectId: session.projectId,
      name: session.name,
      status: session.status,
      startedAt: session.startedAt,
      lastActive: session.lastActive,
      pid: session.pty?.pid ?? null,
      promptCount: session.promptCount,
      tokenUsageInput: session.tokenEstimateInput,
      tokenUsageOutput: session.tokenEstimateOutput,
      terminalId: session.terminalId,
    };
  }

  /**
   * Set terminal ID for a session (called after terminal is spawned)
   */
  setTerminalId(sessionId: string, terminalId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.terminalId = terminalId;
  }

  /**
   * Get all active (in-memory) sessions — only running/idle, not completed
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'running' || s.status === 'idle')
      .map(s => ({
        id: s.id,
        projectId: s.projectId,
        name: s.name,
        status: s.status,
        startedAt: s.startedAt,
        lastActive: s.lastActive,
        pid: s.pty?.pid ?? null,
        promptCount: s.promptCount,
        tokenUsageInput: s.tokenEstimateInput,
        tokenUsageOutput: s.tokenEstimateOutput,
        terminalId: s.terminalId,
      }));
  }

  /**
   * Get all sessions (active + completed from DB)
   */
  getAllSessions(projectId?: string): SessionInfo[] {
    const db = getDb();
    let query = `
      SELECT cs.*, sm.prompt_count, sm.token_usage_input, sm.token_usage_output,
             sm.tokens_actual, sm.cost_usd
      FROM claude_sessions cs
      LEFT JOIN session_metrics sm ON sm.session_id = cs.id
    `;
    const params: any[] = [];

    if (projectId) {
      query += ' WHERE cs.project_id = ?';
      params.push(projectId);
    }

    query += ' ORDER BY cs.last_active DESC';

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => {
      // If session is still active in memory, use live data
      const live = this.sessions.get(row.id);
      if (live) {
        return {
          id: live.id,
          projectId: live.projectId,
          name: live.name,
          status: live.status,
          startedAt: live.startedAt,
          lastActive: live.lastActive,
          pid: live.pty?.pid ?? null,
          promptCount: live.promptCount,
          tokenUsageInput: live.tokenEstimateInput,
          tokenUsageOutput: live.tokenEstimateOutput,
          terminalId: live.terminalId,
        };
      }

      return {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        status: row.status,
        startedAt: row.started_at,
        lastActive: row.last_active,
        pid: null,
        promptCount: row.prompt_count || 0,
        tokenUsageInput: row.token_usage_input || 0,
        tokenUsageOutput: row.token_usage_output || 0,
        terminalId: row.terminal_id || null,
      };
    });
  }

  /**
   * Get sessions for a specific project
   */
  getProjectSessions(projectId: string): SessionInfo[] {
    return this.getAllSessions(projectId);
  }

  /**
   * Get recent output from a session
   */
  getSessionOutput(sessionId: string, lastN = 4096): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';
    return session.outputBuffer.slice(-lastN);
  }

  /**
   * Redact specific string values from every live session's in-memory PTY buffer
   * AND from the session_output column in the DB. Called immediately after
   * save_credential so a credential the user pasted into a terminal is wiped from
   * scrollback as fast as possible.
   *
   * Caveat: cannot retroactively scrub the user's terminal emulator scrollback —
   * if you scroll back inside the running Claude TUI you may still see the value.
   * It's wiped from Cortex's persisted state, not from the OS-level pty stream
   * already rendered to the WebView.
   *
   * Returns the number of replacements made across all live + DB rows.
   */
  redactStringsEverywhere(values: string[]): number {
    const meaningful = values
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(v => v.length >= 4); // skip empty / 1-3 char "values" — too many false positives
    if (meaningful.length === 0) return 0;

    let replacements = 0;
    const replaceAll = (haystack: string): string => {
      let out = haystack;
      for (const v of meaningful) {
        if (!v) continue;
        // Plain split/join to avoid regex-escaping the credential.
        const parts = out.split(v);
        if (parts.length > 1) {
          replacements += parts.length - 1;
          out = parts.join('[redacted]');
        }
      }
      return out;
    };

    // 1) live PTY buffers in memory
    for (const session of this.sessions.values()) {
      if (!session.outputBuffer) continue;
      session.outputBuffer = replaceAll(session.outputBuffer);
    }

    // 2) persisted session_output rows
    try {
      const db = getDb();
      const rows = db
        .prepare("SELECT id, session_output FROM claude_sessions WHERE session_output IS NOT NULL AND session_output != ''")
        .all() as Array<{ id: string; session_output: string }>;
      const update = db.prepare('UPDATE claude_sessions SET session_output = ? WHERE id = ?');
      for (const row of rows) {
        const cleaned = replaceAll(row.session_output);
        if (cleaned !== row.session_output) {
          update.run(cleaned, row.id);
        }
      }
    } catch (err: unknown) {
      console.warn('[redact] DB scrub failed:', err instanceof Error ? err.message : err);
    }

    return replacements;
  }

  /**
   * Get usage summary across all projects
   */
  getUsageSummary(): {
    today: { promptCount: number; tokenTotal: number; sessionCount: number };
    byProject: { projectId: string; promptCount: number; tokenTotal: number }[];
  } {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const todayRow = db.prepare(`
      SELECT COALESCE(SUM(prompt_count), 0) as prompt_count,
             COALESCE(SUM(token_total), 0) as token_total,
             COALESCE(SUM(session_count), 0) as session_count
      FROM usage_daily WHERE date = ?
    `).get(today) as any;

    const byProject = db.prepare(`
      SELECT project_id, COALESCE(SUM(prompt_count), 0) as prompt_count,
             COALESCE(SUM(token_total), 0) as token_total
      FROM usage_daily WHERE date = ?
      GROUP BY project_id
    `).all(today) as any[];

    // Add live session data not yet flushed to daily
    for (const session of this.sessions.values()) {
      todayRow.prompt_count += session.promptCount;
      todayRow.token_total += session.tokenEstimateInput + session.tokenEstimateOutput;

      const existing = byProject.find(p => p.project_id === session.projectId);
      if (existing) {
        existing.prompt_count += session.promptCount;
        existing.token_total += session.tokenEstimateInput + session.tokenEstimateOutput;
      } else {
        byProject.push({
          project_id: session.projectId,
          prompt_count: session.promptCount,
          token_total: session.tokenEstimateInput + session.tokenEstimateOutput,
        });
      }
    }

    return {
      today: {
        promptCount: todayRow.prompt_count,
        tokenTotal: todayRow.token_total,
        sessionCount: todayRow.session_count + this.sessions.size,
      },
      byProject: byProject.map(p => ({
        projectId: p.project_id,
        promptCount: p.prompt_count,
        tokenTotal: p.token_total,
      })),
    };
  }

  /**
   * Update session in DB
   */
  private updateSessionDb(session: ManagedSession): void {
    const db = getDb();
    db.prepare(`
      UPDATE claude_sessions SET status = ?, last_active = ? WHERE id = ?
    `).run(session.status, session.lastActive, session.id);

    this.updateMetrics(session);
    this.updateDailyUsage(session);
  }

  /**
   * Update metrics for a session
   */
  private updateMetrics(session: ManagedSession): void {
    const db = getDb();
    const duration = Math.floor(
      (new Date(session.lastActive).getTime() - new Date(session.startedAt).getTime()) / 1000
    );

    db.prepare(`
      UPDATE session_metrics SET
        prompt_count = ?,
        token_usage_input = ?,
        token_usage_output = ?,
        duration_seconds = ?,
        updated_at = ?
      WHERE session_id = ?
    `).run(
      session.promptCount,
      session.tokenEstimateInput,
      session.tokenEstimateOutput,
      duration,
      session.lastActive,
      session.id
    );
  }

  /**
   * Flush session usage to daily aggregate
   */
  private updateDailyUsage(session: ManagedSession): void {
    if (session.flushedToDaily) return;
    
    const db = getDb();
    const date = new Date().toISOString().split('T')[0];
    const tokenTotal = session.tokenEstimateInput + session.tokenEstimateOutput;

    const existing = db.prepare(
      'SELECT id FROM usage_daily WHERE project_id = ? AND date = ?'
    ).get(session.projectId, date) as any;

    if (existing) {
      db.prepare(`
        UPDATE usage_daily SET
          prompt_count = prompt_count + ?,
          token_total = token_total + ?,
          session_count = session_count + 1
        WHERE id = ?
      `).run(session.promptCount, tokenTotal, existing.id);
    } else {
      db.prepare(`
        INSERT INTO usage_daily (id, project_id, date, prompt_count, token_total, session_count)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(uuid(), session.projectId, date, session.promptCount, tokenTotal);
    }

    session.flushedToDaily = true;
  }

  /**
   * Heartbeat: check if processes are still alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [id, session] of this.sessions) {
        // Skip sessions without their own PTY (terminal manager tracks those)
        if (!session.pty) continue;
        try {
          // Check if process is alive by sending signal 0
          process.kill(session.pty.pid, 0);
        } catch {
          // Process is dead
          if (session.status === 'running') {
            session.status = 'error';
            this.updateSessionDb(session);
            this.sessions.delete(id);
            this.emit('session:died', { sessionId: id });
          }
        }
      }
    }, 5000);
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const [id, session] of this.sessions) {
      try {
        this.updateSessionDb(session);
        if (session.pty) session.pty.kill();
      } catch {
        // Best effort
      }
    }
    this.sessions.clear();
  }
}

// Singleton
let instance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!instance) {
    instance = new SessionManager();
  }
  return instance;
}
