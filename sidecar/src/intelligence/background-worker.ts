import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { checkBudgets } from './budget-guard.js';
import { analyzeSession } from './session-analyzer.js';

type JobType = 'prune_snapshots' | 'compress_history' | 'update_confidence' | 'index_files' | 'budget_check';
type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

interface JobResult {
  jobType: JobType;
  status: JobStatus;
  result: string;
  durationMs: number;
}

export class BackgroundWorker extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  /**
   * Start the background worker (default: every 5 minutes)
   */
  start(intervalMs = 300000): void {
    // Run immediately on first start
    setTimeout(() => this.runAll(), 5000);
    this.interval = setInterval(() => this.runAll(), intervalMs);
    console.log(`[background-worker] Started (interval: ${intervalMs / 1000}s)`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Run all background jobs
   */
  async runAll(): Promise<void> {
    if (this.running) return; // Prevent overlap
    this.running = true;

    try {
      await this.pruneSnapshots();
      await this.compressHistory();
      await this.updateConfidence();
      await this.checkBudgetLimits();
      await this.analyzeRecentSessions();
    } catch (err) {
      console.error('[background-worker] Error:', err);
    } finally {
      this.running = false;
    }
  }

  /**
   * Prune old snapshots (keep last 50 per project)
   */
  async pruneSnapshots(): Promise<JobResult> {
    const start = Date.now();
    const db = getDb();
    const jobId = uuid();

    this.logJob(jobId, 'prune_snapshots', 'running');

    try {
      const projects = db.prepare('SELECT id FROM projects').all() as any[];
      let totalPruned = 0;

      for (const project of projects) {
        const result = db.prepare(`
          DELETE FROM project_snapshots
          WHERE project_id = ? AND id NOT IN (
            SELECT id FROM project_snapshots WHERE project_id = ?
            ORDER BY timestamp DESC LIMIT 50
          )
        `).run(project.id, project.id);
        totalPruned += result.changes;
      }

      const msg = `Pruned ${totalPruned} old snapshots across ${projects.length} projects`;
      this.logJob(jobId, 'prune_snapshots', 'completed', msg);
      return { jobType: 'prune_snapshots', status: 'completed', result: msg, durationMs: Date.now() - start };
    } catch (err: any) {
      this.logJob(jobId, 'prune_snapshots', 'failed', err.message);
      return { jobType: 'prune_snapshots', status: 'failed', result: err.message, durationMs: Date.now() - start };
    }
  }

  /**
   * Compress old execution history (keep last 1000 per session, archive rest as summary)
   */
  async compressHistory(): Promise<JobResult> {
    const start = Date.now();
    const db = getDb();
    const jobId = uuid();

    this.logJob(jobId, 'compress_history', 'running');

    try {
      const sessions = db.prepare(`
        SELECT session_id, COUNT(*) as cnt FROM execution_history
        GROUP BY session_id HAVING cnt > 1000
      `).all() as any[];

      let totalArchived = 0;

      for (const session of sessions) {
        const excess = session.cnt - 1000;
        const result = db.prepare(`
          DELETE FROM execution_history
          WHERE session_id = ? AND id IN (
            SELECT id FROM execution_history WHERE session_id = ?
            ORDER BY timestamp ASC LIMIT ?
          )
        `).run(session.session_id, session.session_id, excess);
        totalArchived += result.changes;
      }

      const msg = `Compressed ${totalArchived} old history entries from ${sessions.length} sessions`;
      this.logJob(jobId, 'compress_history', 'completed', msg);
      return { jobType: 'compress_history', status: 'completed', result: msg, durationMs: Date.now() - start };
    } catch (err: any) {
      this.logJob(jobId, 'compress_history', 'failed', err.message);
      return { jobType: 'compress_history', status: 'failed', result: err.message, durationMs: Date.now() - start };
    }
  }

  /**
   * Update confidence scores based on usage patterns
   */
  async updateConfidence(): Promise<JobResult> {
    const start = Date.now();
    const db = getDb();
    const jobId = uuid();

    this.logJob(jobId, 'update_confidence', 'running');

    try {
      // Promote patterns with high usage + rating to verified
      const promoted = db.prepare(`
        UPDATE pattern_memory SET confidence = 'verified', updated_at = ?
        WHERE confidence = 'probable' AND usage_count >= 5 AND user_rating >= 4
      `).run(new Date().toISOString());

      // Promote probable patterns with moderate usage
      const probable = db.prepare(`
        UPDATE pattern_memory SET confidence = 'probable', updated_at = ?
        WHERE confidence = 'unverified' AND usage_count >= 3
      `).run(new Date().toISOString());

      // Same for debug memory
      const debugPromoted = db.prepare(`
        UPDATE debug_memory SET confidence = 'verified', updated_at = ?
        WHERE confidence = 'probable' AND usage_count >= 3 AND user_rating >= 4
      `).run(new Date().toISOString());

      const debugProbable = db.prepare(`
        UPDATE debug_memory SET confidence = 'probable', updated_at = ?
        WHERE confidence = 'unverified' AND usage_count >= 2
      `).run(new Date().toISOString());

      // Calculate success_rate for patterns (based on rating)
      db.prepare(`
        UPDATE pattern_memory SET success_rate = CASE
          WHEN user_rating >= 4 THEN 0.9
          WHEN user_rating >= 3 THEN 0.7
          WHEN user_rating >= 2 THEN 0.5
          ELSE success_rate
        END
        WHERE user_rating IS NOT NULL
      `).run();

      const msg = `Confidence updated: ${promoted.changes + probable.changes} patterns, ${debugPromoted.changes + debugProbable.changes} debug solutions`;
      this.logJob(jobId, 'update_confidence', 'completed', msg);
      return { jobType: 'update_confidence', status: 'completed', result: msg, durationMs: Date.now() - start };
    } catch (err: any) {
      this.logJob(jobId, 'update_confidence', 'failed', err.message);
      return { jobType: 'update_confidence', status: 'failed', result: err.message, durationMs: Date.now() - start };
    }
  }

  /**
   * Analyze recently completed sessions for auto-learning
   */
  async analyzeRecentSessions(): Promise<void> {
    const db = getDb();
    // 7-day window: catches sessions missed during restarts or offline periods.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Find completed sessions from last 7 days that haven't been analyzed yet.
    // Sentinel: after analysis we insert an execution_history row with action_type='analyzed'.
    const sessions = db.prepare(`
      SELECT cs.id, cs.project_id FROM claude_sessions cs
      WHERE cs.status = 'completed' AND cs.last_active > ?
      AND cs.id NOT IN (
        SELECT session_id FROM execution_history WHERE action_type = 'analyzed'
      )
      LIMIT 10
    `).all(sevenDaysAgo) as { id: string; project_id: string }[];

    for (const session of sessions) {
      try {
        analyzeSession(session.id, session.project_id);
        // Mark as analyzed so we don't re-process on next tick
        db.prepare(`
          INSERT INTO execution_history (id, session_id, action_type, timestamp)
          VALUES (?, ?, 'analyzed', ?)
        `).run(uuid(), session.id, new Date().toISOString());
      } catch (err) {
        console.error(`[background-worker] Session analysis failed for ${session.id}:`, err);
      }
    }
  }

  /**
   * Check budget limits and create alerts
   */
  async checkBudgetLimits(): Promise<JobResult> {
    const start = Date.now();
    const jobId = uuid();
    this.logJob(jobId, 'budget_check', 'running');

    try {
      const status = checkBudgets();
      const warnings = status.limits.filter(l => l.status !== 'ok').length;
      const newAlerts = status.alerts.filter(a => !a.acknowledged).length;
      const msg = `Budget check: ${warnings} limit(s) at risk, ${newAlerts} unacknowledged alert(s)`;
      this.logJob(jobId, 'budget_check', 'completed', msg);

      if (newAlerts > 0) {
        this.emit('budget:alert', status.alerts.filter(a => !a.acknowledged));
      }

      return { jobType: 'budget_check', status: 'completed', result: msg, durationMs: Date.now() - start };
    } catch (err: any) {
      this.logJob(jobId, 'budget_check', 'failed', err.message);
      return { jobType: 'budget_check', status: 'failed', result: err.message, durationMs: Date.now() - start };
    }
  }

  /**
   * Get recent job history
   */
  getJobHistory(limit = 20): any[] {
    const db = getDb();
    return db.prepare('SELECT * FROM background_jobs ORDER BY last_run DESC LIMIT ?').all(limit);
  }

  private logJob(jobId: string, jobType: JobType, status: JobStatus, result?: string): void {
    const db = getDb();
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT id FROM background_jobs WHERE id = ?').get(jobId);
    if (existing) {
      db.prepare('UPDATE background_jobs SET status = ?, result = ?, last_run = ? WHERE id = ?')
        .run(status, result || null, now, jobId);
    } else {
      db.prepare('INSERT INTO background_jobs (id, job_type, status, result, last_run) VALUES (?, ?, ?, ?, ?)')
        .run(jobId, jobType, status, result || null, now);
    }

    this.emit('job:complete', { jobType, status, result });
  }
}

// Singleton
let instance: BackgroundWorker | null = null;
export function getBackgroundWorker(): BackgroundWorker {
  if (!instance) instance = new BackgroundWorker();
  return instance;
}
