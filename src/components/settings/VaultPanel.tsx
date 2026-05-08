import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useProjectStore } from '@/stores/project-store';
import {
  KeyRound, Plus, Trash2, Eye, EyeOff, ShieldCheck, ShieldOff, Loader2, Copy, Check, X,
} from 'lucide-react';

type Credential = Awaited<ReturnType<typeof api.listCredentials>>['credentials'][number];

const KINDS: Array<{ value: string; label: string; placeholderFields: string[] }> = [
  { value: 'ssh',           label: 'SSH',            placeholderFields: ['host', 'user', 'port', 'password', 'key_path'] },
  { value: 'wordpress',     label: 'WordPress',      placeholderFields: ['url', 'user', 'password'] },
  { value: 'shopify',       label: 'Shopify',        placeholderFields: ['store', 'admin_url', 'user', 'password', 'api_key'] },
  { value: 'smtp',          label: 'SMTP',           placeholderFields: ['host', 'port', 'user', 'password'] },
  { value: 'backend_panel', label: 'Backend Panel',  placeholderFields: ['url', 'user', 'password'] },
  { value: 'api_key',       label: 'API Key',        placeholderFields: ['service', 'key', 'secret'] },
  { value: 'db',            label: 'Database',       placeholderFields: ['host', 'port', 'user', 'password', 'database'] },
  { value: 'app_user',      label: 'App User',       placeholderFields: ['email', 'password', 'role'] },
  { value: 'github',        label: 'GitHub',         placeholderFields: ['user', 'pat'] },
  { value: 'other',         label: 'Other',          placeholderFields: ['user', 'password'] },
];

const KIND_COLORS: Record<string, { bg: string; fg: string }> = {
  ssh: { bg: 'rgba(167,139,250,0.15)', fg: '#a78bfa' },
  wordpress: { bg: 'rgba(34,211,238,0.15)', fg: 'var(--accent)' },
  shopify: { bg: 'rgba(52,211,153,0.15)', fg: 'var(--green)' },
  smtp: { bg: 'rgba(250,179,135,0.15)', fg: 'var(--peach)' },
  backend_panel: { bg: 'rgba(34,211,238,0.15)', fg: 'var(--accent)' },
  api_key: { bg: 'rgba(243,139,168,0.15)', fg: 'var(--error)' },
  db: { bg: 'rgba(167,139,250,0.15)', fg: '#a78bfa' },
  app_user: { bg: 'rgba(52,211,153,0.15)', fg: 'var(--green)' },
  github: { bg: 'rgba(200,200,200,0.15)', fg: 'var(--text-secondary)' },
  other: { bg: 'rgba(200,200,200,0.15)', fg: 'var(--text-tertiary)' },
};

export function VaultPanel() {
  const activeProject = useProjectStore(s => s.activeProject());
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [creds, setCreds] = useState<Credential[]>([]);
  const [status, setStatus] = useState<{ available: boolean; reason?: string }>({ available: true });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [revealing, setRevealing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, list] = await Promise.all([
        api.vaultStatus(),
        api.listCredentials(scope === 'project' ? (activeProject?.id ?? null) : null),
      ]);
      setStatus(s);
      setCreds(list.credentials);
    } catch (err) {
      toast.error('Vault load failed', { description: err instanceof Error ? err.message : 'Unknown' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [scope, activeProject?.id]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete credential "${name}"? This cannot be undone.`)) return;
    try {
      await api.deleteCredential(id);
      toast.success('Credential deleted');
      load();
    } catch (err) {
      toast.error('Delete failed', { description: err instanceof Error ? err.message : 'Unknown' });
    }
  };

  if (!status.available) {
    return (
      <div
        className="rounded-xl"
        style={{ padding: '20px 24px', background: 'var(--error-dim)', border: '1px solid rgba(243,139,168,0.3)' }}
      >
        <div className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
          <ShieldOff size={20} style={{ color: 'var(--error)' }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--error)' }}>
            Vault unavailable
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {status.reason || 'libsecret / GNOME Keyring is required to encrypt the master key.'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
          Install: <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>sudo apt install libsecret-tools gnome-keyring</code>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl" style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <div className="rounded-lg flex items-center justify-center" style={{ width: 36, height: 36, background: 'rgba(52,211,153,0.18)' }}>
          <KeyRound size={18} style={{ color: 'var(--green)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Vault</h2>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Encrypted credentials · {creds.length} stored · master key in OS keyring
          </p>
        </div>
        <span title="Master key found in libsecret">
          <ShieldCheck size={16} style={{ color: 'var(--green)' }} />
        </span>
      </div>

      {/* Scope toggle + Add button */}
      <div className="flex items-center" style={{ gap: 10, marginBottom: 14 }}>
        <div className="flex rounded-lg" style={{ background: 'var(--bg-primary)', padding: 3, border: '1px solid var(--border)' }}>
          <ScopeButton active={scope === 'project'} onClick={() => setScope('project')} disabled={!activeProject}>
            {activeProject ? activeProject.name : 'No project'}
          </ScopeButton>
          <ScopeButton active={scope === 'global'} onClick={() => setScope('global')}>Global</ScopeButton>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center rounded-lg"
          style={{
            gap: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700,
            background: 'var(--accent)', color: 'var(--bg-primary)',
          }}
        >
          <Plus size={14} /> Add credential
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center" style={{ gap: 10, padding: '20px 0', color: 'var(--text-tertiary)' }}>
          <Loader2 size={14} className="animate-spin" />
          <span style={{ fontSize: 13 }}>Loading…</span>
        </div>
      ) : creds.length === 0 ? (
        <div style={{
          padding: 24, fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center',
          background: 'var(--bg-primary)', borderRadius: 8, border: '1px dashed var(--border)',
        }}>
          No credentials yet for this scope. Click <strong>Add credential</strong> above.
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {creds.map(c => (
            <CredentialRow
              key={c.id}
              cred={c}
              revealing={revealing === c.id}
              onReveal={() => setRevealing(revealing === c.id ? null : c.id)}
              onDelete={() => handleDelete(c.id, c.name)}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddCredentialModal
          projectId={scope === 'project' ? activeProject?.id ?? null : null}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}

function ScopeButton({ active, onClick, disabled, children }: {
  active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md transition-colors"
      style={{
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-tertiary)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function CredentialRow({
  cred, revealing, onReveal, onDelete, onRefresh,
}: {
  cred: Credential;
  revealing: boolean;
  onReveal: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const [reason, setReason] = useState('');
  const [fields, setFields] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);

  const palette = KIND_COLORS[cred.kind] || KIND_COLORS.other;

  const reveal = async () => {
    if (reason.trim().length < 4) {
      toast.error('Reason required (min 4 chars)');
      return;
    }
    setBusy(true);
    try {
      const result = await api.revealCredential(cred.id, reason.trim());
      setFields(result.fields as Record<string, string>);
      onRefresh();
    } catch (err) {
      toast.error('Reveal failed', { description: err instanceof Error ? err.message : 'Unknown' });
    } finally {
      setBusy(false);
    }
  };

  const hide = () => {
    setFields(null);
    setReason('');
    onReveal();
  };

  return (
    <div className="rounded-lg" style={{ padding: '12px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <span
          className="rounded-md"
          style={{
            padding: '3px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: palette.bg, color: palette.fg,
          }}
        >
          {cred.kind}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{cred.name}</div>
          {cred.description && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{cred.description}</div>
          )}
        </div>
        {cred.lastUsed && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            used {new Date(cred.lastUsed).toLocaleDateString()}
          </span>
        )}
        <button
          onClick={revealing ? hide : onReveal}
          className="rounded-md"
          style={{ padding: 8, color: revealing ? 'var(--accent)' : 'var(--text-tertiary)' }}
          title={revealing ? 'Hide' : 'Reveal'}
        >
          {revealing ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          onClick={onDelete}
          className="rounded-md"
          style={{ padding: 8, color: 'var(--error)' }}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {revealing && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {!fields ? (
            <div className="flex items-center" style={{ gap: 8 }}>
              <input
                type="text"
                placeholder="Reason (audited) — e.g. SSH into prod, deploy WP"
                value={reason}
                autoFocus
                onChange={e => setReason(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') reveal(); }}
                className="flex-1 rounded-md bg-transparent"
                style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
              <button
                onClick={reveal}
                disabled={busy}
                className="rounded-md font-semibold"
                style={{ padding: '8px 16px', fontSize: 13, background: 'var(--accent)', color: 'var(--bg-primary)' }}
              >
                {busy ? 'Revealing…' : 'Reveal'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 6 }}>
              {Object.entries(fields).map(([k, v]) => (
                <FieldRow key={k} label={k} value={String(v)} />
              ))}
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Logged: "{reason}" — click the eye again to hide.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const isSecret = /pass|secret|key|token|pat/i.test(label);
  const display = isSecret && !copied ? '•'.repeat(Math.min(value.length, 16)) : value;

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="flex items-center rounded-md"
      style={{ padding: '6px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', minWidth: 90 }}>
        {label}
      </span>
      <span className="font-mono" style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, marginLeft: 8, wordBreak: 'break-all' }}>
        {display}
      </span>
      <button
        onClick={copy}
        className="rounded p-1"
        style={{ color: copied ? 'var(--success)' : 'var(--text-tertiary)' }}
        title="Copy"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function AddCredentialModal({ projectId, onClose, onSaved }: {
  projectId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState('ssh');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const placeholderFields = KINDS.find(k => k.value === kind)?.placeholderFields || [];

  const setField = (k: string, v: string) => setFields(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v && v.trim()) filtered[k] = v;
    }
    if (Object.keys(filtered).length === 0) { toast.error('At least one field required'); return; }

    setBusy(true);
    try {
      await api.createCredential({
        project_id: projectId,
        kind,
        name: name.trim(),
        description: description.trim(),
        fields: filtered,
      });
      toast.success('Credential added');
      onSaved();
    } catch (err) {
      toast.error('Save failed', { description: err instanceof Error ? err.message : 'Unknown' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl"
        style={{
          width: 520, maxHeight: '90vh', overflow: 'auto',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-active)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', gap: 12 }}>
          <KeyRound size={18} style={{ color: 'var(--green)' }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Add credential</h3>
          <button onClick={onClose} className="rounded p-1" style={{ color: 'var(--text-tertiary)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col" style={{ padding: '16px 20px', gap: 14 }}>
          <Field label="Kind">
            <select
              value={kind}
              onChange={e => { setKind(e.target.value); setFields({}); }}
              className="rounded-md bg-transparent w-full"
              style={{ padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. digitaldadi-admin, prod-ssh, hubspot-pat"
              className="rounded-md bg-transparent w-full"
              style={{ padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </Field>
          <Field label="Description (optional)">
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What this is for"
              className="rounded-md bg-transparent w-full"
              style={{ padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </Field>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 10 }}>
              Fields
            </div>
            <div className="flex flex-col" style={{ gap: 8 }}>
              {placeholderFields.map(f => (
                <Field key={f} label={f}>
                  <input
                    type={/pass|secret|key|token|pat/i.test(f) ? 'password' : 'text'}
                    value={fields[f] || ''}
                    onChange={e => setField(f, e.target.value)}
                    className="rounded-md bg-transparent w-full font-mono"
                    style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  />
                </Field>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center" style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            className="rounded-md font-semibold"
            style={{ padding: '10px 20px', fontSize: 13, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md font-semibold flex items-center"
            style={{ gap: 8, padding: '10px 20px', fontSize: 13, background: 'var(--accent)', color: 'var(--bg-primary)' }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}
