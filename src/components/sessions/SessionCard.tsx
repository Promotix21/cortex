import type { Session } from '@/types/session';
import { useSessionStore } from '@/stores/session-store';
import { useProjectStore } from '@/stores/project-store';
import { formatRelativeTime } from '@/lib/utils';
import { Circle, Square, Clock, Hash, Cpu } from 'lucide-react';

interface SessionCardProps {
  session: Session;
  projectName: string;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

function formatDuration(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const mins = Math.floor((now - start) / 60000);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function SessionCard({ session, projectName }: SessionCardProps) {
  const { stopSession } = useSessionStore();
  const setActiveProject = useProjectStore(s => s.setActiveProject);
  const setDashboardOpen = useSessionStore(s => s.setDashboardOpen);

  const isRunning = session.status === 'running' || session.status === 'idle';
  const statusColor =
    session.status === 'running' ? 'var(--running)' :
    session.status === 'idle' ? 'var(--idle)' :
    session.status === 'error' ? 'var(--error)' :
    'var(--text-tertiary)';

  const statusLabel =
    session.status === 'running' ? 'Running' :
    session.status === 'idle' ? 'Idle' :
    session.status === 'error' ? 'Error' :
    'Completed';

  const totalTokens = session.tokenUsageInput + session.tokenUsageOutput;

  const handleJump = () => {
    setActiveProject(session.projectId);
    setDashboardOpen(false);
  };

  return (
    <div
      className="rounded-xl transition-colors"
      style={{
        padding: '18px 22px',
        background: isRunning ? 'var(--bg-hover)' : 'var(--bg-primary)',
        border: `1px solid ${isRunning ? 'var(--border-active)' : 'var(--border)'}`,
      }}
    >
      {/* Top Row: Status + Name + Actions */}
      <div className="flex items-center" style={{ gap: 12, marginBottom: 14 }}>
        <Circle
          size={12}
          fill={statusColor}
          style={{ color: statusColor, flexShrink: 0 }}
        />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          {session.name}
        </span>
        <span
          className="rounded-lg"
          style={{
            padding: '5px 14px',
            fontSize: 12,
            fontWeight: 700,
            background: isRunning ? 'var(--success-dim)' : 'var(--bg-surface)',
            color: isRunning ? 'var(--success)' : 'var(--text-tertiary)',
          }}
        >
          {statusLabel}
        </span>
        <button
          onClick={handleJump}
          className="rounded-lg transition-colors"
          style={{
            padding: '5px 14px',
            fontSize: 12,
            fontWeight: 600,
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
          }}
        >
          {projectName}
        </button>
      </div>

      {/* Metrics Row */}
      <div className="flex items-center" style={{ gap: 20 }}>
        <div className="flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>
          <Hash size={14} />
          <span>{session.promptCount} prompts</span>
        </div>
        <div className="flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>
          <Cpu size={14} />
          <span>~{formatTokens(totalTokens)} tokens</span>
        </div>
        <div className="flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>
          <Clock size={14} />
          <span>{isRunning ? formatDuration(session.startedAt) : formatRelativeTime(session.lastActive)}</span>
        </div>
        {session.pid && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            PID {session.pid}
          </span>
        )}

        <div className="flex-1" />

        {/* Stop Button */}
        {isRunning && (
          <button
            onClick={() => stopSession(session.id)}
            className="flex items-center rounded-lg transition-all"
            style={{
              gap: 8,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--error-dim)',
              color: 'var(--error)',
              border: '1px solid rgba(243, 139, 168, 0.25)',
            }}
          >
            <Square size={13} />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
