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
import { RemotionStudio } from '@/components/remotion/RemotionStudio';
import {
  LayoutDashboard, Terminal, GitBranch,
  MessageSquare, Brain, FolderOpen, Pencil,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';

export function WorkspaceTabs() {
  const activeActivity = useNavigationStore((s) => s.activeActivity);
  const viewingSessionId = useNavigationStore((s) => s.viewingSessionId);
  const setActivity = useNavigationStore((s) => s.setActivity);
  const activeProject = useProjectStore((s) => s.activeProject());

  // Settings doesn't need a project
  if (activeActivity === 'settings') {
    return (
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex-1 overflow-auto p-6">
          <SettingsPanel />
        </div>
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

  const fullHeightActivities = ['terminal', 'chat'];

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <div className={`flex-1 overflow-auto ${!fullHeightActivities.includes(activeActivity) ? '' : ''}`}
        style={{ padding: fullHeightActivities.includes(activeActivity) ? 0 : '28px 32px' }}
      >
        {activeActivity === 'dashboard' && <OverviewPanel project={activeProject} onNavigate={setActivity} />}
        {activeActivity === 'terminal' && (viewingSessionId ? <SessionTerminal sessionId={viewingSessionId} /> : <TerminalPanel />)}
        {activeActivity === 'git' && <GitPanel />}
        {activeActivity === 'notes' && <NotesAndTasksPanel />}
        {activeActivity === 'brain' && (
          <div className="space-y-6">
            <IntelligencePanel />
            <ReferencePanel />
            <ErrorPanel />
          </div>
        )}
        {activeActivity === 'chat' && <ChatPanel />}
        {activeActivity === 'studio' && <RemotionStudio />}
      </div>
    </div>
  );
}

function OverviewPanel({ project, onNavigate }: { project: any; onNavigate: (id: 'terminal' | 'chat' | 'git' | 'brain') => void }) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconInput, setIconInput] = useState(project.icon || '');
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
            background: 'linear-gradient(135deg, rgba(137,180,250,0.2), rgba(137,180,250,0.05))',
            border: '1px solid rgba(137,180,250,0.15)',
          }}
        >
          {hasIcon ? (
            project.icon.startsWith('http') || project.icon.startsWith('data:') ? (
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
      <div className="grid grid-cols-4" style={{ gap: 16, marginBottom: 32 }}>
        <InfoCard label="Type" value={project.type} accent="var(--accent)" />
        <InfoCard label="Status" value={project.status} accent="var(--success)" />
        <InfoCard label="Git" value={project.git_enabled ? 'Enabled' : 'Disabled'} accent={project.git_enabled ? 'var(--success)' : 'var(--text-tertiary)'} />
        <InfoCard label="Dev Port" value={project.dev_server_port || 'Not set'} accent="var(--warning)" />
      </div>

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
          <ActionChip label="Open Terminal" icon={Terminal} onClick={() => onNavigate('terminal')} />
          <ActionChip label="Start AI Chat" icon={MessageSquare} onClick={() => onNavigate('chat')} />
          <ActionChip label="View Git Status" icon={GitBranch} onClick={() => onNavigate('git')} />
          <ActionChip label="Edit Brain" icon={Brain} onClick={() => onNavigate('brain')} />
        </div>
      </div>
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

function NotesAndTasksPanel() {
  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      <NotesPanel />
      <TasksPanel />
    </div>
  );
}
