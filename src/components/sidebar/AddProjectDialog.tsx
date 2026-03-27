import { useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { open } from '@tauri-apps/plugin-dialog';
import { X, FolderOpen } from 'lucide-react';

interface AddProjectDialogProps {
  onClose: () => void;
}

export function AddProjectDialog({ onClose }: AddProjectDialogProps) {
  const { createProject, setActiveProject } = useProjectStore();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });
      if (selected && typeof selected === 'string') {
        setPath(selected);
        // Auto-fill name from folder name if empty
        if (!name.trim()) {
          const folderName = selected.split('/').filter(Boolean).pop() || '';
          setName(folderName);
        }
      }
    } catch {
      // User cancelled
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !path.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      const project = await createProject({ name: name.trim(), path: path.trim() });
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
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-lg p-5 w-[420px]"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Add Project
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-hover)]">
            <X size={14} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Folder Picker */}
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              Project Folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="Select a folder..."
                className="flex-1 px-3 py-2 rounded text-xs outline-none"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                readOnly
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="px-3 py-2 rounded text-xs font-medium flex items-center gap-1.5 transition-colors hover:opacity-90"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--bg-primary)',
                }}
              >
                <FolderOpen size={13} />
                Browse
              </button>
            </div>
          </div>

          {/* Project Name */}
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-filled from folder name"
              className="w-full px-3 py-2 rounded text-xs outline-none"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--error)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs"
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !path.trim()}
              className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
              style={{
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
