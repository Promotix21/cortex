import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** If set, user must type this exact string to confirm */
  confirmText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title, message, confirmText, confirmLabel = 'Confirm',
  cancelLabel = 'Cancel', destructive = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const [input, setInput] = useState('');
  const canConfirm = confirmText ? input === confirmText : true;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', zIndex: 9999 }}
      onClick={onCancel}
    >
      <div
        className="rounded-2xl"
        style={{ width: 440, padding: 28, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between" style={{ marginBottom: 16 }}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <div
              className="rounded-xl flex items-center justify-center"
              style={{ width: 40, height: 40, background: destructive ? 'var(--error-dim)' : 'var(--warning-dim)' }}
            >
              <AlertTriangle size={20} style={{ color: destructive ? 'var(--error)' : 'var(--warning)' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          </div>
          <button onClick={onCancel} style={{ padding: 4, color: 'var(--text-tertiary)' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
          {message}
        </p>

        {confirmText && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
              Type <strong style={{ color: 'var(--text-primary)' }}>{confirmText}</strong> to confirm:
            </p>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              autoFocus
              className="w-full rounded-lg bg-transparent outline-none"
              style={{ padding: '10px 14px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              placeholder={confirmText}
            />
          </div>
        )}

        <div className="flex justify-end" style={{ gap: 10 }}>
          <button
            onClick={onCancel}
            className="rounded-lg"
            style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="rounded-lg disabled:opacity-30"
            style={{
              padding: '10px 20px', fontSize: 14, fontWeight: 600, border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed',
              background: destructive ? 'var(--error)' : 'var(--accent)',
              color: destructive ? 'white' : 'var(--bg-primary)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
