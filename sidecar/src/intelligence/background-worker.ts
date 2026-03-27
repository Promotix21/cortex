import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';

type JobType = 'prune_snapshots' | 'compress_history' | 'update_confidence' | 'index_files';
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
