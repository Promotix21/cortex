import { create } from 'zustand';
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
      // Auto-select first terminal if none selected
      const { activeTerminalId } = get();
      if (!activeTerminalId && data.terminals.length > 0) {
        set({ activeTerminalId: data.terminals[0].id });
      }
    } catch {
      // silent
    }
  },

  spawnTerminal: async (projectId, name, type = 'shell', command) => {
    const data = await api.spawnTerminal(projectId, name, type, command);
    const terminal = data.terminal;
    set(s => ({
      terminals: [...s.terminals, terminal],
      activeTerminalId: terminal.id,
    }));
    return terminal;
  },

  killTerminal: async (id) => {
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
  },

  renameTerminal: async (id, name) => {
    await api.renameTerminal(id, name);
    set(s => ({
      terminals: s.terminals.map(t => t.id === id ? { ...t, name } : t),
    }));
  },

  restartTerminal: async (id) => {
    const data = await api.restartTerminal(id);
    const newTerminal = data.terminal;
    set(s => ({
      terminals: s.terminals.map(t => t.id === id ? newTerminal : t),
      activeTerminalId: s.activeTerminalId === id ? newTerminal.id : s.activeTerminalId,
    }));
  },

  clearTerminal: async (id) => {
    await api.clearTerminal(id);
  },
}));
