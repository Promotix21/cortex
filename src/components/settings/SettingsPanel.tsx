import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import {
  CheckCircle, XCircle, RefreshCw,
  Terminal, Shield, Database, Trash2, Loader2, Zap, Globe, Copy, Check,
} from 'lucide-react';

export function SettingsPanel() {
  const {
    claudeStatus, loading,
    fetchSettings, checkClaudeStatus,
  } = useSettingsStore();

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSettings();
    checkClaudeStatus();
  }, [fetchSettings, checkClaudeStatus]);

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearData = async () => {
    const confirmed = window.confirm(
      'This will clear ALL Cortex data including projects, sessions, notes, and brain data. This cannot be undone. Continue?'
    );
    if (!confirmed) return;
    // TODO: call clear endpoint
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Configure your Claude Max subscription connection and Cortex preferences
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-3 mb-6" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading settings...</span>
        </div>
      )}

      {/* Claude Max Subscription */}
      <SectionCard
        title="Claude Max Subscription"
        icon={Zap}
        description="Cortex uses your Claude Max plan through the Claude CLI — no API key needed"
      >
        <div className="space-y-5">
          {/* How it works explanation */}
          <div
            className="rounded-lg px-4 py-3"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Cortex connects to Claude through the <strong style={{ color: 'var(--text-primary)' }}>Claude Code CLI</strong>,
              which uses your Claude Max subscription (browser-based OAuth). No API keys or credit card billing —
              everything runs through your existing Max plan.
            </p>
          </div>

          {/* CLI Installation Status */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Terminal size={18} style={{ color: 'var(--text-secondary)' }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Claude CLI
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Required for all AI features
                </div>
              </div>
            </div>
            <StatusBadge
              ok={claudeStatus.installed}
              labelOk="Installed"
              labelFail="Not Installed"
            />
          </div>

          {/* Auth Status */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Shield size={18} style={{ color: 'var(--text-secondary)' }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Authentication
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Claude Max subscription login
                </div>
              </div>
            </div>
            <StatusBadge
              ok={claudeStatus.authenticated}
              labelOk="Connected"
              labelFail="Not Connected"
            />
          </div>

          {/* Version */}
          {claudeStatus.version && (
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Globe size={18} style={{ color: 'var(--text-secondary)' }} />
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Version
                </div>
              </div>
              <span
                className="text-sm font-mono px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--bg-primary)', color: 'var(--accent)' }}
              >
                {claudeStatus.version}
              </span>
            </div>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Install Instructions */}
          {!claudeStatus.installed && (
            <div
              className="rounded-xl px-5 py-4"
              style={{ background: 'var(--warning-dim)', border: '1px solid rgba(249, 226, 175, 0.3)' }}
            >
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--warning)' }}>
                Step 1: Install Claude CLI
              </div>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                Open a terminal and run:
              </p>
              <CommandBlock
                command="npm install -g @anthropic-ai/claude-code"
                onCopy={() => copyCommand('npm install -g @anthropic-ai/claude-code')}
                copied={copied}
              />
            </div>
          )}

          {/* Auth Instructions */}
          {claudeStatus.installed && !claudeStatus.authenticated && (
            <div
              className="rounded-xl px-5 py-4"
              style={{ background: 'var(--accent-dim)', border: '1px solid rgba(137, 180, 250, 0.3)' }}
            >
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>
                {!claudeStatus.installed ? 'Step 2' : 'Step 1'}: Authenticate with Claude Max
              </div>
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                This will open your browser to sign in with your Claude Max account:
              </p>
              <CommandBlock
                command="claude login"
                onCopy={() => copyCommand('claude login')}
                copied={copied}
              />
              <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
                After signing in, click "Refresh Status" below to verify the connection.
              </p>
            </div>
          )}

          {/* All Good State */}
          {claudeStatus.installed && claudeStatus.authenticated && (
            <div
              className="rounded-xl px-5 py-4 flex items-center gap-4"
              style={{ background: 'var(--success-dim)', border: '1px solid rgba(166, 227, 161, 0.3)' }}
            >
              <CheckCircle size={24} style={{ color: 'var(--success)' }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
                  Ready to go
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Claude Max subscription is connected. All AI features are available.
                </p>
              </div>
            </div>
          )}

          {/* Refresh Button */}
          <div className="flex justify-end">
            <button
              onClick={() => checkClaudeStatus()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <RefreshCw size={15} />
              Refresh Status
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Data & Storage */}
      <SectionCard title="Data & Storage" icon={Database} description="Local storage — all data stays on your machine">
        <div className="space-y-5">
          <InfoRow
            label="Data Directory"
            description="Where Cortex stores its database"
            value="~/.cortex/"
          />
          <InfoRow
            label="Database"
            description="SQLite database file (31 tables)"
            value="cortex.db"
          />
          <InfoRow
            label="Privacy"
            description="No telemetry, no cloud sync, no data collection"
            value="Local only"
            accent="var(--success)"
          />

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <div>
            <button
              onClick={handleClearData}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: 'var(--error-dim)',
                color: 'var(--error)',
                border: '1px solid rgba(243, 139, 168, 0.3)',
              }}
            >
              <Trash2 size={15} />
              Clear All Data
            </button>
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Removes all projects, sessions, notes, brain data, and settings. Cannot be undone.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* About */}
      <div
        className="rounded-xl px-5 py-4 mb-8 text-center"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Cortex v0.1.0
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          AI Development Workspace — Built by Rajesh Kumar
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SectionCard({
  title, icon: Icon, description, children,
}: {
  title: string; icon: React.ElementType; description: string; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl px-6 py-6 mb-5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--accent-dim)' }}
        >
          <Icon size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {description}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ ok, labelOk, labelFail }: { ok: boolean; labelOk: string; labelFail: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold"
      style={{
        background: ok ? 'var(--success-dim)' : 'var(--error-dim)',
        color: ok ? 'var(--success)' : 'var(--error)',
      }}
    >
      {ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
      {ok ? labelOk : labelFail}
    </span>
  );
}

function CommandBlock({ command, onCopy, copied }: { command: string; onCopy: () => void; copied: boolean }) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-4 py-3"
      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
    >
      <code className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
        $ {command}
      </code>
      <button
        onClick={onCopy}
        className="p-1.5 rounded-md transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {copied ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

function InfoRow({
  label, description, value, accent,
}: {
  label: string; description: string; value: string; accent?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {description}
        </div>
      </div>
      <span
        className="text-sm font-mono px-3 py-1.5 rounded-lg"
        style={{ background: 'var(--bg-primary)', color: accent || 'var(--text-secondary)' }}
      >
        {value}
      </span>
    </div>
  );
}
