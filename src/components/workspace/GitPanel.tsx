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
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Git is not initialized in this project</p>
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
      case 'modified': return <FileEdit size={11} style={{ color: 'var(--warning)' }} />;
      case 'created': case 'untracked': return <FilePlus size={11} style={{ color: 'var(--success)' }} />;
      case 'deleted': return <FileX size={11} style={{ color: 'var(--error)' }} />;
      case 'conflicted': return <AlertCircle size={11} style={{ color: 'var(--error)' }} />;
      default: return <FileEdit size={11} />;
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <GitBranch size={16} style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Git</h3>
        {status?.branch && (
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--accent)' }}>
            {status.branch}
          </span>
        )}
        {status?.isClean && <Check size={12} style={{ color: 'var(--success)' }} />}
        <div className="flex-1" />
        <button onClick={refresh} className="p-1 rounded hover:bg-[var(--bg-hover)]" title="Refresh">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-tertiary)' }} />
        </button>
        <button onClick={handlePull} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-secondary)' }}>
          <ArrowDown size={11} /> Pull
        </button>
        <button onClick={handlePush} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-secondary)' }}>
          <ArrowUp size={11} /> Push
        </button>
      </div>

      {error && (
        <div className="text-xs px-3 py-2 rounded mb-3" style={{ background: 'rgba(243,139,168,0.1)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Ahead/Behind */}
      {status && (status.ahead > 0 || status.behind > 0) && (
        <div className="flex gap-3 mb-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {status.ahead > 0 && <span>{status.ahead} ahead</span>}
          {status.behind > 0 && <span>{status.behind} behind</span>}
        </div>
      )}

      {/* Dirty Files */}
      {dirtyFiles.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Changes ({dirtyFiles.length})
            </p>
            <button
              onClick={fetchDiff}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-[var(--bg-hover)]"
              style={{ color: 'var(--accent)' }}
            >
              View Diff
            </button>
          </div>
          {dirtyFiles.map(f => (
            <div key={f.path + f.type} className="flex items-center gap-2 py-1 text-xs">
              {fileIcon(f.type)}
              <span style={{ color: 'var(--text-secondary)' }}>{f.path}</span>
              <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{f.type}</span>
            </div>
          ))}
        </div>
      )}

      {status?.isClean && dirtyFiles.length === 0 && (
        <div className="text-xs py-4 text-center mb-4" style={{ color: 'var(--text-tertiary)' }}>
          Working tree is clean
        </div>
      )}

      {/* Diff */}
      {showDiff && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-tertiary)' }}>Diff</p>
            <button onClick={() => setShowDiff(false)} className="text-[10px] px-2 py-0.5 rounded hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-tertiary)' }}>Hide</button>
          </div>
          <pre
            className="text-[11px] p-3 rounded-lg overflow-auto max-h-64"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            {diff || 'No diff'}
          </pre>
        </div>
      )}

      {/* Commit Log */}
      {commits.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Recent Commits
          </p>
          {commits.map(c => (
            <div key={c.hashShort} className="flex items-start gap-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-mono shrink-0 mt-0.5" style={{ color: 'var(--accent)' }}>
                {c.hashShort}
              </span>
              <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>
                {c.message}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <Clock size={9} style={{ color: 'var(--text-tertiary)' }} />
                <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
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
