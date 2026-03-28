import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { FileText, Copy, Check, RefreshCw } from 'lucide-react';

interface HandoffViewerProps {
  sessionId: string;
}

export function HandoffViewer({ sessionId }: HandoffViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchHandoff = async () => {
    setLoading(true);
    try {
      const data = await api.getSessionHandoff(sessionId);
      setContent(data.handoff);
    } catch {
      setContent(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHandoff();
  }, [sessionId]);

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      await api.generateHandoff(sessionId);
      await fetchHandoff();
    } catch {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: 32, color: 'var(--text-tertiary)' }}>
        <RefreshCw size={16} className="animate-spin" />
        <span style={{ marginLeft: 8, fontSize: 14 }}>Loading handoff...</span>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="text-center" style={{ padding: 32 }}>
        <FileText size={28} className="mx-auto" style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          No handoff document generated yet
        </p>
        <button
          onClick={handleGenerate}
          className="rounded-xl font-semibold transition-colors"
          style={{
            padding: '10px 20px',
            fontSize: 14,
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            border: '1px solid rgba(137,180,250,0.25)',
          }}
        >
          Generate Handoff
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 12, marginBottom: 16 }}>
        <FileText size={18} style={{ color: 'var(--accent)' }} />
        <span className="font-bold flex-1" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
          Session Handoff
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center rounded-lg transition-colors"
          style={{
            gap: 6,
            padding: '6px 14px',
            fontSize: 13,
            background: 'var(--bg-hover)',
            color: copied ? 'var(--success)' : 'var(--text-secondary)',
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={handleGenerate}
          className="flex items-center rounded-lg transition-colors"
          style={{
            gap: 6,
            padding: '6px 14px',
            fontSize: 13,
            background: 'var(--bg-hover)',
            color: 'var(--text-secondary)',
          }}
        >
          <RefreshCw size={14} />
          Regenerate
        </button>
      </div>

      {/* Content */}
      <div
        className="rounded-xl overflow-auto font-mono"
        style={{
          padding: '20px 24px',
          maxHeight: 500,
          fontSize: 13,
          lineHeight: 1.6,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {content}
      </div>
    </div>
  );
}
