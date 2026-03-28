import { create } from 'zustand';

export type ActivityId = 'dashboard' | 'terminal' | 'git' | 'notes' | 'brain' | 'chat' | 'settings';

interface NavigationStore {
  activeActivity: ActivityId;
  setActivity: (id: ActivityId) => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  activeActivity: 'dashboard',
  setActivity: (id) => set({ activeActivity: id }),
}));
