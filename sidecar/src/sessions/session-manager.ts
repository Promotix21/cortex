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
}

// Rough token estimation: ~4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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

      // Skip empty prompts and control sequences
      if (!promptText || promptText.length < 2) return;

      session.promptCount++;
      session.tokenEstimateInput += estimateTokens(promptText);

      // Log to session_history
      const db = getDb();
      db.prepare(`
        INSERT INTO session_history (id, session_id, prompt_text, timestamp)
        VALUES (?, ?, ?, ?)
      `).run(uuid(), session.id, promptText, session.lastActive);

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

      if (promptText && promptText.length >= 2) {
        session.promptCount++;
        session.tokenEstimateInput += estimateTokens(promptText);

        // Log to session_history
        const db = getDb();
        db.prepare(`
          INSERT INTO session_history (id, session_id, prompt_text, timestamp)
          VALUES (?, ?, ?, ?)
        `).run(uuid(), sessionId, promptText, session.lastActive);

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
    try {
      db.exec('ALTER TABLE claude_sessions ADD COLUMN session_output TEXT DEFAULT NULL');
    } catch { /* column may already exist */ }

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
        SELECT cs.*, sm.prompt_count, sm.token_usage_input, sm.token_usage_output
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
   * Get all active (in-memory) sessions
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => ({
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
      SELECT cs.*, sm.prompt_count, sm.token_usage_input, sm.token_usage_output
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
