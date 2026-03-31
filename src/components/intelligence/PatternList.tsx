import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Search, Trash2, Star, Globe, Lock } from 'lucide-react';

const confidenceColors: Record<string, string> = {
  verified: 'var(--success)',
  probable: 'var(--accent)',
  unverified: 'var(--text-tertiary)',
  deprecated: 'var(--error)',
};

export function PatternList({ projectId }: { projectId: string }) {
  const [patterns, setPatterns] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ title: string; description: string; code: string; tags: string; scope: 'project' | 'reusable' }>({ title: '', description: '', code: '', tags: '', scope: 'project' });

  const fetch = async () => {
    try {
      const { patterns: p } = await api.getPatterns(projectId, search || undefined);
      setPatterns(p);
    } catch { /* silent */ }
  };

  useEffect(() => { fetch(); }, [projectId, search]);

  const create = async () => {
    if (!form.title.trim()) return;
    await api.createPattern({
      title: form.title,
      description: form.description,
      code: form.code,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      source_project_id: projectId,
      scope: form.scope,
    });
    setForm({ title: '', description: '', code: '', tags: '', scope: 'project' });
    setShowForm(false);
    fetch();
  };

  const remove = async (id: string) => {
    await api.deletePattern(id);
    fetch();
  };

  const rate = async (id: string, rating: number) => {
    await api.updatePattern(id, { user_rating: rating, confidence: rating >= 4 ? 'verified' : rating >= 2 ? 'probable' : 'unverified' });
    fetch();
  };

  return (
    <div className="max-w-2xl">
      {/* Search + Add */}
      <div className="flex" style={{ gap: 12, marginBottom: 24 }}>
        <div className="flex items-center flex-1 rounded-xl" style={{ gap: 10, padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search patterns..."
            className="bg-transparent border-none outline-none flex-1"
            style={{ fontSize: 14, color: 'var(--text-primary)' }}
          />
        </div>
        <button onClick={() => setShowForm(!showForm)} className="rounded-xl" style={{ padding: '10px 20px', fontSize: 14, background: 'var(--accent)', color: 'var(--bg-primary)' }}>
          <Plus size={16} />
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl" style={{ padding: 20, marginBottom: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Pattern title"
            className="w-full rounded-xl bg-transparent outline-none" style={{ marginBottom: 12, padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description"
            rows={2} className="w-full rounded-xl bg-transparent outline-none resize-none" style={{ marginBottom: 12, padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <textarea value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Code snippet"
            rows={4} className="w-full rounded-xl bg-transparent outline-none resize-none font-mono" style={{ marginBottom: 12, padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <div className="flex items-center" style={{ gap: 12 }}>
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)"
              className="flex-1 rounded-xl bg-transparent outline-none" style={{ padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value as 'project' | 'reusable' })}
              className="rounded-xl bg-transparent outline-none" style={{ padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="project">Project</option>
              <option value="reusable">Reusable</option>
            </select>
            <button onClick={create} disabled={!form.title.trim()} className="rounded-xl disabled:opacity-30" style={{ padding: '10px 20px', fontSize: 14, background: 'var(--accent)', color: 'var(--bg-primary)' }}>Save</button>
          </div>
        </div>
      )}

      {/* Pattern List */}
      {patterns.map(p => (
        <div key={p.id} className="rounded-xl group" style={{ padding: '16px 20px', marginBottom: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
            <span className="rounded-full" style={{ width: 8, height: 8, background: confidenceColors[p.confidence] || 'var(--text-tertiary)' }} />
            <span className="font-medium flex-1" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{p.title}</span>
            {p.scope === 'reusable' ? <Globe size={14} style={{ color: 'var(--accent)' }} /> : <Lock size={14} style={{ color: 'var(--text-tertiary)' }} />}
            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity" style={{ gap: 4 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => rate(p.id, n)} style={{ padding: 4 }}>
                  <Star size={14} fill={p.user_rating >= n ? 'var(--warning)' : 'none'} style={{ color: p.user_rating >= n ? 'var(--warning)' : 'var(--text-tertiary)' }} />
                </button>
              ))}
              <button onClick={() => remove(p.id)} style={{ padding: 4, marginLeft: 6 }}><Trash2 size={14} style={{ color: 'var(--text-tertiary)' }} /></button>
            </div>
          </div>
          {p.description && <p style={{ fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>{p.description}</p>}
          {p.code && <pre className="rounded-xl overflow-auto" style={{ fontSize: 12, padding: 12, marginTop: 8, maxHeight: 120, background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{p.code}</pre>}
          {p.tags?.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: 8, marginTop: 10 }}>
              {p.tags.map((t: string) => (
                <span key={t} className="rounded-lg" style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}

      {patterns.length === 0 && !showForm && (
        <p className="text-center" style={{ fontSize: 14, padding: '32px 0', color: 'var(--text-tertiary)' }}>No patterns yet. Save reusable code snippets here.</p>
      )}
    </div>
  );
}
