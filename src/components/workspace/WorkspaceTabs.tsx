import { useProjectStore } from '@/stores/project-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { ProjectSessions } from '@/components/sessions/ProjectSessions';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { NotesPanel } from './NotesPanel';
import { TasksPanel } from './TasksPanel';
import { GitPanel } from './GitPanel';
import { IntelligencePanel } from '@/components/intelligence/IntelligencePanel';
import { ErrorPanel } from '@/components/bridge/ErrorPanel';
import { ReferencePanel } from './ReferencePanel';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { SessionTerminal } from '@/components/sessions/SessionTerminal';
import { SessionGridPanel } from '@/components/sessions/SessionGridPanel';
import { RemotionStudio } from '@/components/remotion/RemotionStudio';
import { DocumentsPanel } from './DocumentsPanel';
import { ExplorerPanel } from '@/components/explorer/ExplorerPanel';
import { MemPalacePanel } from '@/components/mempalace/MemPalacePanel';
import { ShadowTerminalPanel } from '@/components/shadow/ShadowTerminalPanel';
import { BrowserPanel } from '@/components/browser/BrowserPanel';
import {
  LayoutDashboard, Terminal, GitBranch,
  MessageSquare, Brain, FolderOpen, Pencil, RefreshCw,
  CheckCircle, AlertTriangle, Code2, Database, Globe, Shield, CreditCard, Mail, HardDrive,
  FileText, Zap, Layers, Sparkles,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { Project } from '@/types/project';

export function WorkspaceTabs() {
  const activeActivity = useNavigationStore((s) => s.activeActivity);
  const viewingSessionId = useNavigationStore((s) => s.viewingSessionId);
  const setActivity = useNavigationStore((s) => s.setActivity);
  const activeProject = useProjectStore((s) => s.activeProject());

  // Settings and MemPalace don't need a project
  if (activeActivity === 'settings') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex-1 overflow-auto p-6">
          <SettingsPanel />
        </div>
      </div>
    );
  }

  if (activeActivity === 'mempalace') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex-1 overflow-auto" style={{ padding: '28px 32px' }}>
          <MemPalacePanel />
        </div>
      </div>
    );
  }

  // Browser panel works without a selected project
  if (activeActivity === 'browser') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <BrowserPanel />
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'var(--bg-surface)' }}
          >
            <FolderOpen size={36} style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p className="text-xl font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            No project selected
          </p>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Select a project from the sidebar or add a new one
          </p>
        </div>
      </div>
    );
  }

  const fullHeightActivities = ['terminal', 'sessions', 'chat', 'explorer', 'shadow', 'browser'];

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <div className={`flex-1 overflow-auto tab-content-enter`}
        key={activeActivity}
        style={{ padding: fullHeightActivities.includes(activeActivity) ? 0 : '28px 32px' }}
      >
        <ErrorBoundary fallbackLabel={`Error in ${activeActivity} panel`} key={activeActivity}>
          {activeActivity === 'dashboard' && <OverviewPanel project={activeProject} onNavigate={setActivity} />}
          {activeActivity === 'sessions' && <SessionGridPanel />}
          {activeActivity === 'terminal' && (viewingSessionId ? <SessionTerminal sessionId={viewingSessionId} /> : <TerminalPanel />)}
          {activeActivity === 'git' && <GitPanel />}
          {activeActivity === 'notes' && <NotesPanel />}
          {activeActivity === 'tasks' && <TasksPanel />}
          {activeActivity === 'brain' && (
            <div className="space-y-6">
              <IntelligencePanel />
              <ReferencePanel />
              <ErrorPanel />
            </div>
          )}
          {activeActivity === 'chat' && <ChatPanel />}
          {activeActivity === 'explorer' && <ExplorerPanel />}
          {activeActivity === 'documents' && <DocumentsPanel />}
          {activeActivity === 'studio' && <RemotionStudio />}
          {activeActivity === 'shadow' && <ShadowTerminalPanel />}
        </ErrorBoundary>
      </div>
    </div>
  );
}

function OverviewPanel({ project, onNavigate }: { project: Project; onNavigate: (id: 'terminal' | 'chat' | 'git' | 'brain') => void }) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconInput, setIconInput] = useState(project.icon || '');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [buildingMemory, setBuildingMemory] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState('');
  const { fetchProjects } = useProjectStore();

  const handleSaveIcon = async () => {
    await api.updateProjectIcon(project.id, iconInput);
    setShowIconPicker(false);
    fetchProjects();
  };

  const EMOJI_PRESETS = ['🚀', '⚡', '🧠', '🎯', '💎', '🔥', '🌐', '📱', '🎨', '🛠️', '📦', '🏗️', '🎮', '🤖', '💻', '🔒', '📊', '🌟', '🎵', '🛒'];

  const hasIcon = project.icon && project.icon.length > 0;

  return (
    <div>
      {/* Project Header */}
      <div className="flex items-center" style={{ gap: 20, marginBottom: 32 }}>
        <div
          className="flex items-center justify-center rounded-2xl relative cursor-pointer group"
          onClick={() => setShowIconPicker(!showIconPicker)}
          style={{
            width: 56,
            height: 56,
            background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(167,139,250,0.08))',
            border: '1px solid rgba(34,211,238,0.15)',
          }}
        >
          {hasIcon ? (
            project.icon!.startsWith('http') || project.icon!.startsWith('data:') ? (
              <img src={project.icon} alt="" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: 8 }} />
            ) : (
              <span style={{ fontSize: 28, lineHeight: 1 }}>{project.icon}</span>
            )
          ) : (
            <LayoutDashboard size={26} style={{ color: 'var(--accent)' }} />
          )}
          <div
            className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.5)' }}
          >
            <Pencil size={16} style={{ color: 'white' }} />
          </div>
        </div>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {project.name}
          </h2>
          <p style={{ fontSize: 14, marginTop: 4, color: 'var(--text-tertiary)' }}>
            {project.path}
          </p>
        </div>
      </div>

      {/* Icon Picker */}
      {showIconPicker && (
        <div
          className="rounded-xl"
          style={{ padding: '20px 24px', marginBottom: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12, color: 'var(--text-tertiary)' }}>
            Project Icon
          </div>
          {/* Emoji presets */}
          <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 16 }}>
            {EMOJI_PRESETS.map(emoji => (
              <button
                key={emoji}
                onClick={() => setIconInput(emoji)}
                className="rounded-lg transition-all"
                style={{
                  width: 40,
                  height: 40,
                  fontSize: 20,
                  background: iconInput === emoji ? 'var(--accent-dim)' : 'var(--bg-hover)',
                  border: iconInput === emoji ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          {/* Custom URL input */}
          <div className="flex" style={{ gap: 8 }}>
            <input
              type="text"
              value={iconInput}
              onChange={(e) => setIconInput(e.target.value)}
              placeholder="Emoji, URL, or data:image/..."
              className="flex-1 rounded-lg border bg-transparent"
              style={{
                padding: '10px 14px',
                fontSize: 14,
                color: 'var(--text-primary)',
                borderColor: 'var(--border)',
              }}
            />
            <button
              onClick={handleSaveIcon}
              className="rounded-lg font-semibold transition-colors"
              style={{
                padding: '10px 20px',
                fontSize: 14,
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setIconInput(''); handleSaveIcon(); }}
              className="rounded-lg font-semibold transition-colors"
              style={{
                padding: '10px 16px',
                fontSize: 14,
                background: 'var(--bg-hover)',
                color: 'var(--text-tertiary)',
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Info Cards Grid */}
      {/* Info Cards Grid */}
      {(() => {
        const cliTools: string[] = project.cli_tools ? JSON.parse(project.cli_tools) : [];
        const sshHosts: string[] = project.ssh_hosts ? JSON.parse(project.ssh_hosts) : [];
        return (
          <>
            <div className="grid grid-cols-4" style={{ gap: 16, marginBottom: 16 }}>
              <InfoCard label="Type" value={project.type} accent="var(--accent)" />
              <InfoCard label="Status" value={project.status} accent="var(--success)" />
              <InfoCard label="Git" value={project.git_enabled ? 'Enabled' : 'Disabled'} accent={project.git_enabled ? 'var(--success)' : 'var(--text-tertiary)'} />
              <InfoCard label="Dev Port" value={String(project.dev_server_port || 'Not set')} accent="var(--warning)" />
            </div>
            {(cliTools.length > 0 || project.ssh_configured || project.deploy_method) && (
              <div className="grid grid-cols-3" style={{ gap: 16, marginBottom: 32 }}>
                <InfoCard
                  label="CLI Tools"
                  value={cliTools.length > 0 ? cliTools.map(t => t.replace('-cli', '').replace(' (project detected)', '')).join(', ') : 'None'}
                  accent={cliTools.length > 0 ? 'var(--green)' : 'var(--text-tertiary)'}
                />
                <InfoCard
                  label="SSH"
                  value={project.ssh_configured ? `Active${sshHosts.length > 0 ? ' — ' + sshHosts[0] : ''}` : 'Not configured'}
                  accent={project.ssh_configured ? 'var(--green)' : 'var(--text-tertiary)'}
                />
                <InfoCard
                  label="Deploy"
                  value={project.deploy_method || 'Not configured'}
                  accent={project.deploy_method ? 'var(--accent)' : 'var(--text-tertiary)'}
                />
              </div>
            )}
          </>
        );
      })()}

      {/* Project Intelligence Summary */}
      <ProjectIntelligenceCard projectId={project.id} onNavigate={onNavigate} completionEstimate={project.completion_estimate} completionIndicators={project.completion_indicators} />

      {/* Claude Code Sessions */}
      <div style={{ marginBottom: 32 }}>
        <ProjectSessions projectId={project.id} projectName={project.name} />
      </div>

      {/* Quick Actions */}
      <div
        className="rounded-2xl"
        style={{ padding: '24px 28px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16, color: 'var(--text-tertiary)' }}>
          Quick Actions
        </h3>
        <div className="flex flex-wrap" style={{ gap: 12 }}>
          <ActionChip label={scanning ? 'Scanning...' : scanMessage || 'Scan & Build Brain'} icon={RefreshCw} onClick={async () => {
            if (scanning) return;
            setScanning(true);
            setScanMessage('');
            try {
              const result = await api.scanProject(project.id);
              await fetchProjects();
              const scan = result.scan;
              setScanMessage(`Scanned ${scan?.filesIndexed || 0} files`);
              setTimeout(() => setScanMessage(''), 4000);
            } catch {
              setScanMessage('Scan failed');
              setTimeout(() => setScanMessage(''), 3000);
            } finally {
              setScanning(false);
            }
          }} />
          <ActionChip label="Open Terminal" icon={Terminal} onClick={() => onNavigate('terminal')} />
          <ActionChip label="Start AI Chat" icon={MessageSquare} onClick={() => onNavigate('chat')} />
          <ActionChip label="View Git Status" icon={GitBranch} onClick={() => onNavigate('git')} />
          <ActionChip label="Edit Brain" icon={Brain} onClick={() => onNavigate('brain')} />
          <ActionChip label={buildingMemory ? 'Building...' : memoryMessage || 'Build Memory'} icon={Sparkles} onClick={async () => {
            if (buildingMemory) return;
            setBuildingMemory(true);
            setMemoryMessage('');
            try {
              const result = await api.buildMemory(project.id);
              setMemoryMessage(`${result.factsCreated} facts built`);
              setTimeout(() => setMemoryMessage(''), 4000);
            } catch {
              setMemoryMessage('Build failed');
              setTimeout(() => setMemoryMessage(''), 3000);
            } finally {
              setBuildingMemory(false);
            }
          }} />
        </div>
      </div>
    </div>
  );
}

// Feature icon mapping
const FEATURE_ICONS: Record<string, React.ElementType> = {
  'Authentication': Shield,
  'Payments': CreditCard,
  'Email': Mail,
  'File Storage': HardDrive,
};

function ProjectIntelligenceCard({ projectId, onNavigate, completionEstimate, completionIndicators }: {
  projectId: string;
  onNavigate: (id: 'brain') => void;
  completionEstimate: number | null;
  completionIndicators: string | null;
}) {
  const [brain, setBrain] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getProjectBrain(projectId).then((data: any) => {
      if (!cancelled) {
        setBrain(data.brain || data);
        setLoading(false);
      }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return (
      <div className="rounded-2xl" style={{ padding: '24px 28px', marginBottom: 32, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center" style={{ gap: 12 }}>
          <Zap size={18} className="animate-pulse" style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading project intelligence...</span>
        </div>
      </div>
    );
  }

  if (!brain || !brain.summary) {
    return (
      <div className="rounded-2xl" style={{ padding: '24px 28px', marginBottom: 32, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center" style={{ gap: 12 }}>
            <Brain size={20} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>No intelligence data yet</span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Click "Scan & Build Brain" below to analyze this project
          </span>
        </div>
      </div>
    );
  }

  // Parse brain data
  const summaryLines = (brain.summary || '').split('\n').filter((l: string) => l.trim());
  const archLines = (brain.architecture_notes || brain.architecture || '').split('\n').filter((l: string) => l.trim());

  // Extract features from summary
  const featuresLine = summaryLines.find((l: string) => l.startsWith('Features:'));
  const features = featuresLine ? featuresLine.replace('Features:', '').trim().split(',').map((f: string) => f.trim()) : [];

  // Extract stacks from architecture
  const stacks = archLines.filter((l: string) => l.startsWith('['));

  // Extract ports
  const portsLine = archLines.find((l: string) => l.startsWith('Ports:'));
  const ports = portsLine ? portsLine.replace('Ports:', '').trim().split(',').map((p: string) => p.trim()) : [];

  // Extract databases
  const dbLine = archLines.find((l: string) => l.startsWith('Databases:'));
  const databases = dbLine ? dbLine.replace('Databases:', '').trim().split(',').map((d: string) => d.trim()) : [];

  // Extract API route count
  const routeLine = archLines.find((l: string) => l.includes('API Routes'));
  const routeMatch = routeLine?.match(/\((\d+)\)/);
  const routeCount = routeMatch ? parseInt(routeMatch[1]) : 0;

  // Conventions
  const convLines = (brain.conventions || '').split('\n').filter((l: string) => l.trim());

  // Completion indicators
  let indicators: string[] = [];
  try {
    indicators = completionIndicators ? JSON.parse(completionIndicators) : [];
  } catch { /* */ }

  const completionColor = completionEstimate != null
    ? completionEstimate >= 80 ? 'var(--green)' : completionEstimate >= 50 ? 'var(--accent)' : 'var(--peach)'
    : 'var(--text-tertiary)';

  return (
    <div className="rounded-2xl" style={{ padding: '24px 28px', marginBottom: 32, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
        <div className="flex items-center" style={{ gap: 12 }}>
          <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: 'var(--accent-dim)' }}>
            <Brain size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              Project Intelligence
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Auto-generated from code analysis
            </span>
          </div>
        </div>
        <button
          onClick={() => onNavigate('brain')}
          className="rounded-lg transition-colors"
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--accent)', border: '1px solid var(--border)' }}
        >
          View Full Brain
        </button>
      </div>

      {/* Completion + Stacks Row */}
      <div className="flex" style={{ gap: 16, marginBottom: 20 }}>
        {/* Completion Ring */}
        {completionEstimate != null && (
          <div className="flex items-center rounded-xl" style={{ gap: 14, padding: '14px 18px', background: 'var(--bg-hover)', flex: '0 0 auto' }}>
            <div style={{ position: 'relative', width: 48, height: 48 }}>
              <svg width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--border)" strokeWidth="4" />
                <circle
                  cx="24" cy="24" r="20" fill="none"
                  stroke={completionColor}
                  strokeWidth="4"
                  strokeDasharray={`${(completionEstimate / 100) * 125.6} 125.6`}
                  strokeLinecap="round"
                  transform="rotate(-90 24 24)"
                />
              </svg>
              <span style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: completionColor,
              }}>
                {completionEstimate}%
              </span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Completion</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 140, lineHeight: 1.3 }}>
                {indicators.slice(0, 2).join(', ')}
              </div>
            </div>
          </div>
        )}

        {/* Architecture Stacks */}
        {stacks.length > 0 && (
          <div className="flex-1 rounded-xl" style={{ padding: '14px 18px', background: 'var(--bg-hover)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, color: 'var(--text-tertiary)' }}>
              Architecture
            </div>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {stacks.map((s: string, i: number) => (
                <span key={i} className="rounded-md" style={{
                  padding: '4px 10px', fontSize: 12, fontWeight: 600,
                  background: 'var(--bg-surface)', color: 'var(--accent)', border: '1px solid var(--border)',
                }}>
                  <Layers size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detected Features + Stats Row */}
      <div className="grid" style={{ gridTemplateColumns: features.length > 0 ? '1fr 1fr' : '1fr', gap: 16 }}>
        {/* Features */}
        {features.length > 0 && (
          <div className="rounded-xl" style={{ padding: '14px 18px', background: 'var(--bg-hover)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, color: 'var(--text-tertiary)' }}>
              Detected Features
            </div>
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {features.map((f: string) => {
                const FeatureIcon = FEATURE_ICONS[f] || CheckCircle;
                return (
                  <span key={f} className="flex items-center rounded-md" style={{
                    gap: 6, padding: '5px 12px', fontSize: 13, fontWeight: 600,
                    background: 'var(--bg-surface)', color: 'var(--green)', border: '1px solid rgba(52,211,153,0.2)',
                  }}>
                    <FeatureIcon size={14} />
                    {f}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="rounded-xl" style={{ padding: '14px 18px', background: 'var(--bg-hover)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, color: 'var(--text-tertiary)' }}>
            Code Stats
          </div>
          <div className="grid grid-cols-2" style={{ gap: 8 }}>
            {routeCount > 0 && (
              <StatPill icon={Globe} label="API Routes" value={String(routeCount)} />
            )}
            {databases.length > 0 && (
              <StatPill icon={Database} label="Databases" value={databases.join(', ')} />
            )}
            {ports.length > 0 && (
              <StatPill icon={Code2} label="Ports" value={ports.join(', ')} />
            )}
            {convLines.length > 0 && (
              <StatPill icon={FileText} label="Conventions" value={`${convLines.length} detected`} />
            )}
          </div>
        </div>
      </div>

      {/* Completion indicators (expandable) */}
      {indicators.length > 2 && (
        <div style={{ marginTop: 12 }}>
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            {indicators.map((ind, i) => {
              const isPositive = ind.includes('present') || ind.includes('No TODO') || ind.includes('No empty') || ind.includes('Tests present') || ind.includes('CI/CD');
              return (
                <span key={i} className="flex items-center rounded-md" style={{
                  gap: 4, padding: '3px 10px', fontSize: 11, fontWeight: 500,
                  background: isPositive ? 'rgba(52,211,153,0.08)' : 'rgba(250,179,135,0.08)',
                  color: isPositive ? 'var(--green)' : 'var(--peach)',
                }}>
                  {isPositive ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
                  {ind}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <Icon size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{label}:</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-xl"
      style={{ padding: '20px 22px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, color: 'var(--text-tertiary)' }}>
        {label}
      </div>
      <div className="capitalize" style={{ fontSize: 18, fontWeight: 700, color: accent }}>
        {value}
      </div>
    </div>
  );
}

function ActionChip({ label, icon: Icon, onClick }: { label: string; icon: React.ElementType; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center rounded-xl transition-all"
      style={{
        gap: 12,
        padding: '14px 22px',
        fontSize: 14,
        fontWeight: 600,
        background: 'var(--bg-hover)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <Icon size={20} style={{ color: 'var(--accent)' }} />
      {label}
    </button>
  );
}

