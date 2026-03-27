import { create } from 'zustand';
import type { Session, UsageSummary } from '@/types/session';
import { api } from '@/lib/api';

interface SessionStore {
  sessions: Session[];
  activeSessions: Session[];
  usage: UsageSummary | null;
  loading: boolean;
  dashboardOpen: boolean;

  // Actions
  fetchSessions: (projectId?: string) => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
  fetchUsage: () => Promise<void>;
  spawnSession: (projectId: string, name: string) => Promise<Session>;
  stopSession: (id: string) => Promise<void>;
  killSession: (id: string) => Promise<void>;
  toggleDashboard: () => void;
  setDashboardOpen: (open: boolean) => void;
}

export const useSessionStore = create<SessionStore>((set, _get) => ({
  sessions: [],
  activeSessions: [],
  usage: null,
  loading: false,
  dashboardOpen: false,

  fetchSessions: async (projectId) => {
    set({ loading: true });
    try {
      const data = await api.getSessions(projectId);
      set({ sessions: data.sessions, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchActiveSessions: async () => {
    try {
      const data = await api.getActiveSessions();
      set({ activeSessions: data.sessions });
    } catch {
      // silent
    }
  },

  fetchUsage: async () => {
    try {
      const data = await api.getUsageSummary();
      set({ usage: data });
    } catch {
      // silent
    }
  },

  spawnSession: async (projectId, name) => {
    const data = await api.spawnSession(projectId, name);
    const session = data.session;
    set(s => ({
      sessions: [session, ...s.sessions],
      activeSessions: [session, ...s.activeSessions],
    }));
    return session;
  },

  stopSession: async (id) => {
    await api.stopSession(id);
    set(s => ({
      activeSessions: s.activeSessions.filter(sess => sess.id !== id),
      sessions: s.sessions.map(sess =>
        sess.id === id ? { ...sess, status: 'completed' as const } : sess
      ),
    }));
  },

  killSession: async (id) => {
    await api.killSession(id);
    set(s => ({
      activeSessions: s.activeSessions.filter(sess => sess.id !== id),
      sessions: s.sessions.map(sess =>
        sess.id === id ? { ...sess, status: 'completed' as const } : sess
      ),
    }));
  },

  toggleDashboard: () => set(s => ({ dashboardOpen: !s.dashboardOpen })),
  setDashboardOpen: (open) => set({ dashboardOpen: open }),
}));
