import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { api, getSidecarUrl } from '@/lib/api';
import {
  FileText, FileSpreadsheet, File, FileType, Download,
  ChevronRight, ArrowLeft, Search, FolderOpen,
} from 'lucide-react';

interface DocFile {
  name: string;
  path: string;
  relativePath: string;
  ext: string;
  size: number;
  modified: string;
}

const EXT_ICONS: Record<string, React.ElementType> = {
  '.md': FileText,
  '.mdx': FileText,
  '.txt': FileText,
  '.csv': FileSpreadsheet,
  '.xlsx': FileSpreadsheet,
  '.xls': FileSpreadsheet,
  '.docx': FileType,
  '.doc': FileType,
  '.pdf': File,
  '.pptx': File,
};

const EXT_COLORS: Record<string, string> = {
  '.md': 'var(--accent)',
  '.mdx': 'var(--accent)',
  '.txt': 'var(--text-secondary)',
  '.csv': 'var(--green)',
  '.xlsx': 'var(--green)',
  '.xls': 'var(--green)',
  '.docx': 'var(--blue, #89b4fa)',
  '.doc': 'var(--blue, #89b4fa)',
  '.pdf': 'var(--error)',
  '.pptx': 'var(--warning)',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function DocumentsPanel() {
  const project = useProjectStore(s => s.activeProject());
  const [documents, setDocuments] = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewingDoc, setViewingDoc] = useState<DocFile | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => {
    if (!project) return;
    setLoading(true);
    setViewingDoc(null);
    setDocContent(null);
    api.getProjectDocuments(project.id).then(data => {
      setDocuments(data.documents);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [project?.id]);

  const openDocument = async (doc: DocFile) => {
    if (!project) return;
    if (doc.ext === '.md' || doc.ext === '.mdx' || doc.ext === '.txt' || doc.ext === '.csv') {
      try {
        const data = await api.readDocument(project.id, doc.path);
        setDocContent(data.content);
        setViewingDoc(doc);
      } catch {
        setDocContent('Failed to read file');
        setViewingDoc(doc);
      }
    } else {
      // Binary files — download
      window.open(`${getSidecarUrl()}/api/projects/${project.id}/documents/read?path=${encodeURIComponent(doc.path)}`, '_blank');
    }
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        <p style={{ fontSize: 14 }}>Select a project to view documents</p>
      </div>
    );
  }

  // Group by extension
  const extCounts: Record<string, number> = {};
  for (const d of documents) {
    extCounts[d.ext] = (extCounts[d.ext] || 0) + 1;
  }

  const filtered = documents.filter(d => {
    if (activeFilter !== 'all' && d.ext !== activeFilter) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.relativePath.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Viewing a document
  if (viewingDoc && docContent !== null) {
    return (
      <div>
        {/* Header */}
        <div className="flex items-center" style={{ gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => { setViewingDoc(null); setDocContent(null); }}
            className="flex items-center rounded-lg transition-colors"
            style={{ gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <FileText size={18} style={{ color: EXT_COLORS[viewingDoc.ext] || 'var(--text-tertiary)' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{viewingDoc.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{viewingDoc.relativePath}</div>
          </div>
        </div>

        {/* Content */}
        <div className="rounded-xl overflow-auto" style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: 'calc(100vh - 200px)' }}>
          <pre style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
          }}>
            {docContent}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 16, marginBottom: 24 }}>
        <div className="flex items-center justify-center rounded-2xl" style={{
          width: 48, height: 48,
          background: 'linear-gradient(135deg, rgba(137,180,250,0.2), rgba(137,180,250,0.05))',
          border: '1px solid rgba(137,180,250,0.15)',
        }}>
          <FolderOpen size={24} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>Documents</h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            {documents.length} files in {project.name}
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center" style={{ gap: 12, marginBottom: 20 }}>
        <div className="flex-1 relative">
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full rounded-lg outline-none"
            style={{ padding: '10px 14px 10px 36px', fontSize: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex" style={{ gap: 4 }}>
          <FilterChip label="All" count={documents.length} active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} />
          {Object.entries(extCounts).sort((a, b) => b[1] - a[1]).map(([ext, count]) => (
            <FilterChip key={ext} label={ext} count={count} active={activeFilter === ext} onClick={() => setActiveFilter(ext)} color={EXT_COLORS[ext]} />
          ))}
        </div>
      </div>

      {/* File List */}
      {loading ? (
        <div className="text-center" style={{ padding: 48, color: 'var(--text-tertiary)' }}>Loading documents...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center rounded-xl" style={{ padding: 48, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <FolderOpen size={36} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {documents.length === 0 ? 'No documents found' : 'No matches'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {documents.length === 0 ? 'This project has no .md, .docx, .xlsx, or .pdf files' : 'Try a different search or filter'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 6 }}>
          {filtered.map(doc => {
            const Icon = EXT_ICONS[doc.ext] || File;
            const color = EXT_COLORS[doc.ext] || 'var(--text-tertiary)';
            const isReadable = ['.md', '.mdx', '.txt', '.csv'].includes(doc.ext);
            return (
              <div
                key={doc.path}
                className="flex items-center rounded-xl transition-all cursor-pointer hover:bg-[var(--bg-hover)]"
                onClick={() => openDocument(doc)}
                style={{
                  gap: 14,
                  padding: '12px 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 36, height: 36, background: `${color}15` }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{doc.relativePath}</div>
                </div>
                <div className="flex items-center" style={{ gap: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  <span>{formatFileSize(doc.size)}</span>
                  <span>{new Date(doc.modified).toLocaleDateString()}</span>
                  {isReadable ? (
                    <ChevronRight size={16} style={{ color: 'var(--accent)' }} />
                  ) : (
                    <Download size={16} style={{ color: 'var(--text-tertiary)' }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick, color }: {
  label: string; count: number; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg transition-all"
      style={{
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: 600,
        background: active ? 'var(--accent-dim)' : 'var(--bg-surface)',
        color: active ? 'var(--accent)' : color || 'var(--text-tertiary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {label} <span style={{ opacity: 0.6 }}>({count})</span>
    </button>
  );
}
