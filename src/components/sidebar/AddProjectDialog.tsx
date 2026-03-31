import { useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { X, FolderOpen } from 'lucide-react';

// Detect if running inside Tauri
const isTauri = !!(window as any).__TAURI_INTERNALS__;

interface AddProjectDialogProps {
  onClose: () => void;
}

export function AddProjectDialog({ onClose }: AddProjectDialogProps) {
  const { createProject, setActiveProject } = useProjectStore();
  const [name, setName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleBrowse = async () => {
    try {
      if (isTauri) {
        // Tauri native file dialog
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Select Project Folder',
        });
        if (selected && typeof selected === 'string') {
          setProjectPath(selected);
          if (!name.trim()) {
            const folderName = selected.split('/').filter(Boolean).pop() || '';
            setName(folderName);
          }
        }
      } else {
        // Browser mode — ask sidecar to open native OS file dialog
        const result = await api.browseFolder();
        if (result.path) {
          setProjectPath(result.path);
          if (!name.trim() && result.name) {
            setName(result.name);
          }
        }
      }
    } catch {
      // User cancelled or sidecar unavailable
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !projectPath.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      const project = await createProject({ name: name.trim(), path: projectPath.trim() });
      setActiveProject(project.id);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add project"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-xl"
        style={{ padding: 24, width: 460, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
          <h2 className="font-semibold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
            Add Project
          </h2>
          <button onClick={onClose} className="rounded hover:bg-[var(--bg-hover)]" style={{ padding: 6 }}>
            <X size={16} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 16 }}>
          {/* Folder Picker */}
          <div>
            <label className="block" style={{ fontSize: 14, marginBottom: 6, color: 'var(--text-secondary)' }}>
              Project Folder
            </label>
            <div className="flex" style={{ gap: 12 }}>
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder={isTauri ? 'Select a folder...' : '/home/user/projects/my-project'}
                className="flex-1 rounded-xl outline-none"
                style={{
                  padding: '12px 16px',
                  fontSize: 14,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                readOnly={false}
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="rounded-xl font-medium flex items-center transition-colors hover:opacity-90"
                style={{
                  gap: 8,
                  padding: '10px 20px',
                  fontSize: 14,
                  background: 'var(--accent)',
                  color: 'var(--bg-primary)',
                }}
              >
                <FolderOpen size={16} />
                Browse
              </button>
            </div>
          </div>

          {/* Project Name */}
          <div>
            <label className="block" style={{ fontSize: 14, marginBottom: 6, color: 'var(--text-secondary)' }}>
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-filled from folder name"
              className="w-full rounded-xl outline-none"
              style={{
                padding: '12px 16px',
                fontSize: 14,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 14, color: 'var(--error)' }}>
              {error}
            </p>
          )}

          <div className="flex justify-end" style={{ gap: 12, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl"
              style={{
                padding: '10px 20px',
                fontSize: 14,
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !projectPath.trim()}
              className="rounded-xl font-medium disabled:opacity-50"
              style={{
                padding: '10px 20px',
                fontSize: 14,
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
              }}
            >
              {submitting ? 'Adding...' : 'Add Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
