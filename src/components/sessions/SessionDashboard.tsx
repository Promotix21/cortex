import { useEffect } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { useProjectStore } from '@/stores/project-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { UsageBanner } from './UsageBanner';
import { X, RefreshCw, Zap, Terminal as TerminalIcon, Sparkles } from 'lucide-react';

export function SessionDashboard() {
  const {
    liveProjects,
    usage,
    dashboardOpen,
    setDashboardOpen,
    fetchLiveWork,
    fetchUsage,
  } = useSessionStore();
  const projects = useProjectStore(s => s.projects);
  const setActiveProject = useProjectStore(s => s.setActiveProject);
  const setActivity = useNavigationStore(s => s.setActivity);

  useEffect(() => {
    if (!dashboardOpen) return;
    fetchLiveWork();
    fetchUsage();
    const interval = setInterval(() => {
      fetchLiveWork();
      fetchUsage();
    }, 3000);
    return () => clearInterval(interval);
  }, [dashboardOpen, fetchLiveWork, fetchUsage]);

  if (!dashboardOpen) return null;

  const getProjectName = (projectId: string) =>
    projects.find(p => p.id === projectId)?.name ?? 'Unknown';

  const totalLive = liveProjects.reduce((sum, p) => sum + p.count, 0);

  const jumpTo = (projectId: string) => {
    setActiveProject(projectId);
    setActivity('terminal');
    setDashboardOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Session dashboard"
      style={{ background: 'rgba(0,0,0,0.7)', paddingTop: 48 }}
      onClick={(e) => e.target === e.currentTarget && setDashboardOpen(false)}
    >
      <div
        className="rounded-xl flex flex-col"
        style={{ width: 760, maxHeight: '80vh', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center"
          style={{ gap: 14, padding: '16px 24px', borderBottom: '1px solid var(--border)' }}
        >
          <Zap size={20} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold flex-1" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
            Live Work — All Projects
          </h2>
          <span
            style={{
              fontSize: 12,
              padding: '3px 10px',
              borderRadius: 10,
              background: totalLive > 0 ? 'var(--success-dim)' : 'var(--bg-surface)',
              color: totalLive > 0 ? 'var(--success)' : 'var(--text-tertiary)',
            }}
          >
            {totalLive} live
          </span>
          <button
            onClick={() => { fetchLiveWork(); fetchUsage(); }}
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
          {usage && <UsageBanner usage={usage} getProjectName={getProjectName} />}

          {liveProjects.length === 0 ? (
            <div className="text-center" style={{ padding: '48px 0' }}>
              <Zap size={36} className="mx-auto" style={{ marginBottom: 14, color: 'var(--text-tertiary)' }} />
              <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
                No live sessions or terminals
              </p>
              <p style={{ fontSize: 13, marginTop: 6, color: 'var(--text-tertiary)' }}>
                Start a session from a project dashboard or open a terminal
              </p>
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 24, marginTop: 16 }}>
              {liveProjects.map(group => (
                <div key={group.projectId}>
                  <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
                    <h3
                      className="uppercase tracking-wider font-medium"
                      style={{ fontSize: 12, color: 'var(--text-tertiary)' }}
                    >
                      {group.projectName}
                    </h3>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '1px 7px',
                        borderRadius: 8,
                        background: 'var(--bg-surface)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {group.count}
                    </span>
                  </div>
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    {group.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => jumpTo(item.projectId)}
                        className="flex items-center rounded-lg transition-colors text-left"
                        style={{
                          gap: 12,
                          padding: '12px 16px',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                      >
                        {item.kind === 'session' ? (
                          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                        ) : (
                          <TerminalIcon size={16} style={{ color: 'var(--text-secondary)' }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {item.kind === 'session' ? 'Claude session' : `${item.type ?? 'shell'} terminal`}
                            {item.kind === 'session' && typeof item.promptCount === 'number' && item.promptCount > 0
                              ? ` · ${item.promptCount} prompt${item.promptCount > 1 ? 's' : ''}`
                              : ''}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 8,
                            background: 'var(--success-dim)',
                            color: 'var(--success)',
                          }}
                        >
                          {item.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
