import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import {
  GitBranch, RefreshCw, ArrowDown, ArrowUp,
  FileEdit, FilePlus, FileX, AlertCircle, Check, Clock,
} from 'lucide-react';

interface GitStatus {
  branch: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  not_added: string[];
  created: string[];
  deleted: string[];
  conflicted: string[];
  isClean: boolean;
}

interface Commit {
  hashShort: string;
  message: string;
  author: string;
  date: string;
}

export function GitPanel() {
  const project = useProjectStore(s => s.activeProject());
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDiff, setShowDiff] = useState(false);

  const refresh = async () => {
    if (!project || !project.git_enabled) return;
    setLoading(true);
    setError('');
    try {
      const [s, l] = await Promise.all([
        api.getGitStatus(project.id),
        api.getGitLog(project.id, 15),
      ]);
      setStatus(s);
      setCommits(l.commits);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDiff = async () => {
    if (!project) return;
    try {
      const d = await api.getGitDiff(project.id);
      setDiff(d.diff || d.stagedDiff || 'No changes');
      setShowDiff(true);
    } catch { /* silent */ }
  };

  const handlePull = async () => {
    if (!project) return;
    try {
      await api.gitPull(project.id);
      refresh();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePush = async () => {
    if (!project) return;
    try {
      await api.gitPush(project.id);
      refresh();
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => { refresh(); }, [project?.id]);

  if (!project) return null;

  if (!project.git_enabled) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Git is not initialized in this project</p>
      </div>
    );
  }

  const dirtyFiles = [
    ...(status?.modified || []).map(f => ({ path: f, type: 'modified' as const })),
    ...(status?.created || []).map(f => ({ path: f, type: 'created' as const })),
    ...(status?.not_added || []).map(f => ({ path: f, type: 'untracked' as const })),
    ...(status?.deleted || []).map(f => ({ path: f, type: 'deleted' as const })),
    ...(status?.conflicted || []).map(f => ({ path: f, type: 'conflicted' as const })),
  ];

  const fileIcon = (type: string) => {
    switch (type) {
      case 'modified': return <FileEdit size={16} style={{ color: 'var(--warning)' }} />;
      case 'created': case 'untracked': return <FilePlus size={16} style={{ color: 'var(--success)' }} />;
      case 'deleted': return <FileX size={16} style={{ color: 'var(--error)' }} />;
      case 'conflicted': return <AlertCircle size={16} style={{ color: 'var(--error)' }} />;
      default: return <FileEdit size={16} />;
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
        <GitBranch size={18} style={{ color: 'var(--accent)' }} />
        <h3 className="font-medium" style={{ fontSize: 16, color: 'var(--text-primary)' }}>Git</h3>
        {status?.branch && (
          <span className="rounded-lg" style={{ fontSize: 13, padding: '4px 12px', background: 'var(--bg-surface)', color: 'var(--accent)' }}>
            {status.branch}
          </span>
        )}
        {status?.isClean && <Check size={16} style={{ color: 'var(--success)' }} />}
        <div className="flex-1" />
        <button onClick={refresh} className="rounded hover:bg-[var(--bg-hover)]" style={{ padding: 6 }} title="Refresh">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-tertiary)' }} />
        </button>
        <button onClick={handlePull} className="flex items-center rounded hover:bg-[var(--bg-hover)]" style={{ gap: 6, padding: '8px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
          <ArrowDown size={14} /> Pull
        </button>
        <button onClick={handlePush} className="flex items-center rounded hover:bg-[var(--bg-hover)]" style={{ gap: 6, padding: '8px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
          <ArrowUp size={14} /> Push
        </button>
      </div>

      {error && (
        <div className="rounded-xl" style={{ fontSize: 14, padding: '12px 16px', marginBottom: 16, background: 'rgba(243,139,168,0.1)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Ahead/Behind */}
      {status && (status.ahead > 0 || status.behind > 0) && (
        <div className="flex" style={{ gap: 16, marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          {status.ahead > 0 && <span>{status.ahead} ahead</span>}
          {status.behind > 0 && <span>{status.behind} behind</span>}
        </div>
      )}

      {/* Dirty Files */}
      {dirtyFiles.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <p className="uppercase tracking-wider font-medium" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Changes ({dirtyFiles.length})
            </p>
            <button
              onClick={fetchDiff}
              className="rounded hover:bg-[var(--bg-hover)]"
              style={{ fontSize: 12, padding: '4px 12px', color: 'var(--accent)' }}
            >
              View Diff
            </button>
          </div>
          {dirtyFiles.map(f => (
            <div key={f.path + f.type} className="flex items-center" style={{ gap: 10, padding: '6px 0', fontSize: 14 }}>
              {fileIcon(f.type)}
              <span style={{ color: 'var(--text-secondary)' }}>{f.path}</span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{f.type}</span>
            </div>
          ))}
        </div>
      )}

      {status?.isClean && dirtyFiles.length === 0 && (
        <div className="text-center" style={{ fontSize: 14, padding: '20px 0', marginBottom: 24, color: 'var(--text-tertiary)' }}>
          Working tree is clean
        </div>
      )}

      {/* Diff */}
      {showDiff && (
        <div style={{ marginBottom: 24 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <p className="uppercase tracking-wider font-medium" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Diff</p>
            <button onClick={() => setShowDiff(false)} className="rounded hover:bg-[var(--bg-hover)]" style={{ fontSize: 12, padding: '4px 12px', color: 'var(--text-tertiary)' }}>Hide</button>
          </div>
          <pre
            className="rounded-xl overflow-auto"
            style={{ fontSize: 13, padding: 16, maxHeight: 256, background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {diff || 'No diff'}
          </pre>
        </div>
      )}

      {/* Commit Log */}
      {commits.length > 0 && (
        <div>
          <p className="uppercase tracking-wider font-medium" style={{ fontSize: 13, marginBottom: 12, color: 'var(--text-tertiary)' }}>
            Recent Commits
          </p>
          {commits.map(c => (
            <div key={c.hashShort} className="flex items-start" style={{ gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="font-mono shrink-0" style={{ fontSize: 12, marginTop: 2, color: 'var(--accent)' }}>
                {c.hashShort}
              </span>
              <span className="flex-1" style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {c.message}
              </span>
              <div className="flex items-center shrink-0" style={{ gap: 6 }}>
                <Clock size={14} style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {new Date(c.date).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
