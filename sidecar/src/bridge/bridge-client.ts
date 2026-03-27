import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';

const BRIDGE_URL = 'http://localhost:9877';

export interface CapturedError {
  type: string;
  message: string;
  stack?: string;
  source?: string;
  timestamp: string;
  url?: string;
}

export class BridgeClient extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null;
  private connected = false;
  private lastErrorCount = 0;

  get isConnected() { return this.connected; }

  start(intervalMs = 3000): void {
    this.pollInterval = setInterval(() => this.poll(), intervalMs);
    this.poll(); // immediate first poll
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch(`${BRIDGE_URL}/summary`);
      if (!res.ok) { this.connected = false; return; }
      this.connected = true;

      const errRes = await fetch(`${BRIDGE_URL}/errors`);
      if (!errRes.ok) return;
      const errors: CapturedError[] = await errRes.json();

      // Only process new errors
      if (errors.length > this.lastErrorCount) {
        const newErrors = errors.slice(this.lastErrorCount);
        this.lastErrorCount = errors.length;

        for (const err of newErrors) {
          this.emit('error', err);
          this.routeAndStore(err);
        }
      }
    } catch {
      this.connected = false;
    }
  }

  private routeAndStore(error: CapturedError): void {
    const db = getDb();

    // Route to project by matching URL port to dev_server_port
    let projectId: string | null = null;
    if (error.url) {
      const portMatch = error.url.match(/:(\d+)/);
      if (portMatch) {
        const port = parseInt(portMatch[1]);
        const project = db.prepare('SELECT id FROM projects WHERE dev_server_port = ?').get(port) as any;
        if (project) projectId = project.id;
      }
    }

    // Fallback: use most recently opened project
    if (!projectId) {
      const recent = db.prepare('SELECT id FROM projects ORDER BY last_opened DESC LIMIT 1').get() as any;
      if (recent) projectId = recent.id;
    }

    if (!projectId) return;

    // Normalize error signature
    const signature = normalizeSignature(error.message);

    // Check for existing debug match
    let matchedDebugId: string | null = null;
    if (signature) {
      const match = db.prepare(
        "SELECT id FROM debug_memory WHERE error_signature = ? AND confidence != 'deprecated' LIMIT 1"
      ).get(signature) as any;
      if (match) {
        matchedDebugId = match.id;
        db.prepare('UPDATE debug_memory SET usage_count = usage_count + 1, last_used = ? WHERE id = ?')
          .run(new Date().toISOString(), match.id);
      }
    }

    // Store captured error
    db.prepare(`
      INSERT INTO captured_errors (id, project_id, error_type, message, stack, source, error_signature, matched_debug_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(), projectId, error.type || 'unknown', error.message,
      error.stack || null, error.source || null, signature,
      matchedDebugId, error.timestamp || new Date().toISOString()
    );

    this.emit('error:stored', { projectId, error, matchedDebugId });
  }

  async clearBridge(): Promise<void> {
    try {
      await fetch(`${BRIDGE_URL}/clear`);
      this.lastErrorCount = 0;
    } catch { /* silent */ }
  }
}

function normalizeSignature(message: string): string | null {
  if (!message) return null;
  return message
    .replace(/at line \d+/g, 'at line N')
    .replace(/:\d+:\d+/g, ':N:N')
    .replace(/0x[0-9a-f]+/gi, '0xHEX')
    .replace(/\b\d{4,}\b/g, 'NUM')
    .trim()
    .slice(0, 200);
}

// Singleton
let instance: BridgeClient | null = null;
export function getBridgeClient(): BridgeClient {
  if (!instance) instance = new BridgeClient();
  return instance;
}
