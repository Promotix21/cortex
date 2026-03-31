import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { BudgetSettings } from '@/components/budget/BudgetSettings';
import { api } from '@/lib/api';
import {
  CheckCircle, XCircle, RefreshCw,
  Terminal, Shield, Database, Trash2, Loader2, Zap, Globe, Copy, Check, Sparkles,
  Server, Chrome, Wrench, Radio,
} from 'lucide-react';

export function SettingsPanel() {
  const {
    claudeStatus, loading, masterpieceMode,
    fetchSettings, checkClaudeStatus, toggleMasterpieceMode,
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
                <div className="flex items-center rounded-lg" style={{ gap: 10, padding: '10px 14px', background: 'var(--success-dim)', border: '1px solid rgba(166,227,161,0.3)' }}>
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
                <div className="rounded-lg" style={{ padding: '12px 16px', background: 'var(--accent-dim)', border: '1px solid rgba(137,180,250,0.3)' }}>
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
        </div>
      </div>

      {/* About — full width */}
      <div className="rounded-xl text-center" style={{ padding: '16px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Cortex v0.1.0</span>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)', marginLeft: 12 }}>AI Development Workspace — Built by Rajesh Kumar</span>
      </div>
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
