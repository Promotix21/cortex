import { useEffect, useState } from 'react';
import { useBudgetStore } from '@/stores/budget-store';
import { AlertTriangle, X } from 'lucide-react';

export function BudgetGuard() {
  const { limits, alerts, fetchStatus, acknowledgeAll } = useBudgetStore();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 120000); // Check every 2 min (not 1)
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const activeLimits = limits.filter(l => l.status !== 'ok');

  // Nothing to show
  if ((activeLimits.length === 0 && alerts.length === 0) || dismissed) return null;

  // Compact: show only the worst limit in one line, plus dismiss-all
  const worst = activeLimits.sort((a, b) => b.pct - a.pct)[0];
  if (!worst && alerts.length === 0) return null;

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        gap: 12,
        padding: '6px 20px',
        background: worst?.status === 'exceeded' ? 'var(--error-dim)' : 'var(--warning-dim)',
        borderBottom: `1px solid ${worst?.status === 'exceeded' ? 'rgba(243,139,168,0.2)' : 'rgba(249,226,175,0.2)'}`,
        fontSize: 13,
      }}
    >
      <AlertTriangle size={14} style={{ color: worst?.status === 'exceeded' ? 'var(--error)' : 'var(--warning)', flexShrink: 0 }} />

      {worst && (
        <span style={{ color: worst.status === 'exceeded' ? 'var(--error)' : 'var(--warning)', fontWeight: 600 }}>
          {worst.name}: {Math.round(worst.currentValue)}/{worst.limitValue} ({Math.round(worst.pct * 100)}%)
        </span>
      )}

      {!worst && alerts.length > 0 && (
        <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
          {alerts[0].message}
        </span>
      )}

      {/* Compact progress bar */}
      {worst && (
        <div
          className="rounded-full overflow-hidden"
          style={{ width: 100, height: 4, background: 'rgba(255,255,255,0.1)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(worst.pct * 100, 100)}%`,
              background: worst.status === 'exceeded' ? 'var(--error)' : 'var(--warning)',
            }}
          />
        </div>
      )}

      <div className="flex-1" />

      {/* Dismiss all */}
      <button
        onClick={() => { acknowledgeAll(); setDismissed(true); }}
        className="rounded transition-colors"
        style={{ padding: '2px 8px', color: 'var(--text-tertiary)', fontSize: 12 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
