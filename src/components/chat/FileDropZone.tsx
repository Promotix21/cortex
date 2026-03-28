import { useState, useCallback } from 'react';
import { Upload, X, FileCode, FileText as FileIcon } from 'lucide-react';

interface DroppedFile {
  name: string;
  path: string;
  content: string;
  size: number;
}

interface FileDropZoneProps {
  onFilesAdded: (files: DroppedFile[]) => void;
  files: DroppedFile[];
  onFileRemoved: (path: string) => void;
}

export function FileDropZone({ onFilesAdded, files, onFileRemoved }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const droppedFiles: DroppedFile[] = [];

    // Handle DataTransfer files
    if (e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        if (file.size > 1024 * 1024) continue; // Skip files > 1MB

        try {
          const content = await file.text();
          droppedFiles.push({
            name: file.name,
            path: file.name,
            content: content.slice(0, 50000), // Limit to 50KB of content
            size: file.size,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }

    // Handle text/plain drag (e.g., from file explorer)
    const textData = e.dataTransfer.getData('text/plain');
    if (textData && !droppedFiles.length) {
      // Treat as a file path if it looks like one
      if (textData.includes('/') || textData.includes('\\')) {
        droppedFiles.push({
          name: textData.split(/[/\\]/).pop() || textData,
          path: textData,
          content: `[File path: ${textData}]`,
          size: 0,
        });
      }
    }

    if (droppedFiles.length > 0) {
      onFilesAdded(droppedFiles);
    }
  }, [onFilesAdded]);

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    const codeExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'css', 'html', 'json'];
    return codeExts.includes(ext || '') ? FileCode : FileIcon;
  };

  return (
    <div>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="rounded-xl transition-all"
        style={{
          padding: dragging ? '16px 20px' : '0',
          marginBottom: files.length > 0 ? 8 : 0,
          background: dragging ? 'var(--accent-dim)' : 'transparent',
          border: dragging ? '2px dashed var(--accent)' : '2px dashed transparent',
          minHeight: dragging ? 60 : 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {dragging && (
          <div className="flex items-center" style={{ gap: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>
            <Upload size={16} />
            Drop files to attach
          </div>
        )}
      </div>

      {/* File Pills */}
      {files.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 8 }}>
          {files.map(file => {
            const Icon = getFileIcon(file.name);
            return (
              <div
                key={file.path}
                className="flex items-center rounded-lg"
                style={{
                  gap: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  border: '1px solid rgba(137,180,250,0.2)',
                }}
              >
                <Icon size={12} />
                <span>{file.name}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                  {file.size > 0 ? `${(file.size / 1024).toFixed(1)}KB` : 'path'}
                </span>
                <button
                  onClick={() => onFileRemoved(file.path)}
                  className="rounded-full transition-colors"
                  style={{ padding: 2, color: 'var(--text-tertiary)' }}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
