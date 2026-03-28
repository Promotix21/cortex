import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { Send } from 'lucide-react';

interface ChatInputProps {
  projectId: string;
  disabled: boolean;
}

export function ChatInput({ projectId, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage } = useChatStore();

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '0';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleSubmit = () => {
    const msg = input.trim();
    if (!msg || disabled) return;
    setInput('');
    sendMessage(projectId, msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="shrink-0"
      style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
    >
      <div
        className="flex items-end rounded-xl"
        style={{ gap: 12, padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Waiting for response...' : 'Ask about your project... (Enter to send, Shift+Enter for newline)'}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent border-none outline-none resize-none"
          style={{
            color: 'var(--text-primary)',
            fontSize: 14,
            minHeight: '24px',
            maxHeight: '120px',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          className="rounded transition-colors disabled:opacity-30"
          style={{ padding: 8, color: 'var(--accent)' }}
        >
          <Send size={18} />
        </button>
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: 8, padding: '0 4px' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Claude Sonnet 4 · Project Brain injected as context
        </span>
      </div>
    </div>
  );
}
