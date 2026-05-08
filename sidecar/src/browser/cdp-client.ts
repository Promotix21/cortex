/**
 * CDP Client — WebSocket JSON-RPC to a single page target.
 *
 * Usage:
 *   const cdp = new CDPClient(wsUrl);
 *   await cdp.connect();
 *   await cdp.send('Runtime.evaluate', { expression: '1+1', returnByValue: true });
 *   cdp.on('Console.messageAdded', (params) => { ... });
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export class CDPClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private _connected = false;

  constructor(private wsUrl: string) {
    super();
    this.setMaxListeners(50);
  }

  get connected(): boolean { return this._connected; }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl, { perMessageDeflate: false });
      this.ws = ws;

      ws.on('open', () => {
        this._connected = true;
        resolve();
      });

      ws.on('error', (err) => {
        if (!this._connected) reject(err);
        else this.emit('error', err);
      });

      ws.on('close', () => {
        this._connected = false;
        this.emit('close');
        for (const { reject } of this.pending.values()) reject(new Error('CDP connection closed'));
        this.pending.clear();
      });

      ws.on('message', (raw) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); }
        catch { return; }

        if (msg.id !== undefined) {
          const waiter = this.pending.get(msg.id);
          if (waiter) {
            this.pending.delete(msg.id);
            if (msg.error) waiter.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
            else waiter.resolve(msg.result);
          }
        } else if (msg.method) {
          // Event from CDP — emit by method name (e.g., 'Console.messageAdded')
          this.emit(msg.method, msg.params);
          this.emit('event', { method: msg.method, params: msg.params });
        }
      });
    });
  }

  async send<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws || !this._connected) throw new Error('CDP not connected');
    const id = ++this.msgId;
    const payload = JSON.stringify({ id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(payload, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  close() {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this._connected = false;
  }
}
