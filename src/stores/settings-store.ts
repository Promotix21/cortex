import { create } from 'zustand';
import { api } from '@/lib/api';

interface ClaudeStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
}

interface SettingsStore {
  settings: Record<string, string>;
  claudeStatus: ClaudeStatus;
  loading: boolean;
  error: string | null;
  masterpieceMode: boolean;

  fetchSettings: () => Promise<void>;
  saveSetting: (key: string, value: string) => Promise<void>;
  checkClaudeStatus: () => Promise<void>;
  validateApiKey: (apiKey: string) => Promise<{ valid: boolean; error?: string }>;
  toggleMasterpieceMode: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: {},
  claudeStatus: { installed: false, authenticated: false, version: null },
  loading: false,
  error: null,
  masterpieceMode: false,

  fetchSettings: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getSettings();
      set({
        settings: data.settings,
        masterpieceMode: data.settings.masterpiece_mode === 'true',
        loading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch settings';
      set({ error: message, loading: false });
    }
  },

  saveSetting: async (key: string, value: string) => {
    try {
      await api.saveSetting(key, value);
      const settings = { ...get().settings, [key]: value };
      set({ settings });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save setting';
      set({ error: message });
    }
  },

  checkClaudeStatus: async () => {
    try {
      const status = await api.checkClaudeStatus();
      set({ claudeStatus: status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to check Claude status';
      set({ error: message });
    }
  },

  validateApiKey: async (apiKey: string) => {
    try {
      const result = await api.validateApiKey(apiKey);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Validation failed';
      return { valid: false, error: message };
    }
  },

  toggleMasterpieceMode: async () => {
    const current = get().masterpieceMode;
    const newVal = !current;
    await api.saveSetting('masterpiece_mode', String(newVal));
    set({ masterpieceMode: newVal, settings: { ...get().settings, masterpiece_mode: String(newVal) } });
  },
}));
