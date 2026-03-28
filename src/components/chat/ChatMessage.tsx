import { useState } from 'react';
import { User, Bot, Copy, Check, Bookmark } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/stores/chat-store';

interface ChatMessageProps {
  message: ChatMessageType;
  projectId: string;
  isStreaming?: boolean;
}

export function ChatMessage({ message, projectId: _projectId, isStreaming }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex" style={{ gap: 12, marginBottom: 20 }}>
      {/* Avatar */}
      <div
        className="rounded-lg flex items-center justify-center shrink-0"
        style={{
          width: 32,
          height: 32,
          marginTop: 2,
          background: isUser ? 'var(--bg-surface)' : 'rgba(137, 180, 250, 0.15)',
          border: '1px solid var(--border)',
        }}
      >
        {isUser ? (
          <User size={16} style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <Bot size={16} style={{ color: 'var(--accent)' }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
          <span className="font-medium" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {isUser ? 'You' : 'Claude'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div
          className="leading-relaxed whitespace-pre-wrap break-words"
          style={{ fontSize: 14, color: isUser ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          {message.content}
          {isStreaming && (
            <span className="inline-block animate-pulse" style={{ width: 6, height: 14, marginLeft: 2, background: 'var(--accent)' }} />
          )}
        </div>

        {/* Actions (assistant messages only, not streaming) */}
        {!isUser && !isStreaming && message.content && (
          <div className="flex items-center transition-opacity"
            style={{ gap: 6, marginTop: 8, opacity: undefined }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
          >
            <button
              onClick={handleCopy}
              className="flex items-center rounded hover:bg-[var(--bg-hover)] transition-colors"
              style={{ gap: 4, padding: '4px 10px', fontSize: 12, color: 'var(--text-tertiary)' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              className="flex items-center rounded hover:bg-[var(--bg-hover)] transition-colors"
              style={{ gap: 4, padding: '4px 10px', fontSize: 12, color: 'var(--text-tertiary)' }}
              title="Save as pattern (Phase 6)"
            >
              <Bookmark size={14} />
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
