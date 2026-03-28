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
      <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
        <span className="font-medium" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          Project Brain — auto-injected into AI context
        </span>
        <div className="flex-1" />
        <div className="flex items-center" style={{ gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
          {saved ? <><Check size={14} style={{ color: 'var(--success)' }} /> Saved</> : <><Save size={14} /> Saving...</>}
        </div>
      </div>

      {fields.map(({ key, label, placeholder }) => (
        <div key={key} style={{ marginBottom: 24 }}>
          <label className="uppercase tracking-wider font-medium block" style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-tertiary)' }}>
            {label}
          </label>
          <textarea
            value={(brain as any)[key] || ''}
            onChange={e => handleChange(key, e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full bg-transparent rounded-xl outline-none resize-none"
            style={{ padding: '12px 16px', fontSize: 14, border: '1px solid var(--border)', color: 'var(--text-primary)', lineHeight: 1.6 }}
          />
        </div>
      ))}
    </div>
  );
}
