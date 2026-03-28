import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { ProjectItem } from './ProjectItem';
import { AddProjectDialog } from './AddProjectDialog';
import { Search, Plus, FolderPlus } from 'lucide-react';

export function ProjectSidebar() {
  const {
    filteredProjects,
    fetchProjects,
    searchQuery,
    setSearchQuery,
    activeProjectId,
    setActiveProject,
    loading,
  } = useProjectStore();

  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const projects = filteredProjects();

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
      </div>

      {showAddDialog && <AddProjectDialog onClose={() => setShowAddDialog(false)} />}
    </aside>
  );
}
