import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chat-store';
import { FileDropZone, type DroppedFile } from './FileDropZone';
import { Send } from 'lucide-react';

interface ChatInputProps {
  projectId: string;
  disabled: boolean;
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
    const hasFiles = attachedFiles.some(f => !f.isImage);
    const hasImages = attachedFiles.some(f => f.isImage);

    if (hasFiles) {
      fullMessage += '\n\n---\n**Attached Files:**\n';
      for (const file of attachedFiles.filter(f => !f.isImage)) {
        fullMessage += `\n### ${file.name}\n\`\`\`\n${file.content.slice(0, 10000)}\n\`\`\`\n`;
      }
    }

    if (hasImages) {
      fullMessage += '\n\n---\n**Attached Images:**\n';
      for (const file of attachedFiles.filter(f => f.isImage)) {
        if (file.imageDataUrl) {
          fullMessage += `\n![${file.name}](${file.imageDataUrl})\n`;
        }
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

  const handleFilesAdded = useCallback((files: DroppedFile[]) => {
    setAttachedFiles(prev => {
      // Avoid duplicates by path
      const paths = new Set(prev.map(f => f.path));
      const newFiles = files.filter(f => !paths.has(f.path));
      return [...prev, ...newFiles];
    });
  }, []);

  const handleFileRemoved = useCallback((path: string) => {
    setAttachedFiles(prev => prev.filter(f => f.path !== path));
  }, []);

  // Handle paste — intercept image data from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems: DataTransferItem[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        imageItems.push(item);
      }
    }

    if (imageItems.length === 0) return; // Let default text paste happen

    e.preventDefault(); // Prevent pasting image as text garbage

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const name = `clipboard-${Date.now()}.${file.type.split('/')[1] || 'png'}`;
        handleFilesAdded([{
          name,
          path: name,
          content: `[Image: ${name}]`,
          size: file.size,
          imageDataUrl: dataUrl,
          isImage: true,
        }]);
      };
      reader.readAsDataURL(file);
    }
  }, [handleFilesAdded]);

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

      {/* Image previews row */}
      {attachedFiles.some(f => f.isImage && f.imageDataUrl) && (
        <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 8 }}>
          {attachedFiles.filter(f => f.isImage && f.imageDataUrl).map(file => (
            <div
              key={file.path}
              style={{ position: 'relative' }}
            >
              <img
                src={file.imageDataUrl}
                alt={file.name}
                style={{
                  maxWidth: 120,
                  maxHeight: 80,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  objectFit: 'cover',
                }}
              />
              <button
                onClick={() => handleFileRemoved(file.path)}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-tertiary)',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex items-end rounded-xl"
        style={{ gap: 12, padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            disabled ? 'Waiting for response...'
            : attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached — ask about them...`
            : 'Ask about your project... (Enter to send, Shift+Enter for newline, paste images with Ctrl+V)'
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
          disabled={disabled || (!input.trim() && attachedFiles.length === 0)}
          className="rounded transition-colors disabled:opacity-30"
          style={{ padding: 8, color: 'var(--accent)' }}
        >
          <Send size={18} />
        </button>
      </div>
      <div className="flex items-center justify-between" style={{ marginTop: 8, padding: '0 4px' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Claude Sonnet 4 · Project Brain injected as context
          {attachedFiles.length > 0 && ` · ${attachedFiles.length} file(s) attached`}
        </span>
      </div>
    </div>
  );
}
