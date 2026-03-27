import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/index.js';

const DEFAULT_RESTRICTED = [
  'rm -rf', 'sudo', 'chmod 777', 'curl | bash', 'curl | sh',
  'DROP TABLE', 'DROP DATABASE', 'DELETE FROM', '> /dev/sda',
];

export function checkPolicy(req: Request, res: Response, _next: NextFunction): void {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const { action, project_id } = req.body;
  if (!action) {
    res.status(400).json({ error: 'action required' });
    return;
  }

  // Check restricted defaults
  for (const pattern of DEFAULT_RESTRICTED) {
    if (action.includes(pattern)) {
      res.json({ allowed: false, policy: 'restrict', reason: `Default restricted: ${pattern}` });
      return;
    }
  }

  // Check project-specific policies
  if (project_id) {
    const db = getDb();
    const policies = db.prepare('SELECT * FROM execution_policies WHERE project_id = ?').all(project_id) as any[];
    for (const p of policies) {
      if (action.includes(p.action_pattern)) {
        res.json({ allowed: p.policy === 'allow', policy: p.policy, reason: p.reason });
        return;
      }
    }
  }

  res.json({ allowed: true, policy: 'allow', reason: 'Default allow' });
}
