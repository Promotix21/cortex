import { Router } from 'express';
import { getBackgroundWorker } from '../intelligence/background-worker.js';

export const jobsRouter: ReturnType<typeof Router> = Router();

// GET /api/jobs — list recent job history
jobsRouter.get('/', (_req, res) => {
  const worker = getBackgroundWorker();
  res.json({ jobs: worker.getJobHistory() });
});

// POST /api/jobs/run — manually trigger all background jobs
jobsRouter.post('/run', async (_req, res) => {
  const worker = getBackgroundWorker();
  try {
    await worker.runAll();
    res.json({ success: true, jobs: worker.getJobHistory(5) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
