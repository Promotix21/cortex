/**
 * Ring buffers for browser console + network events.
 * Bounded to keep memory under control; queryable by timestamp.
 */

export interface ConsoleEntry {
  ts: number;
  level: string;       // 'log' | 'warn' | 'error' | 'info' | 'debug'
  text: string;
  source?: string;
  url?: string;
  line?: number;
  column?: number;
}

export interface NetworkEntry {
  ts: number;
  requestId: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  mimeType?: string;
  durationMs?: number;
  sizeBytes?: number;
  failed?: boolean;
  failureText?: string;
}

class RingBuffer<T extends { ts: number }> {
  private buf: T[] = [];
  constructor(private readonly max: number) {}

  push(item: T) {
    this.buf.push(item);
    if (this.buf.length > this.max) this.buf.shift();
  }

  upsertByKey(keyFn: (item: T) => string, updates: Partial<T>, key: string) {
    for (let i = this.buf.length - 1; i >= 0; i--) {
      if (keyFn(this.buf[i]) === key) {
        this.buf[i] = { ...this.buf[i], ...updates };
        return;
      }
    }
  }

  findByKey(keyFn: (item: T) => string, key: string): T | undefined {
    for (let i = this.buf.length - 1; i >= 0; i--) {
      if (keyFn(this.buf[i]) === key) return this.buf[i];
    }
    return undefined;
  }

  getSince(sinceTs?: number, limit = 500): T[] {
    const filtered = sinceTs !== undefined ? this.buf.filter(e => e.ts > sinceTs) : this.buf;
    return filtered.slice(-limit);
  }

  clear() { this.buf = []; }

  get length() { return this.buf.length; }
}

export const consoleBuffer: RingBuffer<ConsoleEntry> = new RingBuffer<ConsoleEntry>(500);
export const networkBuffer: RingBuffer<NetworkEntry> = new RingBuffer<NetworkEntry>(500);

export function netKey(e: NetworkEntry): string { return e.requestId; }
