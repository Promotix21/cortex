import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { Video, Play, Loader2, CheckCircle, XCircle, Download } from 'lucide-react';

interface RenderJob {
  id: string;
  projectId: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  outputPath: string | null;
  progress: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function RemotionStudio() {
  const project = useProjectStore(s => s.activeProject());
  const [latestJob, setLatestJob] = useState<RenderJob | null>(null);
  const [rendering, setRendering] = useState(false);

  const fetchLatest = async () => {
    if (!project) return;
    try {
      const data = await api.getLatestRender(project.id);
      setLatestJob(data.job);
    } catch {
      setLatestJob(null);
    }
  };

  useEffect(() => {
    fetchLatest();
  }, [project?.id]);

  // Poll while rendering
  useEffect(() => {
    if (!latestJob || latestJob.status !== 'rendering') return;

    const interval = setInterval(async () => {
      try {
        const data = await api.getRenderStatus(latestJob.id);
        setLatestJob(data.job);
        if (data.job.status !== 'rendering') {
          setRendering(false);
        }
      } catch {
        // Keep polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [latestJob?.id, latestJob?.status]);

  const handleRender = async () => {
    if (!project) return;
    setRendering(true);
    try {
      const data = await api.startRender(project.id);
      setLatestJob(data.job);
    } catch {
      setRendering(false);
    }
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
        <p style={{ fontSize: 14 }}>Select a project to use Remotion Studio</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center" style={{ gap: 16, marginBottom: 32 }}>
        <div
          className="flex items-center justify-center rounded-2xl"
          style={{
            width: 56,
            height: 56,
            background: 'linear-gradient(135deg, rgba(250,179,135,0.2), rgba(250,179,135,0.05))',
            border: '1px solid rgba(250,179,135,0.15)',
          }}
        >
          <Video size={26} style={{ color: 'var(--warning)' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
            Remotion Studio
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginTop: 2 }}>
            Generate programmatic promo videos from project data
          </p>
        </div>
      </div>

      {/* Project Info */}
      <div
        className="rounded-xl"
        style={{ padding: '20px 24px', marginBottom: 24, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, color: 'var(--text-tertiary)' }}>
          Rendering For
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          {project.name}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
          Uses Project Brain data (summary, architecture, features) as video props
        </p>
      </div>

      {/* Render Button */}
      <button
        onClick={handleRender}
        disabled={rendering}
        className="flex items-center rounded-xl font-bold transition-all"
        style={{
          gap: 12,
          padding: '16px 28px',
          fontSize: 15,
          marginBottom: 24,
          background: rendering ? 'var(--bg-hover)' : 'linear-gradient(135deg, var(--accent), #7c6dd8)',
          color: rendering ? 'var(--text-tertiary)' : 'white',
          border: 'none',
          cursor: rendering ? 'not-allowed' : 'pointer',
        }}
      >
        {rendering ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Play size={18} />
        )}
        {rendering ? 'Rendering...' : 'Generate Promo Video'}
      </button>

      {/* Render Status */}
      {latestJob && (
        <div
          className="rounded-xl"
          style={{ padding: '20px 24px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center" style={{ gap: 12, marginBottom: 16 }}>
            {latestJob.status === 'rendering' && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--warning)' }} />}
            {latestJob.status === 'completed' && <CheckCircle size={18} style={{ color: 'var(--success)' }} />}
            {latestJob.status === 'failed' && <XCircle size={18} style={{ color: 'var(--error)' }} />}
            <span className="font-bold" style={{
              fontSize: 15,
              color: latestJob.status === 'completed' ? 'var(--success)' : latestJob.status === 'failed' ? 'var(--error)' : 'var(--warning)',
            }}>
              {latestJob.status === 'rendering' ? `Rendering... ${latestJob.progress}%` :
               latestJob.status === 'completed' ? 'Render Complete' :
               latestJob.status === 'failed' ? 'Render Failed' :
               'Pending'}
            </span>
          </div>

          {/* Progress bar */}
          {latestJob.status === 'rendering' && (
            <div
              className="rounded-full overflow-hidden"
              style={{ height: 8, marginBottom: 16, background: 'var(--bg-hover)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${latestJob.progress}%`,
                  background: 'var(--warning)',
                }}
              />
            </div>
          )}

          {/* Error */}
          {latestJob.error && (
            <div
              className="rounded-lg"
              style={{ padding: '12px 16px', fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)' }}
            >
              {latestJob.error}
            </div>
          )}

          {/* Video preview (completed) */}
          {latestJob.status === 'completed' && latestJob.outputPath && (
            <div style={{ marginTop: 16 }}>
              <video
                src={`http://localhost:4700/api/remotion/video/${latestJob.id}`}
                controls
                className="rounded-xl w-full"
                style={{ maxHeight: 400, background: '#000' }}
              />
              <a
                href={`http://localhost:4700/api/remotion/video/${latestJob.id}`}
                download
                className="flex items-center rounded-xl font-semibold transition-colors mt-3 inline-flex"
                style={{
                  gap: 8,
                  padding: '10px 20px',
                  fontSize: 14,
                  background: 'var(--accent-dim)',
                  color: 'var(--accent)',
                  textDecoration: 'none',
                }}
              >
                <Download size={16} />
                Download Video
              </a>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center" style={{ gap: 16, marginTop: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
            <span>Started: {new Date(latestJob.startedAt).toLocaleTimeString()}</span>
            {latestJob.completedAt && (
              <span>Completed: {new Date(latestJob.completedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
