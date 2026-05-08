import { Router } from 'express';
import {
  syncGlobalKnowledge,
  getGlobalOverview,
  getGlobalFacts,
  getCompanyInsights,
  getCrossProjectPatterns,
  globalSearch,
} from '../intelligence/global-mempalace.js';

export const mempalaceRouter: ReturnType<typeof Router> = Router();

// GET /api/mempalace/overview — global stats dashboard
mempalaceRouter.get('/overview', (_req, res) => {
  try {
    const overview = getGlobalOverview();
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mempalace/sync — aggregate all project knowledge into global view
mempalaceRouter.post('/sync', (_req, res) => {
  try {
    const result = syncGlobalKnowledge();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mempalace/facts — browse all global facts
mempalaceRouter.get('/facts', (req, res) => {
  try {
    const { company, room, subject, search, limit, offset } = req.query;
    const result = getGlobalFacts({
      company: company as string,
      room: room as string,
      subject: subject as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mempalace/companies — company insights
mempalaceRouter.get('/companies', (req, res) => {
  try {
    const insights = getCompanyInsights(req.query.company as string);
    res.json({ insights });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mempalace/patterns — cross-project patterns
mempalaceRouter.get('/patterns', (req, res) => {
  try {
    const patterns = getCrossProjectPatterns(req.query.type as string);
    res.json({ patterns });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mempalace/search — global search
mempalaceRouter.get('/search', (req, res) => {
  const q = req.query.q as string;
  if (!q) { res.json({ facts: [], patterns: [], insights: [] }); return; }
  try {
    const results = globalSearch(q);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
