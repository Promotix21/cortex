/**
 * Browser Session — singleton lifecycle + CDP wiring.
 *
 * One browser instance at a time. Owns the launched Chromium process,
 * the CDP connection to the first page target, and routes CDP events
 * into the console + network ring buffers.
 */

import { launchChromium, findChromiumBinary, getFirstPageTarget, type LaunchedBrowser } from './chromium-launcher.js';
import { CDPClient } from './cdp-client.js';
import { consoleBuffer, networkBuffer, type NetworkEntry } from './buffers.js';

export interface BrowserStatus {
  running: boolean;
  pid?: number;
  port?: number;
  currentUrl?: string;
  startedAt?: number;
  binary?: string;
}

class BrowserSession {
  private launched: LaunchedBrowser | null = null;
  private cdp: CDPClient | null = null;
  private currentUrl = '';
  private startedAt = 0;
  private binary: string | null = null;

  get isRunning(): boolean { return !!this.launched && !!this.cdp?.connected; }

  status(): BrowserStatus {
    if (!this.isRunning) return { running: false, binary: findChromiumBinary() || undefined };
    return {
      running: true,
      pid: this.launched!.pid,
      port: this.launched!.port,
      currentUrl: this.currentUrl,
      startedAt: this.startedAt,
      binary: this.binary || findChromiumBinary() || undefined,
    };
  }

  async open(opts: { url?: string; headless?: boolean } = {}): Promise<BrowserStatus> {
    if (this.isRunning) {
      if (opts.url) await this.goto(opts.url);
      return this.status();
    }

    this.binary = findChromiumBinary();
    this.launched = await launchChromium({ headless: opts.headless });
    this.startedAt = Date.now();

    // Connect to first page target
    const deadline = Date.now() + 5000;
    let target: Awaited<ReturnType<typeof getFirstPageTarget>> = null;
    while (Date.now() < deadline) {
      target = await getFirstPageTarget(this.launched.port);
      if (target) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (!target) throw new Error('No page target found after Chromium launch');

    this.cdp = new CDPClient(target.webSocketDebuggerUrl);
    await this.cdp.connect();
    this.currentUrl = target.url;

    await this.enableDomains();
    this.wireEvents();

    if (opts.url) await this.goto(opts.url);
    return this.status();
  }

  async close(): Promise<void> {
    try { this.cdp?.close(); } catch { /* ignore */ }
    try { this.launched?.process.kill('SIGTERM'); } catch { /* ignore */ }
    // Force kill after 2s if still alive
    if (this.launched?.process && this.launched.pid) {
      const pid = this.launched.pid;
      setTimeout(() => {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
      }, 2000);
    }
    this.cdp = null;
    this.launched = null;
    this.currentUrl = '';
    this.startedAt = 0;
    consoleBuffer.clear();
    networkBuffer.clear();
  }

  client(): CDPClient {
    if (!this.cdp || !this.cdp.connected) throw new Error('Browser is not running. Call open() first.');
    return this.cdp;
  }

  async goto(url: string, waitUntil: 'load' | 'domcontentloaded' = 'load'): Promise<void> {
    const cdp = this.client();
    const waitEvent = waitUntil === 'load' ? 'Page.loadEventFired' : 'Page.domContentEventFired';
    const loaded = new Promise<void>((resolve) => {
      const handler = () => { cdp.off(waitEvent, handler); resolve(); };
      cdp.on(waitEvent, handler);
      setTimeout(() => { cdp.off(waitEvent, handler); resolve(); }, 30000);
    });
    await cdp.send('Page.navigate', { url });
    this.currentUrl = url;
    await loaded;
  }

  private async enableDomains() {
    const cdp = this.cdp!;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Log.enable').catch(() => {});
    // Runtime.consoleAPICalled gives us console.log/warn/error from page
    // Log.entryAdded gives us browser-level messages
  }

  private wireEvents() {
    const cdp = this.cdp!;

    // Console events from page JS
    cdp.on('Runtime.consoleAPICalled', (params: any) => {
      const text = (params.args || []).map((a: any) => this.stringifyRemote(a)).join(' ');
      consoleBuffer.push({
        ts: Date.now(),
        level: params.type || 'log',
        text,
        source: 'console-api',
        url: params.stackTrace?.callFrames?.[0]?.url,
        line: params.stackTrace?.callFrames?.[0]?.lineNumber,
        column: params.stackTrace?.callFrames?.[0]?.columnNumber,
      });
    });

    cdp.on('Runtime.exceptionThrown', (params: any) => {
      const ex = params.exceptionDetails;
      consoleBuffer.push({
        ts: Date.now(),
        level: 'error',
        text: ex?.exception?.description || ex?.text || 'Uncaught exception',
        source: 'exception',
        url: ex?.url,
        line: ex?.lineNumber,
        column: ex?.columnNumber,
      });
    });

    cdp.on('Log.entryAdded', (params: any) => {
      const e = params.entry;
      consoleBuffer.push({
        ts: Date.now(),
        level: e.level,
        text: e.text,
        source: e.source,
        url: e.url,
        line: e.lineNumber,
      });
    });

    // Network events
    cdp.on('Network.requestWillBeSent', (params: any) => {
      networkBuffer.push({
        ts: Date.now(),
        requestId: params.requestId,
        method: params.request.method,
        url: params.request.url,
      });
    });

    cdp.on('Network.responseReceived', (params: any) => {
      const existing = networkBuffer.findByKey(e => e.requestId, params.requestId);
      if (existing) {
        Object.assign(existing, {
          status: params.response.status,
          statusText: params.response.statusText,
          mimeType: params.response.mimeType,
        });
      }
    });

    cdp.on('Network.loadingFinished', (params: any) => {
      const existing = networkBuffer.findByKey(e => e.requestId, params.requestId);
      if (existing) {
        existing.durationMs = Date.now() - existing.ts;
        existing.sizeBytes = params.encodedDataLength;
      }
    });

    cdp.on('Network.loadingFailed', (params: any) => {
      const existing = networkBuffer.findByKey(e => e.requestId, params.requestId);
      if (existing) {
        existing.failed = true;
        existing.failureText = params.errorText;
      } else {
        networkBuffer.push({
          ts: Date.now(),
          requestId: params.requestId,
          method: 'UNKNOWN',
          url: '',
          failed: true,
          failureText: params.errorText,
        });
      }
    });

    // Track navigations
    cdp.on('Page.frameNavigated', (params: any) => {
      if (params.frame?.parentId) return; // only top-level
      this.currentUrl = params.frame?.url || this.currentUrl;
    });
  }

  private stringifyRemote(arg: any): string {
    if (arg.value !== undefined) return String(arg.value);
    if (arg.description) return arg.description;
    if (arg.unserializableValue) return arg.unserializableValue;
    return '[object]';
  }
}

let singleton: BrowserSession | null = null;
export function getBrowserSession(): BrowserSession {
  if (!singleton) singleton = new BrowserSession();
  return singleton;
}

export type { BrowserSession };
