import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { api, type ExplorerTreeNode } from '@/lib/api';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  Search, RefreshCw, FilePlus, FolderPlus,
  Save, X, Edit3, Trash2, FolderTree,
  Image, Film, Music, ExternalLink, Share2,
} from 'lucide-react';

// ── Language → color mapping for file icons ──
const LANG_COLORS: Record<string, string> = {
  typescript: '#3b82f6',
  javascript: '#eab308',
  python: '#22c55e',
  rust: '#f97316',
  go: '#06b6d4',
  ruby: '#ef4444',
  java: '#f97316',
  php: '#8b5cf6',
  html: '#f97316',
  css: '#3b82f6',
  scss: '#ec4899',
  json: '#eab308',
  yaml: '#ef4444',
  markdown: 'var(--accent)',
  sql: '#06b6d4',
  bash: '#22c55e',
  text: 'var(--text-tertiary)',
};

const EXT_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.rb': 'ruby',
  '.java': 'java', '.php': 'php', '.html': 'html', '.css': 'css', '.scss': 'scss',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown', '.mdx': 'markdown',
  '.sql': 'sql', '.sh': 'bash', '.txt': 'text',
  '.vue': 'javascript', '.svelte': 'javascript',
};

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.ogg']);

function isImage(ext?: string): boolean { return !!ext && IMAGE_EXTS.has(ext); }
function isVideo(ext?: string): boolean { return !!ext && VIDEO_EXTS.has(ext); }
function isAudio(ext?: string): boolean { return !!ext && AUDIO_EXTS.has(ext); }
function isMedia(ext?: string): boolean { return isImage(ext) || isVideo(ext) || isAudio(ext); }

function getFileColor(ext?: string): string {
  if (!ext) return 'var(--text-tertiary)';
  const lang = EXT_LANG[ext];
  return lang ? (LANG_COLORS[lang] || 'var(--text-tertiary)') : 'var(--text-tertiary)';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

// ── Tree Node Component ──
function TreeItem({
  node, depth, selectedPath, onSelect, expandedPaths, onToggle,
  onRename, onDelete, onCreateInDir, projectId, onContextMenu,
}: {
  node: ExplorerTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (node: ExplorerTreeNode) => void;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onRename: (node: ExplorerTreeNode) => void;
  onDelete: (node: ExplorerTreeNode) => void;
  onCreateInDir: (dirPath: string, type: 'file' | 'directory') => void;
  projectId: string;
  onContextMenu: (e: React.MouseEvent, node: ExplorerTreeNode) => void;
}) {
  const isDir = node.type === 'directory';
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (isDir) {
      onToggle(node.path);
    } else {
      onSelect(node);
    }
  };

  // File icon based on type
  const FileIcon = isImage(node.ext) ? Image : isVideo(node.ext) ? Film : isAudio(node.ext) ? Music : File;
  const fileIconColor = isImage(node.ext) ? '#ec4899' : isVideo(node.ext) ? '#a78bfa' : isAudio(node.ext) ? '#22d3ee' : getFileColor(node.ext);

  return (
    <>
      <div
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}
        className="flex items-center cursor-pointer select-none"
        style={{
          paddingLeft: depth * 16 + 8,
          paddingRight: 8,
          height: 30,
          fontSize: 13,
          color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
          background: isSelected ? 'var(--accent-dim)' : hovered ? 'var(--bg-hover)' : 'transparent',
          transition: 'background 0.1s ease',
        }}
      >
        {/* Expand/collapse arrow for dirs */}
        <span style={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isDir ? (
            isExpanded ? <ChevronDown size={14} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
          ) : null}
        </span>

        {/* Icon */}
        <span style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
          {isDir ? (
            isExpanded
              ? <FolderOpen size={15} style={{ color: 'var(--accent)' }} />
              : <Folder size={15} style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <FileIcon size={14} style={{ color: fileIconColor }} />
          )}
        </span>

        {/* Name */}
        <span className="truncate flex-1" style={{ fontWeight: isDir ? 600 : 400 }}>
          {node.name}
        </span>

        {/* Size for files */}
        {!isDir && node.size !== undefined && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 8, flexShrink: 0 }}>
            {formatSize(node.size)}
          </span>
        )}

        {/* Action buttons on hover */}
        {hovered && (
          <span className="flex items-center" style={{ gap: 2, marginLeft: 4, flexShrink: 0 }}>
            {isDir && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateInDir(node.path, 'file'); }}
                  className="rounded p-0.5 transition-colors"
                  style={{ background: 'transparent', color: 'var(--text-tertiary)', border: 'none', cursor: 'pointer' }}
                  title="New file"
                >
                  <FilePlus size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateInDir(node.path, 'directory'); }}
                  className="rounded p-0.5 transition-colors"
                  style={{ background: 'transparent', color: 'var(--text-tertiary)', border: 'none', cursor: 'pointer' }}
                  title="New folder"
                >
                  <FolderPlus size={13} />
                </button>
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onRename(node); }}
              className="rounded p-0.5 transition-colors"
              style={{ background: 'transparent', color: 'var(--text-tertiary)', border: 'none', cursor: 'pointer' }}
              title="Rename"
            >
              <Edit3 size={13} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node); }}
              className="rounded p-0.5 transition-colors"
              style={{ background: 'transparent', color: 'var(--error)', border: 'none', cursor: 'pointer' }}
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>

      {/* Children */}
      {isDir && isExpanded && node.children?.map(child => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          expandedPaths={expandedPaths}
          onToggle={onToggle}
          onRename={onRename}
          onDelete={onDelete}
          onCreateInDir={onCreateInDir}
          projectId={projectId}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  );
}

// ── Context Menu ──
function ContextMenu({ x, y, node, onClose, onRename, onDelete }: {
  x: number; y: number;
  node: ExplorerTreeNode;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  const openInFileManager = async () => {
    onClose();
    try { await revealItemInDir(node.path); } catch { /* no Tauri runtime */ }
  };

  const shareOnWhatsApp = () => {
    onClose();
    // For images/files, share the file name + path as text
    const text = `Check out this file: ${node.name}\nPath: ${node.path}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg overflow-hidden"
      style={{
        left: x, top: y, minWidth: 180,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-active)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <button onClick={openInFileManager} className="w-full flex items-center text-left" style={ctxItemStyle}>
        <ExternalLink size={14} style={{ marginRight: 10, color: 'var(--accent)' }} />
        Open in File Manager
      </button>
      {(isImage(node.ext) || node.type === 'file') && (
        <button onClick={shareOnWhatsApp} className="w-full flex items-center text-left" style={ctxItemStyle}>
          <Share2 size={14} style={{ marginRight: 10, color: '#25d366' }} />
          Share on WhatsApp
        </button>
      )}
      <div style={{ height: 1, background: 'var(--border)' }} />
      <button onClick={() => { onClose(); onRename(); }} className="w-full flex items-center text-left" style={ctxItemStyle}>
        <Edit3 size={14} style={{ marginRight: 10, color: 'var(--text-tertiary)' }} />
        Rename
      </button>
      <button onClick={() => { onClose(); onDelete(); }} className="w-full flex items-center text-left" style={{ ...ctxItemStyle, color: 'var(--error)' }}>
        <Trash2 size={14} style={{ marginRight: 10 }} />
        Delete
      </button>
    </div>
  );
}

const ctxItemStyle: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  color: 'var(--text-secondary)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.1s',
};

// ── Inline rename/create input ──
function InlineInput({ defaultValue, onSubmit, onCancel, placeholder }: {
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue || '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) onSubmit(value.trim());
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => { if (value.trim()) onSubmit(value.trim()); else onCancel(); }}
      placeholder={placeholder}
      className="w-full rounded outline-none"
      style={{
        padding: '4px 8px',
        fontSize: 13,
        background: 'var(--bg-surface)',
        border: '1px solid var(--accent)',
        color: 'var(--text-primary)',
      }}
    />
  );
}

// ── Main ExplorerPanel ──
export function ExplorerPanel() {
  const project = useProjectStore(s => s.activeProject());
  const [tree, setTree] = useState<ExplorerTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<ExplorerTreeNode | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [, setFileLanguage] = useState('text');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ name: string; path: string; relativePath: string; type: 'file' | 'directory' }[]>([]);
  const [searching, setSearching] = useState(false);
  const [renameNode, setRenameNode] = useState<ExplorerTreeNode | null>(null);
  const [createInDir, setCreateInDir] = useState<{ dirPath: string; type: 'file' | 'directory' } | null>(null);
  const [fileBinary, setFileBinary] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: ExplorerTreeNode } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadTree = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const data = await api.getFileTree(project.id);
      setTree(data.tree);
      // Auto-expand first level
      const firstLevelDirs = data.tree.filter(n => n.type === 'directory').map(n => n.path);
      setExpandedPaths(prev => {
        const next = new Set(prev);
        for (const d of firstLevelDirs) next.add(d);
        return next;
      });
    } catch { /* */ }
    setLoading(false);
  }, [project?.id]);

  useEffect(() => {
    loadTree();
    setSelectedFile(null);
    setFileContent(null);
    setIsEditing(false);
  }, [project?.id, loadTree]);

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const selectFile = async (node: ExplorerTreeNode) => {
    if (!project || node.type === 'directory') return;
    setSelectedFile(node);
    setIsEditing(false);
    setFileBinary(false);
    setFileContent(null);

    // Media files are served via raw endpoint — no need to read content
    if (isMedia(node.ext)) {
      setFileBinary(false); // not "generic binary", it's viewable media
      return;
    }

    try {
      const data = await api.readFile(project.id, node.path);
      if (data.type === 'binary') {
        setFileBinary(true);
      } else {
        setFileContent(data.content);
        setFileLanguage(data.language || 'text');
      }
    } catch {
      setFileContent('Failed to read file');
    }
  };

  const isMarkdown = selectedFile?.ext === '.md' || selectedFile?.ext === '.mdx' || selectedFile?.ext === '.txt';
  const isJson = selectedFile?.ext === '.json';
  const isImageFile = isImage(selectedFile?.ext);
  const isVideoFile = isVideo(selectedFile?.ext);
  const isAudioFile = isAudio(selectedFile?.ext);
  const rawUrl = project && selectedFile ? api.getRawFileUrl(project.id, selectedFile.path) : '';

  const startEditing = () => {
    if (!isMarkdown || !fileContent) return;
    setEditContent(fileContent);
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const saveFile = async () => {
    if (!project || !selectedFile) return;
    setSaving(true);
    try {
      await api.writeFile(project.id, selectedFile.path, editContent);
      setFileContent(editContent);
      setIsEditing(false);
    } catch { /* */ }
    setSaving(false);
  };

  const handleRename = async (node: ExplorerTreeNode, newName: string) => {
    if (!project) return;
    setRenameNode(null);
    try {
      await api.renameFile(project.id, node.path, newName);
      loadTree();
      if (selectedFile?.path === node.path) {
        setSelectedFile(null);
        setFileContent(null);
      }
    } catch { /* */ }
  };

  const handleDelete = async (node: ExplorerTreeNode) => {
    if (!project) return;
    try {
      await api.deleteFileOrFolder(project.id, node.path);
      loadTree();
      if (selectedFile?.path === node.path) {
        setSelectedFile(null);
        setFileContent(null);
      }
    } catch { /* */ }
  };

  const handleCreate = async (dirPath: string, name: string, type: 'file' | 'directory') => {
    if (!project) return;
    setCreateInDir(null);
    try {
      const result = await api.createFileOrFolder(project.id, dirPath, name, type);
      loadTree();
      // Auto-expand parent
      setExpandedPaths(prev => { const n = new Set(prev); n.add(dirPath); return n; });
      // Auto-select if file
      if (type === 'file') {
        setSelectedFile({ name, path: result.path, relativePath: result.relativePath, type: 'file', ext: '.' + name.split('.').pop() });
        setFileContent('');
        setFileLanguage('text');
      }
    } catch { /* */ }
  };

  // Search
  useEffect(() => {
    if (!project || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.searchFiles(project.id, searchQuery);
        setSearchResults(data.results);
      } catch { /* */ }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, project?.id]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        <p style={{ fontSize: 14 }}>Select a project to explore files</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Left: File Tree */}
      <div
        className="flex flex-col h-full border-r shrink-0"
        style={{ width: 280, minWidth: 220, maxWidth: 400, borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
      >
        {/* Tree Header */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Explorer
          </span>
          <div className="flex items-center" style={{ gap: 4 }}>
            <button
              onClick={() => setCreateInDir({ dirPath: project.path, type: 'file' })}
              title="New file in root"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}
            >
              <FilePlus size={15} />
            </button>
            <button
              onClick={() => setCreateInDir({ dirPath: project.path, type: 'directory' })}
              title="New folder in root"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}
            >
              <FolderPlus size={15} />
            </button>
            <button
              onClick={loadTree}
              title="Refresh"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 2 }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
          <div className="relative">
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full rounded outline-none"
              style={{
                padding: '6px 10px 6px 28px',
                fontSize: 12,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Create inline input */}
        {createInDir && (
          <div style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              New {createInDir.type === 'file' ? 'file' : 'folder'}:
            </div>
            <InlineInput
              placeholder={createInDir.type === 'file' ? 'filename.ext' : 'folder-name'}
              onSubmit={(name) => handleCreate(createInDir.dirPath, name, createInDir.type)}
              onCancel={() => setCreateInDir(null)}
            />
          </div>
        )}

        {/* Tree or Search Results */}
        <div className="flex-1 overflow-auto" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {searchQuery.trim() ? (
            searching ? (
              <div className="text-center" style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 12 }}>Searching...</div>
            ) : searchResults.length === 0 ? (
              <div className="text-center" style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 12 }}>No files found</div>
            ) : (
              searchResults.map(result => (
                <div
                  key={result.path}
                  onClick={() => {
                    if (result.type === 'file') {
                      selectFile({ ...result, ext: '.' + result.name.split('.').pop() } as ExplorerTreeNode);
                    }
                    setSearchQuery('');
                  }}
                  className="flex items-center cursor-pointer"
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    gap: 8,
                  }}
                >
                  {result.type === 'directory' ? <Folder size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : <File size={14} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />}
                  <div className="truncate">
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{result.name}</span>
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>{result.relativePath}</span>
                  </div>
                </div>
              ))
            )
          ) : loading ? (
            <div className="text-center" style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 12 }}>Loading tree...</div>
          ) : tree.length === 0 ? (
            <div className="text-center" style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 12 }}>Empty project</div>
          ) : (
            tree.map(node => (
              <TreeItem
                key={node.path}
                node={node}
                depth={0}
                selectedPath={selectedFile?.path || null}
                onSelect={selectFile}
                expandedPaths={expandedPaths}
                onToggle={toggleExpand}
                onRename={setRenameNode}
                onDelete={handleDelete}
                onCreateInDir={(dirPath, type) => setCreateInDir({ dirPath, type })}
                projectId={project.id}
                onContextMenu={(e, n) => setContextMenu({ x: e.clientX, y: e.clientY, node: n })}
              />
            ))
          )}
        </div>

        {/* Rename dialog */}
        {renameNode && (
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              Rename "{renameNode.name}":
            </div>
            <InlineInput
              defaultValue={renameNode.name}
              onSubmit={(newName) => handleRename(renameNode, newName)}
              onCancel={() => setRenameNode(null)}
            />
          </div>
        )}
      </div>

      {/* Right: File Viewer / Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile ? (
          <>
            {/* File header bar */}
            <div
              className="flex items-center justify-between shrink-0"
              style={{
                padding: '8px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
              }}
            >
              <div className="flex items-center" style={{ gap: 10 }}>
                <File size={16} style={{ color: getFileColor(selectedFile.ext) }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedFile.name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {selectedFile.relativePath}
                </span>
                {isEditing && (
                  <span
                    className="rounded"
                    style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, background: 'var(--accent-dim)', color: 'var(--accent)' }}
                  >
                    EDITING
                  </span>
                )}
              </div>
              <div className="flex items-center" style={{ gap: 6 }}>
                {isMarkdown && !isEditing && fileContent !== null && (
                  <button
                    onClick={startEditing}
                    className="flex items-center rounded-lg transition-colors"
                    style={{
                      gap: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                      background: 'var(--accent-dim)', color: 'var(--accent)',
                      border: '1px solid rgba(34,211,238,0.2)', cursor: 'pointer',
                    }}
                  >
                    <Edit3 size={13} />
                    Edit
                  </button>
                )}
                {isEditing && (
                  <>
                    <button
                      onClick={saveFile}
                      disabled={saving}
                      className="flex items-center rounded-lg transition-colors"
                      style={{
                        gap: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                        background: 'var(--accent)', color: 'var(--bg-primary)',
                        border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1,
                      }}
                    >
                      <Save size={13} />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex items-center rounded-lg transition-colors"
                      style={{
                        gap: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                        background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                      }}
                    >
                      <X size={13} />
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* File content */}
            <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-primary)' }}>
              {/* Image viewer */}
              {isImageFile ? (
                <div className="flex flex-col items-center justify-center h-full" style={{ padding: 24 }}>
                  <img
                    src={rawUrl}
                    alt={selectedFile.name}
                    style={{
                      maxWidth: '100%',
                      maxHeight: 'calc(100vh - 160px)',
                      objectFit: 'contain',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'repeating-conic-gradient(var(--bg-surface) 0% 25%, var(--bg-hover) 0% 50%) 50% / 20px 20px',
                    }}
                  />
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {selectedFile.name} {selectedFile.size ? `— ${formatSize(selectedFile.size)}` : ''}
                  </div>
                </div>
              ) : isVideoFile ? (
                <div className="flex flex-col items-center justify-center h-full" style={{ padding: 24 }}>
                  <video
                    src={rawUrl}
                    controls
                    style={{
                      maxWidth: '100%',
                      maxHeight: 'calc(100vh - 160px)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: '#000',
                    }}
                  />
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {selectedFile.name} {selectedFile.size ? `— ${formatSize(selectedFile.size)}` : ''}
                  </div>
                </div>
              ) : isAudioFile ? (
                <div className="flex flex-col items-center justify-center h-full" style={{ padding: 24, gap: 16 }}>
                  <div
                    className="flex items-center justify-center rounded-2xl"
                    style={{ width: 96, height: 96, background: 'var(--accent-dim)', border: '1px solid rgba(34,211,238,0.15)' }}
                  >
                    <Music size={40} style={{ color: 'var(--accent)' }} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedFile.name}</p>
                  <audio src={rawUrl} controls style={{ width: '100%', maxWidth: 480 }} />
                </div>
              ) : fileBinary ? (
                <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
                  <File size={48} style={{ marginBottom: 12 }} />
                  <p style={{ fontSize: 14, fontWeight: 600 }}>Binary file</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>This file cannot be displayed</p>
                </div>
              ) : fileContent === null ? (
                <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
                  <div style={{ fontSize: 13 }}>Loading...</div>
                </div>
              ) : isEditing ? (
                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.ctrlKey && e.key === 's') {
                      e.preventDefault();
                      saveFile();
                    }
                  }}
                  className="w-full h-full resize-none outline-none"
                  style={{
                    padding: '16px 20px',
                    fontSize: 13,
                    lineHeight: 1.7,
                    fontFamily: "'JetBrains Mono', monospace",
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: 'none',
                    tabSize: 2,
                  }}
                  spellCheck={false}
                />
              ) : isJson ? (
                /* JSON viewer with formatted output */
                <div style={{ padding: '16px 20px' }}>
                  <pre style={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: 0,
                  }}>
                    {(() => {
                      try {
                        const formatted = JSON.stringify(JSON.parse(fileContent), null, 2);
                        return formatted.split('\n').map((line, i) => (
                          <div key={i} className="flex" style={{ minHeight: '1.7em' }}>
                            <span style={{ width: 48, flexShrink: 0, textAlign: 'right', paddingRight: 16, color: 'var(--text-tertiary)', userSelect: 'none', fontSize: 12, opacity: 0.5 }}>{i + 1}</span>
                            <span className="flex-1">
                              {/* Basic JSON syntax coloring */}
                              {line.replace(/"([^"]+)":/g, '<key>"$1"</key>:') ? (
                                <JsonLine line={line} />
                              ) : line}
                            </span>
                          </div>
                        ));
                      } catch {
                        // Invalid JSON — show raw
                        return fileContent.split('\n').map((line, i) => (
                          <div key={i} className="flex" style={{ minHeight: '1.7em' }}>
                            <span style={{ width: 48, flexShrink: 0, textAlign: 'right', paddingRight: 16, color: 'var(--text-tertiary)', userSelect: 'none', fontSize: 12, opacity: 0.5 }}>{i + 1}</span>
                            <span className="flex-1">{line || ' '}</span>
                          </div>
                        ));
                      }
                    })()}
                  </pre>
                </div>
              ) : (
                <div style={{ padding: '16px 20px' }}>
                  <pre style={{
                    fontSize: 13,
                    lineHeight: 1.7,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: 0,
                  }}>
                    {fileContent.split('\n').map((line, i) => (
                      <div key={i} className="flex" style={{ minHeight: '1.7em' }}>
                        <span
                          style={{
                            width: 48,
                            flexShrink: 0,
                            textAlign: 'right',
                            paddingRight: 16,
                            color: 'var(--text-tertiary)',
                            userSelect: 'none',
                            fontSize: 12,
                            opacity: 0.5,
                          }}
                        >
                          {i + 1}
                        </span>
                        <span className="flex-1">{line || ' '}</span>
                      </div>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
            <div
              className="flex items-center justify-center rounded-2xl"
              style={{
                width: 64, height: 64, marginBottom: 16,
                background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(167,139,250,0.1))',
                border: '1px solid rgba(34,211,238,0.1)',
              }}
            >
              <FolderTree size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {project.name}
            </p>
            <p style={{ fontSize: 13 }}>
              Select a file from the tree to view it
            </p>
            <p style={{ fontSize: 12, marginTop: 8, color: 'var(--text-tertiary)' }}>
              Markdown files (.md, .txt) can be edited
            </p>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && project && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={() => setContextMenu(null)}
          onRename={() => setRenameNode(contextMenu.node)}
          onDelete={() => handleDelete(contextMenu.node)}
        />
      )}
    </div>
  );
}

// ── JSON syntax coloring helper ──
function JsonLine({ line }: { line: string }) {
  // Simple regex-based JSON coloring
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;

  // Match keys, strings, numbers, booleans, null
  const regex = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(\b\d+\.?\d*\b)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(remaining)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{remaining.slice(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      // Key
      parts.push(<span key={key++} style={{ color: '#22d3ee' }}>{match[1]}</span>);
      parts.push(<span key={key++}>:</span>);
    } else if (match[2]) {
      // String value
      parts.push(<span key={key++} style={{ color: '#34d399' }}>{match[2]}</span>);
    } else if (match[3]) {
      // Number
      parts.push(<span key={key++} style={{ color: '#fbbf24' }}>{match[3]}</span>);
    } else if (match[4]) {
      // Boolean
      parts.push(<span key={key++} style={{ color: '#a78bfa' }}>{match[4]}</span>);
    } else if (match[5]) {
      // Null
      parts.push(<span key={key++} style={{ color: '#f87171' }}>{match[5]}</span>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < remaining.length) {
    parts.push(<span key={key++}>{remaining.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}
