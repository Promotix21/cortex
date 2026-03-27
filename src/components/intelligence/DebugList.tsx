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
      <div className="flex gap-2 mb-4">
        <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search debug solutions..."
            className="bg-transparent border-none outline-none text-xs flex-1" style={{ color: 'var(--text-primary)' }} />
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-2.5 py-1.5 rounded text-xs" style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}>
          <Plus size={12} />
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <input value={form.problem} onChange={e => setForm({ ...form, problem: e.target.value })} placeholder="Problem / Error message"
            className="w-full mb-2 px-2 py-1.5 rounded text-xs bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <textarea value={form.root_cause} onChange={e => setForm({ ...form, root_cause: e.target.value })} placeholder="Root cause"
            rows={2} className="w-full mb-2 px-2 py-1.5 rounded text-xs bg-transparent outline-none resize-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <textarea value={form.solution} onChange={e => setForm({ ...form, solution: e.target.value })} placeholder="Solution"
            rows={3} className="w-full mb-2 px-2 py-1.5 rounded text-xs bg-transparent outline-none resize-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2 items-center mb-2">
            <input value={form.error_signature} onChange={e => setForm({ ...form, error_signature: e.target.value })} placeholder="Error signature (for auto-matching)"
              className="flex-1 px-2 py-1.5 rounded text-xs bg-transparent outline-none font-mono" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex gap-2 items-center">
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)"
              className="flex-1 px-2 py-1.5 rounded text-xs bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}
              className="px-2 py-1.5 rounded text-xs bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="project">Project</option>
              <option value="reusable">Reusable</option>
            </select>
            <button onClick={create} disabled={!form.problem.trim()} className="px-3 py-1.5 rounded text-xs disabled:opacity-30" style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}>Save</button>
          </div>
        </div>
      )}

      {/* Debug List */}
      {items.map(d => (
        <div key={d.id} className="rounded-lg px-3 py-2.5 mb-2 group" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Bug size={12} style={{ color: 'var(--error)' }} />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: confidenceColors[d.confidence] || 'var(--text-tertiary)' }} />
            <span className="text-xs font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{d.problem}</span>
            {d.scope === 'reusable' ? <Globe size={10} style={{ color: 'var(--accent)' }} /> : <Lock size={10} style={{ color: 'var(--text-tertiary)' }} />}
            {d.usage_count > 0 && <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>used {d.usage_count}x</span>}
            <button onClick={() => remove(d.id)} className="opacity-0 group-hover:opacity-100 p-0.5"><Trash2 size={10} style={{ color: 'var(--text-tertiary)' }} /></button>
          </div>
          {d.root_cause && (
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--warning)' }}>Cause:</strong> {d.root_cause}
            </div>
          )}
          {d.solution && (
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--success)' }}>Fix:</strong> {d.solution}
            </div>
          )}
          {d.error_signature && (
            <div className="text-[9px] font-mono mt-1 px-1.5 py-0.5 rounded inline-block" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
              sig: {d.error_signature}
            </div>
          )}
          {d.tags?.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {d.tags.map((t: string) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}

      {items.length === 0 && !showForm && (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No debug solutions yet. Never solve the same bug twice.</p>
      )}
    </div>
  );
}
