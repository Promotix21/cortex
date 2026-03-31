import { useEffect, useState } from 'react';
import { getSidecarUrl } from '@/lib/api';
import { Book, Plus, Trash2, Tag, AlertCircle } from 'lucide-react';

const SIDECAR = getSidecarUrl();

export function ReferencePanel() {
  const [tools, setTools] = useState<any[]>([]);
  const [commands, setCommands] = useState<any[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const [showAddTool, setShowAddTool] = useState(false);
  const [toolForm, setToolForm] = useState({ name: '', category: 'framework', doc_url: '' });
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  const fetchTools = async () => {
    try {
      const res = await fetch(`${SIDECAR}/api/reference/tools`);
      const data = await res.json();
      setTools(data.tools);
    } catch { /* silent */ }
  };

  const fetchCommands = async (toolId: string) => {
    try {
      const res = await fetch(`${SIDECAR}/api/reference/commands?tool_id=${toolId}&os=linux`);
      setCommands((await res.json()).commands);
    } catch { /* silent */ }
  };

  const fetchChanges = async (toolId: string) => {
    try {
      const res = await fetch(`${SIDECAR}/api/reference/changes?tool_id=${toolId}`);
      setChanges((await res.json()).changes);
    } catch { /* silent */ }
  };

  useEffect(() => { fetchTools(); }, []);

  useEffect(() => {
    if (selectedTool) { fetchCommands(selectedTool); fetchChanges(selectedTool); }
  }, [selectedTool]);

  const addTool = async () => {
    if (!toolForm.name.trim()) return;
    await fetch(`${SIDECAR}/api/reference/tools`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toolForm),
    });
    setToolForm({ name: '', category: 'framework', doc_url: '' });
    setShowAddTool(false);
    fetchTools();
  };

  const deleteTool = async (id: string) => {
    await fetch(`${SIDECAR}/api/reference/tools/${id}`, { method: 'DELETE' });
    if (selectedTool === id) setSelectedTool(null);
    fetchTools();
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
        <Book size={18} style={{ color: 'var(--accent)' }} />
        <h3 className="font-medium" style={{ fontSize: 16, color: 'var(--text-primary)' }}>Reference Intelligence</h3>
        <div className="flex-1" />
        <button onClick={() => setShowAddTool(!showAddTool)} className="rounded-xl" style={{ padding: '10px 20px', fontSize: 14, background: 'var(--accent)', color: 'var(--bg-primary)' }}>
          <Plus size={16} />
        </button>
      </div>

      {showAddTool && (
        <div className="flex items-center" style={{ gap: 12, marginBottom: 24 }}>
          <input value={toolForm.name} onChange={e => setToolForm({ ...toolForm, name: e.target.value })} placeholder="Tool name"
            className="rounded-xl bg-transparent outline-none flex-1" style={{ padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <select value={toolForm.category} onChange={e => setToolForm({ ...toolForm, category: e.target.value })}
            className="rounded-xl bg-transparent outline-none" style={{ padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="framework">Framework</option><option value="cli">CLI</option><option value="sdk">SDK</option><option value="api">API</option><option value="general">General</option>
          </select>
          <button onClick={addTool} className="rounded-xl" style={{ padding: '10px 20px', fontSize: 14, background: 'var(--accent)', color: 'var(--bg-primary)' }}>Add</button>
        </div>
      )}

      <div className="grid grid-cols-3" style={{ gap: 20 }}>
        {/* Tool List */}
        <div className="col-span-1">
          <p className="uppercase tracking-wider font-medium" style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-tertiary)' }}>Tools</p>
          {tools.map(t => (
            <div key={t.id}
              className="flex items-center rounded-xl cursor-pointer group"
              style={{ gap: 10, padding: '10px 14px', marginBottom: 6, background: selectedTool === t.id ? 'var(--bg-surface)' : 'transparent', color: 'var(--text-secondary)' }}
              onClick={() => setSelectedTool(t.id)}
            >
              <Tag size={14} style={{ color: 'var(--accent)' }} />
              <span className="flex-1" style={{ fontSize: 14 }}>{t.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t.category}</span>
              <button onClick={e => { e.stopPropagation(); deleteTool(t.id); }} className="opacity-0 group-hover:opacity-100" style={{ padding: 4 }}>
                <Trash2 size={14} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
          ))}
          {tools.length === 0 && <p className="text-center" style={{ fontSize: 12, padding: '20px 0', color: 'var(--text-tertiary)' }}>No tools added</p>}
        </div>

        {/* Commands + Changes */}
        <div className="col-span-2">
          {selectedTool ? (
            <>
              <p className="uppercase tracking-wider font-medium" style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-tertiary)' }}>Commands</p>
              {commands.length > 0 ? commands.map(c => (
                <div key={c.id} className="flex items-center" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <code className="font-mono" style={{ fontSize: 13, color: c.deprecated ? 'var(--error)' : 'var(--accent)' }}>
                    {c.deprecated ? <s>{c.command}</s> : c.command}
                  </code>
                  <span className="flex-1" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.description}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>v{c.version}</span>
                </div>
              )) : <p style={{ fontSize: 12, padding: '10px 0', color: 'var(--text-tertiary)' }}>No commands for this tool</p>}

              {changes.length > 0 && (
                <>
                  <p className="uppercase tracking-wider font-medium" style={{ fontSize: 13, marginTop: 24, marginBottom: 12, color: 'var(--text-tertiary)' }}>API Changes</p>
                  {changes.map(c => (
                    <div key={c.id} className="rounded-xl" style={{ padding: '12px 16px', marginBottom: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
                        <AlertCircle size={14} style={{ color: c.change_type === 'breaking' ? 'var(--error)' : 'var(--warning)' }} />
                        <span className="font-medium" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{c.change_type} — v{c.version}</span>
                      </div>
                      {c.old_usage && <p className="font-mono" style={{ fontSize: 12, color: 'var(--error)' }}>- {c.old_usage}</p>}
                      {c.new_usage && <p className="font-mono" style={{ fontSize: 12, color: 'var(--success)' }}>+ {c.new_usage}</p>}
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <p className="text-center" style={{ fontSize: 14, padding: '32px 0', color: 'var(--text-tertiary)' }}>Select a tool to view commands</p>
          )}
        </div>
      </div>
    </div>
  );
}
