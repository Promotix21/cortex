import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { Brain, Activity, AlertTriangle, CheckCircle2, GitCommit, Hash, RefreshCw } from 'lucide-react';

type Brain = NonNullable<Awaited<ReturnType<typeof api.getBrainPanel>>['brain']>;
type Observation = Awaited<ReturnType<typeof api.getBrainPanel>>['observations'][number];
type HookStats = Awaited<ReturnType<typeof api.getBrainPanel>>['hookStats'];

const KIND_COLORS: Record<string, { bg: string; fg: string }> = {
  fix: { bg: 'rgba(52,211,153,0.12)', fg: 'var(--green)' },
  decision: { bg: 'rgba(167,139,250,0.12)', fg: '#a78bfa' },
  discovery: { bg: 'rgba(34,211,238,0.12)', fg: 'var(--accent)' },
  gotcha: { bg: 'rgba(250,179,135,0.12)', fg: 'var(--peach)' },
  feature: { bg: 'rgba(34,211,238,0.12)', fg: 'var(--accent)' },
  refactor: { bg: 'rgba(167,139,250,0.12)', fg: '#a78bfa' },
};

export function BrainPanel() {
  const activeProject = useProjectStore(s => s.activeProject());
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getBrainPanel>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!activeProject) return;
    try {
      const result = await api.getBrainPanel(activeProject.id);
      setData(result);
    } catch (err) {
      console.warn('[BrainPanel] failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [activeProject?.id]);

  if (!activeProject) return null;

  if (loading || !data) {
    return (
      <div
        className="rounded-2xl flex items-center"
        style={{ padding: '20px 24px', gap: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <Brain size={18} className="animate-pulse" style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading brain…</span>
      </div>
    );
  }

  const { brain, observations, hookStats } = data;
  const decisions = brain ? brain.decisions.split('\n').map(l => l.trim()).filter(Boolean).slice(-5) : [];
  const consultsTotal = hookStats.total;
  const isCold = consultsTotal === 0;

  return (
    <div className="space-y-4">
      {/* Header + consult counter */}
      <div
        className="rounded-2xl flex items-center justify-between"
        style={{
          padding: '20px 24px',
          background: isCold
            ? 'linear-gradient(135deg, rgba(250,179,135,0.10), rgba(250,179,135,0.04))'
            : 'linear-gradient(135deg, rgba(52,211,153,0.10), rgba(34,211,238,0.04))',
          border: `1px solid ${isCold ? 'rgba(250,179,135,0.25)' : 'rgba(52,211,153,0.25)'}`,
        }}
      >
        <div className="flex items-center" style={{ gap: 14 }}>
          <div
            className="rounded-xl flex items-center justify-center"
            style={{
              width: 44,
              height: 44,
              background: isCold ? 'rgba(250,179,135,0.18)' : 'rgba(52,211,153,0.18)',
            }}
          >
            <Brain size={22} style={{ color: isCold ? 'var(--peach)' : 'var(--green)' }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Cortex Brain — {data.project.name}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {observations.length} observations · {decisions.length} decisions ·{' '}
              <span style={{ color: isCold ? 'var(--peach)' : 'var(--green)', fontWeight: 600 }}>
                {consultsTotal} hook consult{consultsTotal === 1 ? '' : 's'}
              </span>
              {isCold && ' — Claude has not consulted the brain yet'}
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            load();
          }}
          className="rounded-lg flex items-center transition-colors"
          style={{
            gap: 6,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Hook stats grid */}
      <div className="grid grid-cols-3" style={{ gap: 16 }}>
        <HookStat label="Prime calls" value={hookStats.byType.prime || 0} icon={Activity} />
        <HookStat label="Hint calls" value={hookStats.byType.hint || 0} icon={Hash} />
        <HookStat label="Session ends" value={hookStats.byType.session_end || 0} icon={GitCommit} />
      </div>

      {/* Recent decisions */}
      {decisions.length > 0 && (
        <div className="rounded-2xl" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 14 }}>
            Recent Decisions
          </div>
          <div className="space-y-2">
            {decisions.map((d, i) => (
              <div
                key={i}
                style={{
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'var(--bg-hover)',
                  borderLeft: '2px solid #a78bfa',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {d.replace(/^[-•*]\s*/, '')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent observations */}
      <div className="rounded-2xl" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Recent Observations
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {observations.length} stored
          </span>
        </div>
        {observations.length === 0 ? (
          <EmptyObservations />
        ) : (
          <div className="space-y-2">
            {observations.slice(0, 12).map(obs => (
              <ObservationRow key={obs.id} obs={obs} />
            ))}
          </div>
        )}
      </div>

      {/* Recent consults */}
      {hookStats.recent.length > 0 && (
        <div className="rounded-2xl" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 14 }}>
            Recent Hook Activity
          </div>
          <div className="space-y-1">
            {hookStats.recent.map((c, i) => (
              <ConsultRow key={i} consult={c} />
            ))}
          </div>
        </div>
      )}

      {!brain && (
        <div
          className="rounded-2xl flex items-center"
          style={{ padding: '20px 24px', gap: 14, background: 'var(--bg-surface)', border: '1px dashed var(--border)' }}
        >
          <AlertTriangle size={18} style={{ color: 'var(--peach)' }} />
          <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
            No project brain yet — run "Scan & Build Brain" from the dashboard to populate it.
          </div>
        </div>
      )}
    </div>
  );
}

function HookStat({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  const cold = value === 0;
  return (
    <div
      className="rounded-xl"
      style={{
        padding: '16px 20px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
        <Icon size={16} style={{ color: cold ? 'var(--text-tertiary)' : 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cold ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function ObservationRow({ obs }: { obs: Observation }) {
  const palette = KIND_COLORS[obs.kind] || KIND_COLORS.discovery;
  const filesCount = obs.files_touched?.length || 0;
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 8,
        background: 'var(--bg-hover)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center" style={{ gap: 10, marginBottom: 4 }}>
        <span
          className="rounded-md"
          style={{
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: palette.bg,
            color: palette.fg,
          }}
        >
          {obs.kind}
        </span>
        {obs.room_tag && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            [{obs.room_tag}]
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
          {new Date(obs.created_at).toLocaleDateString()}
        </span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.4 }}>
        {obs.title}
      </div>
      {filesCount > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
          {filesCount} file{filesCount === 1 ? '' : 's'} touched
        </div>
      )}
    </div>
  );
}

function ConsultRow({ consult }: { consult: HookStats['recent'][number] }) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: 10,
        padding: '8px 12px',
        fontSize: 13,
        borderRadius: 6,
      }}
    >
      <CheckCircle2 size={12} style={{ color: 'var(--green)' }} />
      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: 84 }}>
        {consult.hook_type}
      </span>
      {consult.tool_name && (
        <span style={{ color: 'var(--accent)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          {consult.tool_name}
        </span>
      )}
      {consult.query && (
        <span style={{ color: 'var(--text-tertiary)', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          "{consult.query}"
        </span>
      )}
      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
        {consult.result_count} hit{consult.result_count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function EmptyObservations() {
  return (
    <div
      style={{
        padding: '20px 16px',
        textAlign: 'center',
        fontSize: 14,
        color: 'var(--text-tertiary)',
        borderRadius: 8,
        background: 'var(--bg-hover)',
      }}
    >
      No observations yet. They'll appear here as Claude finishes sessions, or after the backfill worker processes historical sessions.
    </div>
  );
}
