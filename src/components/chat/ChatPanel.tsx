import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useProjectStore } from '@/stores/project-store';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { Brain, Trash2, Download, AlertCircle } from 'lucide-react';

export function ChatPanel() {
  const project = useProjectStore(s => s.activeProject());
  const { messages, streaming, streamingContent, error, fetchHistory, clearHistory } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project) {
      fetchHistory(project.id);
    }
  }, [project?.id, fetchHistory]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        <p className="text-xs">Select a project to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        <Brain size={14} style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
          AI Chat — {project.name}
        </span>
        <button
          onClick={() => window.open(`http://localhost:4700/api/chat/${project.id}/export`, '_blank')}
          className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
          title="Export chat"
        >
          <Download size={12} style={{ color: 'var(--text-tertiary)' }} />
        </button>
        <button
          onClick={() => { if (confirm('Clear all chat history for this project?')) clearHistory(project.id); }}
          className="p-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
          title="Clear history"
        >
          <Trash2 size={12} style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-12">
            <Brain size={28} className="mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Start a conversation about {project.name}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              AI has access to your Project Brain context
            </p>
          </div>
        )}

        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} projectId={project.id} />
        ))}

        {/* Streaming response */}
        {streaming && streamingContent && (
          <ChatMessage
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: new Date().toISOString(),
            }}
            projectId={project.id}
            isStreaming
          />
        )}

        {/* Streaming indicator */}
        {streaming && !streamingContent && (
          <div className="flex items-center gap-2 py-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)', animationDelay: '0.2s' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)', animationDelay: '0.4s' }} />
            </div>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Thinking...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mt-2"
            style={{ background: 'rgba(243, 139, 168, 0.1)', color: 'var(--error)' }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput projectId={project.id} disabled={streaming} />
    </div>
  );
}
