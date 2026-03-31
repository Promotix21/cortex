import { create } from 'zustand';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export type TerminalType = 'shell' | 'ai_session' | 'dev_server' | 'git';

export interface TerminalInfo {
  id: string;
  projectId: string;
  name: string;
  type: TerminalType;
  status: 'running' | 'stopped' | 'error';
  pid: number | null;
  createdAt: string;
}

interface TerminalStore {
  terminals: TerminalInfo[];
  activeTerminalId: string | null;

  setActiveTerminal: (id: string | null) => void;
  fetchTerminals: (projectId: string) => Promise<void>;
  spawnTerminal: (projectId: string, name: string, type?: TerminalType, command?: string) => Promise<TerminalInfo>;
  killTerminal: (id: string) => Promise<void>;
  renameTerminal: (id: string, name: string) => Promise<void>;
  restartTerminal: (id: string) => Promise<void>;
  clearTerminal: (id: string) => Promise<void>;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: [],
  activeTerminalId: null,

  setActiveTerminal: (id) => set({ activeTerminalId: id }),

  fetchTerminals: async (projectId) => {
    try {
      const data = await api.getTerminals(projectId);
      set({ terminals: data.terminals });
      // Auto-select first terminal for this project if current selection doesn't belong
      const { activeTerminalId } = get();
      const projectTerminals = data.terminals.filter((t: TerminalInfo) => t.projectId === projectId);
      const currentBelongsToProject = projectTerminals.some((t: TerminalInfo) => t.id === activeTerminalId);
      if (!currentBelongsToProject && projectTerminals.length > 0) {
        set({ activeTerminalId: projectTerminals[0].id });
      }
    } catch {
      // silent
    }
  },

  spawnTerminal: async (projectId, name, type = 'shell', command) => {
    try {
      const data = await api.spawnTerminal(projectId, name, type, command);
      const terminal = data.terminal;
      set(s => ({
        terminals: [...s.terminals, terminal],
        activeTerminalId: terminal.id,
      }));
      return terminal;
    } catch (err) {
      toast.error('Failed to spawn terminal', { description: err instanceof Error ? err.message : 'Unknown error' });
      throw err;
    }
  },

  killTerminal: async (id) => {
    try {
      await api.killTerminal(id);
      set(s => {
        const remaining = s.terminals.filter(t => t.id !== id);
        return {
          terminals: remaining,
          activeTerminalId: s.activeTerminalId === id
            ? (remaining[0]?.id ?? null)
            : s.activeTerminalId,
        };
      });
    } catch (err) {
      toast.error('Failed to kill terminal', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  renameTerminal: async (id, name) => {
    try {
      await api.renameTerminal(id, name);
      set(s => ({
        terminals: s.terminals.map(t => t.id === id ? { ...t, name } : t),
      }));
    } catch (err) {
      toast.error('Failed to rename terminal', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  restartTerminal: async (id) => {
    try {
      const data = await api.restartTerminal(id);
      const newTerminal = data.terminal;
      set(s => ({
        terminals: s.terminals.map(t => t.id === id ? newTerminal : t),
        activeTerminalId: s.activeTerminalId === id ? newTerminal.id : s.activeTerminalId,
      }));
    } catch (err) {
      toast.error('Failed to restart terminal', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  clearTerminal: async (id) => {
    await api.clearTerminal(id);
  },
}));
