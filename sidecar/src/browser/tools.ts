/**
 * Browser Tool Functions — scoped capabilities backing MCP tools + REST endpoints.
 * Each function is one verb on one capability. No God-objects.
 */

import { getBrowserSession } from './browser-session.js';
import { consoleBuffer, networkBuffer } from './buffers.js';

// ==================== PAGE ====================

export async function pageScreenshot(opts: { selector?: string; fullPage?: boolean } = {}): Promise<{
  mimeType: string;
  base64: string;
  width: number;
  height: number;
}> {
  const cdp = getBrowserSession().client();
  let clip: any = undefined;
  if (opts.selector) {
    const rect = await domRect(opts.selector);
    if (!rect) throw new Error(`Selector not found: ${opts.selector}`);
    clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 };
  }
  const res = await cdp.send<{ data: string }>('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: opts.fullPage ?? false,
    ...(clip ? { clip } : {}),
  });
  // Get dimensions via Page.getLayoutMetrics for fullPage, else clip or viewport
  const layout = await cdp.send<any>('Page.getLayoutMetrics').catch(() => null);
  const width = clip?.width ?? layout?.cssVisualViewport?.clientWidth ?? 1280;
  const height = clip?.height ?? layout?.cssVisualViewport?.clientHeight ?? 800;
  return { mimeType: 'image/png', base64: res.data, width, height };
}

export async function pageGoto(url: string): Promise<void> {
  await getBrowserSession().goto(url);
}

export async function pageReload(): Promise<void> {
  const cdp = getBrowserSession().client();
  await cdp.send('Page.reload');
}

// ==================== DOM ====================

async function domRect(selector: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const cdp = getBrowserSession().client();
  const result = await cdp.send<any>('Runtime.evaluate', {
    expression: `(()=>{const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};})()`,
    returnByValue: true,
  });
  return result.result?.value ?? null;
}

export async function domQuery(selector: string, maxNodes = 10): Promise<{
  count: number;
  nodes: Array<{ tag: string; outerHTML: string; text: string }>;
}> {
  const cdp = getBrowserSession().client();
  const expr = `
    (() => {
      const all = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const slice = all.slice(0, ${maxNodes});
      return {
        count: all.length,
        nodes: slice.map(el => ({
          tag: el.tagName.toLowerCase(),
          outerHTML: el.outerHTML.slice(0, 4000),
          text: (el.textContent || '').trim().slice(0, 500),
        })),
      };
    })()
  `;
  const result = await cdp.send<any>('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(`domQuery failed: ${result.exceptionDetails.text}`);
  }
  return result.result?.value ?? { count: 0, nodes: [] };
}

export async function domText(selector: string): Promise<{ count: number; texts: string[] }> {
  const cdp = getBrowserSession().client();
  const expr = `
    (() => {
      const all = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      return { count: all.length, texts: all.slice(0, 50).map(el => (el.textContent || '').trim()) };
    })()
  `;
  const result = await cdp.send<any>('Runtime.evaluate', { expression: expr, returnByValue: true });
  return result.result?.value ?? { count: 0, texts: [] };
}

export async function domAttributes(selector: string, attrs?: string[]): Promise<{ count: number; items: Array<Record<string, string>> }> {
  const cdp = getBrowserSession().client();
  const attrsJson = attrs ? JSON.stringify(attrs) : 'null';
  const expr = `
    (() => {
      const all = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const filter = ${attrsJson};
      return {
        count: all.length,
        items: all.slice(0, 50).map(el => {
          const out = {};
          for (const a of el.attributes) {
            if (!filter || filter.includes(a.name)) out[a.name] = a.value;
          }
          return out;
        }),
      };
    })()
  `;
  const result = await cdp.send<any>('Runtime.evaluate', { expression: expr, returnByValue: true });
  return result.result?.value ?? { count: 0, items: [] };
}

// ==================== RUNTIME ====================

export async function runtimeEval(expression: string, awaitPromise = false): Promise<{ value: any; type: string; error?: string }> {
  const cdp = getBrowserSession().client();
  const result = await cdp.send<any>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  if (result.exceptionDetails) {
    return { value: null, type: 'error', error: result.exceptionDetails.text || 'eval failed' };
  }
  return { value: result.result?.value, type: result.result?.type || 'undefined' };
}

// ==================== CONSOLE ====================

export function consoleTail(sinceTs?: number, limit = 200) {
  return consoleBuffer.getSince(sinceTs, limit);
}

export function consoleClear() {
  consoleBuffer.clear();
}

// ==================== NETWORK ====================

export function networkList(opts: { sinceTs?: number; filter?: string; limit?: number } = {}) {
  let items = networkBuffer.getSince(opts.sinceTs, opts.limit ?? 200);
  if (opts.filter) {
    const f = opts.filter.toLowerCase();
    items = items.filter(e => e.url.toLowerCase().includes(f));
  }
  return items;
}

export function networkFailures(sinceTs?: number) {
  return networkBuffer.getSince(sinceTs, 500).filter(e => e.failed || (e.status !== undefined && e.status >= 400));
}

export async function networkResponseBody(requestId: string): Promise<{ body: string; base64Encoded: boolean }> {
  const cdp = getBrowserSession().client();
  const result = await cdp.send<any>('Network.getResponseBody', { requestId });
  return { body: result.body, base64Encoded: !!result.base64Encoded };
}

// ==================== INPUT (gated via orchestrator in v2.7) ====================

export async function inputClick(selector: string): Promise<{ clicked: boolean }> {
  const result = await runtimeEval(
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true;})()`
  );
  return { clicked: result.value === true };
}

export async function inputType(selector: string, text: string): Promise<{ typed: boolean }> {
  const result = await runtimeEval(
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`
  );
  return { typed: result.value === true };
}
