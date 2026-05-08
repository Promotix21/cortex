import { Router } from 'express';
import { getBrowserSession } from '../browser/browser-session.js';
import {
  pageGoto,
  pageReload,
  pageScreenshot,
  domQuery,
  domText,
  domAttributes,
  runtimeEval,
  consoleTail,
  consoleClear,
  networkList,
  networkFailures,
  networkResponseBody,
  inputClick,
  inputType,
} from '../browser/tools.js';
import { shadowBus } from '../orchestrator/event-bus.js';
import { v4 as uuid } from 'uuid';

export const browserRouter: ReturnType<typeof Router> = Router();

function emitTool(projectId: string | undefined, name: string, payload: Record<string, unknown>) {
  shadowBus.emitEvent({
    runId: `browser-${uuid().slice(0, 8)}`,
    projectId: projectId || 'browser',
    type: 'tool',
    payload: { name: `browser.${name}`, ...payload },
  });
}

// --- Lifecycle ---

browserRouter.get('/status', (_req, res) => {
  res.json(getBrowserSession().status());
});

browserRouter.post('/open', async (req, res) => {
  try {
    const status = await getBrowserSession().open({ url: req.body?.url, headless: !!req.body?.headless });
    emitTool(req.body?.projectId, 'session_open', { url: req.body?.url || null });
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.post('/close', async (req, res) => {
  try {
    await getBrowserSession().close();
    emitTool(req.body?.projectId, 'session_close', {});
    res.json({ running: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.post('/goto', async (req, res) => {
  const { url, projectId } = req.body || {};
  if (!url) { res.status(400).json({ error: 'url required' }); return; }
  try {
    await pageGoto(url);
    emitTool(projectId, 'goto', { url });
    res.json({ ok: true, currentUrl: getBrowserSession().status().currentUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.post('/reload', async (req, res) => {
  try {
    await pageReload();
    emitTool(req.body?.projectId, 'reload', {});
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Screenshot ---

browserRouter.get('/screenshot', async (req, res) => {
  try {
    const shot = await pageScreenshot({
      selector: req.query.selector as string | undefined,
      fullPage: req.query.fullPage === '1',
    });
    emitTool(req.query.projectId as string | undefined, 'screenshot', { width: shot.width, height: shot.height });
    res.json(shot);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- DOM ---

browserRouter.post('/dom/query', async (req, res) => {
  const { selector, maxNodes, projectId } = req.body || {};
  if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
  try {
    const result = await domQuery(selector, maxNodes ?? 10);
    emitTool(projectId, 'dom_query', { selector, count: result.count });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.post('/dom/text', async (req, res) => {
  const { selector, projectId } = req.body || {};
  if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
  try {
    const result = await domText(selector);
    emitTool(projectId, 'dom_text', { selector, count: result.count });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.post('/dom/attributes', async (req, res) => {
  const { selector, attrs, projectId } = req.body || {};
  if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
  try {
    const result = await domAttributes(selector, attrs);
    emitTool(projectId, 'dom_attributes', { selector, count: result.count });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Runtime (gated) ---

browserRouter.post('/eval', async (req, res) => {
  const { expression, awaitPromise, projectId } = req.body || {};
  if (!expression) { res.status(400).json({ error: 'expression required' }); return; }
  try {
    const result = await runtimeEval(expression, !!awaitPromise);
    emitTool(projectId, 'eval', { bytes: expression.length, type: result.type, hasError: !!result.error });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Console ---

browserRouter.get('/console', (req, res) => {
  const since = req.query.since ? Number(req.query.since) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 200;
  res.json({ entries: consoleTail(since, limit), serverTs: Date.now() });
});

browserRouter.post('/console/clear', (_req, res) => {
  consoleClear();
  res.json({ ok: true });
});

// --- Network ---

browserRouter.get('/network', (req, res) => {
  const since = req.query.since ? Number(req.query.since) : undefined;
  const filter = req.query.filter as string | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 200;
  res.json({ entries: networkList({ sinceTs: since, filter, limit }), serverTs: Date.now() });
});

browserRouter.get('/network/failures', (req, res) => {
  const since = req.query.since ? Number(req.query.since) : undefined;
  res.json({ entries: networkFailures(since), serverTs: Date.now() });
});

browserRouter.get('/network/response', async (req, res) => {
  const requestId = req.query.requestId as string | undefined;
  if (!requestId) { res.status(400).json({ error: 'requestId required' }); return; }
  try {
    const body = await networkResponseBody(requestId);
    res.json(body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Input (gated) ---

browserRouter.post('/click', async (req, res) => {
  const { selector, projectId } = req.body || {};
  if (!selector) { res.status(400).json({ error: 'selector required' }); return; }
  try {
    const result = await inputClick(selector);
    emitTool(projectId, 'click', { selector, clicked: result.clicked });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

browserRouter.post('/type', async (req, res) => {
  const { selector, text, projectId } = req.body || {};
  if (!selector || text === undefined) { res.status(400).json({ error: 'selector and text required' }); return; }
  try {
    const result = await inputType(selector, text);
    emitTool(projectId, 'type', { selector, length: String(text).length });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
