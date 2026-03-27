import type { Project } from '@/types/project';
import { formatRelativeTime, getStatusColor } from '@/lib/utils';
import { Folder, GitBranch } from 'lucide-react';

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  onClick: () => void;
}

export function ProjectItem({ project, isActive, onClick }: ProjectItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-md mb-0.5 transition-colors flex items-start gap-2.5"
      style={{
        background: isActive ? 'var(--bg-surface)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      <Folder
        size={15}
        className="mt-0.5 shrink-0"
        style={{ color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-xs font-medium truncate"
            style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {project.name}
          </span>
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ background: getStatusColor(project.status) }}
          />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {project.git_enabled && (
            <GitBranch size={10} style={{ color: 'var(--text-tertiary)' }} />
          )}
          <span className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
            {formatRelativeTime(project.last_opened)}
          </span>
        </div>
      </div>
    </button>
  );
}
