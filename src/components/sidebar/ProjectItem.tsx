import { useState } from 'react';
import type { Project } from '@/types/project';
import { formatRelativeTime } from '@/lib/utils';
import { useSessionStore } from '@/stores/session-store';
import { Folder, GitBranch, FolderOpen } from 'lucide-react';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  onClick: () => void;
}

export function ProjectItem({ project, isActive, onClick }: ProjectItemProps) {
  const hasIcon = project.icon && project.icon.length > 0;
  const [hovered, setHovered] = useState(false);
  const hasRunningSession = useSessionStore(s =>
    s.sessions.some(sess => sess.projectId === project.id && (sess.status === 'running' || sess.status === 'idle'))
  );

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    revealItemInDir(project.path);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/cortex-project-id', project.id);
    e.dataTransfer.setData('text/plain', project.name);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        position: 'relative',
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
              className="shrink-0 rounded-full pulse-dot"
              style={{
                width: 9,
                height: 9,
                background: 'var(--success)',
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

      {/* Open Folder button — visible on hover */}
      {hovered && (
        <div
          onClick={handleOpenFolder}
          title="Open project folder"
          className="flex items-center justify-center rounded-lg shrink-0 transition-colors"
          style={{
            width: 32,
            height: 32,
            marginTop: 4,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          <FolderOpen size={16} />
        </div>
      )}
    </button>
  );
}
