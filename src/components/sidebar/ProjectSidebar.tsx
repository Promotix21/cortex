import { useEffect, useMemo } from 'react';
import { useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { useSessionStore } from '@/stores/session-store';
import { ProjectItem } from './ProjectItem';
import { AddProjectDialog } from './AddProjectDialog';
import { RecentSessions } from './RecentSessions';
import { Search, Plus, FolderPlus, X, LayoutGrid } from 'lucide-react';
import type { Project } from '@/types/project';

import { useNavigationStore } from '@/stores/navigation-store';

/** Sort projects so those with active sessions come first, then by last_opened */
function sortWithActiveSessions(projects: Project[], activeProjectIds: Set<string>): Project[] {
  return [...projects].sort((a, b) => {
    const aActive = activeProjectIds.has(a.id) ? 1 : 0;
    const bActive = activeProjectIds.has(b.id) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return new Date(b.last_opened).getTime() - new Date(a.last_opened).getTime();
  });
}


export function ProjectSidebar() {
  const setActivity = useNavigationStore(s => s.setActivity);
  const {
    filteredProjects,
    fetchProjects,
    searchQuery,
    setSearchQuery,
    activeProjectId,
    setActiveProject,
    loading,
    projects: storeProjects,
    error,
  } = useProjectStore();

  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Retry if projects failed to load (sidecar may have been slow to start from app menu)
  useEffect(() => {
    if (loading || storeProjects.length > 0 || !error) return;
    const timer = setTimeout(() => fetchProjects(), 3000);
    return () => clearTimeout(timer);
  }, [loading, storeProjects.length, error, fetchProjects]);

  const sessions = useSessionStore(s => s.sessions);
  const activeSessions = useSessionStore(s => s.activeSessions);
  const activeProjectIds = useMemo(() => {
    const ids = new Set<string>();
    // Combine both session sources for robustness
    for (const s of [...sessions, ...activeSessions]) {
      if (s.status === 'running' || s.status === 'idle') ids.add(s.projectId);
    }
    return ids;
  }, [sessions, activeSessions]);

  const allProjects = filteredProjects();
  const projects = useMemo(
    () => sortWithActiveSessions(allProjects, activeProjectIds),
    [allProjects, activeProjectIds]
  );

  return (
    <aside
      className="flex flex-col h-full border-r"
      style={{
        width: 300,
        minWidth: 300,
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b"
        style={{
          padding: '18px 20px',
          borderColor: 'var(--border)',
        }}
      >
        <span
          className="font-bold uppercase tracking-widest"
          style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-tertiary)' }}
        >
          Projects
        </span>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center justify-center rounded-lg transition-all hover:scale-105"
          style={{
            width: 34,
            height: 34,
            background: 'var(--accent)',
            color: 'var(--bg-primary)',
          }}
          title="Add project"
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '14px 16px' }}>
        <div
          className="flex items-center rounded-lg"
          style={{
            padding: '10px 14px',
            gap: 10,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
          }}
        >
          <Search size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none flex-1"
            style={{ fontSize: 14, color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* All Projects (grid / multi-session) toggle */}
      <div style={{ padding: '0 12px 6px 12px' }}>
        <button
          onClick={() => { setActiveProject(null); setActivity('sessions'); }}
          className="flex items-center w-full rounded-lg transition-colors"
          style={{
            gap: 10,
            padding: '10px 12px',
            fontSize: 13,
            fontWeight: 600,
            background: activeProjectId === null ? 'var(--accent-dim)' : 'transparent',
            color: activeProjectId === null ? 'var(--accent)' : 'var(--text-secondary)',
            border: '1px solid',
            borderColor: activeProjectId === null ? 'var(--accent)' : 'var(--border)',
          }}
          title="Show all active sessions across projects"
        >
          <LayoutGrid size={14} />
          <span className="flex-1 text-left">All Projects</span>
          {activeProjectIds.size > 0 && (
            <span
              className="rounded-full"
              style={{
                padding: '1px 8px',
                fontSize: 11,
                fontWeight: 700,
                background: activeProjectId === null ? 'var(--accent)' : 'var(--bg-surface)',
                color: activeProjectId === null ? 'var(--bg-primary)' : 'var(--text-tertiary)',
              }}
            >
              {activeProjectIds.size}
            </span>
          )}
          {activeProjectId !== null && (
            <X size={12} style={{ color: 'var(--text-tertiary)' }} />
          )}
        </button>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '4px 12px' }}>
        {loading && projects.length === 0 ? (
          <div className="text-center" style={{ padding: '48px 16px', fontSize: 14, color: 'var(--text-tertiary)' }}>
            Loading...
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ padding: '60px 24px' }}>
            <div
              className="flex items-center justify-center rounded-2xl"
              style={{ width: 64, height: 64, marginBottom: 20, background: 'var(--bg-surface)' }}
            >
              <FolderPlus size={28} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
              {searchQuery ? 'No matching projects' : 'No projects yet'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              {searchQuery ? 'Try a different search' : 'Click + to add your first project'}
            </p>
          </div>
        ) : (
          projects.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              isActive={project.id === activeProjectId}
              onClick={() => setActiveProject(project.id)}
            />
          ))
        )}
      </div>

      {/* Recent Sessions */}
      <RecentSessions />

      {/* Footer */}
      <div
        className="border-t"
        style={{
          padding: '12px 20px',
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-tertiary)',
          borderColor: 'var(--border)',
        }}
      >
        {projects.length} project{projects.length !== 1 ? 's' : ''}
        {activeProjectIds.size > 0 && ` · ${activeProjectIds.size} active`}
      </div>

      {showAddDialog && <AddProjectDialog onClose={() => setShowAddDialog(false)} />}
    </aside>
  );
}
