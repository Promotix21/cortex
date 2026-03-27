import { useState } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { Play, X } from 'lucide-react';

interface StartSessionButtonProps {
  projectId: string;
  projectName: string;
}

export function StartSessionButton({ projectId, projectName }: StartSessionButtonProps) {
  const { spawnSession } = useSessionStore();
  const [showInput, setShowInput] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [spawning, setSpawning] = useState(false);
  const [error, setError] = useState('');

  const handleSpawn = async () => {
    const name = sessionName.trim() || `${projectName}-session`;
    setSpawning(true);
    setError('');
    try {
      await spawnSession(projectId, name);
      setShowInput(false);
      setSessionName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSpawning(false);
    }
  };

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
        style={{
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
        }}
      >
        <Play size={12} />
        Start Claude Code
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={sessionName}
        onChange={(e) => setSessionName(e.target.value)}
        placeholder={`${projectName}-session`}
        className="px-2 py-1 rounded text-xs outline-none w-48"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSpawn();
          if (e.key === 'Escape') setShowInput(false);
        }}
      />
      <button
        onClick={handleSpawn}
        disabled={spawning}
        className="px-2 py-1 rounded text-xs font-medium disabled:opacity-50"
        style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
      >
        {spawning ? '...' : 'Start'}
      </button>
      <button
        onClick={() => setShowInput(false)}
        className="p-1 rounded hover:bg-[var(--bg-hover)]"
      >
        <X size={12} style={{ color: 'var(--text-tertiary)' }} />
      </button>
      {error && <span className="text-[10px]" style={{ color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}
