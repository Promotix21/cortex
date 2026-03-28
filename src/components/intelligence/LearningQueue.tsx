import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Sparkles, Check, X, Bug, Puzzle } from 'lucide-react';

interface LearningQueueProps {
  projectId: string;
}

interface QueueItem {
  id: string;
  type: 'pattern' | 'debug';
  title: string;
  description: string;
  code?: string;
}

export function LearningQueue({ projectId }: LearningQueueProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const data = await api.getLearningQueue(projectId);
      const mapped: QueueItem[] = [
        ...data.patterns.map((p: any) => ({
          id: p.id,
          type: 'pattern' as const,
          title: p.title,
          description: p.description,
          code: p.code,
        })),
        ...data.debug.map((d: any) => ({
          id: d.id,
          type: 'debug' as const,
          title: d.problem,
          description: `${d.root_cause} → ${d.solution}`,
        })),
      ];
      setItems(mapped);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [projectId]);

  const handleReview = async (id: string, type: 'pattern' | 'debug', action: 'approve' | 'dismiss') => {
    await api.reviewLearningItem(id, type, action);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  if (loading) {
    return (
      <div style={{ padding: 20, color: 'var(--text-tertiary)', fontSize: 14 }}>
        Loading learning queue...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center" style={{ padding: 32 }}>
        <Sparkles size={28} className="mx-auto" style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
          No pending items — auto-detected patterns and errors will appear here
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 16 }}>
        <Sparkles size={16} style={{ color: 'var(--warning)' }} />
        <span className="font-semibold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          Learning Queue
        </span>
        <span
          className="rounded-full font-bold"
          style={{
            padding: '2px 10px',
            fontSize: 12,
            background: 'var(--warning-dim)',
            color: 'var(--warning)',
          }}
        >
          {items.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div
            key={item.id}
            className="rounded-xl"
            style={{
              padding: '14px 18px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="flex items-start" style={{ gap: 12 }}>
              {item.type === 'pattern' ? (
                <Puzzle size={16} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
              ) : (
                <Bug size={16} style={{ color: 'var(--error)', marginTop: 2, flexShrink: 0 }} />
              )}
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="font-semibold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  {item.title.slice(0, 120)}
                </div>
                {item.description && (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {item.description.slice(0, 200)}
                  </div>
                )}
                {item.code && (
                  <pre
                    className="rounded-lg overflow-auto"
                    style={{
                      padding: '8px 12px',
                      marginTop: 8,
                      fontSize: 12,
                      maxHeight: 100,
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {item.code.slice(0, 300)}
                  </pre>
                )}
              </div>
              <div className="flex" style={{ gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => handleReview(item.id, item.type, 'approve')}
                  className="rounded-lg transition-colors"
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    background: 'var(--success-dim)',
                    color: 'var(--success)',
                  }}
                  title="Approve — promotes to probable"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => handleReview(item.id, item.type, 'dismiss')}
                  className="rounded-lg transition-colors"
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    background: 'var(--error-dim)',
                    color: 'var(--error)',
                  }}
                  title="Dismiss — marks as deprecated"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
