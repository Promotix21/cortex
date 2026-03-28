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
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        style={{
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
        }}
      >
        <Play size={14} />
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
        className="px-3 py-2 rounded-lg text-sm outline-none w-56"
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
        className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
      >
        {spawning ? '...' : 'Start'}
      </button>
      <button
        onClick={() => setShowInput(false)}
        className="p-2 rounded-lg hover:bg-[var(--bg-hover)]"
      >
        <X size={16} style={{ color: 'var(--text-tertiary)' }} />
      </button>
      {error && <span className="text-xs" style={{ color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}
