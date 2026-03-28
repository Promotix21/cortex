import { useProjectStore } from '@/stores/project-store';
import { useSessionStore } from '@/stores/session-store';
import { Wifi, WifiOff, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function StatusBar() {
  const activeProject = useProjectStore((s) => s.activeProject());
  const activeSessions = useSessionStore((s) => s.activeSessions);
  const [sidecarConnected, setSidecarConnected] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        await api.health();
        setSidecarConnected(true);
      } catch {
        setSidecarConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="flex items-center px-4 text-xs font-medium select-none shrink-0"
      style={{
        height: 28,
        fontSize: 12,
        background: 'var(--bg-tertiary)',
        borderTop: '1px solid var(--border)',
        color: 'var(--text-tertiary)',
      }}
    >
      {/* Left: Sidecar status */}
      <div className="flex items-center gap-1.5">
        {sidecarConnected ? (
          <Wifi size={12} style={{ color: 'var(--success)' }} />
        ) : (
          <WifiOff size={12} style={{ color: 'var(--error)' }} />
        )}
        <span>{sidecarConnected ? 'Sidecar Connected' : 'Sidecar Offline'}</span>
      </div>

      {/* Center: Active project */}
      <div className="flex-1 text-center">
        {activeProject && (
          <span>
            {activeProject.name}
            <span className="mx-1.5" style={{ color: 'var(--border)' }}>&middot;</span>
            <span className="capitalize">{activeProject.type}</span>
          </span>
        )}
      </div>

      {/* Right: Session count + version */}
      <div className="flex items-center gap-3">
        {activeSessions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Zap size={12} style={{ color: 'var(--running)' }} />
            <span>
              {activeSessions.length} session{activeSessions.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
        <span>Cortex v0.1.0</span>
      </div>
    </div>
  );
}
