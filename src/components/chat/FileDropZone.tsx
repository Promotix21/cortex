import { useState, useCallback } from 'react';
import { Upload, X, FileCode, FileText as FileIcon, Image as ImageIcon } from 'lucide-react';

export interface DroppedFile {
  name: string;
  path: string;
  content: string;
  size: number;
  /** Base64 data URL for image previews */
  imageDataUrl?: string;
  /** Whether this is an image attachment */
  isImage?: boolean;
}

interface FileDropZoneProps {
  onFilesAdded: (files: DroppedFile[]) => void;
  files: DroppedFile[];
  onFileRemoved: (path: string) => void;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const IMAGE_MIME_PREFIXES = ['image/'];

function isImageFile(file: File): boolean {
  if (file.type && IMAGE_MIME_PREFIXES.some(p => file.type.startsWith(p))) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.has(ext || '');
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
        if (file.size > 10 * 1024 * 1024) continue; // Skip files > 10MB

        try {
          if (isImageFile(file)) {
            // Handle image files — read as data URL for preview
            const dataUrl = await readFileAsDataUrl(file);
            droppedFiles.push({
              name: file.name,
              path: file.name + '-' + Date.now(),
              content: `[Image: ${file.name}]`,
              size: file.size,
              imageDataUrl: dataUrl,
              isImage: true,
            });
          } else if (file.size <= 1024 * 1024) {
            // Text files — read content (limit 1MB)
            const content = await file.text();
            droppedFiles.push({
              name: file.name,
              path: file.name,
              content: content.slice(0, 50000),
              size: file.size,
            });
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    // Handle text/plain drag (e.g., from file explorer)
    const textData = e.dataTransfer.getData('text/plain');
    if (textData && !droppedFiles.length) {
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

  const getFileIcon = (file: DroppedFile) => {
    if (file.isImage) return ImageIcon;
    const ext = file.name.split('.').pop()?.toLowerCase();
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
            Drop files or images to attach
          </div>
        )}
      </div>

      {/* File/Image Pills */}
      {files.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 8 }}>
          {files.map(file => {
            const Icon = getFileIcon(file);
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
                {file.isImage && file.imageDataUrl ? (
                  <img
                    src={file.imageDataUrl}
                    alt={file.name}
                    style={{
                      width: 20,
                      height: 20,
                      objectFit: 'cover',
                      borderRadius: 3,
                    }}
                  />
                ) : (
                  <Icon size={12} />
                )}
                <span>{file.name}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                  {file.isImage ? 'image' : file.size > 0 ? `${(file.size / 1024).toFixed(1)}KB` : 'path'}
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
