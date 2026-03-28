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

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div
        className="flex items-center overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
      >
        {projectTerminals.map(t => {
          const Icon = typeIcons[t.type] || Terminal;
          const isActive = t.id === activeTerminalId;
          return (
            <div
              key={t.id}
              className="flex items-center cursor-pointer shrink-0 relative group"
              style={{
                gap: 8,
                padding: '10px 16px',
                fontSize: 14,
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                background: isActive ? 'var(--bg-primary)' : 'transparent',
              }}
              onClick={() => setActiveTerminal(t.id)}
            >
              <Icon size={14} style={{ color: typeColors[t.type] }} />
              <span className="max-w-24 truncate">{t.name}</span>
              {t.status !== 'running' && (
                <span className="rounded-full" style={{ width: 7, height: 7, background: 'var(--error)' }} />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); killTerminal(t.id); }}
                className="opacity-0 group-hover:opacity-100 rounded hover:bg-[var(--bg-hover)] transition-opacity"
                style={{ padding: 4 }}
              >
                <X size={14} style={{ color: 'var(--text-tertiary)' }} />
              </button>
              {isActive && (
                <div className="absolute bottom-0 left-1 right-1 rounded-full" style={{ height: 2, background: 'var(--accent)' }} />
              )}
            </div>
          );
        })}

        {/* Add Terminal Dropdown */}
        <div className="flex items-center" style={{ gap: 4, padding: '0 8px', marginLeft: 4 }}>
          <button
            onClick={() => handleSpawn('shell')}
            disabled={spawning}
            className="rounded hover:bg-[var(--bg-hover)] transition-colors"
            style={{ padding: 6 }}
            title="New Shell"
          >
            <Plus size={16} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        <div className="flex-1" />

        {/* Terminal Actions */}
        {activeTerminalId && (
          <div className="flex items-center" style={{ gap: 4, padding: '0 12px' }}>
            <button
              onClick={() => clearTerminal(activeTerminalId)}
              className="rounded hover:bg-[var(--bg-hover)] transition-colors"
              style={{ padding: 6 }}
              title="Clear"
            >
              <Eraser size={16} style={{ color: 'var(--text-tertiary)' }} />
            </button>
            <button
              onClick={() => restartTerminal(activeTerminalId)}
              className="rounded hover:bg-[var(--bg-hover)] transition-colors"
              style={{ padding: 6 }}
              title="Restart"
            >
              <RotateCw size={16} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>
        )}
      </div>

      {/* Terminal Content */}
      <div className="flex-1 relative" style={{ background: '#1e1e2e' }}>
        {projectTerminals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ gap: 16 }}>
            <Terminal size={36} style={{ color: 'var(--text-tertiary)' }} />
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>No terminals open</p>
            <div className="flex" style={{ gap: 12 }}>
              {(['shell', 'dev_server', 'git'] as TerminalType[]).map(type => {
                const Icon = typeIcons[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleSpawn(type)}
                    className="flex items-center rounded-xl transition-colors"
                    style={{
                      gap: 8,
                      padding: '10px 20px',
                      fontSize: 13,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Icon size={16} style={{ color: typeColors[type] }} />
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
