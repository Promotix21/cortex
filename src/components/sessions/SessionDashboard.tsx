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
      className="fixed inset-0 z-50 flex items-start justify-center pt-12"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && setDashboardOpen(false)}
    >
      <div
        className="rounded-xl w-[700px] max-h-[80vh] flex flex-col"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <Zap size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
            Claude Code Sessions
          </h2>
          <button
            onClick={() => { fetchSessions(); fetchUsage(); }}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} style={{ color: 'var(--text-tertiary)' }} />
          </button>
          <button
            onClick={() => setDashboardOpen(false)}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={14} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Usage Banner */}
          {usage && <UsageBanner usage={usage} getProjectName={getProjectName} />}

          {/* Running Sessions */}
          {running.length > 0 && (
            <div className="mb-4">
              <h3
                className="text-[10px] uppercase tracking-wider mb-2 font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Active ({running.length})
              </h3>
              <div className="flex flex-col gap-2">
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
                className="text-[10px] uppercase tracking-wider mb-2 font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Recent ({completed.length})
              </h3>
              <div className="flex flex-col gap-2">
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
            <div className="text-center py-12">
              <Zap size={32} className="mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                No Claude Code sessions yet
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Select a project and start a session
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
