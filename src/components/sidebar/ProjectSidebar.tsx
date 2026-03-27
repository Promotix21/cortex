import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { ProjectItem } from './ProjectItem';
import { AddProjectDialog } from './AddProjectDialog';
import { Search, Plus, Brain } from 'lucide-react';

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
        width: 260,
        minWidth: 260,
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <Brain size={18} style={{ color: 'var(--accent)' }} />
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          Cortex
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setShowAddDialog(true)}
          className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
          title="Add project"
        >
          <Plus size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div
          className="flex items-center gap-2 px-2 py-1.5 rounded"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <Search size={14} style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-xs flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {loading && projects.length === 0 ? (
          <div className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
            Loading...
          </div>
        ) : projects.length === 0 ? (
          <div className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
            {searchQuery ? 'No matching projects' : 'No projects yet'}
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
        className="px-4 py-2 text-xs border-t"
        style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border)' }}
      >
        {projects.length} project{projects.length !== 1 ? 's' : ''}
      </div>

      {showAddDialog && <AddProjectDialog onClose={() => setShowAddDialog(false)} />}
    </aside>
  );
}
