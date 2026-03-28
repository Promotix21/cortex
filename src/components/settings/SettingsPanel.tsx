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
      <div style={{ marginBottom: 32 }}>
        <h1 className="text-2xl font-bold" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>
          Settings
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
          Configure your Claude Max subscription connection and Cortex preferences
        </p>
      </div>

      {loading && (
        <div className="flex items-center" style={{ gap: 12, marginBottom: 24, color: 'var(--text-tertiary)' }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: 14 }}>Loading settings...</span>
        </div>
      )}

      {/* Claude Max Subscription */}
      <SectionCard
        title="Claude Max Subscription"
        icon={Zap}
        description="Cortex uses your Claude Max plan through the Claude CLI — no API key needed"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* How it works explanation */}
          <div
            className="rounded-xl"
            style={{ padding: '16px 20px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
          >
            <p className="leading-relaxed" style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Cortex connects to Claude through the <strong style={{ color: 'var(--text-primary)' }}>Claude Code CLI</strong>,
              which uses your Claude Max subscription (browser-based OAuth). No API keys or credit card billing —
              everything runs through your existing Max plan.
            </p>
          </div>

          {/* CLI Installation Status */}
          <div className="flex items-center justify-between" style={{ padding: '10px 0' }}>
            <div className="flex items-center" style={{ gap: 12 }}>
              <Terminal size={18} style={{ color: 'var(--text-secondary)' }} />
              <div>
                <div className="font-semibold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  Claude CLI
                </div>
                <div style={{ fontSize: 13, marginTop: 2, color: 'var(--text-tertiary)' }}>
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
          <div className="flex items-center justify-between" style={{ padding: '10px 0' }}>
            <div className="flex items-center" style={{ gap: 12 }}>
              <Shield size={18} style={{ color: 'var(--text-secondary)' }} />
              <div>
                <div className="font-semibold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  Authentication
                </div>
                <div style={{ fontSize: 13, marginTop: 2, color: 'var(--text-tertiary)' }}>
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
            <div className="flex items-center justify-between" style={{ padding: '10px 0' }}>
              <div className="flex items-center" style={{ gap: 12 }}>
                <Globe size={18} style={{ color: 'var(--text-secondary)' }} />
                <div className="font-semibold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  Version
                </div>
              </div>
              <span
                className="font-mono rounded-lg"
                style={{ fontSize: 14, padding: '8px 16px', background: 'var(--bg-primary)', color: 'var(--accent)' }}
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
              className="rounded-xl"
              style={{ padding: '20px 24px', background: 'var(--warning-dim)', border: '1px solid rgba(249, 226, 175, 0.3)' }}
            >
              <div className="font-semibold" style={{ fontSize: 14, marginBottom: 10, color: 'var(--warning)' }}>
                Step 1: Install Claude CLI
              </div>
              <p style={{ fontSize: 14, marginBottom: 14, color: 'var(--text-secondary)' }}>
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
              className="rounded-xl"
              style={{ padding: '20px 24px', background: 'var(--accent-dim)', border: '1px solid rgba(137, 180, 250, 0.3)' }}
            >
              <div className="font-semibold" style={{ fontSize: 14, marginBottom: 10, color: 'var(--accent)' }}>
                {!claudeStatus.installed ? 'Step 2' : 'Step 1'}: Authenticate with Claude Max
              </div>
              <p style={{ fontSize: 14, marginBottom: 14, color: 'var(--text-secondary)' }}>
                This will open your browser to sign in with your Claude Max account:
              </p>
              <CommandBlock
                command="claude login"
                onCopy={() => copyCommand('claude login')}
                copied={copied}
              />
              <p style={{ fontSize: 13, marginTop: 14, color: 'var(--text-tertiary)' }}>
                After signing in, click "Refresh Status" below to verify the connection.
              </p>
            </div>
          )}

          {/* All Good State */}
          {claudeStatus.installed && claudeStatus.authenticated && (
            <div
              className="rounded-xl flex items-center"
              style={{ padding: '20px 24px', gap: 16, background: 'var(--success-dim)', border: '1px solid rgba(166, 227, 161, 0.3)' }}
            >
              <CheckCircle size={24} style={{ color: 'var(--success)' }} />
              <div>
                <div className="font-semibold" style={{ fontSize: 14, color: 'var(--success)' }}>
                  Ready to go
                </div>
                <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-secondary)' }}>
                  Claude Max subscription is connected. All AI features are available.
                </p>
              </div>
            </div>
          )}

          {/* Refresh Button */}
          <div className="flex justify-end">
            <button
              onClick={() => checkClaudeStatus()}
              className="flex items-center rounded-xl font-medium transition-colors"
              style={{
                gap: 10,
                padding: '12px 24px',
                fontSize: 14,
                background: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <RefreshCw size={16} />
              Refresh Status
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Data & Storage */}
      <SectionCard title="Data & Storage" icon={Database} description="Local storage — all data stays on your machine">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
              className="flex items-center rounded-xl font-semibold transition-colors"
              style={{
                gap: 10,
                padding: '12px 24px',
                fontSize: 14,
                background: 'var(--error-dim)',
                color: 'var(--error)',
                border: '1px solid rgba(243, 139, 168, 0.3)',
              }}
            >
              <Trash2 size={16} />
              Clear All Data
            </button>
            <p style={{ fontSize: 13, marginTop: 10, color: 'var(--text-tertiary)' }}>
              Removes all projects, sessions, notes, brain data, and settings. Cannot be undone.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* About */}
      <div
        className="rounded-xl text-center"
        style={{ padding: '20px 24px', marginBottom: 32, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <p className="font-semibold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          Cortex v0.1.0
        </p>
        <p style={{ fontSize: 13, marginTop: 6, color: 'var(--text-tertiary)' }}>
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
      className="rounded-xl"
      style={{ padding: 24, marginBottom: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center" style={{ gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <div
          className="rounded-lg flex items-center justify-center"
          style={{ width: 40, height: 40, background: 'var(--accent-dim)' }}
        >
          <Icon size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
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
      className="inline-flex items-center rounded-full font-semibold"
      style={{
        gap: 8,
        padding: '8px 18px',
        fontSize: 14,
        background: ok ? 'var(--success-dim)' : 'var(--error-dim)',
        color: ok ? 'var(--success)' : 'var(--error)',
      }}
    >
      {ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
      {ok ? labelOk : labelFail}
    </span>
  );
}

function CommandBlock({ command, onCopy, copied }: { command: string; onCopy: () => void; copied: boolean }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl"
      style={{ padding: '14px 20px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
    >
      <code className="font-mono" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
        $ {command}
      </code>
      <button
        onClick={onCopy}
        className="rounded-lg transition-colors"
        style={{ padding: 8, color: 'var(--text-tertiary)' }}
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
    <div className="flex items-center justify-between" style={{ padding: '6px 0' }}>
      <div>
        <div className="font-semibold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          {label}
        </div>
        <div style={{ fontSize: 13, marginTop: 2, color: 'var(--text-tertiary)' }}>
          {description}
        </div>
      </div>
      <span
        className="font-mono rounded-lg"
        style={{ fontSize: 14, padding: '8px 16px', background: 'var(--bg-primary)', color: accent || 'var(--text-secondary)' }}
      >
        {value}
      </span>
    </div>
  );
}
