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
      className="w-full text-left px-3.5 py-3 rounded-lg mb-1 transition-all flex items-start gap-3"
      style={{
        background: isActive ? 'var(--bg-surface)' : 'transparent',
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: isActive ? 'var(--accent-dim)' : 'var(--bg-hover)',
        }}
      >
        <Folder
          size={18}
          style={{ color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium truncate"
            style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {project.name}
          </span>
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ background: getStatusColor(project.status) }}
          />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
            {project.type}
          </span>
          {project.git_enabled && (
            <>
              <span style={{ color: 'var(--border)' }}>·</span>
              <GitBranch size={12} style={{ color: 'var(--text-tertiary)' }} />
            </>
          )}
          <span style={{ color: 'var(--border)' }}>·</span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {formatRelativeTime(project.last_opened)}
          </span>
        </div>
      </div>
    </button>
  );
}
