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
      className="w-full text-left rounded-xl transition-all"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '14px 16px',
        marginBottom: 4,
        background: isActive ? 'var(--bg-surface)' : 'transparent',
        border: isActive ? '1px solid var(--border-active)' : '1px solid transparent',
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
      }}
    >
      {/* Folder Icon */}
      <div
        className="flex items-center justify-center rounded-lg shrink-0"
        style={{
          width: 42,
          height: 42,
          marginTop: 1,
          background: isActive ? 'var(--accent-dim)' : 'var(--bg-hover)',
        }}
      >
        <Folder
          size={22}
          style={{ color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }}
        />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
          <span
            className="truncate"
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {project.name}
          </span>
          <span
            className="shrink-0 rounded-full"
            style={{
              width: 9,
              height: 9,
              background: getStatusColor(project.status),
            }}
          />
        </div>
        <div className="flex items-center" style={{ gap: 6 }}>
          <span
            className="capitalize"
            style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)' }}
          >
            {project.type}
          </span>
          {project.git_enabled && (
            <>
              <span style={{ color: 'var(--border-active)', fontSize: 10 }}>·</span>
              <GitBranch size={13} style={{ color: 'var(--text-tertiary)' }} />
            </>
          )}
          <span style={{ color: 'var(--border-active)', fontSize: 10 }}>·</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {formatRelativeTime(project.last_opened)}
          </span>
        </div>
      </div>
    </button>
  );
}
