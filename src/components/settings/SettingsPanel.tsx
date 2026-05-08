import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSettingsStore } from '@/stores/settings-store';
import { BudgetSettings } from '@/components/budget/BudgetSettings';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { VaultPanel } from './VaultPanel';
import { api } from '@/lib/api';
import {
  CheckCircle, XCircle, RefreshCw,
  Terminal, Shield, Database, Trash2, Loader2, Zap, Globe, Copy, Check, Sparkles,
  Server, Chrome, Wrench, Radio, Brain, GitCommit, Cloud,
} from 'lucide-react';

export function SettingsPanel() {
  const {
    claudeStatus, loading, masterpieceMode,
    fetchSettings, checkClaudeStatus, toggleMasterpieceMode,
  } = useSettingsStore();

  const [copied, setCopied] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    fetchSettings();
    checkClaudeStatus();
  }, [fetchSettings, checkClaudeStatus]);

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearData = () => {
    setShowClearConfirm(true);
  };

  const executeClearData = async () => {
    setShowClearConfirm(false);
    try {
      await api.clearAllData();
      toast.success('All data cleared', { description: 'Cortex database has been wiped. Restart the app.' });
    } catch (err) {
      toast.error('Failed to clear data', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
          Settings
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
          Configure your Claude Max subscription, services, and preferences
        </p>
      </div>

      {loading && (
        <div className="flex items-center" style={{ gap: 12, marginBottom: 24, color: 'var(--text-tertiary)' }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: 14 }}>Loading settings...</span>
        </div>
      )}

      {/* 2-column grid layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Claude Max Subscription — compact */}
          <SectionCard title="Claude Max Subscription" icon={Zap} description="Uses Claude CLI — no API key needed">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <StatusRow icon={Terminal} label="Claude CLI" sub="Required for AI" ok={claudeStatus.installed} okLabel="Installed" failLabel="Not Installed" />
              <StatusRow icon={Shield} label="Authentication" sub="Max subscription" ok={claudeStatus.authenticated} okLabel="Connected" failLabel="Not Connected" />
              {claudeStatus.version && (
                <div className="flex items-center justify-between" style={{ padding: '6px 0' }}>
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <Globe size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Version</span>
                  </div>
                  <span className="font-mono rounded-lg" style={{ fontSize: 13, padding: '5px 12px', background: 'var(--bg-primary)', color: 'var(--accent)' }}>
                    {claudeStatus.version}
                  </span>
                </div>
              )}
              {claudeStatus.installed && claudeStatus.authenticated && (
                <div className="flex items-center rounded-lg" style={{ gap: 10, padding: '10px 14px', background: 'var(--success-dim)', border: '1px solid rgba(52,211,153,0.3)' }}>
                  <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>Ready to go</span>
                </div>
              )}
              {!claudeStatus.installed && (
                <div className="rounded-lg" style={{ padding: '12px 16px', background: 'var(--warning-dim)', border: '1px solid rgba(249,226,175,0.3)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warning)', marginBottom: 8 }}>Install Claude CLI</div>
                  <CommandBlock command="npm install -g @anthropic-ai/claude-code" onCopy={() => copyCommand('npm install -g @anthropic-ai/claude-code')} copied={copied} />
                </div>
              )}
              {claudeStatus.installed && !claudeStatus.authenticated && (
                <div className="rounded-lg" style={{ padding: '12px 16px', background: 'var(--accent-dim)', border: '1px solid rgba(34,211,238,0.3)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginBottom: 8 }}>Authenticate with Claude Max</div>
                  <CommandBlock command="claude login" onCopy={() => copyCommand('claude login')} copied={copied} />
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={() => checkClaudeStatus()} className="flex items-center rounded-lg" style={{ gap: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            </div>
          </SectionCard>

          {/* Masterpiece Mode */}
          <SectionCard title="Masterpiece Mode" icon={Sparkles} description="Award-worthy design rules in AI context">
            <div className="flex items-center justify-between">
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Enable</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Lenis, GSAP, Catppuccin, desktop-quality standards</div>
              </div>
              <button
                onClick={toggleMasterpieceMode}
                className="rounded-full transition-colors"
                style={{ width: 44, height: 24, padding: 3, background: masterpieceMode ? 'var(--accent)' : 'var(--bg-hover)', border: '1px solid var(--border)', position: 'relative', flexShrink: 0 }}
              >
                <div className="rounded-full transition-all" style={{ width: 16, height: 16, background: 'white', transform: masterpieceMode ? 'translateX(20px)' : 'translateX(0)' }} />
              </button>
            </div>
          </SectionCard>

          {/* Cortex Hooks for Claude Code */}
          <CortexHooksSection />

          {/* Data & Storage */}
          <SectionCard title="Data & Storage" icon={Database} description="All data stays on your machine">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <InfoRow label="Data Directory" value="~/.cortex/" />
              <InfoRow label="Database" value="cortex.db (35 tables)" />
              <InfoRow label="Privacy" value="Local only" accent="var(--success)" />
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <button onClick={handleClearData} className="flex items-center rounded-lg" style={{ gap: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'var(--error-dim)', color: 'var(--error)', border: '1px solid rgba(243,139,168,0.3)' }}>
                  <Trash2 size={14} /> Clear All Data
                </button>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Services & Integrations */}
          <ServicesPanel />

          {/* Budget Guard */}
          <SectionCard title="Budget Guard" icon={Shield} description="Rate limit alerts for Claude Max">
            <BudgetSettings />
          </SectionCard>

          {/* Vault */}
          <VaultPanel />
        </div>
      </div>

      {/* About — full width */}
      <div className="rounded-xl text-center" style={{ padding: '16px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Cortex v0.1.0</span>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)', marginLeft: 12 }}>AI Development Workspace — Built by Rajesh Kumar</span>
      </div>

      {/* Clear data confirmation dialog */}
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear All Data"
          message="This will permanently delete ALL Cortex data including projects, sessions, notes, brain data, and intelligence. This cannot be undone."
          confirmText="DELETE"
          confirmLabel="Delete Everything"
          destructive
          onConfirm={executeClearData}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cortex Hooks for Claude Code                                        */
/* ------------------------------------------------------------------ */

function CortexHooksSection() {
  const [status, setStatus] = useState<{ installed: boolean; events: string[] }>({ installed: false, events: [] });
  const [busy, setBusy] = useState(false);
  const [autoCommit, setAutoCommit] = useState(true);
  const [autoPush, setAutoPush] = useState(false);
  const [backfill, setBackfill] = useState<{
    state: string;
    sessionsProcessed: number;
    sessionsTotal: number;
    observationsCreated: number;
  } | null>(null);

  const refresh = async () => {
    try {
      const [hookStatus, settings, bf] = await Promise.all([
        api.getHookStatus(),
        api.getSettings(),
        api.getBackfillStatus(),
      ]);
      setStatus({ installed: hookStatus.installed, events: hookStatus.events });
      setAutoCommit(settings.settings.git_auto_commit !== 'false');
      setAutoPush(settings.settings.git_auto_push === 'true');
      setBackfill(bf);
    } catch { /* sidecar offline */ }
  };

  useEffect(() => { refresh(); }, []);

  const toggleHooks = async () => {
    setBusy(true);
    try {
      if (status.installed) {
        await api.uninstallHooks();
        toast.success('Cortex hooks removed from Claude Code');
      } else {
        await api.installHooks();
        toast.success('Cortex hooks installed', { description: 'Claude Code will now consult Cortex on prompts and tool calls.' });
      }
      await refresh();
    } catch (err) {
      toast.error('Hook update failed', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoCommit = async () => {
    const next = !autoCommit;
    setAutoCommit(next);
    await api.saveSetting('git_auto_commit', next ? 'true' : 'false');
  };

  const toggleAutoPush = async () => {
    const next = !autoPush;
    setAutoPush(next);
    await api.saveSetting('git_auto_push', next ? 'true' : 'false');
  };

  const startBackfill = async () => {
    try {
      await api.startBackfill();
      toast.success('Backfill started', { description: 'Processing historical sessions in the background.' });
      await refresh();
    } catch (err) {
      toast.error('Backfill failed to start', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  return (
    <SectionCard
      title="Claude Code Hooks"
      icon={Brain}
      description="Force Claude to consult Cortex on every prompt + auto-save fixes"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="flex items-center justify-between rounded-lg" style={{ padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Hook installation</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {status.installed
                ? `Active on ${status.events.join(', ')}`
                : 'Not installed — Claude is unaware of Cortex'}
            </div>
          </div>
          <button
            onClick={toggleHooks}
            disabled={busy}
            className="rounded-lg flex items-center"
            style={{
              gap: 8,
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 700,
              background: status.installed ? 'var(--bg-hover)' : 'var(--accent)',
              color: status.installed ? 'var(--text-secondary)' : 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {status.installed ? 'Remove' : 'Install'}
          </button>
        </div>

        <ToggleRow
          icon={GitCommit}
          label="Auto-commit on session end"
          sub="Commit files Claude touched, with WebXExpert co-author"
          checked={autoCommit}
          onChange={toggleAutoCommit}
        />

        <ToggleRow
          icon={Cloud}
          label="Auto-push after commit"
          sub="Push to remote after auto-commit (off by default — explicit opt-in)"
          checked={autoPush}
          onChange={toggleAutoPush}
        />

        {backfill && (
          <div className="rounded-lg" style={{ padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
                Historical backfill
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {backfill.state}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {backfill.sessionsTotal === 0
                ? 'No legacy sessions detected.'
                : `${backfill.sessionsProcessed}/${backfill.sessionsTotal} sessions · ${backfill.observationsCreated} observations created`}
            </div>
            {backfill.state !== 'running' && (
              <button
                onClick={startBackfill}
                className="rounded-lg"
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                {backfill.state === 'completed' ? 'Re-run' : 'Start backfill'}
              </button>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function ToggleRow({ icon: Icon, label, sub, checked, onChange }: {
  icon: React.ElementType; label: string; sub: string; checked: boolean; onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '6px 0' }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <Icon size={16} style={{ color: 'var(--text-tertiary)' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</div>
        </div>
      </div>
      <button
        onClick={onChange}
        className="rounded-full transition-colors"
        style={{
          width: 44,
          height: 24,
          padding: 3,
          background: checked ? 'var(--accent)' : 'var(--bg-hover)',
          border: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div
          className="rounded-full transition-all"
          style={{
            width: 16,
            height: 16,
            background: 'white',
            transform: checked ? 'translateX(20px)' : 'translateX(0)',
          }}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Services & Integrations                                             */
/* ------------------------------------------------------------------ */

function ServicesPanel() {
  const [sidecar, setSidecar] = useState<{ ok: boolean; sessions: number; terminals: number }>({ ok: false, sessions: 0, terminals: 0 });
  const [mcp, setMcp] = useState<{ running: boolean; tools: any[] }>({ running: false, tools: [] });
  const [bridge, setBridge] = useState<{ connected: boolean }>({ connected: false });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    const [h, m, b] = await Promise.all([
      api.health().catch(() => null),
      api.mcpStatus().catch(() => ({ running: false, tools: [] })),
      api.bridgeStatus().catch(() => ({ connected: false })),
    ]);
    if (h) setSidecar({ ok: true, sessions: h.activeSessions, terminals: h.activeTerminals });
    else setSidecar({ ok: false, sessions: 0, terminals: 0 });
    setMcp(m);
    setBridge(b);
    setRefreshing(false);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <SectionCard title="Services & Integrations" icon={Radio} description="Live status of all connected services">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <StatusRow icon={Server} label="Express Sidecar" sub={`Port 4700 · ${sidecar.sessions} sessions · ${sidecar.terminals} terminals`} ok={sidecar.ok} okLabel="Running" failLabel="Offline" />
        <StatusRow icon={Wrench} label="MCP Server" sub={`Port 4710 · ${mcp.tools.length} tools`} ok={mcp.running} okLabel="Running" failLabel="Offline" />
        <StatusRow icon={Chrome} label="Chrome Console Bridge" sub="Browser error capture" ok={bridge.connected} okLabel="Connected" failLabel="Not Connected" />

        {/* MCP Tools List */}
        {mcp.running && mcp.tools.length > 0 && (
          <div className="rounded-lg" style={{ padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              MCP Tools
            </div>
            <div className="flex flex-wrap" style={{ gap: 4 }}>
              {mcp.tools.map((t: any) => (
                <span key={t.name} className="rounded" style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, background: 'var(--bg-surface)', color: 'var(--accent)', border: '1px solid var(--border)' }} title={t.description}>
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button onClick={refresh} disabled={refreshing} className="flex items-center rounded-lg" style={{ gap: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SectionCard({ title, icon: Icon, description, children }: {
  title: string; icon: React.ElementType; description: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl" style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center" style={{ gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <div className="rounded-lg flex items-center justify-center" style={{ width: 36, height: 36, background: 'var(--accent-dim)' }}>
          <Icon size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function StatusRow({ icon: Icon, label, sub, ok, okLabel, failLabel }: {
  icon: React.ElementType; label: string; sub: string; ok: boolean; okLabel: string; failLabel: string;
}) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '6px 0' }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <Icon size={16} style={{ color: 'var(--text-tertiary)' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</div>
        </div>
      </div>
      <span className="inline-flex items-center rounded-full" style={{ gap: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, background: ok ? 'var(--success-dim)' : 'var(--error-dim)', color: ok ? 'var(--success)' : 'var(--error)' }}>
        {ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
        {ok ? okLabel : failLabel}
      </span>
    </div>
  );
}

function CommandBlock({ command, onCopy, copied }: { command: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg" style={{ padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      <code className="font-mono" style={{ fontSize: 13, color: 'var(--text-primary)' }}>$ {command}</code>
      <button onClick={onCopy} className="rounded" style={{ padding: 6, color: 'var(--text-tertiary)' }}>
        {copied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '4px 0' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
      <span className="font-mono rounded-lg" style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-primary)', color: accent || 'var(--text-secondary)' }}>{value}</span>
    </div>
  );
}
