import { Router } from 'express';
import { startRender, getRenderStatus, getLatestRender, listRenders } from '../intelligence/remotion-renderer.js';
import path from 'path';
import fs from 'fs';

export const remotionRouter: ReturnType<typeof Router> = Router();

// POST /api/remotion/render — start a render for a project
remotionRouter.post('/render', (req, res) => {
  const { project_id } = req.body;
  if (!project_id) {
    res.status(400).json({ error: 'project_id is required' });
    return;
  }

  try {
    const job = startRender(project_id);
    res.status(201).json({ job });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/remotion/status/:jobId — get render status
remotionRouter.get('/status/:jobId', (req, res) => {
  const job = getRenderStatus(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Render job not found' });
    return;
  }
  res.json({ job });
});

// GET /api/remotion/latest/:projectId — get latest render for a project
remotionRouter.get('/latest/:projectId', (req, res) => {
  const job = getLatestRender(req.params.projectId);
  res.json({ job });
});

// GET /api/remotion/list — list all renders
remotionRouter.get('/list', (_req, res) => {
  res.json({ jobs: listRenders() });
});

// GET /api/remotion/video/:jobId — serve rendered video file
remotionRouter.get('/video/:jobId', (req, res) => {
  const job = getRenderStatus(req.params.jobId);
  if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(job.outputPath)}"`);
  fs.createReadStream(job.outputPath).pipe(res);
});
