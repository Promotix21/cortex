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
      className="flex items-center px-4 py-1.5 border-b select-none"
      style={{
        background: 'var(--bg-tertiary)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center gap-2">
        <Brain size={16} style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          Cortex
        </span>
      </div>

      <div className="flex-1" />

      {/* Session Dashboard Toggle */}
      <button
        onClick={toggleDashboard}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors hover:bg-[var(--bg-hover)]"
        style={{
          color: activeCount > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)',
        }}
      >
        <Zap size={12} style={{ color: activeCount > 0 ? 'var(--running)' : 'var(--text-tertiary)' }} />
        <span>
          {activeCount > 0
            ? `${activeCount} session${activeCount > 1 ? 's' : ''}`
            : 'Sessions'}
        </span>
        <ChevronDown size={10} />
      </button>
    </div>
  );
}
