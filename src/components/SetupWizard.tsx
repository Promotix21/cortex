import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { Brain, CheckCircle, XCircle, Copy, Check, FolderOpen, Loader2 } from 'lucide-react';

type Step = 1 | 2 | 3;

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { claudeStatus, checkClaudeStatus } = useSettingsStore();
  const [copied, setCopied] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [folderSelected, setFolderSelected] = useState(false);

  // Poll claude status every 3 seconds
  useEffect(() => {
    checkClaudeStatus();
    const interval = setInterval(checkClaudeStatus, 3000);
    return () => clearInterval(interval);
  }, [checkClaudeStatus]);

  // Auto-advance steps based on status
  useEffect(() => {
    if (claudeStatus.installed && currentStep === 1) {
      setCurrentStep(2);
    }
    if (claudeStatus.authenticated && currentStep === 2) {
      setCurrentStep(3);
    }
  }, [claudeStatus.installed, claudeStatus.authenticated, currentStep]);

  const canStart = claudeStatus.installed && claudeStatus.authenticated;

  const handleCopy = () => {
    navigator.clipboard.writeText('claude login');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFolderPick = () => {
    // In a real Tauri app this would use dialog.open()
    setFolderSelected(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="w-full max-w-xl rounded-2xl p-8"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'var(--accent-dim)' }}
          >
            <Brain size={32} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Welcome to Cortex
          </h1>
          <p className="text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
            Let's get you set up. This takes about 2 minutes.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4 mb-8">
          {/* Step 1: Claude CLI */}
          <StepCard
            number={1}
            title="Claude CLI"
            description={claudeStatus.installed
              ? `Installed${claudeStatus.version ? ` (v${claudeStatus.version})` : ''}`
              : 'Checking for Claude CLI installation...'}
            status={claudeStatus.installed ? 'complete' : 'pending'}
            active={currentStep === 1}
          />

          {/* Step 2: Authentication */}
          <StepCard
            number={2}
            title="Authentication"
            description={claudeStatus.authenticated
              ? 'Connected to Claude'
              : 'Run this command in your terminal to authenticate'}
            status={claudeStatus.authenticated ? 'complete' : currentStep >= 2 ? 'active' : 'pending'}
            active={currentStep === 2}
          >
            {!claudeStatus.authenticated && currentStep >= 2 && (
              <div className="mt-3">
                <div
                  className="flex items-center justify-between px-4 py-3 rounded-lg font-mono text-sm"
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    color: 'var(--accent)',
                  }}
                >
                  <span>claude login</span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors"
                    style={{
                      color: copied ? 'var(--success)' : 'var(--text-tertiary)',
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Waiting for authentication...
                  </span>
                </div>
              </div>
            )}
          </StepCard>

          {/* Step 3: First Project */}
          <StepCard
            number={3}
            title="Add your first project"
            description={folderSelected
              ? 'Project folder selected'
              : 'Choose a project folder to get started'}
            status={folderSelected ? 'complete' : currentStep >= 3 ? 'active' : 'pending'}
            active={currentStep === 3}
          >
            {!folderSelected && currentStep >= 3 && (
              <button
                onClick={handleFolderPick}
                className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <FolderOpen size={16} style={{ color: 'var(--accent)' }} />
                Choose Folder
              </button>
            )}
          </StepCard>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={onComplete}
            className="text-sm font-medium transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Skip for now
          </button>

          <button
            onClick={onComplete}
            disabled={!canStart}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: canStart ? 'var(--accent)' : 'var(--bg-surface)',
              color: canStart ? 'var(--bg-primary)' : 'var(--text-tertiary)',
              opacity: canStart ? 1 : 0.6,
              cursor: canStart ? 'pointer' : 'not-allowed',
            }}
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
  status,
  active,
  children,
}: {
  number: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'complete';
  active: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl px-5 py-4 transition-colors"
      style={{
        background: active ? 'var(--bg-surface)' : 'transparent',
        border: `1px solid ${active ? 'var(--border-active)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="mt-0.5">
          {status === 'complete' ? (
            <CheckCircle size={20} style={{ color: 'var(--success)' }} />
          ) : status === 'active' ? (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              {number}
            </div>
          ) : (
            <XCircle size={20} style={{ color: 'var(--text-tertiary)' }} />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {description}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}
