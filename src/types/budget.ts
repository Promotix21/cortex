export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

export interface BudgetLimit {
  id: string;
  name: string;
  limitType: string;
  limitValue: number;
  warnAtPct: number;
  enabled: boolean;
  currentValue: number;
  pct: number;
  status: BudgetStatus;
}

export interface BudgetAlert {
  id: string;
  limitId: string;
  alertType: 'warning' | 'exceeded' | 'reset';
  currentValue: number;
  limitValue: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}
