import { create } from 'zustand';

export type ActivityId = 'dashboard' | 'terminal' | 'git' | 'notes' | 'brain' | 'chat' | 'settings';

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
  setActivity: (id) => set({ activeActivity: id, viewingSessionId: null }),
  viewSession: (sessionId) => set({ activeActivity: 'terminal', viewingSessionId: sessionId }),
  clearSessionView: () => set({ viewingSessionId: null }),
}));
