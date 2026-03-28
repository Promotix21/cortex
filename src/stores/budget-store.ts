import { create } from 'zustand';
import { api } from '@/lib/api';

interface BudgetLimit {
  id: string;
  name: string;
  limitType: string;
  limitValue: number;
  warnAtPct: number;
  enabled: boolean;
  currentValue: number;
  pct: number;
  status: 'ok' | 'warning' | 'exceeded';
}

interface BudgetAlert {
  id: string;
  limitId: string;
  alertType: 'warning' | 'exceeded' | 'reset';
  currentValue: number;
  limitValue: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

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
    await api.updateBudgetLimit(id, fields);
    const data = await api.getBudgetStatus();
    set({ limits: data.limits });
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
