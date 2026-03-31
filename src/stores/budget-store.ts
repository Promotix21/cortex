import { create } from 'zustand';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { BudgetLimit, BudgetAlert } from '@/types/budget';

interface BudgetStore {
  limits: BudgetLimit[];
  alerts: BudgetAlert[];
  loading: boolean;

  fetchStatus: () => Promise<void>;
  updateLimit: (id: string, fields: Partial<BudgetLimit>) => Promise<void>;
  acknowledgeAlert: (id: string) => Promise<void>;
  acknowledgeAll: () => Promise<void>;
}

export const useBudgetStore = create<BudgetStore>((set) => ({
  limits: [],
  alerts: [],
  loading: false,

  fetchStatus: async () => {
    set({ loading: true });
    try {
      const data = await api.getBudgetStatus();
      set({ limits: data.limits, alerts: data.alerts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  updateLimit: async (id, fields) => {
    try {
      await api.updateBudgetLimit(id, fields);
      const data = await api.getBudgetStatus();
      set({ limits: data.limits });
      toast.success('Budget limit updated');
    } catch (err) {
      toast.error('Failed to update budget limit', { description: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  acknowledgeAlert: async (id) => {
    await api.acknowledgeBudgetAlert(id);
    set(state => ({
      alerts: state.alerts.filter(a => a.id !== id),
    }));
  },

  acknowledgeAll: async () => {
    await api.acknowledgeBudgetAlertAll();
    set({ alerts: [] });
  },
}));
