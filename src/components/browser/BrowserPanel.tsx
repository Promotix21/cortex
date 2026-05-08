import { useEffect, useState } from 'react';
import { Globe, Power, RotateCw, Camera, AlertTriangle, Terminal, Network, Code2, Activity, Play, Square } from 'lucide-react';
import { getSidecarUrl } from '@/lib/api';
import { useProjectStore } from '@/stores/project-store';

type Tab = 'console' | 'network' | 'elements' | 'activity';

interface BrowserStatus {
  running: boolean;
  pid?: number;
  port?: number;
  currentUrl?: string;
  binary?: string;
  startedAt?: number;
}

interface ConsoleEntry {
  ts: number;
  level: string;
  text: string;
  source?: string;
  url?: string;
  line?: number;
}

interface NetworkEntry {
  ts: number;
  requestId: string;
  method: string;
  url: string;
  status?: number;
  mimeType?: string;
  durationMs?: number;
  sizeBytes?: number;
  failed?: boolean;
  failureText?: string;
}

const API = () => getSidecarUrl();

export function BrowserPanel() {
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const activeProject = useProjectStore(s => s.activeProject());
  const [status, setStatus] = useState<BrowserStatus>({ running: false });
  const [urlInput, setUrlInput] = useState('https://example.com');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotTs, setScreenshotTs] = useState(0);
  const [tab, setTab] = useState<Tab>('console');
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [networkEntries, setNetworkEntries] = useState<NetworkEntry[]>([]);
  const [querySelector, setQuerySelector] = useState('h1');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll status + buffers when running
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const s = await fetch(`${API()}/api/browser/status`).then(r => r.json());
        if (!alive) return;
        setStatus(s);
        if (s.running) {
          const [c, n] = await Promise.all([
            fetch(`${API()}/api/browser/console?limit=200`).then(r => r.json()),
            fetch(`${API()}/api/browser/network?limit=200`).then(r => r.json()),
          ]);
          if (!alive) return;
          setConsoleEntries(c.entries || []);
          setNetworkEntries(n.entries || []);
        }
      } catch { /* sidecar may be starting */ }
    };
    tick();
    const interval = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  const openBrowser = async (headless = false) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API()}/api/browser/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput, headless, projectId: activeProjectId }),
      });
      if (!r.ok) throw new Error(await r.text());
      setTimeout(() => refreshScreenshot(), 800);
    } catch (e: any) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const closeBrowser = async () => {
    setBusy(true); setError(null);
    try {
      await fetch(`${API()}/api/browser/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId }),
      });
      setScreenshot(null);
      setConsoleEntries([]);
      setNetworkEntries([]);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const goto = async () => {
    if (!status.running) return openBrowser();
    setBusy(true); setError(null);
    try {
      await fetch(`${API()}/api/browser/goto`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput, projectId: activeProjectId }),
      });
      setTimeout(() => refreshScreenshot(), 500);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const reload = async () => {
    if (!status.running) return;
    await fetch(`${API()}/api/browser/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProjectId }),
    });
    setTimeout(() => refreshScreenshot(), 500);
  };

  const refreshScreenshot = async () => {
    if (!status.running) return;
    try {
      const qs = activeProjectId ? `?projectId=${encodeURIComponent(activeProjectId)}` : '';
      const r = await fetch(`${API()}/api/browser/screenshot${qs}`);
      if (!r.ok) return;
      const data = await r.json();
      setScreenshot(`data:${data.mimeType};base64,${data.base64}`);
      setScreenshotTs(Date.now());
    } catch { /* ignore */ }
  };

  const runQuery = async () => {
    if (!status.running) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API()}/api/browser/dom/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selector: querySelector, maxNodes: 10, projectId: activeProjectId }),
      });
      setQueryResult(await r.json());
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center shrink-0"
        style={{
          padding: '0 16px', height: 46,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          gap: 10,
        }}
      >
        <Globe size={16} style={{ color: status.running ? 'var(--success)' : 'var(--text-tertiary)' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Browser</span>
        <span
          className="rounded-full"
          style={{
            padding: '2px 8px', fontSize: 11, fontWeight: 600,
            background: status.running ? 'var(--success-dim)' : 'var(--bg-hover)',
            color: status.running ? 'var(--success)' : 'var(--text-tertiary)',
          }}
        >
          {status.running ? `live · pid ${status.pid}` : 'stopped'}
        </span>
        {activeProject && (
          <span
            className="rounded"
            style={{
              padding: '2px 8px', fontSize: 11, fontWeight: 600,
              background: 'var(--bg-surface)', color: 'var(--text-tertiary)',
              border: '1px solid var(--border)',
            }}
            title="Browser events are tagged with this project in the Shadow Terminal"
          >
            {activeProject.name}
          </span>
        )}

        <input
          type="text"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') goto(); }}
          placeholder="https://..."
          style={{
            flex: 1, marginLeft: 10, padding: '6px 12px', fontSize: 13,
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-primary)',
          }}
        />

        <button
          onClick={goto}
          disabled={busy}
          className="flex items-center rounded-lg"
          style={{ gap: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600,
            background: 'var(--accent-dim)', color: 'var(--accent)', opacity: busy ? 0.5 : 1 }}
        >
          <Play size={13} /> Go
        </button>
        <button
          onClick={reload}
          disabled={!status.running}
          className="rounded"
          style={{ padding: 7, color: 'var(--text-tertiary)', opacity: status.running ? 1 : 0.3 }}
          title="Reload"
        >
          <RotateCw size={15} />
        </button>
        <button
          onClick={refreshScreenshot}
          disabled={!status.running}
          className="rounded"
          style={{ padding: 7, color: 'var(--text-tertiary)', opacity: status.running ? 1 : 0.3 }}
          title="Re-capture screenshot"
        >
          <Camera size={15} />
        </button>
        {status.running ? (
          <button
            onClick={closeBrowser}
            className="flex items-center rounded"
            style={{ gap: 4, padding: '6px 10px', fontSize: 12, fontWeight: 600,
              background: 'var(--error-dim)', color: 'var(--error)' }}
          >
            <Square size={12} /> Stop
          </button>
        ) : (
          <button
            onClick={() => openBrowser(false)}
            className="flex items-center rounded"
            style={{ gap: 4, padding: '6px 10px', fontSize: 12, fontWeight: 600,
              background: 'var(--accent-dim)', color: 'var(--accent)' }}
          >
            <Power size={12} /> Launch
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 16px', fontSize: 12,
          background: 'var(--error-dim)', color: 'var(--error)',
          borderBottom: '1px solid var(--border)',
        }}>
          <AlertTriangle size={12} style={{ display: 'inline', marginRight: 6 }} />
          {error}
        </div>
      )}

      {/* Body: screenshot + tabs */}
      <div className="flex-1 flex" style={{ minHeight: 0 }}>
        {/* Screenshot pane */}
        <div style={{
          flex: '0 0 60%',
          borderRight: '1px solid var(--border)',
          background: '#0f0f17',
          overflow: 'auto',
          padding: 12,
        }}>
          {!status.running ? (
            <EmptyState onLaunch={() => openBrowser(false)} binary={status.binary} />
          ) : screenshot ? (
            <>
              <img
                src={screenshot}
                alt="browser screenshot"
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, display: 'block' }}
              />
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                Captured {new Date(screenshotTs).toLocaleTimeString()} · {status.currentUrl}
              </div>
            </>
          ) : (
            <div style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 13 }}>
              Click the camera icon to capture.
            </div>
          )}
        </div>

        {/* Right pane — tabs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            display: 'flex', gap: 2,
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border)',
          }}>
            <TabBtn tab="console" current={tab} onClick={() => setTab('console')} icon={Terminal} label={`Console (${consoleEntries.length})`} />
            <TabBtn tab="network" current={tab} onClick={() => setTab('network')} icon={Network} label={`Network (${networkEntries.length})`} />
            <TabBtn tab="elements" current={tab} onClick={() => setTab('elements')} icon={Code2} label="Elements" />
            <TabBtn tab="activity" current={tab} onClick={() => setTab('activity')} icon={Activity} label="Activity" />
          </div>
          <div style={{ flex: 1, overflow: 'auto', background: '#1e1e2e' }}>
            {tab === 'console' && <ConsoleView entries={consoleEntries} />}
            {tab === 'network' && <NetworkView entries={networkEntries} />}
            {tab === 'elements' && (
              <ElementsView
                selector={querySelector}
                setSelector={setQuerySelector}
                runQuery={runQuery}
                result={queryResult}
                busy={busy}
              />
            )}
            {tab === 'activity' && <ActivityView status={status} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ tab, current, onClick, icon: Icon, label }: { tab: Tab; current: Tab; onClick: () => void; icon: React.ElementType; label: string }) {
  const active = tab === current;
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '10px 12px', fontSize: 12, fontWeight: 600,
        background: active ? 'var(--bg-primary)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-tertiary)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function EmptyState({ onLaunch, binary }: { onLaunch: () => void; binary?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
      <Globe size={48} style={{ color: 'var(--text-tertiary)' }} />
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>Browser is not running</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', maxWidth: 320 }}>
        Cortex will spawn {binary || 'Chromium'} with DevTools Protocol enabled on port 9222.
      </div>
      <button
        onClick={onLaunch}
        className="rounded-lg"
        style={{ padding: '8px 18px', fontSize: 13, fontWeight: 700, background: 'var(--accent)', color: '#0f0f17' }}
      >
        Launch Browser
      </button>
    </div>
  );
}

function ConsoleView({ entries }: { entries: ConsoleEntry[] }) {
  if (entries.length === 0) return <Empty label="No console entries yet." />;
  return (
    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
      {entries.map((e, i) => (
        <div key={i} style={{ padding: '6px 12px', borderBottom: '1px dashed var(--border)', color: levelColor(e.level) }}>
          <span style={{ color: 'var(--text-tertiary)', marginRight: 8 }}>{new Date(e.ts).toLocaleTimeString()}</span>
          <span style={{ fontWeight: 700, marginRight: 8, textTransform: 'uppercase' }}>{e.level}</span>
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.text}</span>
          {e.url && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 2 }}>
              {trimUrl(e.url)}{e.line !== undefined ? `:${e.line}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NetworkView({ entries }: { entries: NetworkEntry[] }) {
  if (entries.length === 0) return <Empty label="No network activity yet." />;
  return (
    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
      {entries.slice().reverse().map(e => (
        <div key={e.requestId} style={{ padding: '6px 12px', borderBottom: '1px dashed var(--border)', display: 'flex', gap: 8 }}>
          <span style={{ width: 48, color: 'var(--text-tertiary)' }}>{e.method}</span>
          <span style={{
            width: 44,
            color: e.failed ? 'var(--error)' :
                   (e.status ?? 0) >= 400 ? 'var(--error)' :
                   (e.status ?? 0) >= 300 ? 'var(--warning, #eab308)' :
                   (e.status ?? 0) >= 200 ? 'var(--success)' : 'var(--text-tertiary)',
            fontWeight: 700,
          }}>
            {e.failed ? 'FAIL' : e.status ?? '—'}
          </span>
          <span style={{ flex: 1, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            {trimUrl(e.url || '(no url)', 100)}
          </span>
          <span style={{ color: 'var(--text-tertiary)', minWidth: 50, textAlign: 'right' }}>
            {e.durationMs !== undefined ? `${e.durationMs}ms` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function ElementsView({ selector, setSelector, runQuery, result, busy }: {
  selector: string; setSelector: (s: string) => void; runQuery: () => void; result: any; busy: boolean;
}) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={selector}
          onChange={e => setSelector(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runQuery(); }}
          placeholder="CSS selector (e.g., h1, .class, #id)"
          style={{
            flex: 1, padding: '8px 12px', fontSize: 13,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-primary)',
            fontFamily: 'ui-monospace, monospace',
          }}
        />
        <button
          onClick={runQuery}
          disabled={busy}
          className="rounded"
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          Query
        </button>
      </div>
      {result ? (
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
            Matched <strong style={{ color: 'var(--accent)' }}>{result.count}</strong> element{result.count === 1 ? '' : 's'}
          </div>
          {(result.nodes || []).map((n: any, i: number) => (
            <div key={i} style={{
              padding: 10, marginBottom: 8,
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6,
            }}>
              <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                &lt;{n.tag}&gt;
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)', margin: 0, fontSize: 11 }}>
                {n.outerHTML}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
          Enter a CSS selector to query the DOM.
        </div>
      )}
    </div>
  );
}

function ActivityView({ status }: { status: BrowserStatus }) {
  return (
    <div style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
      <div style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Binary:</strong> {status.binary || '(not running)'}</div>
      {status.running && (
        <>
          <div style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>PID:</strong> {status.pid}</div>
          <div style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Port:</strong> {status.port}</div>
          <div style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Current URL:</strong> {status.currentUrl}</div>
          <div style={{ marginBottom: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Started:</strong> {status.startedAt ? new Date(status.startedAt).toLocaleString() : '—'}</div>
        </>
      )}
      <div style={{ marginTop: 16, padding: 10, background: 'var(--bg-surface)', borderRadius: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
        Each browser action also appears in the Shadow Terminal (Activity icon in the sidebar) as a tool event —
        <code style={{ color: 'var(--accent)' }}>browser.goto</code>, <code style={{ color: 'var(--accent)' }}>browser.dom_query</code>, etc.
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 13 }}>{label}</div>;
}

function trimUrl(u: string, max = 80): string {
  if (u.length <= max) return u;
  return u.slice(0, max) + '…';
}

function levelColor(level: string): string {
  switch (level) {
    case 'error': return 'var(--error)';
    case 'warning':
    case 'warn': return 'var(--warning, #eab308)';
    case 'info': return 'var(--accent)';
    default: return 'var(--text-secondary)';
  }
}
