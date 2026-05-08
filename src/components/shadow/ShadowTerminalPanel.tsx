import { useEffect, useRef, useState, useMemo } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { Activity, Brain, Zap, AlertTriangle, GitBranch, Play, CheckCircle2, XCircle, Wrench, FileText, FlaskConical } from 'lucide-react';

type ShadowEventType = 'run:start' | 'run:end' | 'plan' | 'reflect' | 'tool' | 'chunk' | 'error' | 'impact' | 'test:start' | 'test:end';

interface ShadowEvent {
  id: string;
  runId: string;
  projectId: string;
  sessionId?: string;
  type: ShadowEventType;
  ts: number;
  payload: any;
}

const MAX_EVENTS = 300;

export function ShadowTerminalPanel() {
  const activeProject = useProjectStore(s => s.activeProject());
  const [events, setEvents] = useState<ShadowEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filterRunId, setFilterRunId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!activeProject) return;
    const url = `http://localhost:4700/api/shadow/stream?projectId=${encodeURIComponent(activeProject.id)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      if (pausedRef.current) return;
      try {
        const ev: ShadowEvent = JSON.parse(e.data);
        setEvents(prev => {
          const next = [...prev, ev];
          if (next.length > MAX_EVENTS) next.splice(0, next.length - MAX_EVENTS);
          return next;
        });
      } catch { /* ignore malformed */ }
    };

    return () => { es.close(); };
  }, [activeProject?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, paused]);

  const runs = useMemo(() => {
    const byRun = new Map<string, ShadowEvent[]>();
    for (const ev of events) {
      if (!byRun.has(ev.runId)) byRun.set(ev.runId, []);
      byRun.get(ev.runId)!.push(ev);
    }
    return Array.from(byRun.entries()).map(([runId, evs]) => ({
      runId,
      events: evs,
      startTs: evs[0]?.ts ?? 0,
      plan: evs.find(e => e.type === 'plan')?.payload,
      reflection: evs.find(e => e.type === 'reflect')?.payload,
    }));
  }, [events]);

  const visibleEvents = filterRunId ? events.filter(e => e.runId === filterRunId) : events;

  if (!activeProject) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        Select a project to see orchestrator activity.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center shrink-0"
        style={{
          padding: '0 16px',
          height: 46,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div className="flex items-center flex-1" style={{ gap: 10 }}>
          <Activity size={16} style={{ color: connected ? 'var(--success)' : 'var(--text-tertiary)' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Shadow Terminal
          </span>
          <span
            className="rounded-full"
            style={{
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              background: connected ? 'var(--success-dim)' : 'var(--bg-hover)',
              color: connected ? 'var(--success)' : 'var(--text-tertiary)',
            }}
          >
            {connected ? 'live' : 'reconnecting…'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 4 }}>
            {runs.length} run{runs.length === 1 ? '' : 's'} · {events.length} events
          </span>
        </div>

        <div className="flex items-center" style={{ gap: 8 }}>
          {filterRunId && (
            <button
              onClick={() => setFilterRunId(null)}
              className="rounded transition-colors"
              style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: 'var(--accent-dim)', color: 'var(--accent)' }}
            >
              Clear filter
            </button>
          )}
          <button
            onClick={() => setPaused(p => !p)}
            className="rounded transition-colors"
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              background: paused ? 'var(--warning-dim, rgba(250,200,50,0.15))' : 'var(--bg-hover)',
              color: paused ? 'var(--warning, #eab308)' : 'var(--text-secondary)',
            }}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={() => setEvents([])}
            className="rounded transition-colors"
            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Body: runs list (left) + event stream (right) */}
      <div className="flex-1 flex" style={{ minHeight: 0, overflow: 'hidden' }}>
        {/* Run list */}
        <div
          style={{
            width: 260,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            overflowY: 'auto',
          }}
        >
          {runs.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
              No orchestrator runs yet. Send a chat message to see plan/reflect activity.
            </div>
          ) : (
            runs.slice().reverse().map(run => (
              <RunCard
                key={run.runId}
                run={run}
                active={filterRunId === run.runId}
                onClick={() => setFilterRunId(filterRunId === run.runId ? null : run.runId)}
              />
            ))
          )}
        </div>

        {/* Event stream */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            background: '#1e1e2e',
          }}
        >
          {visibleEvents.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', padding: 16 }}>
              Waiting for orchestrator events…
            </div>
          ) : (
            visibleEvents.map(ev => <EventLine key={ev.id} ev={ev} />)
          )}
        </div>
      </div>
    </div>
  );
}

function RunCard({
  run,
  active,
  onClick,
}: {
  run: { runId: string; events: ShadowEvent[]; startTs: number; plan: any; reflection: any };
  active: boolean;
  onClick: () => void;
}) {
  const hasError = run.events.some(e => e.type === 'error');
  const done = run.events.some(e => e.type === 'run:end');
  const outcome = run.reflection?.outcome || (done ? 'success' : 'running');

  return (
    <div
      onClick={onClick}
      className="cursor-pointer"
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: active ? 'var(--accent-dim)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {outcome === 'running' ? (
          <Play size={12} style={{ color: 'var(--accent)' }} />
        ) : outcome === 'success' ? (
          <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
        ) : (
          <XCircle size={12} style={{ color: 'var(--error)' }} />
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
          {run.plan?.intent || 'run'}
        </span>
        {run.plan?.writeIntent && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--warning-dim, rgba(250,200,50,0.15))',
              color: 'var(--warning, #eab308)',
              fontWeight: 700,
            }}
          >
            WRITE
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
        {run.plan?.summary || run.runId.slice(0, 8)}
      </div>
      {hasError && (
        <div style={{ fontSize: 10, color: 'var(--error)', marginTop: 4 }}>
          errored
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
        {new Date(run.startTs).toLocaleTimeString()} · {run.events.length} evt
      </div>
    </div>
  );
}

function EventLine({ ev }: { ev: ShadowEvent }) {
  const time = new Date(ev.ts).toLocaleTimeString();
  const color = ev.type === 'test:end'
    ? ((ev.payload as any)?.passed ? 'var(--success)' : 'var(--error)')
    : eventColor(ev.type);

  return (
    <div style={{ display: 'flex', gap: 10, padding: '4px 0', borderBottom: '1px dashed var(--border)' }}>
      <span style={{ color: 'var(--text-tertiary)', fontSize: 11, minWidth: 72 }}>{time}</span>
      <div style={{ flexShrink: 0, marginTop: 2 }}>{eventIcon(ev.type)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {ev.type}
        </div>
        <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 2 }}>
          {renderPayload(ev)}
        </div>
      </div>
    </div>
  );
}

function renderPayload(ev: ShadowEvent): string {
  switch (ev.type) {
    case 'run:start': return `Prompt: ${ev.payload?.prompt || ''}`;
    case 'run:end': return `Outcome: ${ev.payload?.outcome || '?'}`;
    case 'plan': return ev.payload?.summary || JSON.stringify(ev.payload);
    case 'reflect': return ev.payload?.summary || JSON.stringify(ev.payload);
    case 'tool': return `${ev.payload?.name}${ev.payload?.route ? ` → ${ev.payload.route}` : ''}${ev.payload?.chars ? ` (${ev.payload.chars} chars)` : ''}`;
    case 'error': return ev.payload?.message || JSON.stringify(ev.payload);
    case 'test:start': return `$ ${ev.payload?.command || ''}  (cwd: ${ev.payload?.cwd || ''})`;
    case 'test:end': {
      const p = ev.payload as any;
      const status = p?.passed ? '✓ PASSED' : '✗ FAILED';
      const dur = p?.durationMs ? ` (${(p.durationMs / 1000).toFixed(1)}s)` : '';
      const preview = p?.stdoutPreview ? `\n${p.stdoutPreview.slice(-600)}` : (p?.error ? `\n${p.error}` : '');
      return `${status}  exit ${p?.exitCode ?? '?'}${dur}${preview}`;
    }
    case 'impact': {
      const arr = ev.payload as Array<{ target: string; dependentCount: number; dependents: string[] }>;
      if (!Array.isArray(arr) || arr.length === 0) return '(no files resolved)';
      return arr.map(i =>
        `${i.target} → ${i.dependentCount} dependent${i.dependentCount === 1 ? '' : 's'}${i.dependents.length > 0 ? `\n  ${i.dependents.slice(0, 6).map(d => trimPath(d)).join('\n  ')}${i.dependents.length > 6 ? `\n  +${i.dependents.length - 6} more` : ''}` : ''}`
      ).join('\n\n');
    }
    case 'chunk': return ev.payload?.preview || '';
    default: return JSON.stringify(ev.payload);
  }
}

function trimPath(p: string): string {
  const parts = p.split('/');
  return parts.slice(-3).join('/');
}

function eventColor(type: ShadowEventType): string {
  switch (type) {
    case 'plan': return 'var(--accent)';
    case 'reflect': return 'var(--success)';
    case 'tool': return '#a78bfa';
    case 'error': return 'var(--error)';
    case 'impact': return 'var(--warning, #eab308)';
    case 'run:start': return 'var(--text-primary)';
    case 'run:end': return 'var(--text-secondary)';
    case 'test:start': return '#38bdf8';
    case 'test:end': return 'var(--success)';
    default: return 'var(--text-secondary)';
  }
}

function eventIcon(type: ShadowEventType) {
  const iconProps = { size: 12, style: { color: eventColor(type) } };
  switch (type) {
    case 'plan': return <Brain {...iconProps} />;
    case 'reflect': return <CheckCircle2 {...iconProps} />;
    case 'tool': return <Wrench {...iconProps} />;
    case 'error': return <AlertTriangle {...iconProps} />;
    case 'impact': return <GitBranch {...iconProps} />;
    case 'run:start': return <Play {...iconProps} />;
    case 'run:end': return <Zap {...iconProps} />;
    case 'test:start': return <FlaskConical {...iconProps} />;
    case 'test:end': return <FlaskConical {...iconProps} />;
    default: return <FileText {...iconProps} />;
  }
}
