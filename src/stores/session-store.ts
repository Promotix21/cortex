import { create } from 'zustand';
import { toast } from 'sonner';
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
  deleteSession: (id: string) => Promise<void>;
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
    try {
      const data = await api.spawnSession(projectId, name);
      const session = data.session;
      set(s => ({
        sessions: [session, ...s.sessions],
        activeSessions: [session, ...s.activeSessions],
      }));
      toast.success('Session started');
      return session;
    } catch (err) {
      toast.error('Failed to start session', { description: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  },

  stopSession: async (id) => {
    try {
      await api.stopSession(id);
      set(s => ({
        activeSessions: s.activeSessions.filter(sess => sess.id !== id),
        sessions: s.sessions.map(sess =>
          sess.id === id ? { ...sess, status: 'completed' as const } : sess
        ),
      }));
    } catch (err) {
      toast.error('Failed to stop session', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  killSession: async (id) => {
    try {
      await api.killSession(id);
      set(s => ({
        activeSessions: s.activeSessions.filter(sess => sess.id !== id),
        sessions: s.sessions.map(sess =>
          sess.id === id ? { ...sess, status: 'completed' as const } : sess
        ),
      }));
    } catch (err) {
      toast.error('Failed to kill session', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  deleteSession: async (id) => {
    try {
      await api.deleteSession(id);
      set(s => ({
        sessions: s.sessions.filter(sess => sess.id !== id),
        activeSessions: s.activeSessions.filter(sess => sess.id !== id),
      }));
    } catch (err) {
      toast.error('Failed to delete session', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  toggleDashboard: () => set(s => ({ dashboardOpen: !s.dashboardOpen })),
  setDashboardOpen: (open) => set({ dashboardOpen: open }),
}));
