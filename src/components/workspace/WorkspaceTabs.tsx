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
import { LayoutDashboard, Terminal, GitBranch, FileText, MessageSquare, Brain, Book, AlertTriangle } from 'lucide-react';

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
          <p className="text-lg font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
            No project selected
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Select a project from the sidebar or add a new one
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Tab Bar */}
      <div
        className="flex items-center border-b px-2"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs transition-colors relative"
            style={{
              color: activeTab === id ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            <Icon size={13} />
            {label}
            {activeTab === id && (
              <div
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        ))}

        {/* Project name in tab bar */}
        <div className="flex-1" />
        <span className="text-xs px-3" style={{ color: 'var(--text-tertiary)' }}>
          {activeProject.name}
        </span>
      </div>

      {/* Tab Content */}
      <div className={`flex-1 overflow-auto ${activeTab !== 'terminal' && activeTab !== 'chat' ? 'p-4' : ''}`}>
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
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        {project.name}
      </h2>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <InfoCard label="Path" value={project.path} />
        <InfoCard label="Type" value={project.type} />
        <InfoCard label="Status" value={project.status} />
        <InfoCard label="Git" value={project.git_enabled ? 'Enabled' : 'Disabled'} />
      </div>

      {/* Claude Code Sessions — THE feature */}
      <div className="mb-4">
        <ProjectSessions projectId={project.id} projectName={project.name} />
      </div>

      <div
        className="rounded-lg p-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
          Quick Actions
        </h3>
        <div className="flex gap-2 flex-wrap">
          <ActionChip label="Open Terminal" />
          <ActionChip label="Start AI Chat" />
          <ActionChip label="View Git Status" />
          <ActionChip label="Edit Brain" />
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </div>
      <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function ActionChip({ label }: { label: string }) {
  return (
    <button
      className="px-3 py-1.5 rounded text-xs transition-colors"
      style={{
        background: 'var(--bg-hover)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
      }}
    >
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
