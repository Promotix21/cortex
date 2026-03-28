import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';
import { FileDropZone } from './FileDropZone';
import { Send } from 'lucide-react';

interface ChatInputProps {
  projectId: string;
  disabled: boolean;
}

interface DroppedFile {
  name: string;
  path: string;
  content: string;
  size: number;
}

export function ChatInput({ projectId, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<DroppedFile[]>([]);
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

    // Build message with attached file contents
    let fullMessage = msg;
    if (attachedFiles.length > 0) {
      fullMessage += '\n\n---\n**Attached Files:**\n';
      for (const file of attachedFiles) {
        fullMessage += `\n### ${file.name}\n\`\`\`\n${file.content.slice(0, 10000)}\n\`\`\`\n`;
      }
    }

    setInput('');
    setAttachedFiles([]);
    sendMessage(projectId, fullMessage);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFilesAdded = (files: DroppedFile[]) => {
    setAttachedFiles(prev => {
      // Avoid duplicates
      const paths = new Set(prev.map(f => f.path));
      const newFiles = files.filter(f => !paths.has(f.path));
      return [...prev, ...newFiles];
    });
  };

  const handleFileRemoved = (path: string) => {
    setAttachedFiles(prev => prev.filter(f => f.path !== path));
  };

  return (
    <div
      className="shrink-0"
      style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
    >
      <FileDropZone
        onFilesAdded={handleFilesAdded}
        files={attachedFiles}
        onFileRemoved={handleFileRemoved}
      />
      <div
        className="flex items-end rounded-xl"
        style={{ gap: 12, padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled ? 'Waiting for response...'
            : attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached — ask about them...`
            : 'Ask about your project... (Enter to send, Shift+Enter for newline, drag files to attach)'
          }
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
      <ModelIndicator attachedCount={attachedFiles.length} />
    </div>
  );
}

function ModelIndicator({ attachedCount }: { attachedCount: number }) {
  const { settings } = useSettingsStore();
  const model = settings.chat_model || 'claude-cli';

  const getModelLabel = () => {
    if (model === 'claude-cli') return 'Claude CLI (Max)';
    // Extract short name from model ID
    const parts = model.split('/');
    const name = parts[parts.length - 1]?.replace(/:free$/, ' (Free)') || model;
    return name;
  };

  const getProviderColor = () => {
    if (model === 'claude-cli') return 'var(--accent)';
    if (model.includes('meta-llama')) return '#0084ff';
    if (model.includes('google')) return '#4285f4';
    if (model.includes('openai')) return '#10a37f';
    if (model.includes('anthropic')) return '#d97706';
    if (model.includes('deepseek')) return '#4a9eff';
    if (model.includes('qwen')) return '#7c3aed';
    if (model.includes('mistral')) return '#ff7000';
    return 'var(--text-tertiary)';
  };

  return (
    <div className="flex items-center justify-between" style={{ marginTop: 8, padding: '0 4px' }}>
      <div className="flex items-center" style={{ gap: 6 }}>
        <div
          className="rounded-full"
          style={{ width: 6, height: 6, background: getProviderColor() }}
        />
        <span style={{ fontSize: 12, color: getProviderColor(), fontWeight: 600 }}>
          {getModelLabel()}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          · Brain injected
          {attachedCount > 0 && ` · ${attachedCount} file(s)`}
        </span>
      </div>
    </div>
  );
}
