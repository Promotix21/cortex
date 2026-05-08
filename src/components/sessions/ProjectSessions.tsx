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
    <div
      className="rounded-2xl"
      style={{
        padding: '24px 28px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: active.length > 0 || recent.length > 0 ? 20 : 0 }}>
        <div className="flex items-center" style={{ gap: 14 }}>
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: 44,
              height: 44,
              background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(34,211,238,0.05))',
              border: '1px solid rgba(34,211,238,0.15)',
            }}
          >
            <Zap size={22} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
              Claude Code Sessions
            </h3>
            {active.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
                {active.length} active
              </span>
            )}
          </div>
        </div>
        <StartSessionButton projectId={projectId} projectName={projectName} />
      </div>

      {/* Active Sessions */}
      {active.length > 0 && (
        <div className="flex flex-col" style={{ gap: 12, marginBottom: recent.length > 0 ? 24 : 0 }}>
          {active.map(session => (
            <SessionCard key={session.id} session={session} projectName={projectName} />
          ))}
        </div>
      )}

      {/* Recent Sessions */}
      {recent.length > 0 && (
        <div>
          <h4 style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', marginBottom: 12, color: 'var(--text-tertiary)',
          }}>
            Recent
          </h4>
          <div className="flex flex-col" style={{ gap: 8 }}>
            {recent.map(session => (
              <SessionCard key={session.id} session={session} projectName={projectName} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {projectSessions.length === 0 && (
        <div className="text-center" style={{ padding: '32px 0' }}>
          <Zap size={36} className="mx-auto" style={{ marginBottom: 12, color: 'var(--text-tertiary)' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
            No sessions for this project yet
          </p>
          <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-tertiary)' }}>
            Click "Start Claude Code" to begin
          </p>
        </div>
      )}
    </div>
  );
}
