import { useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { ProjectSessions } from '@/components/sessions/ProjectSessions';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { NotesPanel } from './NotesPanel';
import { TasksPanel } from './TasksPanel';
import { GitPanel } from './GitPanel';
import { IntelligencePanel } from '@/components/intelligence/IntelligencePanel';
import { ErrorPanel } from '@/components/bridge/ErrorPanel';
import { ReferencePanel } from './ReferencePanel';
import {
  LayoutDashboard, Terminal, GitBranch, FileText,
  MessageSquare, Brain, Book, AlertTriangle, FolderOpen,
} from 'lucide-react';

type Tab = 'overview' | 'terminal' | 'git' | 'notes' | 'intelligence' | 'reference' | 'errors' | 'chat';

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'notes', label: 'Notes', icon: FileText },
  { id: 'intelligence', label: 'Brain', icon: Brain },
  { id: 'reference', label: 'Reference', icon: Book },
  { id: 'errors', label: 'Errors', icon: AlertTriangle },
  { id: 'chat', label: 'AI Chat', icon: MessageSquare },
];

export function WorkspaceTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const activeProject = useProjectStore(s => s.activeProject());

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'var(--bg-surface)' }}>
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

  const fullHeightTabs = ['terminal', 'chat'];

  return (
    <div className="flex-1 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Tab Bar */}
      <div
        className="flex items-center border-b px-1"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === id ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            <Icon size={16} />
            {label}
            {activeTab === id && (
              <div
                className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        ))}

        <div className="flex-1" />
        <span className="text-sm px-4 font-medium" style={{ color: 'var(--text-tertiary)' }}>
          {activeProject.name}
        </span>
      </div>

      {/* Tab Content */}
      <div className={`flex-1 overflow-auto ${!fullHeightTabs.includes(activeTab) ? 'p-6' : ''}`}>
        {activeTab === 'overview' && <OverviewPanel project={activeProject} />}
        {activeTab === 'terminal' && <TerminalPanel />}
        {activeTab === 'git' && <GitPanel />}
        {activeTab === 'notes' && <NotesAndTasksPanel />}
        {activeTab === 'intelligence' && <IntelligencePanel />}
        {activeTab === 'reference' && <ReferencePanel />}
        {activeTab === 'errors' && <ErrorPanel />}
        {activeTab === 'chat' && <ChatPanel />}
      </div>
    </div>
  );
}

function OverviewPanel({ project }: { project: any }) {
  return (
    <div>
      {/* Project Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
          <LayoutDashboard size={22} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {project.name}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {project.path}
          </p>
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <InfoCard label="Type" value={project.type} accent="var(--accent)" />
        <InfoCard label="Status" value={project.status} accent="var(--success)" />
        <InfoCard label="Git" value={project.git_enabled ? 'Enabled' : 'Disabled'} accent={project.git_enabled ? 'var(--success)' : 'var(--text-tertiary)'} />
        <InfoCard label="Dev Port" value={project.dev_server_port || 'Not set'} accent="var(--warning)" />
      </div>

      {/* Claude Code Sessions */}
      <div className="mb-6">
        <ProjectSessions projectId={project.id} projectName={project.name} />
      </div>

      {/* Quick Actions */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Quick Actions
        </h3>
        <div className="flex gap-3 flex-wrap">
          <ActionChip label="Open Terminal" icon={Terminal} />
          <ActionChip label="Start AI Chat" icon={MessageSquare} />
          <ActionChip label="View Git Status" icon={GitBranch} />
          <ActionChip label="Edit Brain" icon={Brain} />
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </div>
      <div className="text-base font-semibold capitalize" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function ActionChip({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <button
      className="flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors hover:border-[var(--accent)]"
      style={{
        background: 'var(--bg-hover)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <Icon size={16} style={{ color: 'var(--accent)' }} />
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
