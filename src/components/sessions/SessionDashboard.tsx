import { useEffect } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { useProjectStore } from '@/stores/project-store';
import { SessionCard } from './SessionCard';
import { UsageBanner } from './UsageBanner';
import { X, RefreshCw, Zap } from 'lucide-react';

export function SessionDashboard() {
  const { sessions, usage, dashboardOpen, setDashboardOpen, fetchSessions, fetchUsage } =
    useSessionStore();
  const projects = useProjectStore(s => s.projects);

  useEffect(() => {
    if (dashboardOpen) {
      fetchSessions();
      fetchUsage();
      const interval = setInterval(() => {
        fetchSessions();
        fetchUsage();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [dashboardOpen, fetchSessions, fetchUsage]);

  if (!dashboardOpen) return null;

  const getProjectName = (projectId: string) =>
    projects.find(p => p.id === projectId)?.name ?? 'Unknown';

  const running = sessions.filter(s => s.status === 'running' || s.status === 'idle');
  const completed = sessions.filter(s => s.status === 'completed' || s.status === 'error');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', paddingTop: 48 }}
      onClick={(e) => e.target === e.currentTarget && setDashboardOpen(false)}
    >
      <div
        className="rounded-xl flex flex-col"
        style={{ width: 700, maxHeight: '80vh', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center"
          style={{ gap: 14, padding: '16px 24px', borderBottom: '1px solid var(--border)' }}
        >
          <Zap size={20} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold flex-1" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
            Claude Code Sessions
          </h2>
          <button
            onClick={() => { fetchSessions(); fetchUsage(); }}
            className="rounded hover:bg-[var(--bg-hover)] transition-colors"
            style={{ padding: 8 }}
            title="Refresh"
          >
            <RefreshCw size={16} style={{ color: 'var(--text-tertiary)' }} />
          </button>
          <button
            onClick={() => setDashboardOpen(false)}
            className="rounded hover:bg-[var(--bg-hover)] transition-colors"
            style={{ padding: 8 }}
          >
            <X size={16} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
          {/* Usage Banner */}
          {usage && <UsageBanner usage={usage} getProjectName={getProjectName} />}

          {/* Running Sessions */}
          {running.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3
                className="uppercase tracking-wider font-medium"
                style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-tertiary)' }}
              >
                Active ({running.length})
              </h3>
              <div className="flex flex-col" style={{ gap: 12 }}>
                {running.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    projectName={getProjectName(session.projectId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Sessions */}
          {completed.length > 0 && (
            <div>
              <h3
                className="uppercase tracking-wider font-medium"
                style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-tertiary)' }}
              >
                Recent ({completed.length})
              </h3>
              <div className="flex flex-col" style={{ gap: 12 }}>
                {completed.slice(0, 10).map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    projectName={getProjectName(session.projectId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {sessions.length === 0 && (
            <div className="text-center" style={{ padding: '48px 0' }}>
              <Zap size={36} className="mx-auto" style={{ marginBottom: 14, color: 'var(--text-tertiary)' }} />
              <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                No Claude Code sessions yet
              </p>
              <p style={{ fontSize: 13, marginTop: 6, color: 'var(--text-tertiary)' }}>
                Select a project and start a session
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
