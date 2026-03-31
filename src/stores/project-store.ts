import { create } from 'zustand';
import { toast } from 'sonner';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/project';
import { api } from '@/lib/api';
import { useNavigationStore } from './navigation-store';

interface ProjectStore {
  projects: Project[];
  activeProjectId: string | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;

  // Computed
  activeProject: () => Project | null;
  filteredProjects: () => Project[];

  // Actions
  setSearchQuery: (query: string) => void;
  setActiveProject: (id: string | null) => void;
  fetchProjects: () => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  updateProject: (id: string, input: UpdateProjectInput) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

// Persist active project across restarts
const ACTIVE_PROJECT_KEY = 'cortex:activeProjectId';

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: localStorage.getItem(ACTIVE_PROJECT_KEY) || null,
  loading: false,
  error: null,
  searchQuery: '',

  activeProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find(p => p.id === activeProjectId) ?? null;
  },

  filteredProjects: () => {
    const { projects, searchQuery } = get();
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      p => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
    );
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  setActiveProject: (id) => {
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
    set({ activeProjectId: id });
    // Clear any open session view when switching projects
    useNavigationStore.getState().clearSessionView();
  },

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getProjects();
      const { activeProjectId } = get();
      // Auto-select first project if saved active doesn't exist in list
      const activeExists = data.projects.some(p => p.id === activeProjectId);
      const newActiveId = activeExists ? activeProjectId
        : data.projects.length > 0 ? data.projects[0].id : null;

      if (newActiveId && newActiveId !== activeProjectId) {
        localStorage.setItem(ACTIVE_PROJECT_KEY, newActiveId);
      }

      set({ projects: data.projects, loading: false, activeProjectId: newActiveId });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch projects', loading: false });
    }
  },

  createProject: async (input) => {
    try {
      const data = await api.createProject(input);
      set(state => ({ projects: [data.project, ...state.projects] }));
      toast.success(`Project "${input.name}" added`);
      return data.project;
    } catch (err) {
      toast.error('Failed to create project', { description: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  },

  updateProject: async (id, input) => {
    try {
      const data = await api.updateProject(id, input);
      set(state => ({
        projects: state.projects.map(p => (p.id === id ? data.project : p)),
      }));
    } catch (err) {
      toast.error('Failed to update project', { description: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  },

  deleteProject: async (id) => {
    try {
      await api.deleteProject(id);
      set(state => ({
        projects: state.projects.filter(p => p.id !== id),
        activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
      }));
      toast.success('Project deleted');
    } catch (err) {
      toast.error('Failed to delete project', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  },
}));
