import { useEffect } from 'react';
import { useBudgetStore } from '@/stores/budget-store';
import { Shield, AlertTriangle, XCircle } from 'lucide-react';

export function BudgetGuard() {
  const { limits, alerts, fetchStatus, acknowledgeAlert } = useBudgetStore();

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const activeLimits = limits.filter(l => l.status !== 'ok');
  if (activeLimits.length === 0 && alerts.length === 0) return null;

  return (
    <div style={{ padding: '0 32px', marginBottom: 16 }}>
      {/* Active Limit Warnings */}
      {activeLimits.map(limit => (
        <div
          key={limit.id}
          className="flex items-center rounded-xl"
          style={{
            gap: 12,
            padding: '12px 20px',
            marginBottom: 8,
            background: limit.status === 'exceeded' ? 'var(--error-dim)' : 'var(--warning-dim)',
            border: `1px solid ${limit.status === 'exceeded' ? 'rgba(243,139,168,0.3)' : 'rgba(249,226,175,0.3)'}`,
          }}
        >
          {limit.status === 'exceeded' ? (
            <XCircle size={16} style={{ color: 'var(--error)', flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          )}
          <div className="flex-1">
            <span
              className="font-semibold"
              style={{
                fontSize: 13,
                color: limit.status === 'exceeded' ? 'var(--error)' : 'var(--warning)',
              }}
            >
              {limit.name}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 8 }}>
              {Math.round(limit.currentValue)} / {limit.limitValue} ({Math.round(limit.pct * 100)}%)
            </span>
          </div>
          {/* Progress bar */}
          <div
            className="rounded-full overflow-hidden"
            style={{ width: 120, height: 6, background: 'rgba(255,255,255,0.1)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(limit.pct * 100, 100)}%`,
                background: limit.status === 'exceeded' ? 'var(--error)' : 'var(--warning)',
              }}
            />
          </div>
        </div>
      ))}

      {/* Unacknowledged Alerts */}
      {alerts.slice(0, 3).map(alert => (
        <div
          key={alert.id}
          className="flex items-center rounded-xl"
          style={{
            gap: 12,
            padding: '10px 16px',
            marginBottom: 8,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
          }}
        >
          <Shield size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span className="flex-1" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {alert.message}
          </span>
          <button
            onClick={() => acknowledgeAlert(alert.id)}
            className="rounded-lg transition-colors"
            style={{
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--bg-hover)',
              color: 'var(--text-tertiary)',
            }}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
