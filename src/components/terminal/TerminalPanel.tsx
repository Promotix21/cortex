import { useEffect, useState } from 'react';
import { useTerminalStore } from '@/stores/terminal-store';
import { useProjectStore } from '@/stores/project-store';
import { XTerminal } from './XTerminal';
import { Plus, X, RotateCw, Eraser, Terminal, Server, GitBranch, Zap, Grid3x3, Rows3, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TerminalType } from '@/stores/terminal-store';

const typeIcons: Record<TerminalType, React.ElementType> = {
  shell: Terminal,
  ai_session: Zap,
  dev_server: Server,
  git: GitBranch,
};

const typeColors: Record<TerminalType, string> = {
  shell: 'var(--text-secondary)',
  ai_session: 'var(--accent)',
  dev_server: 'var(--success)',
  git: 'var(--warning)',
};

type ViewMode = 'tabs' | 'grid';
const GRID_PAGE_SIZE = 4;

export function TerminalPanel() {
  const project = useProjectStore(s => s.activeProject());
  const {
    terminals,
    activeTerminalId,
    setActiveTerminal,
    fetchTerminals,
    spawnTerminal,
    killTerminal,
    clearTerminal,
    restartTerminal,
  } = useTerminalStore();

  const [spawning, setSpawning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('tabs');
  const [gridPage, setGridPage] = useState(0);

  useEffect(() => {
    if (project) {
      fetchTerminals(project.id);
    }
  }, [project?.id, fetchTerminals]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        <p style={{ fontSize: 14 }}>Select a project to use terminals</p>
      </div>
    );
  }

  const handleSpawn = async (type: TerminalType = 'shell') => {
    setSpawning(true);
    try {
      const count = terminals.filter(t => t.type === type).length + 1;
      const name = `${type}-${count}`;
      await spawnTerminal(project.id, name, type);
    } finally {
      setSpawning(false);
    }
  };

  const projectTerminals = terminals.filter(t => t.projectId === project.id);
  const totalPages = Math.ceil(projectTerminals.length / GRID_PAGE_SIZE);
  const gridTerminals = projectTerminals.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE);

  // Grid layout calculation
  const getGridLayout = (count: number) => {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count === 3) return { cols: 2, rows: 2 };
    return { cols: 2, rows: 2 };
  };

  const gridLayout = getGridLayout(gridTerminals.length);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center shrink-0"
        style={{
          padding: '0 12px',
          height: 46,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        {/* Tabs (only in tab mode) */}
        {viewMode === 'tabs' && (
          <div className="flex items-center flex-1 overflow-x-auto" style={{ gap: 2 }}>
            {projectTerminals.map(t => {
              const Icon = typeIcons[t.type] || Terminal;
              const isActive = t.id === activeTerminalId;
              return (
                <div
                  key={t.id}
                  className="flex items-center cursor-pointer shrink-0 relative group rounded-t-lg"
                  style={{
                    gap: 8,
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    background: isActive ? 'var(--bg-primary)' : 'transparent',
                  }}
                  onClick={() => setActiveTerminal(t.id)}
                >
                  <Icon size={14} style={{ color: typeColors[t.type] }} />
                  <span className="truncate" style={{ maxWidth: 120 }}>{t.name}</span>
                  {t.status !== 'running' && (
                    <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--error)' }} />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); killTerminal(t.id); }}
                    className="opacity-0 group-hover:opacity-100 rounded transition-opacity"
                    style={{ padding: 3 }}
                  >
                    <X size={12} style={{ color: 'var(--text-tertiary)' }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Grid page info */}
        {viewMode === 'grid' && (
          <div className="flex items-center flex-1" style={{ gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {projectTerminals.length} terminal{projectTerminals.length !== 1 ? 's' : ''}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center" style={{ gap: 4 }}>
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
        )}

        {/* Right side controls */}
        <div className="flex items-center" style={{ gap: 4 }}>
          {/* View mode toggle */}
          <button
            onClick={() => setViewMode(viewMode === 'tabs' ? 'grid' : 'tabs')}
            className="rounded transition-colors"
            style={{
              padding: 7,
              color: 'var(--text-tertiary)',
              background: 'transparent',
            }}
            title={viewMode === 'tabs' ? 'Grid view' : 'Tab view'}
          >
            {viewMode === 'tabs' ? <Grid3x3 size={16} /> : <Rows3 size={16} />}
          </button>

          <div style={{ width: 1, height: 20, margin: '0 6px', background: 'var(--border)' }} />

          {/* Terminal actions */}
          {viewMode === 'tabs' && activeTerminalId && (
            <>
              <button
                onClick={() => clearTerminal(activeTerminalId)}
                className="rounded transition-colors"
                style={{ padding: 7, color: 'var(--text-tertiary)' }}
                title="Clear"
              >
                <Eraser size={15} />
              </button>
              <button
                onClick={() => restartTerminal(activeTerminalId)}
                className="rounded transition-colors"
                style={{ padding: 7, color: 'var(--text-tertiary)' }}
                title="Restart"
              >
                <RotateCw size={15} />
              </button>
              <div style={{ width: 1, height: 20, margin: '0 6px', background: 'var(--border)' }} />
            </>
          )}

          {/* New terminal */}
          <button
            onClick={() => handleSpawn('shell')}
            disabled={spawning}
            className="flex items-center rounded-lg transition-colors"
            style={{
              gap: 6,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
            }}
            title="New Shell"
          >
            <Plus size={14} />
            <span>Shell</span>
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 relative" style={{ background: '#1e1e2e' }}>
        {projectTerminals.length === 0 ? (
          /* Empty State */
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
              <Terminal size={32} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <div className="text-center">
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                No terminals open
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                Open a terminal to get started
              </p>
            </div>
            <div className="flex" style={{ gap: 12 }}>
              {(['shell', 'dev_server', 'git'] as TerminalType[]).map(type => {
                const Icon = typeIcons[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleSpawn(type)}
                    className="flex items-center rounded-xl transition-all hover:scale-[1.02]"
                    style={{
                      gap: 10,
                      padding: '12px 22px',
                      fontSize: 14,
                      fontWeight: 600,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Icon size={18} style={{ color: typeColors[type] }} />
                    {type.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'tabs' ? (
          /* Tab View — one terminal fills entire area */
          projectTerminals.map(t => (
            <XTerminal
              key={t.id}
              terminalId={t.id}
              active={t.id === activeTerminalId}
            />
          ))
        ) : (
          /* Grid View — responsive grid layout */
          <div
            className="h-full w-full"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
              gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`,
              gap: 2,
              background: 'var(--border)',
            }}
          >
            {gridTerminals.map((t) => {
              const Icon = typeIcons[t.type] || Terminal;
              return (
                <div
                  key={t.id}
                  className="flex flex-col relative"
                  style={{ background: '#1e1e2e', overflow: 'hidden' }}
                >
                  {/* Grid terminal header */}
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
                    <Icon size={13} style={{ color: typeColors[t.type] }} />
                    <span className="truncate flex-1">{t.name}</span>
                    <button
                      onClick={() => clearTerminal(t.id)}
                      className="rounded transition-colors"
                      style={{ padding: 3, color: 'var(--text-tertiary)' }}
                    >
                      <Eraser size={12} />
                    </button>
                    <button
                      onClick={() => killTerminal(t.id)}
                      className="rounded transition-colors"
                      style={{ padding: 3, color: 'var(--text-tertiary)' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {/* Terminal */}
                  <div className="flex-1 relative">
                    <XTerminal
                      terminalId={t.id}
                      active={true}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
