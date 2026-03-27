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
  const [form, setForm] = useState({ title: '', description: '', code: '', tags: '', scope: 'project' });

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
      <div className="flex gap-2 mb-4">
        <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <Search size={12} style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search patterns..."
            className="bg-transparent border-none outline-none text-xs flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-2.5 py-1.5 rounded text-xs" style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}>
          <Plus size={12} />
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Pattern title"
            className="w-full mb-2 px-2 py-1.5 rounded text-xs bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description"
            rows={2} className="w-full mb-2 px-2 py-1.5 rounded text-xs bg-transparent outline-none resize-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <textarea value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Code snippet"
            rows={4} className="w-full mb-2 px-2 py-1.5 rounded text-xs bg-transparent outline-none resize-none font-mono" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2 items-center">
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Tags (comma-separated)"
              className="flex-1 px-2 py-1.5 rounded text-xs bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}
              className="px-2 py-1.5 rounded text-xs bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="project">Project</option>
              <option value="reusable">Reusable</option>
            </select>
            <button onClick={create} disabled={!form.title.trim()} className="px-3 py-1.5 rounded text-xs disabled:opacity-30" style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}>Save</button>
          </div>
        </div>
      )}

      {/* Pattern List */}
      {patterns.map(p => (
        <div key={p.id} className="rounded-lg px-3 py-2.5 mb-2 group" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: confidenceColors[p.confidence] || 'var(--text-tertiary)' }} />
            <span className="text-xs font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{p.title}</span>
            {p.scope === 'reusable' ? <Globe size={10} style={{ color: 'var(--accent)' }} /> : <Lock size={10} style={{ color: 'var(--text-tertiary)' }} />}
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => rate(p.id, n)} className="p-0.5">
                  <Star size={9} fill={p.user_rating >= n ? 'var(--warning)' : 'none'} style={{ color: p.user_rating >= n ? 'var(--warning)' : 'var(--text-tertiary)' }} />
                </button>
              ))}
              <button onClick={() => remove(p.id)} className="p-0.5 ml-1"><Trash2 size={10} style={{ color: 'var(--text-tertiary)' }} /></button>
            </div>
          </div>
          {p.description && <p className="text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>{p.description}</p>}
          {p.code && <pre className="text-[10px] p-2 rounded mt-1 overflow-auto max-h-24" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{p.code}</pre>}
          {p.tags?.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {p.tags.map((t: string) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}

      {patterns.length === 0 && !showForm && (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No patterns yet. Save reusable code snippets here.</p>
      )}
    </div>
  );
}
