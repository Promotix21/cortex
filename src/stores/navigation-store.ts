import { create } from 'zustand';

export type ActivityId = 'dashboard' | 'terminal' | 'sessions' | 'explorer' | 'git' | 'notes' | 'tasks' | 'brain' | 'mempalace' | 'chat' | 'studio' | 'documents' | 'settings' | 'shadow' | 'browser';

interface NavigationStore {
  activeActivity: ActivityId;
  viewingSessionId: string | null;
  setActivity: (id: ActivityId) => void;
  viewSession: (sessionId: string) => void;
  clearSessionView: () => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeActivity: 'dashboard',
  viewingSessionId: null,
  setActivity: (id) => {
    set({ activeActivity: id, viewingSessionId: null });
    // Sessions view is a cross-project grid — deselect any specific project so it
    // doesn't try to "focus" back on one project and flip the view to single-session.
    // Done async to avoid circular import with project-store.
    if (id === 'sessions') {
      import('./project-store').then(({ useProjectStore }) => {
        if (useProjectStore.getState().activeProjectId) {
          useProjectStore.getState().setActiveProject(null);
        }
      });
    }
  },
  viewSession: (sessionId) => set({ activeActivity: 'terminal', viewingSessionId: sessionId }),
  clearSessionView: () => set({ viewingSessionId: null }),
}));
