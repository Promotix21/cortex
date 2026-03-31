import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useProjectStore } from '@/stores/project-store';
import { getSidecarUrl } from '@/lib/api';
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
        <p style={{ fontSize: 14 }}>Select a project to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center shrink-0"
        style={{ gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
      >
        <Brain size={18} style={{ color: 'var(--accent)' }} />
        <span className="font-medium flex-1" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          AI Chat — {project.name}
        </span>
        <button
          onClick={() => window.open(`${getSidecarUrl()}/api/chat/${project.id}/export`, '_blank')}
          className="rounded hover:bg-[var(--bg-hover)] transition-colors"
          style={{ padding: 6 }}
          title="Export chat"
        >
          <Download size={16} style={{ color: 'var(--text-tertiary)' }} />
        </button>
        <button
          onClick={() => { if (confirm('Clear all chat history for this project?')) clearHistory(project.id); }}
          className="rounded hover:bg-[var(--bg-hover)] transition-colors"
          style={{ padding: 6 }}
          title="Clear history"
        >
          <Trash2 size={16} style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px 20px' }}>
        {messages.length === 0 && !streaming && (
          <div className="text-center" style={{ paddingTop: 48, paddingBottom: 48 }}>
            <Brain size={36} className="mx-auto" style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 6 }}>
              Start a conversation about {project.name}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
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
          <div className="flex items-center" style={{ gap: 10, padding: '10px 0' }}>
            <div className="flex" style={{ gap: 5 }}>
              <span className="rounded-full animate-pulse" style={{ width: 7, height: 7, background: 'var(--accent)' }} />
              <span className="rounded-full animate-pulse" style={{ width: 7, height: 7, background: 'var(--accent)', animationDelay: '0.2s' }} />
              <span className="rounded-full animate-pulse" style={{ width: 7, height: 7, background: 'var(--accent)', animationDelay: '0.4s' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Thinking...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="flex items-center rounded-xl"
            style={{ gap: 10, padding: '12px 16px', fontSize: 14, marginTop: 10, background: 'rgba(243, 139, 168, 0.1)', color: 'var(--error)' }}
          >
            <AlertCircle size={16} />
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
