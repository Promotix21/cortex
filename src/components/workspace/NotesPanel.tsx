import { useEffect, useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { FileText, Save, Check } from 'lucide-react';

export function NotesPanel() {
  const project = useProjectStore(s => s.activeProject());
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(true);
  const [, setLastSaved] = useState('');
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!project) return;
    api.getNote(project.id).then(({ note }) => {
      setContent(note.content || '');
      setLastSaved(note.updated_at || '');
      setSaved(true);
    }).catch(() => {});
  }, [project?.id]);

  const doSave = useCallback(async (text: string) => {
    if (!project) return;
    try {
      const { updated_at } = await api.saveNote(project.id, text) as any;
      setLastSaved(updated_at || new Date().toISOString());
      setSaved(true);
    } catch { /* silent */ }
  }, [project?.id]);

  const handleChange = (value: string) => {
    setContent(value);
    setSaved(false);

    // Debounced autosave (1s)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => doSave(value), 1000);
  };

  if (!project) return null;

  return (
    <div className="flex flex-col h-full max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Notes
        </h3>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {saved ? (
            <>
              <Check size={10} style={{ color: 'var(--success)' }} />
              <span>Saved</span>
            </>
          ) : (
            <>
              <Save size={10} />
              <span>Saving...</span>
            </>
          )}
        </div>
      </div>

      {/* Editor */}
      <textarea
        value={content}
        onChange={e => handleChange(e.target.value)}
        placeholder="Write notes for this project... (Markdown supported)"
        className="flex-1 w-full bg-transparent border rounded-lg p-4 text-xs outline-none resize-none"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          lineHeight: 1.7,
        }}
        spellCheck={false}
      />
    </div>
  );
}
