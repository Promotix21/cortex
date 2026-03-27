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
      className="rounded-lg px-4 py-3 transition-colors"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isRunning ? 'var(--border-active)' : 'var(--border)'}`,
      }}
    >
      {/* Top Row: Status + Name + Project */}
      <div className="flex items-center gap-2 mb-2">
        <Circle
          size={8}
          fill={statusColor}
          style={{ color: statusColor }}
          className="shrink-0"
        />
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          {session.name}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
          background: 'var(--bg-hover)',
          color: 'var(--text-tertiary)',
        }}>
          {statusLabel}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleJump}
          className="text-[10px] px-2 py-0.5 rounded hover:bg-[var(--bg-hover)] transition-colors"
          style={{ color: 'var(--accent)' }}
        >
          {projectName}
        </button>
      </div>

      {/* Metrics Row */}
      <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        <div className="flex items-center gap-1">
          <Hash size={10} />
          <span>{session.promptCount} prompts</span>
        </div>
        <div className="flex items-center gap-1">
          <Cpu size={10} />
          <span>~{formatTokens(totalTokens)} tokens</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock size={10} />
          <span>{isRunning ? formatDuration(session.startedAt) : formatRelativeTime(session.lastActive)}</span>
        </div>
        {session.pid && (
          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            PID {session.pid}
          </span>
        )}

        <div className="flex-1" />

        {/* Actions */}
        {isRunning && (
          <div className="flex gap-1">
            <button
              onClick={() => stopSession(session.id)}
              className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
              title="Stop session"
            >
              <Square size={11} style={{ color: 'var(--warning)' }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
