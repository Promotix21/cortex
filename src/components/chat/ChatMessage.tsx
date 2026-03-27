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
    <div className={`flex gap-2.5 mb-4 ${isUser ? '' : ''}`}>
      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: isUser ? 'var(--bg-surface)' : 'rgba(137, 180, 250, 0.15)',
          border: '1px solid var(--border)',
        }}
      >
        {isUser ? (
          <User size={12} style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <Bot size={12} style={{ color: 'var(--accent)' }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {isUser ? 'You' : 'Claude'}
          </span>
          <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div
          className="text-xs leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: isUser ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          {message.content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse" style={{ background: 'var(--accent)' }} />
          )}
        </div>

        {/* Actions (assistant messages only, not streaming) */}
        {!isUser && !isStreaming && message.content && (
          <div className="flex items-center gap-1 mt-1.5 opacity-0 hover:opacity-100 transition-opacity"
            style={{ opacity: undefined }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
          >
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              title="Save as pattern (Phase 6)"
            >
              <Bookmark size={10} />
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
