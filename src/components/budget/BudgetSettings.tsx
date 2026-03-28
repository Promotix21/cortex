import { useEffect, useState } from 'react';
import { useBudgetStore } from '@/stores/budget-store';
import { Shield, Save } from 'lucide-react';

export function BudgetSettings() {
  const { limits, fetchStatus, updateLimit } = useBudgetStore();
  const [editValues, setEditValues] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const vals: Record<string, number> = {};
    for (const l of limits) vals[l.id] = l.limitValue;
    setEditValues(vals);
  }, [limits]);

  const handleSave = async (id: string) => {
    await updateLimit(id, { limitValue: editValues[id] });
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await updateLimit(id, { enabled });
  };

  const formatType = (type: string) => {
    switch (type) {
      case 'messages_per_5h': return 'Messages / 5 hours';
      case 'hours_per_7d': return 'Hours / 7 days';
      case 'tokens_per_day': return 'Tokens / day';
      case 'sessions_per_day': return 'Sessions / day';
      default: return type;
    }
  };

  return (
    <div>
      <div className="flex items-center" style={{ gap: 12, marginBottom: 20 }}>
        <Shield size={18} style={{ color: 'var(--accent)' }} />
        <span className="font-bold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
          Budget Guard
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Alerts before hitting Claude Max rate limits
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {limits.map(limit => (
          <div
            key={limit.id}
            className="flex items-center rounded-xl"
            style={{
              gap: 16,
              padding: '16px 20px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              opacity: limit.enabled ? 1 : 0.5,
            }}
          >
            {/* Toggle */}
            <button
              onClick={() => handleToggle(limit.id, !limit.enabled)}
              className="rounded-full transition-colors"
              style={{
                width: 40,
                height: 22,
                padding: 2,
                background: limit.enabled ? 'var(--accent)' : 'var(--bg-hover)',
                border: '1px solid var(--border)',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <div
                className="rounded-full transition-all"
                style={{
                  width: 16,
                  height: 16,
                  background: 'white',
                  transform: limit.enabled ? 'translateX(18px)' : 'translateX(0)',
                }}
              />
            </button>

            {/* Info */}
            <div className="flex-1">
              <div className="font-semibold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                {limit.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {formatType(limit.limitType)}
              </div>
            </div>

            {/* Current usage */}
            <div style={{ textAlign: 'right', minWidth: 80 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: limit.status === 'exceeded' ? 'var(--error)' : limit.status === 'warning' ? 'var(--warning)' : 'var(--text-primary)',
              }}>
                {Math.round(limit.currentValue)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>current</div>
            </div>

            {/* Limit input */}
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>/</span>
              <input
                type="number"
                value={editValues[limit.id] ?? limit.limitValue}
                onChange={(e) => setEditValues(prev => ({ ...prev, [limit.id]: Number(e.target.value) }))}
                className="rounded-lg border bg-transparent text-right font-mono"
                style={{
                  width: 80,
                  padding: '6px 10px',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border)',
                }}
              />
              <button
                onClick={() => handleSave(limit.id)}
                className="rounded-lg transition-colors"
                style={{
                  padding: '6px 12px',
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                }}
              >
                <Save size={14} />
              </button>
            </div>

            {/* Progress bar */}
            <div
              className="rounded-full overflow-hidden"
              style={{ width: 80, height: 6, background: 'var(--bg-hover)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(limit.pct * 100, 100)}%`,
                  background: limit.status === 'exceeded' ? 'var(--error)' : limit.status === 'warning' ? 'var(--warning)' : 'var(--accent)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
