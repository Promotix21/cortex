import type { Project } from '@/types/project';
import { formatRelativeTime } from '@/lib/utils';
import { useSessionStore } from '@/stores/session-store';
import { Folder, GitBranch } from 'lucide-react';

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  onClick: () => void;
}

export function ProjectItem({ project, isActive, onClick }: ProjectItemProps) {
  const hasIcon = project.icon && project.icon.length > 0;
  const hasRunningSession = useSessionStore(s =>
    s.sessions.some(sess => sess.projectId === project.id && (sess.status === 'running' || sess.status === 'idle'))
  );

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
      {/* Project Icon/Logo */}
      <div
        className="flex items-center justify-center rounded-lg shrink-0 overflow-hidden"
        style={{
          width: 42,
          height: 42,
          marginTop: 1,
          background: isActive ? 'var(--accent-dim)' : 'var(--bg-hover)',
        }}
      >
        {hasIcon ? (
          // Support both emoji and URL icons
          project.icon!.startsWith('http') || project.icon!.startsWith('/') || project.icon!.startsWith('data:') ? (
            <img
              src={project.icon!}
              alt={project.name}
              style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }}
            />
          ) : (
            // Emoji icon
            <span style={{ fontSize: 22, lineHeight: 1 }}>{project.icon}</span>
          )
        ) : (
          <Folder
            size={22}
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }}
          />
        )}
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
          {hasRunningSession && (
            <span
              className="shrink-0 rounded-full"
              style={{
                width: 9,
                height: 9,
                background: 'var(--success)',
                boxShadow: '0 0 6px rgba(166, 227, 161, 0.5)',
              }}
              title="Active session running"
            />
          )}
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
          {project.completion_estimate != null && (
            <>
              <span style={{ color: 'var(--border-active)', fontSize: 10 }}>·</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: project.completion_estimate >= 80 ? 'var(--green)' :
                         project.completion_estimate >= 50 ? 'var(--accent)' : 'var(--peach)',
                }}
                title={project.completion_indicators ? JSON.parse(project.completion_indicators).join('\n') : ''}
              >
                ~{project.completion_estimate}%
              </span>
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
