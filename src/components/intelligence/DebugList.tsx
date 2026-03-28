import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Search, Trash2, Globe, Lock, Bug } from 'lucide-react';

const confidenceColors: Record<string, string> = {
  verified: 'var(--success)',
  probable: 'var(--accent)',
  unverified: 'var(--text-tertiary)',
};

export function DebugList({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ problem: '', root_cause: '', solution: '', tags: '', scope: 'project', error_signature: '' });

  const fetch = async () => {
    try {
      const { debug } = await api.getDebugMemory(projectId, search || undefined);
      setItems(debug);
    } catch { /* silent */ }
  };

  useEffect(() => { fetch(); }, [projectId, search]);

  const create = async () => {
    if (!form.problem.trim()) return;
    await api.createDebug({
      problem: form.problem,
      root_cause: form.root_cause,
      solution: form.solution,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      source_project_id: projectId,
      scope: form.scope,
      error_signature: form.error_signature || undefined,
    });
    setForm({ problem: '', root_cause: '', solution: '', tags: '', scope: 'project', error_signature: '' });
    setShowForm(false);
    fetch();
  };

  const remove = async (id: string) => {
    await api.deleteDebug(id);
    fetch();
  };

  return (
    <div className="max-w-2xl">
      {/* Search + Add */}
      <div className="flex" style={{ gap: 12, marginBottom: 24 }}>
        <div className="flex items-center flex-1 rounded-xl" style={{ gap: 10, padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search debug solutions..."
            className="bg-transparent border-none outline-none flex-1" style={{ fontSize: 14, color: 'var(--text-primary)' }} />
        </div>
        <button onClick={() => setShowForm(!showForm)} className="rounded-xl" style={{ padding: '10px 20px', fontSize: 14, background: 'var(--accent)', color: 'var(--bg-primary)' }}>
          <Plus size={16} />
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl" style={{ padding: 20, marginBottom: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <input value={form.problem} onChange={e => setForm({ ...form, problem: e.target.value })} placeholder="Problem / Error message"
            className="w-full rounded-xl bg-transparent outline-none" style={{ marginBottom: 12, padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <textarea value={form.root_cause} onChange={e => setForm({ ...form, root_cause: e.target.value })} placeholder="Root cause"
            rows={2} className="w-full rounded-xl bg-transparent outline-none resize-none" style={{ marginBottom: 12, padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <textarea value={form.solution} onChange={e => setForm({ ...form, solution: e.target.value })} placeholder="Solution"
            rows={3} className="w-full rounded-xl bg-transparent outline-none resize-none" style={{ marginBottom: 12, padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <div className="flex items-center" style={{ gap: 12, marginBottom: 12 }}>
            <input value={form.error_signature} onChange={e => setForm({ ...form, error_signature: e.target.value })} placeholder="Error signature (for auto-matching)"
              className="flex-1 rounded-xl bg-transparent outline-none font-mono" style={{ padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex items-center" style={{ gap: 12 }}>
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)"
              className="flex-1 rounded-xl bg-transparent outline-none" style={{ padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}
              className="rounded-xl bg-transparent outline-none" style={{ padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="project">Project</option>
              <option value="reusable">Reusable</option>
            </select>
            <button onClick={create} disabled={!form.problem.trim()} className="rounded-xl disabled:opacity-30" style={{ padding: '10px 20px', fontSize: 14, background: 'var(--accent)', color: 'var(--bg-primary)' }}>Save</button>
          </div>
        </div>
      )}

      {/* Debug List */}
      {items.map(d => (
        <div key={d.id} className="rounded-xl group" style={{ padding: '16px 20px', marginBottom: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
            <Bug size={16} style={{ color: 'var(--error)' }} />
            <span className="rounded-full" style={{ width: 8, height: 8, background: confidenceColors[d.confidence] || 'var(--text-tertiary)' }} />
            <span className="font-medium flex-1 truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{d.problem}</span>
            {d.scope === 'reusable' ? <Globe size={14} style={{ color: 'var(--accent)' }} /> : <Lock size={14} style={{ color: 'var(--text-tertiary)' }} />}
            {d.usage_count > 0 && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>used {d.usage_count}x</span>}
            <button onClick={() => remove(d.id)} className="opacity-0 group-hover:opacity-100" style={{ padding: 4 }}><Trash2 size={14} style={{ color: 'var(--text-tertiary)' }} /></button>
          </div>
          {d.root_cause && (
            <div style={{ fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--warning)' }}>Cause:</strong> {d.root_cause}
            </div>
          )}
          {d.solution && (
            <div style={{ fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--success)' }}>Fix:</strong> {d.solution}
            </div>
          )}
          {d.error_signature && (
            <div className="font-mono rounded-lg inline-block" style={{ fontSize: 12, marginTop: 6, padding: '4px 10px', background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
              sig: {d.error_signature}
            </div>
          )}
          {d.tags?.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10 }}>
              {d.tags.map((t: string) => (
                <span key={t} className="rounded-lg" style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}

      {items.length === 0 && !showForm && (
        <p className="text-center" style={{ fontSize: 14, padding: '32px 0', color: 'var(--text-tertiary)' }}>No debug solutions yet. Never solve the same bug twice.</p>
      )}
    </div>
  );
}
