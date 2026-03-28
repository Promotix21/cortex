import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useProjectStore } from '@/stores/project-store';
import { open } from '@tauri-apps/plugin-dialog';
import { Brain, CheckCircle, Circle, Copy, Check, FolderOpen, Loader2, ArrowRight } from 'lucide-react';

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { claudeStatus, checkClaudeStatus } = useSettingsStore();
  const { createProject, setActiveProject } = useProjectStore();
  const [copied, setCopied] = useState(false);
  const [projectPath, setProjectPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [adding, setAdding] = useState(false);

  // Poll claude status every 3 seconds
  useEffect(() => {
    checkClaudeStatus();
    const interval = setInterval(checkClaudeStatus, 3000);
    return () => clearInterval(interval);
  }, [checkClaudeStatus]);

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBrowse = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Select Project Folder' });
      if (selected && typeof selected === 'string') {
        setProjectPath(selected);
        setProjectName(selected.split('/').filter(Boolean).pop() || '');
      }
    } catch { /* cancelled */ }
  };

  const handleAddProject = async () => {
    if (!projectPath || !projectName) return;
    setAdding(true);
    try {
      const project = await createProject({ name: projectName, path: projectPath });
      setActiveProject(project.id);
      onComplete();
    } catch {
      setAdding(false);
    }
  };

  const step1Done = claudeStatus.installed;
  const step2Done = claudeStatus.authenticated;
  const step3Done = !!projectPath;
  const canFinish = step1Done && step2Done;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(12px)' }}
    >
      <div
        className="w-full rounded-2xl overflow-hidden"
        style={{
          maxWidth: 560,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-active)',
          boxShadow: '0 32px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(137, 180, 250, 0.1)',
        }}
      >
        {/* Header */}
        <div
          className="px-10 pt-10 pb-8 text-center"
          style={{ background: 'linear-gradient(180deg, rgba(137,180,250,0.08) 0%, transparent 100%)' }}
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{
              background: 'linear-gradient(135deg, rgba(137,180,250,0.2), rgba(137,180,250,0.05))',
              border: '1px solid rgba(137,180,250,0.2)',
            }}
          >
            <Brain size={40} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Welcome to Cortex
          </h1>
          <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
            Let's connect your Claude Max subscription.
          </p>
        </div>

        {/* Steps */}
        <div className="px-10 pb-4">
          {/* Step 1: Claude CLI */}
          <div
            className="rounded-xl px-6 py-5 mb-4"
            style={{
              background: step1Done ? 'var(--success-dim)' : 'var(--bg-surface)',
              border: `1px solid ${step1Done ? 'rgba(166,227,161,0.3)' : 'var(--border)'}`,
            }}
          >
            <div className="flex items-center gap-4">
              {step1Done ? (
                <CheckCircle size={24} style={{ color: 'var(--success)' }} />
              ) : (
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
              )}
              <div className="flex-1">
                <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  Claude CLI
                </div>
                <div className="text-sm mt-0.5" style={{ color: step1Done ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {step1Done
                    ? `Installed${claudeStatus.version ? ` — v${claudeStatus.version}` : ''}`
                    : 'Checking for Claude CLI...'}
                </div>
              </div>
            </div>
            {!step1Done && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Install the Claude Code CLI first:
                </p>
                <CopyableCommand
                  command="npm install -g @anthropic-ai/claude-code"
                  onCopy={handleCopy}
                  copied={copied}
                />
              </div>
            )}
          </div>

          {/* Step 2: Authentication */}
          <div
            className="rounded-xl px-6 py-5 mb-4"
            style={{
              background: step2Done ? 'var(--success-dim)' : step1Done ? 'var(--bg-surface)' : 'var(--bg-surface)',
              border: `1px solid ${step2Done ? 'rgba(166,227,161,0.3)' : 'var(--border)'}`,
              opacity: step1Done ? 1 : 0.5,
            }}
          >
            <div className="flex items-center gap-4">
              {step2Done ? (
                <CheckCircle size={24} style={{ color: 'var(--success)' }} />
              ) : step1Done ? (
                <Circle size={24} style={{ color: 'var(--accent)' }} />
              ) : (
                <Circle size={24} style={{ color: 'var(--text-tertiary)' }} />
              )}
              <div className="flex-1">
                <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  Claude Max Authentication
                </div>
                <div className="text-sm mt-0.5" style={{ color: step2Done ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {step2Done ? 'Connected to your Claude Max account' : 'Sign in with your Max subscription'}
                </div>
              </div>
            </div>
            {step1Done && !step2Done && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Run this in your terminal — it will open your browser to sign in:
                </p>
                <CopyableCommand command="claude login" onCopy={handleCopy} copied={copied} />
                <div className="flex items-center gap-2 mt-3">
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Waiting for you to sign in...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Step 3: First Project */}
          <div
            className="rounded-xl px-6 py-5 mb-4"
            style={{
              background: step3Done ? 'var(--accent-dim)' : 'var(--bg-surface)',
              border: `1px solid ${step3Done ? 'rgba(137,180,250,0.3)' : 'var(--border)'}`,
              opacity: canFinish ? 1 : 0.5,
            }}
          >
            <div className="flex items-center gap-4">
              {step3Done ? (
                <CheckCircle size={24} style={{ color: 'var(--accent)' }} />
              ) : (
                <Circle size={24} style={{ color: canFinish ? 'var(--accent)' : 'var(--text-tertiary)' }} />
              )}
              <div className="flex-1">
                <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  Add Your First Project
                </div>
                <div className="text-sm mt-0.5" style={{ color: step3Done ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {step3Done ? projectName : 'Choose a project folder to get started'}
                </div>
              </div>
              {canFinish && !step3Done && (
                <button
                  onClick={handleBrowse}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--bg-primary)',
                  }}
                >
                  <FolderOpen size={16} />
                  Browse
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-10 py-6"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onComplete}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Skip for now
          </button>

          <button
            onClick={step3Done ? handleAddProject : onComplete}
            disabled={!canFinish || adding}
            className="flex items-center gap-2 px-8 py-3 rounded-xl text-base font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: canFinish ? 'var(--accent)' : 'var(--bg-surface)',
              color: canFinish ? 'var(--bg-primary)' : 'var(--text-tertiary)',
              boxShadow: canFinish ? '0 4px 12px rgba(137,180,250,0.3)' : 'none',
            }}
          >
            {adding ? 'Setting up...' : step3Done ? 'Launch Cortex' : 'Get Started'}
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyableCommand({ command, onCopy, copied }: { command: string; onCopy: (cmd: string) => void; copied: boolean }) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-5 py-3.5"
      style={{
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
      }}
    >
      <code className="text-sm font-bold" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
        $ {command}
      </code>
      <button
        onClick={() => onCopy(command)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
        style={{
          background: copied ? 'var(--success-dim)' : 'var(--bg-hover)',
          color: copied ? 'var(--success)' : 'var(--text-secondary)',
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
