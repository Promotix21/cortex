import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { getSidecarUrl } from '@/lib/api';
import { AlertTriangle, Wifi, WifiOff, Trash2, Bug, CheckCircle } from 'lucide-react';

const SIDECAR = getSidecarUrl();

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
      <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
        <AlertTriangle size={18} style={{ color: 'var(--error)' }} />
        <h3 className="font-medium" style={{ fontSize: 16, color: 'var(--text-primary)' }}>Error Capture</h3>
        <div className="flex items-center" style={{ gap: 6, fontSize: 12, color: connected ? 'var(--success)' : 'var(--text-tertiary)' }}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          Bridge: {connected ? 'Connected' : 'Disconnected'}
        </div>
        <div className="flex-1" />
        {errors.length > 0 && (
          <button onClick={clearErrors} className="flex items-center rounded hover:bg-[var(--bg-hover)]" style={{ gap: 6, padding: '8px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>

      {!connected && (
        <div className="rounded-xl" style={{ fontSize: 14, padding: '12px 16px', marginBottom: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
          Console bridge not detected. Start claude-console-bridge on port 9877 to capture browser/server errors.
        </div>
      )}

      {/* Error List */}
      {errors.map((err: any) => (
        <div key={err.id} className="rounded-xl" style={{ padding: '16px 20px', marginBottom: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
            <Bug size={16} style={{ color: 'var(--error)' }} />
            <span className="rounded-lg" style={{ fontSize: 12, padding: '4px 10px', background: 'rgba(243,139,168,0.1)', color: 'var(--error)' }}>
              {err.error_type}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {new Date(err.timestamp).toLocaleTimeString()}
            </span>
            {err.matched_debug_id && (
              <div className="flex items-center ml-auto" style={{ gap: 6 }}>
                <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                <span style={{ fontSize: 12, color: 'var(--success)' }}>Known fix</span>
              </div>
            )}
          </div>
          <p style={{ fontSize: 14, marginBottom: 6, color: 'var(--text-primary)' }}>{err.message}</p>
          {err.matched_solution && (
            <div className="rounded-xl" style={{ fontSize: 13, padding: '10px 14px', marginTop: 8, background: 'rgba(52,211,153,0.08)', color: 'var(--success)' }}>
              <strong>Fix:</strong> {err.matched_solution}
            </div>
          )}
          {err.error_signature && (
            <div className="font-mono" style={{ fontSize: 12, marginTop: 8, color: 'var(--text-tertiary)' }}>
              sig: {err.error_signature.slice(0, 80)}
            </div>
          )}
        </div>
      ))}

      {errors.length === 0 && connected && (
        <p className="text-center" style={{ fontSize: 14, padding: '32px 0', color: 'var(--text-tertiary)' }}>
          No errors captured yet. Errors from chrome-console-for-claude will appear here.
        </p>
      )}
    </div>
  );
}
