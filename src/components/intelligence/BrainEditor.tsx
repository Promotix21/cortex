import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { Save, Check } from 'lucide-react';

const fields = [
  { key: 'summary', label: 'Project Summary', placeholder: 'What this project is and does...' },
  { key: 'architectureNotes', label: 'Architecture', placeholder: 'Tech stack, folder structure, deployment model...' },
  { key: 'conventions', label: 'Conventions', placeholder: 'Code style, naming, commit format...' },
  { key: 'knownIssues', label: 'Known Issues', placeholder: 'Active bugs, workarounds, tech debt...' },
  { key: 'decisions', label: 'Key Decisions', placeholder: 'Architectural decisions with rationale...' },
  { key: 'dependenciesNotes', label: 'Dependencies', placeholder: 'Critical dependencies, version constraints...' },
] as const;

export function BrainEditor({ projectId }: { projectId: string }) {
  const [brain, setBrain] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    api.getProjectBrain(projectId).then(({ brain: b }) => {
      setBrain(b || {});
      setSaved(true);
    }).catch(() => {});
  }, [projectId]);

  const doSave = useCallback(async (data: Record<string, string>) => {
    try {
      await api.updateProjectBrain(projectId, data);
      setSaved(true);
    } catch { /* silent */ }
  }, [projectId]);

  const handleChange = (key: string, value: string) => {
    const updated = { ...brain, [key]: value };
    setBrain(updated);
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => doSave(updated), 1500);
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          Project Brain — auto-injected into AI context
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          {saved ? <><Check size={10} style={{ color: 'var(--success)' }} /> Saved</> : <><Save size={10} /> Saving...</>}
        </div>
      </div>

      {fields.map(({ key, label, placeholder }) => (
        <div key={key} className="mb-4">
          <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {label}
          </label>
          <textarea
            value={(brain as any)[key] || ''}
            onChange={e => handleChange(key, e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full bg-transparent border rounded px-3 py-2 text-xs outline-none resize-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', lineHeight: 1.6 }}
          />
        </div>
      ))}
    </div>
  );
}
