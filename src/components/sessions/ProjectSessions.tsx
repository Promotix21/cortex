import { useEffect } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { SessionCard } from './SessionCard';
import { StartSessionButton } from './StartSessionButton';
import { Zap } from 'lucide-react';

interface ProjectSessionsProps {
  projectId: string;
  projectName: string;
}

export function ProjectSessions({ projectId, projectName }: ProjectSessionsProps) {
  const { sessions, fetchSessions } = useSessionStore();

  useEffect(() => {
    fetchSessions(projectId);
    const interval = setInterval(() => fetchSessions(projectId), 3000);
    return () => clearInterval(interval);
  }, [projectId, fetchSessions]);

  const projectSessions = sessions.filter(s => s.projectId === projectId);
  const active = projectSessions.filter(s => s.status === 'running' || s.status === 'idle');
  const recent = projectSessions.filter(s => s.status === 'completed' || s.status === 'error').slice(0, 5);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
            <Zap size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Claude Code Sessions
            </h3>
            {active.length > 0 && (
              <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>
                {active.length} active
              </span>
            )}
          </div>
        </div>
        <StartSessionButton projectId={projectId} projectName={projectName} />
      </div>

      {/* Active Sessions */}
      {active.length > 0 && (
        <div className="flex flex-col gap-3 mb-5">
          {active.map(session => (
            <SessionCard key={session.id} session={session} projectName={projectName} />
          ))}
        </div>
      )}

      {/* Recent Sessions */}
      {recent.length > 0 && (
        <div>
          <h4
            className="text-xs uppercase tracking-wider font-semibold mb-3"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Recent
          </h4>
          <div className="flex flex-col gap-2">
            {recent.map(session => (
              <SessionCard key={session.id} session={session} projectName={projectName} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {projectSessions.length === 0 && (
        <div
          className="text-center py-12 rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <Zap size={32} className="mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            No sessions for this project yet
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Start a Claude Code session to begin
          </p>
        </div>
      )}
    </div>
  );
}
