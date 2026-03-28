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
        width: 280,
        minWidth: 280,
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Projects
        </span>
        <button
          onClick={() => setShowAddDialog(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
          title="Add project"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {loading && projects.length === 0 ? (
          <div className="text-sm text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
            Loading...
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-surface)' }}>
              <FolderPlus size={24} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              {searchQuery ? 'No matching projects' : 'No projects yet'}
            </p>
            <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
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
        className="px-5 py-3 text-xs font-medium border-t"
        style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border)' }}
      >
        {projects.length} project{projects.length !== 1 ? 's' : ''}
      </div>

      {showAddDialog && <AddProjectDialog onClose={() => setShowAddDialog(false)} />}
    </aside>
  );
}
