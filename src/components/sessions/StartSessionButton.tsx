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
        className="flex items-center rounded-xl transition-all hover:scale-[1.02]"
        style={{
          gap: 10,
          padding: '12px 24px',
          fontSize: 14,
          fontWeight: 700,
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
          boxShadow: '0 2px 8px rgba(137,180,250,0.25)',
        }}
      >
        <Play size={16} />
        Start Claude Code
      </button>
    );
  }

  return (
    <div className="flex items-center" style={{ gap: 10 }}>
      <input
        type="text"
        value={sessionName}
        onChange={(e) => setSessionName(e.target.value)}
        placeholder={`${projectName}-session`}
        className="rounded-xl outline-none"
        style={{
          width: 260,
          padding: '12px 18px',
          fontSize: 14,
          background: 'var(--bg-primary)',
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
        className="rounded-xl disabled:opacity-50"
        style={{
          padding: '12px 24px',
          fontSize: 14,
          fontWeight: 700,
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
        }}
      >
        {spawning ? 'Starting...' : 'Start'}
      </button>
      <button
        onClick={() => setShowInput(false)}
        className="flex items-center justify-center rounded-xl"
        style={{
          width: 42,
          height: 42,
          background: 'var(--bg-hover)',
          color: 'var(--text-tertiary)',
        }}
      >
        <X size={18} />
      </button>
      {error && <span style={{ fontSize: 13, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}
