import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { getProjectBrain } from '../chat/chat-service.js';

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

const activeRenders: Map<string, RenderJob> = new Map();

/**
 * Start a Remotion render for a project's promo video.
 * This spawns the Remotion CLI to render a video from project data.
 */
export function startRender(projectId: string): RenderJob {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) throw new Error('Project not found');

  const brain = getProjectBrain(projectId);
  const jobId = uuid();
  const outputDir = path.join(process.env.HOME || '/tmp', '.cortex', 'renders');
  const outputPath = path.join(outputDir, `${project.name.replace(/\s+/g, '-')}-${jobId.slice(0, 8)}.mp4`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const job: RenderJob = {
    id: jobId,
    projectId,
    status: 'pending',
    outputPath: null,
    progress: 0,
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  activeRenders.set(jobId, job);

  // Generate props JSON for the Remotion composition
  const propsPath = path.join(outputDir, `props-${jobId}.json`);
  const props = {
    projectName: project.name,
    projectType: project.type,
    summary: brain?.summary || 'AI Development Workspace',
    architecture: brain?.architectureNotes || '',
    features: brain?.decisions || '',
    conventions: brain?.conventions || '',
  };
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));

  // Try to find remotion-demo or use a placeholder
  const remotionDir = path.join(process.cwd(), 'remotion-demo');
  const hasRemotion = fs.existsSync(path.join(remotionDir, 'package.json'));

  if (!hasRemotion) {
    // No Remotion project configured — mark as pending setup
    job.status = 'failed';
    job.error = 'Remotion Studio not configured. Create a remotion-demo/ directory with a Remotion project.';
    job.completedAt = new Date().toISOString();
    return job;
  }

  job.status = 'rendering';

  // Spawn Remotion render
  const renderProcess = spawn('npx', [
    'remotion', 'render',
    'src/index.ts',
    'ProjectPromo',
    outputPath,
    '--props', propsPath,
  ], {
    cwd: remotionDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  renderProcess.stdout.on('data', (data: Buffer) => {
    const text = data.toString();
    // Parse progress from Remotion output
    const progressMatch = text.match(/(\d+)%/);
    if (progressMatch) {
      job.progress = parseInt(progressMatch[1]);
    }
  });

  renderProcess.stderr.on('data', (data: Buffer) => {
    const text = data.toString();
    if (text.includes('Error') || text.includes('error')) {
      job.error = text.slice(0, 500);
    }
  });

  renderProcess.on('close', (code) => {
    if (code === 0 && fs.existsSync(outputPath)) {
      job.status = 'completed';
      job.outputPath = outputPath;
      job.progress = 100;
    } else {
      job.status = 'failed';
      if (!job.error) job.error = `Render exited with code ${code}`;
    }
    job.completedAt = new Date().toISOString();

    // Clean up props file
    try { fs.unlinkSync(propsPath); } catch { /* ignore */ }
  });

  return job;
}

/**
 * Get render job status
 */
export function getRenderStatus(jobId: string): RenderJob | null {
  return activeRenders.get(jobId) || null;
}

/**
 * Get latest render for a project
 */
export function getLatestRender(projectId: string): RenderJob | null {
  let latest: RenderJob | null = null;
  for (const job of activeRenders.values()) {
    if (job.projectId === projectId) {
      if (!latest || job.startedAt > latest.startedAt) {
        latest = job;
      }
    }
  }
  return latest;
}

/**
 * List all render jobs
 */
export function listRenders(): RenderJob[] {
  return Array.from(activeRenders.values()).sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt)
  );
}
