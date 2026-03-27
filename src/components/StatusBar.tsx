import { useProjectStore } from '@/stores/project-store';
import { useSessionStore } from '@/stores/session-store';
import { Circle, Wifi, WifiOff, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function StatusBar() {
  const activeProject = useProjectStore(s => s.activeProject());
  const activeSessions = useSessionStore(s => s.activeSessions);
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
      className="flex items-center px-3 py-1 text-[11px] border-t gap-4"
      style={{
        background: 'var(--bg-tertiary)',
        borderColor: 'var(--border)',
        color: 'var(--text-tertiary)',
      }}
    >
      {/* Sidecar Status */}
      <div className="flex items-center gap-1.5">
        {sidecarConnected ? (
          <Wifi size={10} style={{ color: 'var(--success)' }} />
        ) : (
          <WifiOff size={10} style={{ color: 'var(--error)' }} />
        )}
        <span>Sidecar: {sidecarConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      {/* Active Project */}
      {activeProject && (
        <>
          <span style={{ color: 'var(--border)' }}>|</span>
          <div className="flex items-center gap-1.5">
            <Circle size={6} fill="var(--success)" style={{ color: 'var(--success)' }} />
            <span>{activeProject.name}</span>
          </div>
          <span>{activeProject.type}</span>
          {activeProject.git_enabled && <span>git</span>}
        </>
      )}

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <>
          <span style={{ color: 'var(--border)' }}>|</span>
          <div className="flex items-center gap-1.5">
            <Zap size={10} style={{ color: 'var(--running)' }} />
            <span>{activeSessions.length} Claude session{activeSessions.length > 1 ? 's' : ''}</span>
          </div>
        </>
      )}

      <div className="flex-1" />
      <span>Cortex v0.1.0</span>
    </div>
  );
}
