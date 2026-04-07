import { useEffect, useState, useMemo } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { useSessionStore } from '@/stores/session-store';
import { ProjectItem } from './ProjectItem';
import { AddProjectDialog } from './AddProjectDialog';
import { Search, Plus, FolderPlus, ChevronDown, ChevronRight } from 'lucide-react';
import type { Project } from '@/types/project';

/** Sort projects so those with active sessions come first, then by last_opened */
function sortWithActiveSessions(projects: Project[], activeProjectIds: Set<string>): Project[] {
  return [...projects].sort((a, b) => {
    const aActive = activeProjectIds.has(a.id) ? 1 : 0;
    const bActive = activeProjectIds.has(b.id) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return new Date(b.last_opened).getTime() - new Date(a.last_opened).getTime();
  });
}

function groupByCompany(projects: Project[], activeProjectIds: Set<string>): { company: string; projects: Project[] }[] {
  const groups = new Map<string, Project[]>();
  for (const p of projects) {
    const key = p.company || 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  // Sort projects within each group: active sessions first
  for (const [key, list] of groups) {
    groups.set(key, sortWithActiveSessions(list, activeProjectIds));
  }
  // Sort groups: those with active sessions first, then alphabetically, Unassigned last
  const entries = [...groups.entries()].sort((a, b) => {
    const aHasActive = a[1].some(p => activeProjectIds.has(p.id)) ? 1 : 0;
    const bHasActive = b[1].some(p => activeProjectIds.has(p.id)) ? 1 : 0;
    if (aHasActive !== bHasActive) return bHasActive - aHasActive;
    if (a[0] === 'Unassigned') return 1;
    if (b[0] === 'Unassigned') return -1;
    return a[0].localeCompare(b[0]);
  });
  return entries.map(([company, projects]) => ({ company, projects }));
}

export function ProjectSidebar() {
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
  const activeProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (s.status === 'running' || s.status === 'idle') ids.add(s.projectId);
    }
    return ids;
  }, [sessions]);

  const allProjects = filteredProjects();
  const projects = useMemo(() => sortWithActiveSessions(allProjects, activeProjectIds), [allProjects, activeProjectIds]);
  const hasCompanies = projects.some(p => p.company);
  const groups = useMemo(() => groupByCompany(allProjects, activeProjectIds), [allProjects, activeProjectIds]);

  const toggleGroup = (company: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(company)) next.delete(company);
      else next.add(company);
      return next;
    });
  };

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
        ) : hasCompanies ? (
          /* Grouped by company */
          groups.map(({ company, projects: groupProjects }) => (
            <div key={company} style={{ marginBottom: 8 }}>
              <button
                onClick={() => toggleGroup(company)}
                className="flex items-center w-full rounded-lg"
                style={{
                  padding: '8px 10px',
                  gap: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {collapsedGroups.has(company) ? (
                  <ChevronRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                ) : (
                  <ChevronDown size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                )}
                <span
                  className="font-bold uppercase tracking-wider"
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {company}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    opacity: 0.6,
                    marginLeft: 'auto',
                  }}
                >
                  {groupProjects.length}
                </span>
              </button>
              {!collapsedGroups.has(company) && (
                <div style={{ paddingLeft: 4 }}>
                  {groupProjects.map((project) => (
                    <ProjectItem
                      key={project.id}
                      project={project}
                      isActive={project.id === activeProjectId}
                      onClick={() => setActiveProject(project.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          /* Flat list (no companies assigned) */
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
        {hasCompanies && ` · ${groups.length} ${groups.length === 1 ? 'company' : 'companies'}`}
      </div>

      {showAddDialog && <AddProjectDialog onClose={() => setShowAddDialog(false)} />}
    </aside>
  );
}
