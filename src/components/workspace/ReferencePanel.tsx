import { useEffect, useState } from 'react';
import { Book, Plus, Trash2, Tag, AlertCircle } from 'lucide-react';

const SIDECAR = 'http://localhost:4700';

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
      <div className="flex items-center gap-2 mb-4">
        <Book size={16} style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Reference Intelligence</h3>
        <div className="flex-1" />
        <button onClick={() => setShowAddTool(!showAddTool)} className="px-2.5 py-1 rounded text-xs" style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}>
          <Plus size={12} />
        </button>
      </div>

      {showAddTool && (
        <div className="flex gap-2 mb-4 items-center">
          <input value={toolForm.name} onChange={e => setToolForm({ ...toolForm, name: e.target.value })} placeholder="Tool name"
            className="px-2 py-1.5 rounded text-xs bg-transparent outline-none flex-1" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <select value={toolForm.category} onChange={e => setToolForm({ ...toolForm, category: e.target.value })}
            className="px-2 py-1.5 rounded text-xs bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="framework">Framework</option><option value="cli">CLI</option><option value="sdk">SDK</option><option value="api">API</option><option value="general">General</option>
          </select>
          <button onClick={addTool} className="px-3 py-1.5 rounded text-xs" style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}>Add</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Tool List */}
        <div className="col-span-1">
          <p className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>Tools</p>
          {tools.map(t => (
            <div key={t.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer mb-1 group"
              style={{ background: selectedTool === t.id ? 'var(--bg-surface)' : 'transparent', color: 'var(--text-secondary)' }}
              onClick={() => setSelectedTool(t.id)}
            >
              <Tag size={10} style={{ color: 'var(--accent)' }} />
              <span className="text-xs flex-1">{t.name}</span>
              <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{t.category}</span>
              <button onClick={e => { e.stopPropagation(); deleteTool(t.id); }} className="opacity-0 group-hover:opacity-100 p-0.5">
                <Trash2 size={9} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
          ))}
          {tools.length === 0 && <p className="text-[10px] py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>No tools added</p>}
        </div>

        {/* Commands + Changes */}
        <div className="col-span-2">
          {selectedTool ? (
            <>
              <p className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>Commands</p>
              {commands.length > 0 ? commands.map(c => (
                <div key={c.id} className="flex items-center gap-2 py-1 border-b" style={{ borderColor: 'var(--border)' }}>
                  <code className="text-[11px] font-mono" style={{ color: c.deprecated ? 'var(--error)' : 'var(--accent)' }}>
                    {c.deprecated ? <s>{c.command}</s> : c.command}
                  </code>
                  <span className="text-[10px] flex-1" style={{ color: 'var(--text-tertiary)' }}>{c.description}</span>
                  <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>v{c.version}</span>
                </div>
              )) : <p className="text-[10px] py-2" style={{ color: 'var(--text-tertiary)' }}>No commands for this tool</p>}

              {changes.length > 0 && (
                <>
                  <p className="text-[10px] uppercase tracking-wider font-medium mt-4 mb-2" style={{ color: 'var(--text-tertiary)' }}>API Changes</p>
                  {changes.map(c => (
                    <div key={c.id} className="px-2 py-1.5 rounded mb-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <AlertCircle size={10} style={{ color: c.change_type === 'breaking' ? 'var(--error)' : 'var(--warning)' }} />
                        <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>{c.change_type} — v{c.version}</span>
                      </div>
                      {c.old_usage && <p className="text-[10px] font-mono" style={{ color: 'var(--error)' }}>- {c.old_usage}</p>}
                      {c.new_usage && <p className="text-[10px] font-mono" style={{ color: 'var(--success)' }}>+ {c.new_usage}</p>}
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <p className="text-xs py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Select a tool to view commands</p>
          )}
        </div>
      </div>
    </div>
  );
}
