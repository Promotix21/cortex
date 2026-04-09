import { useEffect, useState, useCallback } from 'react';
import { useNavigationStore } from '@/stores/navigation-store';
import { useProjectStore } from '@/stores/project-store';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { Clock, Play, ChevronDown, ChevronRight, Circle, ExternalLink } from 'lucide-react';
import type { Session } from '@/types/session';

type RecentSession = Session & { projectName: string };

export function RecentSessions() {
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const viewSession = useNavigationStore(s => s.viewSession);
  const setActiveProject = useProjectStore(s => s.setActiveProject);
  const fetchSessions = useSessionStore(s => s.fetchSessions);

  const loadRecent = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getRecentSessions(8);
      setSessions(data.sessions);
    } catch {
      // silent — sidecar may not be ready
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
    const interval = setInterval(loadRecent, 10000);
    return () => clearInterval(interval);
  }, [loadRecent]);

  const handleOpen = (session: RecentSession) => {
    setActiveProject(session.projectId);
    viewSession(session.id);
  };

  const handleResume = async (e: React.MouseEvent, session: RecentSession) => {
    e.stopPropagation();
    try {
      const data = await api.resumeSession(session.id);
      setActiveProject(session.projectId);
      fetchSessions();
      viewSession(data.session.id);
    } catch {
      // Fallback: spawn fresh session
      const newSession = await useSessionStore.getState().spawnSession(
        session.projectId,
        `${session.name} (resumed)`
      );
      setActiveProject(session.projectId);
      viewSession(newSession.id);
    }
  };

  if (sessions.length === 0 && !loading) return null;

  const statusColor = (status: string) =>
    status === 'running' ? 'var(--running)' :
    status === 'idle' ? 'var(--idle)' :
    status === 'error' ? 'var(--error)' :
    'var(--text-tertiary)';

  return (
    <div
      className="border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="flex items-center w-full"
        style={{
          padding: '12px 20px',
          gap: 8,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {collapsed ? (
          <ChevronRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        ) : (
          <ChevronDown size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        )}
        <Clock size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span
          className="font-bold uppercase tracking-widest"
          style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-tertiary)' }}
        >
          Recent Sessions
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            opacity: 0.6,
            marginLeft: 'auto',
          }}
        >
          {sessions.length}
        </span>
      </button>

      {/* Session List */}
      {!collapsed && (
        <div style={{ padding: '0 12px 12px' }}>
          {sessions.map(session => {
            const isRunning = session.status === 'running' || session.status === 'idle';
            return (
              <div
                key={session.id}
                onClick={() => handleOpen(session)}
                className="rounded-lg transition-colors"
                style={{
                  padding: '10px 12px',
                  marginBottom: 4,
                  cursor: 'pointer',
                  background: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Row 1: status dot + name + time */}
                <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
                  <Circle
                    size={8}
                    fill={statusColor(session.status)}
                    style={{ color: statusColor(session.status), flexShrink: 0 }}
                  />
                  <span
                    className="flex-1 truncate"
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}
                    title={session.name}
                  >
                    {session.name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {formatRelativeTime(session.lastActive)}
                  </span>
                </div>

                {/* Row 2: project name + actions */}
                <div className="flex items-center" style={{ gap: 8, paddingLeft: 16 }}>
                  <span
                    className="flex-1 truncate"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)' }}
                    title={session.projectName}
                  >
                    {session.projectName}
                    {session.promptCount > 0 && ` · ${session.promptCount} prompts`}
                  </span>

                  {/* Resume button for completed sessions */}
                  {!isRunning && (
                    <button
                      onClick={(e) => handleResume(e, session)}
                      className="flex items-center rounded transition-colors"
                      style={{
                        gap: 4,
                        padding: '3px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'var(--success-dim)',
                        color: 'var(--success)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Resume this session"
                    >
                      <Play size={10} />
                      Resume
                    </button>
                  )}

                  {/* Open button for running sessions */}
                  {isRunning && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpen(session); }}
                      className="flex items-center rounded transition-colors"
                      style={{
                        gap: 4,
                        padding: '3px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'var(--accent-dim)',
                        color: 'var(--accent)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Open this session"
                    >
                      <ExternalLink size={10} />
                      Open
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
