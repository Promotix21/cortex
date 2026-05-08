import { useSessionStore } from '@/stores/session-store';
import { useProjectStore } from '@/stores/project-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { useEffect, useState, useRef } from 'react';
import { Zap, ChevronDown, Circle, Cloud, Terminal, ChevronUp, Code2 } from 'lucide-react';
import { api } from '@/lib/api';

export function TopBar() {
  const { activeSessions, liveProjects, fetchActiveSessions, fetchLiveWork, toggleDashboard } = useSessionStore();
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  const setActiveProject = useProjectStore(s => s.setActiveProject);
  const setActivity = useNavigationStore(s => s.setActivity);

  const [activeProvider, setActiveProvider] = useState<'claude-cli' | 'bedrock' | 'devstral'>('claude-cli');
  const [activeModel, setActiveModel] = useState('');
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const providerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchActiveSessions();
    fetchLiveWork();
    const interval = setInterval(() => {
      fetchActiveSessions();
      fetchLiveWork();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchActiveSessions, fetchLiveWork]);

  useEffect(() => {
    api.getProviderStatus().then(s => {
      setActiveProvider(s.activeProvider);
      setActiveModel(s.activeModel);
    });
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!providerMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)) {
        setProviderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [providerMenuOpen]);

  const switchProvider = async (provider: 'claude-cli' | 'bedrock' | 'devstral', model?: string) => {
    setSwitching(true);
    setProviderMenuOpen(false);
    try {
      const result = await api.switchProvider(provider, model);
      setActiveProvider(result.activeProvider as 'claude-cli' | 'bedrock' | 'devstral');
      setActiveModel(result.activeModel || '');
    } finally {
      setSwitching(false);
    }
  };

  const activeCount = activeSessions.length;

  const switchToProject = (projectId: string) => {
    setActiveProject(projectId);
    setActivity('terminal');
  };

  const providerLabel = activeProvider === 'bedrock'
    ? (activeModel?.includes('opus') ? 'Opus 4.7' : 'Sonnet 4.6')
    : activeProvider === 'devstral'
    ? 'Devstral 2'
    : 'Claude Pro';

  const providerColor = activeProvider === 'bedrock'
    ? { bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.25)', text: '#fbbf24' }
    : activeProvider === 'devstral'
    ? { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.25)', text: '#34d399' }
    : { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.25)', text: '#a78bfa' };

  return (
    <div
      className="flex items-center border-b select-none"
      style={{
        background: 'var(--bg-tertiary)',
        borderColor: 'var(--border)',
        padding: '6px 16px',
        gap: 8,
        minHeight: 44,
      }}
    >
      {/* Active project tabs */}
      <div className="flex items-center flex-1 overflow-x-auto" style={{ gap: 6 }}>
        {liveProjects.length === 0 ? (
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)', paddingLeft: 4 }}>
            No active work — start a session or open a terminal
          </span>
        ) : (
          liveProjects.map(p => {
            const isActive = p.projectId === activeProjectId;
            return (
              <button
                key={p.projectId}
                onClick={() => switchToProject(p.projectId)}
                className="flex items-center rounded-md transition-colors"
                style={{
                  gap: 8,
                  padding: '6px 12px',
                  fontSize: 13,
                  background: isActive ? 'var(--bg-surface)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--accent-dim)' : 'var(--border)'}`,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
                title={`${p.count} live item${p.count > 1 ? 's' : ''} in ${p.projectName}`}
              >
                <Circle size={8} fill="var(--running)" style={{ color: 'var(--running)' }} />
                <span style={{ fontWeight: isActive ? 600 : 500 }}>{p.projectName}</span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 8,
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {p.count}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Provider switcher pill */}
      <div style={{ position: 'relative' }} ref={providerMenuRef}>
        <button
          onClick={() => setProviderMenuOpen(o => !o)}
          disabled={switching}
          className="flex items-center rounded-lg transition-colors"
          style={{
            gap: 6,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 600,
            background: providerColor.bg,
            color: providerColor.text,
            border: `1px solid ${providerColor.border}`,
            whiteSpace: 'nowrap',
            cursor: switching ? 'wait' : 'pointer',
            opacity: switching ? 0.6 : 1,
          }}
          title="Switch AI provider"
        >
          {activeProvider === 'bedrock' ? <Cloud size={12} />
            : activeProvider === 'devstral' ? <Code2 size={12} />
            : <Terminal size={12} />
          }
          <span>{switching ? 'Switching…' : providerLabel}</span>
          {providerMenuOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {providerMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 0',
              minWidth: 200,
              zIndex: 100,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              AI Provider
            </div>

            <ProviderOption
              label="Claude Pro (CLI)"
              sublabel="Your Pro account"
              icon={<Terminal size={13} />}
              active={activeProvider === 'claude-cli'}
              onClick={() => switchProvider('claude-cli')}
            />

            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div style={{ padding: '4px 12px 4px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              AWS Bedrock
            </div>

            <ProviderOption
              label="Claude Sonnet 4.6"
              sublabel="Bedrock · us-west-2"
              icon={<Cloud size={13} />}
              active={activeProvider === 'bedrock' && !activeModel?.includes('opus')}
              onClick={() => switchProvider('bedrock', 'us.anthropic.claude-sonnet-4-6')}
            />
            <ProviderOption
              label="Claude Opus 4.7"
              sublabel="Bedrock · higher cost"
              icon={<Cloud size={13} />}
              active={activeProvider === 'bedrock' && activeModel?.includes('opus')}
              onClick={() => switchProvider('bedrock', 'us.anthropic.claude-opus-4-7')}
            />

            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div style={{ padding: '4px 12px 4px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Mistral AI (Bedrock)
            </div>

            <ProviderOption
              label="Devstral 2 — 123B"
              sublabel="Code analysis · us-west-2"
              icon={<Code2 size={13} />}
              active={activeProvider === 'devstral'}
              onClick={() => switchProvider('devstral')}
            />
          </div>
        )}
      </div>

      {/* Sessions dashboard toggle */}
      <button
        onClick={toggleDashboard}
        className="flex items-center rounded-lg transition-colors"
        style={{
          gap: 8,
          padding: '6px 14px',
          fontSize: 13,
          background: activeCount > 0 ? 'var(--success-dim)' : 'var(--bg-surface)',
          color: activeCount > 0 ? 'var(--success)' : 'var(--text-tertiary)',
          border: `1px solid ${activeCount > 0 ? 'rgba(52, 211, 153, 0.2)' : 'var(--border)'}`,
          whiteSpace: 'nowrap',
        }}
      >
        <Zap size={14} style={{ color: activeCount > 0 ? 'var(--running)' : 'var(--text-tertiary)' }} />
        <span className="font-medium">
          {activeCount > 0 ? `${activeCount} active` : 'No sessions'}
        </span>
        <ChevronDown size={13} />
      </button>
    </div>
  );
}

function ProviderOption({
  label, sublabel, icon, active, onClick,
}: {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full transition-colors"
      style={{
        gap: 10,
        padding: '7px 12px',
        fontSize: 13,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0 }}>{icon}</span>
      <span className="flex-1">
        <div style={{ fontWeight: active ? 600 : 400 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{sublabel}</div>
      </span>
      {active && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--accent)', flexShrink: 0,
        }} />
      )}
    </button>
  );
}
