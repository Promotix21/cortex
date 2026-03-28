import { useSessionStore } from '@/stores/session-store';
import { useEffect } from 'react';
import { Brain, Zap, ChevronDown } from 'lucide-react';

export function TopBar() {
  const { activeSessions, fetchActiveSessions, toggleDashboard } = useSessionStore();

  useEffect(() => {
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 3000);
    return () => clearInterval(interval);
  }, [fetchActiveSessions]);

  const activeCount = activeSessions.length;

  return (
    <div
      className="flex items-center px-5 py-2.5 border-b select-none"
      style={{
        background: 'var(--bg-tertiary)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
          <Brain size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <span className="text-base font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Cortex
        </span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}>
          alpha
        </span>
      </div>

      <div className="flex-1" />

      {/* Session Dashboard Toggle */}
      <button
        onClick={toggleDashboard}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
        style={{
          background: activeCount > 0 ? 'var(--success-dim)' : 'var(--bg-surface)',
          color: activeCount > 0 ? 'var(--success)' : 'var(--text-tertiary)',
          border: `1px solid ${activeCount > 0 ? 'rgba(166, 227, 161, 0.2)' : 'var(--border)'}`,
        }}
      >
        <Zap size={15} style={{ color: activeCount > 0 ? 'var(--running)' : 'var(--text-tertiary)' }} />
        <span className="font-medium">
          {activeCount > 0
            ? `${activeCount} session${activeCount > 1 ? 's' : ''} active`
            : 'No sessions'}
        </span>
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
