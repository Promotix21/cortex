import { useEffect, useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { useProjectStore } from '@/stores/project-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { XTerminal } from '@/components/terminal/XTerminal';
import { Plus, Square, ChevronLeft, ChevronRight, Maximize2, Rows3, Grid3x3, Zap } from 'lucide-react';
import type { Session } from '@/types/session';

const GRID_PAGE_SIZE = 4;

export function SessionGridPanel() {
  const sessions = useSessionStore(s => s.activeSessions);
  const { stopSession, spawnSession, fetchActiveSessions } = useSessionStore();
  const activeProject = useProjectStore(s => s.activeProject());
  const projects = useProjectStore(s => s.projects);
  const viewSession = useNavigationStore(s => s.viewSession);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [gridPage, setGridPage] = useState(0);

  useEffect(() => {
    fetchActiveSessions(); // show ALL running sessions
    const interval = setInterval(() => fetchActiveSessions(), 3000);
    return () => clearInterval(interval);
  }, [fetchActiveSessions]);

  const getProjectName = (projectId: string) =>
    projects.find(p => p.id === projectId)?.name || 'Unknown';

  const getGridLayout = (count: number) => {
    if (count === 0) return { cols: 1, rows: 1 };
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    return { cols: 2, rows: 2 };
  };

  const activeSessions = sessions;
  const totalPages = Math.ceil(activeSessions.length / GRID_PAGE_SIZE);
  const pageSessions = activeSessions.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE);
  const gridLayout = getGridLayout(pageSessions.length);

  // Group all sessions by project for list view
  const sessionsByProject = activeSessions.reduce<Record<string, { projectName: string; sessions: typeof activeSessions }>>((acc, s) => {
    const name = getProjectName(s.projectId);
    if (!acc[s.projectId]) acc[s.projectId] = { projectName: name, sessions: [] };
    acc[s.projectId].sessions.push(s);
    return acc;
  }, {});

  const handleNewSession = async () => {
    // Grid view may have no active project selected — fall back to the most recently
    // opened project so the "New Session" button still works in multi-project mode.
    const project = activeProject ?? projects[0] ?? null;
    if (!project) return;
    const name = `session-${Date.now().toString(36)}`;
    const session = await spawnSession(project.id, name);
    viewSession(session.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center shrink-0"
        style={{
          padding: '0 16px',
          height: 46,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div className="flex items-center flex-1" style={{ gap: 12 }}>
          <Zap size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Active Sessions
          </span>
          <span
            className="rounded-full"
            style={{
              padding: '2px 10px',
              fontSize: 12,
              fontWeight: 700,
              background: activeSessions.length > 0 ? 'var(--success-dim)' : 'var(--bg-hover)',
              color: activeSessions.length > 0 ? 'var(--success)' : 'var(--text-tertiary)',
            }}
          >
            {activeSessions.length}
          </span>

          {totalPages > 1 && (
            <div className="flex items-center" style={{ gap: 4, marginLeft: 8 }}>
              <button
                onClick={() => setGridPage(p => Math.max(0, p - 1))}
                disabled={gridPage === 0}
                className="rounded disabled:opacity-30"
                style={{ padding: 4, color: 'var(--text-tertiary)' }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {gridPage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setGridPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={gridPage >= totalPages - 1}
                className="rounded disabled:opacity-30"
                style={{ padding: 4, color: 'var(--text-tertiary)' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center" style={{ gap: 4 }}>
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="rounded transition-colors"
            style={{ padding: 7, color: 'var(--text-tertiary)' }}
            title={viewMode === 'grid' ? 'List view' : 'Grid view'}
          >
            {viewMode === 'grid' ? <Rows3 size={16} /> : <Grid3x3 size={16} />}
          </button>

          <div style={{ width: 1, height: 20, margin: '0 6px', background: 'var(--border)' }} />

          <button
            onClick={handleNewSession}
            disabled={!activeProject && projects.length === 0}
            className="flex items-center rounded-lg transition-colors disabled:opacity-40"
            style={{
              gap: 6,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
            }}
          >
            <Plus size={14} />
            <span>New Session</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0" style={{ background: '#1e1e2e', position: 'relative', overflow: 'hidden' }}>
        {activeSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ gap: 20 }}>
            <div
              className="flex items-center justify-center rounded-2xl"
              style={{
                width: 72,
                height: 72,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
              }}
            >
              <Zap size={32} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <div className="text-center">
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                No active sessions
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                Start a Claude Code session from the dashboard or press Ctrl+N
              </p>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          /* List view — grouped by project */
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: 16 }}>
            {Object.entries(sessionsByProject).map(([projectId, group]) => (
              <div key={projectId} style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 8,
                  paddingLeft: 4,
                }}>
                  {group.projectName} · {group.sessions.length} session{group.sessions.length > 1 ? 's' : ''}
                </div>
                {group.sessions.map(session => (
                  <SessionListItem
                    key={session.id}
                    session={session}
                    projectName={group.projectName}
                    onFocus={() => viewSession(session.id)}
                    onStop={() => stopSession(session.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          /* Grid view */
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
              gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`,
              gap: 2,
              background: 'var(--border)',
            }}
          >
            {pageSessions.map(session => (
              <div
                key={session.id}
                className="flex flex-col"
                style={{ background: '#1e1e2e', overflow: 'hidden', minHeight: 0 }}
              >
                {/* Grid session header */}
                <div
                  className="flex items-center shrink-0"
                  style={{
                    gap: 8,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Zap size={13} style={{ color: 'var(--accent)' }} />
                  <span className="truncate flex-1">{session.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {getProjectName(session.projectId)}
                  </span>
                  <button
                    onClick={() => viewSession(session.id)}
                    className="rounded transition-colors"
                    style={{ padding: 3, color: 'var(--text-tertiary)' }}
                    title="Expand session"
                  >
                    <Maximize2 size={12} />
                  </button>
                  <button
                    onClick={() => stopSession(session.id)}
                    className="rounded transition-colors"
                    style={{ padding: 3, color: 'var(--error)' }}
                    title="Stop session"
                  >
                    <Square size={12} />
                  </button>
                </div>
                {/* Terminal */}
                <div className="flex-1" style={{ position: 'relative', minHeight: 0 }}>
                  {(session as any).terminalId ? (
                    <XTerminal
                      terminalId={(session as any).terminalId}
                      active={true}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                      No terminal linked
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionListItem({ session, projectName, onFocus, onStop }: {
  session: Session;
  projectName: string;
  onFocus: () => void;
  onStop: () => void;
}) {
  return (
    <div
      className="flex items-center rounded-xl cursor-pointer transition-all"
      onClick={onFocus}
      style={{
        gap: 14,
        padding: '14px 18px',
        marginBottom: 8,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        className="flex items-center justify-center rounded-lg shrink-0"
        style={{ width: 38, height: 38, background: 'var(--accent-dim)' }}
      >
        <Zap size={18} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {session.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {projectName} · {session.promptCount} prompts
        </div>
      </div>
      <span
        className="rounded-full shrink-0"
        style={{
          width: 9,
          height: 9,
          background: 'var(--success)',
          boxShadow: '0 0 6px rgba(52, 211, 153, 0.5)',
        }}
      />
      <button
        onClick={(e) => { e.stopPropagation(); onStop(); }}
        className="rounded-lg transition-colors shrink-0"
        style={{
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 600,
          background: 'var(--error-dim)',
          color: 'var(--error)',
        }}
      >
        Stop
      </button>
    </div>
  );
}
