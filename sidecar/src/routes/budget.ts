import { Router } from 'express';
import {
  checkBudgets, getLimits, updateLimit,
  acknowledgeAlert, acknowledgeAllAlerts, canSpawnSession,
} from '../intelligence/budget-guard.js';

export const budgetRouter: ReturnType<typeof Router> = Router();

// GET /api/budget/status — full budget status with current usage
budgetRouter.get('/status', (_req, res) => {
  const status = checkBudgets();
  res.json(status);
});

// GET /api/budget/limits — all limits
budgetRouter.get('/limits', (_req, res) => {
  res.json({ limits: getLimits() });
});

// PUT /api/budget/limits/:id — update a limit
budgetRouter.put('/limits/:id', (req, res) => {
  updateLimit(req.params.id, req.body);
  res.json({ success: true });
});

// GET /api/budget/can-spawn — check if session spawn is allowed
budgetRouter.get('/can-spawn', (_req, res) => {
  res.json(canSpawnSession());
});

// POST /api/budget/alerts/:id/ack — acknowledge an alert
budgetRouter.post('/alerts/:id/ack', (req, res) => {
  acknowledgeAlert(req.params.id);
  res.json({ success: true });
});

// POST /api/budget/alerts/ack-all — acknowledge all alerts
budgetRouter.post('/alerts/ack-all', (_req, res) => {
  acknowledgeAllAlerts();
  res.json({ success: true });
});
