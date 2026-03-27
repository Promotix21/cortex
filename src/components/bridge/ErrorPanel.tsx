import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { AlertTriangle, Wifi, WifiOff, Trash2, Bug, CheckCircle } from 'lucide-react';

const SIDECAR = 'http://localhost:4700';

export function ErrorPanel() {
  const project = useProjectStore(s => s.activeProject());
  const [errors, setErrors] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);

  const fetchErrors = async () => {
    if (!project) return;
    try {
      const res = await fetch(`${SIDECAR}/api/bridge/errors/${project.id}?limit=30`);
      const data = await res.json();
      setErrors(data.errors || []);
    } catch { /* silent */ }
  };

  const checkBridge = async () => {
    try {
      const res = await fetch(`${SIDECAR}/api/bridge/status`);
      const data = await res.json();
      setConnected(data.connected);
    } catch { setConnected(false); }
  };

  const clearErrors = async () => {
    if (!project) return;
    try {
      await fetch(`${SIDECAR}/api/bridge/errors/${project.id}`, { method: 'DELETE' });
      setErrors([]);
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchErrors();
    checkBridge();
    const interval = setInterval(() => { fetchErrors(); checkBridge(); }, 5000);
    return () => clearInterval(interval);
  }, [project?.id]);

  if (!project) return null;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={16} style={{ color: 'var(--error)' }} />
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Error Capture</h3>
        <div className="flex items-center gap-1 text-[10px]" style={{ color: connected ? 'var(--success)' : 'var(--text-tertiary)' }}>
          {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
          Bridge: {connected ? 'Connected' : 'Disconnected'}
        </div>
        <div className="flex-1" />
        {errors.length > 0 && (
          <button onClick={clearErrors} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-tertiary)' }}>
            <Trash2 size={10} /> Clear
          </button>
        )}
      </div>

      {!connected && (
        <div className="text-xs px-3 py-2 rounded mb-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
          Console bridge not detected. Start claude-console-bridge on port 9877 to capture browser/server errors.
        </div>
      )}

      {/* Error List */}
      {errors.map((err: any) => (
        <div key={err.id} className="rounded-lg px-3 py-2.5 mb-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Bug size={12} style={{ color: 'var(--error)' }} />
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(243,139,168,0.1)', color: 'var(--error)' }}>
              {err.error_type}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
              {new Date(err.timestamp).toLocaleTimeString()}
            </span>
            {err.matched_debug_id && (
              <div className="flex items-center gap-1 ml-auto">
                <CheckCircle size={10} style={{ color: 'var(--success)' }} />
                <span className="text-[9px]" style={{ color: 'var(--success)' }}>Known fix</span>
              </div>
            )}
          </div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-primary)' }}>{err.message}</p>
          {err.matched_solution && (
            <div className="text-[11px] px-2 py-1.5 rounded mt-1" style={{ background: 'rgba(166,227,161,0.08)', color: 'var(--success)' }}>
              <strong>Fix:</strong> {err.matched_solution}
            </div>
          )}
          {err.error_signature && (
            <div className="text-[9px] font-mono mt-1" style={{ color: 'var(--text-tertiary)' }}>
              sig: {err.error_signature.slice(0, 80)}
            </div>
          )}
        </div>
      ))}

      {errors.length === 0 && connected && (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
          No errors captured yet. Errors from chrome-console-for-claude will appear here.
        </p>
      )}
    </div>
  );
}
