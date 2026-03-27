import { useEffect, useState } from 'react';
import { useTerminalStore } from '@/stores/terminal-store';
import { useProjectStore } from '@/stores/project-store';
import { XTerminal } from './XTerminal';
import { Plus, X, RotateCw, Eraser, Terminal, Server, GitBranch, Zap } from 'lucide-react';
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

  useEffect(() => {
    if (project) {
      fetchTerminals(project.id);
    }
  }, [project?.id, fetchTerminals]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        <p className="text-xs">Select a project to use terminals</p>
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

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div
        className="flex items-center border-b overflow-x-auto"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        {projectTerminals.map(t => {
          const Icon = typeIcons[t.type] || Terminal;
          const isActive = t.id === activeTerminalId;
          return (
            <div
              key={t.id}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer shrink-0 relative group"
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                background: isActive ? 'var(--bg-primary)' : 'transparent',
              }}
              onClick={() => setActiveTerminal(t.id)}
            >
              <Icon size={11} style={{ color: typeColors[t.type] }} />
              <span className="max-w-24 truncate">{t.name}</span>
              {t.status !== 'running' && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--error)' }} />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); killTerminal(t.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--bg-hover)] transition-opacity"
              >
                <X size={10} style={{ color: 'var(--text-tertiary)' }} />
              </button>
              {isActive && (
                <div className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
              )}
            </div>
          );
        })}

        {/* Add Terminal Dropdown */}
        <div className="flex items-center gap-0.5 px-1 ml-1">
          <button
            onClick={() => handleSpawn('shell')}
            disabled={spawning}
            className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
            title="New Shell"
          >
            <Plus size={12} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        <div className="flex-1" />

        {/* Terminal Actions */}
        {activeTerminalId && (
          <div className="flex items-center gap-0.5 px-2">
            <button
              onClick={() => clearTerminal(activeTerminalId)}
              className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
              title="Clear"
            >
              <Eraser size={11} style={{ color: 'var(--text-tertiary)' }} />
            </button>
            <button
              onClick={() => restartTerminal(activeTerminalId)}
              className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
              title="Restart"
            >
              <RotateCw size={11} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>
        )}
      </div>

      {/* Terminal Content */}
      <div className="flex-1 relative" style={{ background: '#1e1e2e' }}>
        {projectTerminals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Terminal size={28} style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No terminals open</p>
            <div className="flex gap-2">
              {(['shell', 'dev_server', 'git'] as TerminalType[]).map(type => {
                const Icon = typeIcons[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleSpawn(type)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] transition-colors"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Icon size={11} style={{ color: typeColors[type] }} />
                    {type.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          projectTerminals.map(t => (
            <XTerminal
              key={t.id}
              terminalId={t.id}
              active={t.id === activeTerminalId}
            />
          ))
        )}
      </div>
    </div>
  );
}
