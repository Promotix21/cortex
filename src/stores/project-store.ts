import { create } from 'zustand';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@/types/project';
import { api } from '@/lib/api';

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

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
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

  setActiveProject: (id) => set({ activeProjectId: id }),

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getProjects();
      set({ projects: data.projects, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createProject: async (input) => {
    const data = await api.createProject(input);
    set(state => ({ projects: [data.project, ...state.projects] }));
    return data.project;
  },

  updateProject: async (id, input) => {
    const data = await api.updateProject(id, input);
    set(state => ({
      projects: state.projects.map(p => (p.id === id ? data.project : p)),
    }));
  },

  deleteProject: async (id) => {
    await api.deleteProject(id);
    set(state => ({
      projects: state.projects.filter(p => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    }));
  },
}));
