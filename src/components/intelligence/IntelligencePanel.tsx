import { useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { BrainEditor } from './BrainEditor';
import { PatternList } from './PatternList';
import { DebugList } from './DebugList';
import { Brain, Puzzle, Bug } from 'lucide-react';

type IntelTab = 'brain' | 'patterns' | 'debug';

export function IntelligencePanel() {
  const project = useProjectStore(s => s.activeProject());
  const [activeTab, setActiveTab] = useState<IntelTab>('brain');

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        <p className="text-xs">Select a project to manage intelligence</p>
      </div>
    );
  }

  const tabs: { id: IntelTab; label: string; icon: React.ElementType }[] = [
    { id: 'brain', label: 'Project Brain', icon: Brain },
    { id: 'patterns', label: 'Patterns', icon: Puzzle },
    { id: 'debug', label: 'Debug Memory', icon: Bug },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 mb-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              background: activeTab === id ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              border: activeTab === id ? '1px solid var(--border)' : '1px solid transparent',
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'brain' && <BrainEditor projectId={project.id} />}
        {activeTab === 'patterns' && <PatternList projectId={project.id} />}
        {activeTab === 'debug' && <DebugList projectId={project.id} />}
      </div>
    </div>
  );
}
