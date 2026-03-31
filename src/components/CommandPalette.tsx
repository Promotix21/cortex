import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Folder, Brain, MessageSquare, Bug, Lightbulb, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useProjectStore } from '@/stores/project-store';
import { useNavigationStore } from '@/stores/navigation-store';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

type ResultCategory = 'projects' | 'brains' | 'sessions' | 'patterns' | 'debug';

const CATEGORY_META: Record<ResultCategory, { label: string; icon: React.ElementType; color: string }> = {
  projects: { label: 'Projects', icon: Folder, color: 'var(--accent)' },
  brains: { label: 'Project Brains', icon: Brain, color: 'var(--mauve)' },
  sessions: { label: 'Session History', icon: MessageSquare, color: 'var(--blue)' },
  patterns: { label: 'Patterns', icon: Lightbulb, color: 'var(--yellow)' },
  debug: { label: 'Debug Memory', icon: Bug, color: 'var(--red)' },
};

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<ResultCategory, any[]>>({
    projects: [], brains: [], sessions: [], patterns: [], debug: [],
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setActiveProject = useProjectStore(s => s.setActiveProject);
  const setActivity = useNavigationStore(s => s.setActivity);
  const viewSession = useNavigationStore(s => s.viewSession);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({ projects: [], brains: [], sessions: [], patterns: [], debug: [] });
      setTotal(0);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults({ projects: [], brains: [], sessions: [], patterns: [], debug: [] });
      setTotal(0);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.globalSearch(query);
        setResults(data.results as Record<ResultCategory, any[]>);
        setTotal(data.total);
        setSelectedIndex(0);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Flatten results for keyboard navigation
  const flatResults = useCallback(() => {
    const items: { category: ResultCategory; item: any; index: number }[] = [];
    for (const cat of Object.keys(CATEGORY_META) as ResultCategory[]) {
      for (const item of results[cat]) {
        items.push({ category: cat, item, index: items.length });
      }
    }
    return items;
  }, [results]);

  const flat = flatResults();

  const handleSelect = (category: ResultCategory, item: any) => {
    onClose();
    switch (category) {
      case 'projects':
        setActiveProject(item.id);
        setActivity('dashboard');
        break;
      case 'brains':
        setActiveProject(item.project_id);
        setActivity('brain');
        break;
      case 'sessions':
        setActiveProject(item.project_id);
        viewSession(item.session_id);
        break;
      case 'patterns':
        if (item.source_project_id) setActiveProject(item.source_project_id);
        setActivity('brain');
        break;
      case 'debug':
        if (item.source_project_id) setActiveProject(item.source_project_id);
        setActivity('brain');
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flat.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter' && flat[selectedIndex]) {
      const { category, item } = flat[selectedIndex];
      handleSelect(category, item);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette — search projects, sessions, patterns"
      style={{ paddingTop: 80, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{
          width: 620,
          maxHeight: 520,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-active)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Search input */}
        <div
          className="flex items-center"
          style={{ padding: '16px 20px', gap: 12, borderBottom: '1px solid var(--border)' }}
        >
          <Search size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search across all projects, brains, sessions, patterns..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-transparent border-none outline-none flex-1"
            style={{ fontSize: 16, color: 'var(--text-primary)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--text-tertiary)' }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '8px 0' }}>
          {loading && (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
              Searching...
            </div>
          )}

          {!loading && query.length >= 2 && total === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 14, color: 'var(--text-tertiary)' }}>
              No results for "{query}"
            </div>
          )}

          {!loading && total > 0 && (
            <>
              {(Object.keys(CATEGORY_META) as ResultCategory[]).map(cat => {
                const items = results[cat];
                if (items.length === 0) return null;
                const { label, icon: Icon, color } = CATEGORY_META[cat];

                return (
                  <div key={cat}>
                    <div
                      className="flex items-center"
                      style={{ padding: '8px 20px', gap: 8 }}
                    >
                      <Icon size={14} style={{ color }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {label} ({items.length})
                      </span>
                    </div>
                    {items.map((item: any, i: number) => {
                      const globalIdx = flat.findIndex(f => f.category === cat && f.item === item);
                      const isSelected = globalIdx === selectedIndex;
                      return (
                        <button
                          key={item.id || `${cat}-${i}`}
                          className="w-full text-left"
                          onClick={() => handleSelect(cat, item)}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '10px 20px 10px 36px',
                            gap: 2,
                            background: isSelected ? 'var(--bg-hover)' : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                            {renderTitle(cat, item)}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {renderSubtitle(cat, item)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}

          {!loading && !query && (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
              Type to search across all projects
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between"
          style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-tertiary)' }}
        >
          <span>{total > 0 ? `${total} results` : ''}</span>
          <span style={{ display: 'flex', gap: 12 }}>
            <kbd style={kbdStyle}>↑↓</kbd> navigate
            <kbd style={kbdStyle}>↵</kbd> select
            <kbd style={kbdStyle}>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
};

function renderTitle(cat: ResultCategory, item: any): string {
  switch (cat) {
    case 'projects': return item.name;
    case 'brains': return item.project_name;
    case 'sessions': return `${item.session_name} — ${item.prompt_text?.slice(0, 80)}`;
    case 'patterns': return item.title;
    case 'debug': return item.problem?.slice(0, 80);
  }
}

function renderSubtitle(cat: ResultCategory, item: any): string {
  switch (cat) {
    case 'projects': return `${item.company || 'No company'} · ${item.type} · ${item.path}`;
    case 'brains': return item.summary?.slice(0, 120) || 'No summary';
    case 'sessions': return `${item.project_name} · ${item.timestamp}`;
    case 'patterns': return `${item.project_name || 'Global'} · ${item.description?.slice(0, 100)}`;
    case 'debug': return `${item.project_name || 'Global'} · ${item.root_cause?.slice(0, 100)}`;
  }
}
