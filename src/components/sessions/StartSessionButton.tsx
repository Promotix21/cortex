import { useState, useEffect } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { api } from '@/lib/api';
import { Play, X, Terminal, Cloud, ChevronDown, Code2 } from 'lucide-react';

interface StartSessionButtonProps {
  projectId: string;
  projectName: string;
}

type Provider = 'claude-cli' | 'bedrock' | 'devstral';
type BedrockModel = 'us.anthropic.claude-sonnet-4-6' | 'us.anthropic.claude-opus-4-7';

const BEDROCK_MODELS: { id: BedrockModel; label: string }[] = [
  { id: 'us.anthropic.claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'us.anthropic.claude-opus-4-7', label: 'Opus 4.7' },
];

export function StartSessionButton({ projectId, projectName }: StartSessionButtonProps) {
  const { spawnSession } = useSessionStore();
  const setActivity = useNavigationStore(s => s.setActivity);

  const [showForm, setShowForm] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [spawning, setSpawning] = useState(false);
  const [error, setError] = useState('');

  const [activeProvider, setActiveProvider] = useState<Provider>('claude-cli');
  const [bedrockModel, setBedrockModel] = useState<BedrockModel>('us.anthropic.claude-sonnet-4-6');
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);

  useEffect(() => {
    if (!showForm) return;
    api.getProviderStatus().then(s => {
      setActiveProvider(s.activeProvider);
      if (s.activeModel?.includes('opus')) {
        setBedrockModel('us.anthropic.claude-opus-4-7');
      }
    });
  }, [showForm]);

  const handleStart = async () => {
    setSpawning(true);
    setError('');
    try {
      if (activeProvider === 'bedrock' || activeProvider === 'devstral') {
        await api.switchProvider(activeProvider, activeProvider === 'bedrock' ? bedrockModel : undefined);
        setActivity('chat');
        setShowForm(false);
        setSessionName('');
      } else {
        const name = sessionName.trim() || `${projectName}-session`;
        await spawnSession(projectId, name);
        setShowForm(false);
        setSessionName('');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSpawning(false);
    }
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="flex items-center rounded-xl transition-all hover:scale-[1.02]"
        style={{
          gap: 10,
          padding: '12px 24px',
          fontSize: 14,
          fontWeight: 700,
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
          boxShadow: '0 2px 8px rgba(34,211,238,0.25)',
        }}
      >
        <Play size={16} />
        Start Claude Code
      </button>
    );
  }

  const providerColor = activeProvider === 'bedrock'
    ? { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', text: '#fbbf24' }
    : activeProvider === 'devstral'
    ? { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', text: '#34d399' }
    : { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)', text: '#a78bfa' };

  const providerLabel = activeProvider === 'bedrock'
    ? (bedrockModel.includes('opus') ? 'Bedrock Opus 4.7' : 'Bedrock Sonnet 4.6')
    : activeProvider === 'devstral'
    ? 'Devstral 2 (Code Analysis)'
    : 'Claude Pro (CLI)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Row 1: session name + start + cancel */}
      <div className="flex items-center" style={{ gap: 10 }}>
        {activeProvider === 'claude-cli' && (
          <input
            type="text"
            value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            placeholder={`${projectName}-session`}
            className="rounded-xl outline-none"
            style={{
              width: 240,
              padding: '12px 18px',
              fontSize: 14,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleStart();
              if (e.key === 'Escape') setShowForm(false);
            }}
          />
        )}

        <button
          onClick={handleStart}
          disabled={spawning}
          className="flex items-center rounded-xl disabled:opacity-50"
          style={{
            gap: 8,
            padding: '12px 22px',
            fontSize: 14,
            fontWeight: 700,
            background: 'var(--accent)',
            color: 'var(--bg-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          <Play size={14} />
          {spawning ? 'Starting…'
            : activeProvider === 'bedrock' ? 'Start with Bedrock'
            : activeProvider === 'devstral' ? 'Start with Devstral'
            : 'Start'}
        </button>

        <button
          onClick={() => setShowForm(false)}
          className="flex items-center justify-center rounded-xl"
          style={{ width: 42, height: 42, background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Row 2: provider selector */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setProviderMenuOpen(o => !o)}
          className="flex items-center rounded-lg"
          style={{
            gap: 7,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            background: providerColor.bg,
            color: providerColor.text,
            border: `1px solid ${providerColor.border}`,
            cursor: 'pointer',
          }}
        >
          {activeProvider === 'bedrock' ? <Cloud size={12} /> : activeProvider === 'devstral' ? <Code2 size={12} /> : <Terminal size={12} />}
          {providerLabel}
          <ChevronDown size={11} />
        </button>

        {providerMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '4px 0',
              minWidth: 220,
              zIndex: 100,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {/* Claude CLI option */}
            <ProviderMenuOption
              icon={<Terminal size={13} />}
              label="Claude Pro (CLI)"
              sublabel="PTY terminal session"
              active={activeProvider === 'claude-cli'}
              onClick={() => { setActiveProvider('claude-cli'); setProviderMenuOpen(false); }}
            />

            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div style={{ padding: '2px 12px 4px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              AWS Bedrock
            </div>

            {BEDROCK_MODELS.map(m => (
              <ProviderMenuOption
                key={m.id}
                icon={<Cloud size={13} />}
                label={`Claude ${m.label}`}
                sublabel={`Bedrock · ${m.id.includes('opus') ? 'higher cost' : 'us-west-2'}`}
                active={activeProvider === 'bedrock' && bedrockModel === m.id}
                onClick={() => {
                  setActiveProvider('bedrock');
                  setBedrockModel(m.id);
                  setProviderMenuOpen(false);
                }}
              />
            ))}

            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div style={{ padding: '2px 12px 4px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Mistral AI (Bedrock)
            </div>
            <ProviderMenuOption
              icon={<Code2 size={13} />}
              label="Devstral 2 — 123B"
              sublabel="Code analysis · ON_DEMAND"
              active={activeProvider === 'devstral'}
              onClick={() => { setActiveProvider('devstral'); setProviderMenuOpen(false); }}
            />
          </div>
        )}
      </div>

      {error && <span style={{ fontSize: 13, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}

function ProviderMenuOption({
  icon, label, sublabel, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full"
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
      {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
    </button>
  );
}
