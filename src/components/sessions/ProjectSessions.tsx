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
        <div className="flex items-center gap-2">
          <Zap size={16} style={{ color: 'var(--accent)' }} />
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Claude Code Sessions
          </h3>
          {active.length > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(166, 227, 161, 0.15)', color: 'var(--success)' }}
            >
              {active.length} active
            </span>
          )}
        </div>
        <StartSessionButton projectId={projectId} projectName={projectName} />
      </div>

      {/* Active Sessions */}
      {active.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {active.map(session => (
            <SessionCard key={session.id} session={session} projectName={projectName} />
          ))}
        </div>
      )}

      {/* Recent Sessions */}
      {recent.length > 0 && (
        <div>
          <h4
            className="text-[10px] uppercase tracking-wider mb-2 font-medium"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Recent
          </h4>
          <div className="flex flex-col gap-1.5">
            {recent.map(session => (
              <SessionCard key={session.id} session={session} projectName={projectName} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {projectSessions.length === 0 && (
        <div
          className="text-center py-8 rounded-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <Zap size={24} className="mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            No sessions for this project yet
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Start a Claude Code session to begin
          </p>
        </div>
      )}
    </div>
  );
}
