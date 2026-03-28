import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';

export interface BudgetLimit {
  id: string;
  name: string;
  limitType: 'messages_per_5h' | 'hours_per_7d' | 'tokens_per_day' | 'sessions_per_day';
  limitValue: number;
  warnAtPct: number;
  enabled: boolean;
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

export interface BudgetStatus {
  limits: (BudgetLimit & { currentValue: number; pct: number; status: 'ok' | 'warning' | 'exceeded' })[];
  alerts: BudgetAlert[];
}

/**
 * Seed default Claude Max rate limits if none exist
 */
export function seedDefaultLimits(): void {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM budget_limits').get() as any).cnt;
  if (count > 0) return;

  const defaults: Omit<BudgetLimit, 'id'>[] = [
    { name: 'Opus messages per 5 hours', limitType: 'messages_per_5h', limitValue: 45, warnAtPct: 0.8, enabled: true },
    { name: 'Usage hours per 7 days', limitType: 'hours_per_7d', limitValue: 167, warnAtPct: 0.8, enabled: true },
    { name: 'Tokens per day', limitType: 'tokens_per_day', limitValue: 500000, warnAtPct: 0.8, enabled: true },
    { name: 'Sessions per day', limitType: 'sessions_per_day', limitValue: 20, warnAtPct: 0.8, enabled: true },
  ];

  const stmt = db.prepare(`
    INSERT INTO budget_limits (id, name, limit_type, limit_value, warn_at_pct, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const d of defaults) {
    stmt.run(uuid(), d.name, d.limitType, d.limitValue, d.warnAtPct, d.enabled ? 1 : 0);
  }
}

/**
 * Calculate current usage for a given limit type
 */
function getCurrentUsage(limitType: string): number {
  const db = getDb();
  const now = new Date();

  switch (limitType) {
    case 'messages_per_5h': {
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
      const row = db.prepare(`
        SELECT COUNT(*) as cnt FROM session_history WHERE timestamp > ?
      `).get(fiveHoursAgo) as any;
      return row.cnt || 0;
    }
    case 'hours_per_7d': {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const row = db.prepare(`
        SELECT COALESCE(SUM(sm.duration_seconds), 0) as total
        FROM session_metrics sm
        JOIN claude_sessions cs ON cs.id = sm.session_id
        WHERE cs.started_at > ?
      `).get(sevenDaysAgo) as any;
      return (row.total || 0) / 3600; // Convert to hours
    }
    case 'tokens_per_day': {
      const today = now.toISOString().split('T')[0];
      const row = db.prepare(`
        SELECT COALESCE(SUM(token_total), 0) as total FROM usage_daily WHERE date = ?
      `).get(today) as any;
      return row.total || 0;
    }
    case 'sessions_per_day': {
      const today = now.toISOString().split('T')[0];
      const row = db.prepare(`
        SELECT COUNT(*) as cnt FROM claude_sessions WHERE started_at >= ?
      `).get(today + 'T00:00:00') as any;
      return row.cnt || 0;
    }
    default:
      return 0;
  }
}

/**
 * Check all budget limits and create alerts if needed
 */
export function checkBudgets(): BudgetStatus {
  const db = getDb();
  seedDefaultLimits();

  const limits = db.prepare(
    'SELECT * FROM budget_limits WHERE enabled = 1'
  ).all() as any[];

  const results: BudgetStatus['limits'] = [];

  for (const limit of limits) {
    const currentValue = getCurrentUsage(limit.limit_type);
    const pct = limit.limit_value > 0 ? currentValue / limit.limit_value : 0;
    let status: 'ok' | 'warning' | 'exceeded' = 'ok';

    if (pct >= 1.0) {
      status = 'exceeded';
      createAlertIfNew(limit.id, 'exceeded', currentValue, limit.limit_value,
        `Budget exceeded: ${limit.name} (${Math.round(pct * 100)}%)`);
    } else if (pct >= limit.warn_at_pct) {
      status = 'warning';
      createAlertIfNew(limit.id, 'warning', currentValue, limit.limit_value,
        `Budget warning: ${limit.name} at ${Math.round(pct * 100)}%`);
    }

    results.push({
      id: limit.id,
      name: limit.name,
      limitType: limit.limit_type,
      limitValue: limit.limit_value,
      warnAtPct: limit.warn_at_pct,
      enabled: !!limit.enabled,
      currentValue,
      pct,
      status,
    });
  }

  // Get recent unacknowledged alerts
  const alerts = db.prepare(`
    SELECT * FROM budget_alerts WHERE acknowledged = 0 ORDER BY created_at DESC LIMIT 20
  `).all() as any[];

  return {
    limits: results,
    alerts: alerts.map(a => ({
      id: a.id,
      limitId: a.limit_id,
      alertType: a.alert_type,
      currentValue: a.current_value,
      limitValue: a.limit_value,
      message: a.message,
      acknowledged: !!a.acknowledged,
      createdAt: a.created_at,
    })),
  };
}

/**
 * Create an alert only if there isn't a recent one of the same type
 */
function createAlertIfNew(
  limitId: string, alertType: string, currentValue: number, limitValue: number, message: string
): void {
  const db = getDb();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const recent = db.prepare(`
    SELECT id FROM budget_alerts
    WHERE limit_id = ? AND alert_type = ? AND created_at > ? AND acknowledged = 0
    LIMIT 1
  `).get(limitId, alertType, oneHourAgo);

  if (!recent) {
    db.prepare(`
      INSERT INTO budget_alerts (id, limit_id, alert_type, current_value, limit_value, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuid(), limitId, alertType, currentValue, limitValue, message);
  }
}

/**
 * Check if session spawn is allowed by budget
 */
export function canSpawnSession(): { allowed: boolean; reason?: string } {
  const db = getDb();
  seedDefaultLimits();

  const limits = db.prepare(
    'SELECT * FROM budget_limits WHERE enabled = 1'
  ).all() as any[];

  for (const limit of limits) {
    const currentValue = getCurrentUsage(limit.limit_type);
    if (currentValue >= limit.limit_value) {
      return {
        allowed: false,
        reason: `Budget exceeded: ${limit.name} (${currentValue}/${limit.limit_value})`,
      };
    }
  }

  return { allowed: true };
}

/**
 * CRUD operations for budget limits
 */
export function getLimits(): BudgetLimit[] {
  const db = getDb();
  seedDefaultLimits();
  return (db.prepare('SELECT * FROM budget_limits').all() as any[]).map(row => ({
    id: row.id,
    name: row.name,
    limitType: row.limit_type,
    limitValue: row.limit_value,
    warnAtPct: row.warn_at_pct,
    enabled: !!row.enabled,
  }));
}

export function updateLimit(id: string, fields: Partial<BudgetLimit>): void {
  const db = getDb();
  const sets: string[] = [];
  const params: (string | number)[] = [];

  if (fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
  if (fields.limitValue !== undefined) { sets.push('limit_value = ?'); params.push(fields.limitValue); }
  if (fields.warnAtPct !== undefined) { sets.push('warn_at_pct = ?'); params.push(fields.warnAtPct); }
  if (fields.enabled !== undefined) { sets.push('enabled = ?'); params.push(fields.enabled ? 1 : 0); }

  if (sets.length > 0) {
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    db.prepare(`UPDATE budget_limits SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }
}

export function acknowledgeAlert(id: string): void {
  const db = getDb();
  db.prepare('UPDATE budget_alerts SET acknowledged = 1 WHERE id = ?').run(id);
}

export function acknowledgeAllAlerts(): void {
  const db = getDb();
  db.prepare('UPDATE budget_alerts SET acknowledged = 1 WHERE acknowledged = 0').run();
}
