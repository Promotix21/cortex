import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { shellExists } from '../utils/binaries.js';

export type TerminalType = 'shell' | 'ai_session' | 'dev_server' | 'git';
export type TerminalStatus = 'running' | 'stopped' | 'error';

export interface TerminalInfo {
  id: string;
  projectId: string;
  name: string;
  type: TerminalType;
  status: TerminalStatus;
  pid: number | null;
  createdAt: string;
}

interface ManagedTerminal {
  id: string;
  projectId: string;
  name: string;
  type: TerminalType;
  pty: pty.IPty;
  outputBuffer: string;
  status: TerminalStatus;
  createdAt: string;
  // Ring buffer for output polling — clients track their read offset
  outputChunks: { seq: number; data: string }[];
  nextSeq: number;
}

const MAX_BUFFER = 102400; // 100KB scrollback
const MAX_CHUNKS = 500;

export class TerminalManager extends EventEmitter {
  private terminals: Map<string, ManagedTerminal> = new Map();

  /**
   * Spawn a new terminal for a project
   */
  spawn(
    projectId: string,
    name: string,
    projectPath: string,
    type: TerminalType = 'shell',
    cols = 120,
    rows = 40,
    command?: string
  ): TerminalInfo {
    const id = uuid();
    const now = new Date().toISOString();
    const isWin = process.platform === 'win32';
    
    // Select appropriate shell and args based on OS
    let shell = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    let args: string[] = isWin ? ['-NoProfile'] : ['-l'];

    // Fallback for Windows if powershell is missing
    if (isWin && !shellExists(shell)) {
      shell = 'cmd.exe';
      args = [];
    }

    // Build a clean env — filter out undefined values and NO_COLOR from process.env,
    // then apply terminal color settings. In production (Tauri desktop), process.env
    // is sparse, so we must ensure all color-critical vars are explicitly set.
    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined && k !== 'NO_COLOR') {
        cleanEnv[k] = v;
      }
    }

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: projectPath,
      env: {
        ...cleanEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3',
        TERM_PROGRAM: 'cortex',
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || '',
        HOME: process.env.HOME || process.env.USERPROFILE || '',
        CORTEX_TERMINAL_ID: id,
        CORTEX_PROJECT_ID: projectId,
      },
    });


    const terminal: ManagedTerminal = {
      id,
      projectId,
      name,
      type,
      pty: ptyProcess,
      outputBuffer: '',
      status: 'running',
      createdAt: now,
      outputChunks: [],
      nextSeq: 0,
    };

    // Collect output
    ptyProcess.onData((data: string) => {
      terminal.outputBuffer += data;
      if (terminal.outputBuffer.length > MAX_BUFFER) {
        terminal.outputBuffer = terminal.outputBuffer.slice(-MAX_BUFFER / 2);
      }

      // Push to ring buffer for polling
      terminal.outputChunks.push({ seq: terminal.nextSeq++, data });
      if (terminal.outputChunks.length > MAX_CHUNKS) {
        terminal.outputChunks = terminal.outputChunks.slice(-MAX_CHUNKS / 2);
      }

      this.emit('terminal:output', { terminalId: id, data });
    });

    // Handle exit
    ptyProcess.onExit(({ exitCode }) => {
      terminal.status = exitCode === 0 ? 'stopped' : 'error';
      this.persistStatus(terminal);
      this.emit('terminal:exit', { terminalId: id, exitCode });
    });

    this.terminals.set(id, terminal);

    // Persist to DB
    const db = getDb();
    db.prepare(`
      INSERT INTO terminals (id, project_id, name, type, process_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, name, type, ptyProcess.pid, 'running', now);

    // If a startup command was specified, send it
    if (command) {
      setTimeout(() => ptyProcess.write(command + '\r'), 300);
    }

    this.emit('terminal:spawned', { terminalId: id, projectId, name, type });
    return this.toInfo(terminal);
  }

  /**
   * Send input to a terminal
   */
  write(terminalId: string, data: string): boolean {
    const t = this.terminals.get(terminalId);
    if (!t || t.status !== 'running') return false;
    t.pty.write(data);
    return true;
  }

  /**
   * Resize a terminal
   */
  resize(terminalId: string, cols: number, rows: number): boolean {
    const t = this.terminals.get(terminalId);
    if (!t) return false;
    t.pty.resize(cols, rows);
    return true;
  }

  /**
   * Rename a terminal
   */
  rename(terminalId: string, newName: string): boolean {
    const t = this.terminals.get(terminalId);
    if (!t) return false;
    t.name = newName;
    const db = getDb();
    db.prepare('UPDATE terminals SET name = ? WHERE id = ?').run(newName, terminalId);
    return true;
  }

  /**
   * Kill a terminal
   */
  kill(terminalId: string): boolean {
    const t = this.terminals.get(terminalId);
    if (!t) return false;

    try {
      t.pty.kill();
    } catch {
      // Already dead
    }
    t.status = 'stopped';
    this.persistStatus(t);
    this.terminals.delete(terminalId);
    this.emit('terminal:killed', { terminalId });
    return true;
  }

  /**
   * Restart a terminal (kill + respawn with same config)
   */
  restart(terminalId: string, projectPath: string): TerminalInfo | null {
    const t = this.terminals.get(terminalId);
    if (!t) return null;

    const { projectId, name, type } = t;
    const cols = t.pty.cols;
    const rows = t.pty.rows;

    this.kill(terminalId);
    return this.spawn(projectId, name, projectPath, type, cols, rows);
  }

  /**
   * Clear terminal output buffer
   */
  clear(terminalId: string): boolean {
    const t = this.terminals.get(terminalId);
    if (!t) return false;
    t.outputBuffer = '';
    t.outputChunks = [];
    // Send clear screen escape
    t.pty.write('\x1b[2J\x1b[H');
    return true;
  }

  /**
   * Get full output buffer
   */
  getOutput(terminalId: string, lastN = 8192): string {
    const t = this.terminals.get(terminalId);
    if (!t) return '';
    return t.outputBuffer.slice(-lastN);
  }

  /**
   * Poll for new output since a given sequence number
   * Returns chunks newer than `sinceSeq` for efficient streaming
   */
  pollOutput(terminalId: string, sinceSeq: number): { chunks: { seq: number; data: string }[]; nextSeq: number } {
    const t = this.terminals.get(terminalId);
    if (!t) return { chunks: [], nextSeq: 0 };
    const newChunks = t.outputChunks.filter(c => c.seq > sinceSeq);
    return { chunks: newChunks, nextSeq: t.nextSeq };
  }

  /**
   * Get info for a single terminal
   */
  getTerminal(terminalId: string): TerminalInfo | null {
    const t = this.terminals.get(terminalId);
    if (!t) return null;
    return this.toInfo(t);
  }

  /**
   * Get all terminals for a project
   */
  getProjectTerminals(projectId: string): TerminalInfo[] {
    const result: TerminalInfo[] = [];
    for (const t of this.terminals.values()) {
      if (t.projectId === projectId) {
        result.push(this.toInfo(t));
      }
    }
    return result;
  }

  /**
   * Get all active terminals
   */
  getAllTerminals(): TerminalInfo[] {
    return Array.from(this.terminals.values()).map(t => this.toInfo(t));
  }

  /**
   * Get count of active terminals
   */
  get activeCount(): number {
    return this.terminals.size;
  }

  private toInfo(t: ManagedTerminal): TerminalInfo {
    return {
      id: t.id,
      projectId: t.projectId,
      name: t.name,
      type: t.type,
      status: t.status,
      pid: t.status === 'running' ? t.pty.pid : null,
      createdAt: t.createdAt,
    };
  }

  private persistStatus(t: ManagedTerminal): void {
    const db = getDb();
    db.prepare('UPDATE terminals SET status = ?, process_id = ? WHERE id = ?')
      .run(t.status, t.status === 'running' ? t.pty.pid : null, t.id);
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    for (const [id, t] of this.terminals) {
      try {
        t.pty.kill();
      } catch { /* best effort */ }
    }
    this.terminals.clear();
  }
}

// Singleton
let instance: TerminalManager | null = null;

export function getTerminalManager(): TerminalManager {
  if (!instance) {
    instance = new TerminalManager();
  }
  return instance;
}
