import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { getTerminalManager } from '../terminals/terminal-manager.js';
import { getSessionManager } from '../sessions/session-manager.js';

interface PlaybookStep {
  order: number;
  name: string;
  type: 'command' | 'ai_prompt' | 'manual' | 'checkpoint';
  action: string;
  description?: string;
  requires_approval?: boolean;
}

/**
 * Playbook Execution Engine
 *
 * Manages the state and execution of project playbooks.
 */
class PlaybookManager {
  private activeRuns = new Map<string, any>();

  /**
   * Start or continue a playbook run.
   */
  async runPlaybook(runId: string) {
    const db = getDb();
    const run = db.prepare('SELECT * FROM playbook_runs WHERE id = ?').get(runId) as any;
    if (!run) return;

    const playbook = db.prepare('SELECT * FROM playbooks WHERE id = ?').get(run.playbook_id) as any;
    if (!playbook) return;

    const steps = JSON.parse(playbook.steps_json) as PlaybookStep[];
    const currentStepIdx = run.current_step || 0;

    if (currentStepIdx >= steps.length) {
      db.prepare('UPDATE playbook_runs SET status = ?, completed_at = ? WHERE id = ?')
        .run('completed', new Date().toISOString(), runId);
      return;
    }

    const step = steps[currentStepIdx];
    console.log(`[playbooks] Running step ${currentStepIdx + 1}/${steps.length} for run ${runId}: ${step.name}`);

    try {
      if (step.type === 'checkpoint' || step.requires_approval) {
        db.prepare('UPDATE playbook_runs SET status = ? WHERE id = ?').run('paused', runId);
        return; // Wait for user approval
      }

      await this.executeStep(step, run.project_id, run.session_id);

      // Advance to next step
      db.prepare('UPDATE playbook_runs SET current_step = ?, status = ? WHERE id = ?')
        .run(currentStepIdx + 1, 'running', runId);

      // Recursive call for next step (unless it was the last)
      if (currentStepIdx + 1 < steps.length) {
        setImmediate(() => this.runPlaybook(runId));
      } else {
        db.prepare('UPDATE playbook_runs SET status = ?, completed_at = ? WHERE id = ?')
          .run('completed', new Date().toISOString(), runId);
      }
    } catch (err: any) {
      console.error(`[playbooks] Step failed: ${err.message}`);
      db.prepare('UPDATE playbook_runs SET status = ?, error = ? WHERE id = ?')
        .run('failed', err.message, runId);
    }
  }

  /**
   * Execute a single step.
   */
  private async executeStep(step: PlaybookStep, projectId: string, sessionId: string | null) {
    const db = getDb();

    switch (step.type) {
      case 'command':
        await this.runCommand(step.action, projectId, sessionId);
        break;

      case 'ai_prompt':
        if (!sessionId) throw new Error('AI prompt step requires an active session');
        await this.sendPrompt(step.action, sessionId);
        break;

      case 'manual':
        // Manual steps just pause the execution
        throw new Error('manual_step_pause');

      default:
        break;
    }
  }

  private async runCommand(command: string, projectId: string, sessionId: string | null) {
    const tmgr = getTerminalManager();
    const project = getDb().prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as any;

    if (sessionId) {
      // If we have a session, we should ideally run it in that terminal
      // but Claude Code sessions are interactive.
      // For now, spawn a temporary task terminal.
      const term = tmgr.spawn(projectId, `Playbook: ${command.slice(0, 20)}`, project.path, 'shell', 120, 40, command);

      return new Promise<void>((resolve, reject) => {
        tmgr.on('terminal:exit', ({ terminalId, exitCode }) => {
          if (terminalId === term.id) {
            if (exitCode === 0) resolve();
            else reject(new Error(`Command failed with exit code ${exitCode}`));
          }
        });
      });
    } else {
      const term = tmgr.spawn(projectId, `Playbook: ${command.slice(0, 20)}`, project.path, 'shell', 120, 40, command);
      return new Promise<void>((resolve, reject) => {
        tmgr.on('terminal:exit', ({ terminalId, exitCode }) => {
          if (terminalId === term.id) {
            if (exitCode === 0) resolve();
            else reject(new Error(`Command failed with exit code ${exitCode}`));
          }
        });
      });
    }
  }

  private async sendPrompt(prompt: string, sessionId: string) {
    const smgr = getSessionManager();
    const tmgr = getTerminalManager();
    const session = smgr.getSessionInfo(sessionId);

    if (!session || !session.terminalId) {
      throw new Error('Session or terminal not found');
    }

    // Send the prompt to the xterm terminal as if the user typed it
    tmgr.write(session.terminalId, `${prompt}\n`);

    // We don't easily know when Claude finishes, so we might need a timeout
    // or wait for a specific output pattern. For MVP, we'll just wait 5s.
    return new Promise<void>(resolve => setTimeout(resolve, 5000));
  }

  /**
   * Resume a paused playbook run (e.g. after checkpoint approval).
   */
  async resumeRun(runId: string) {
    const db = getDb();
    const run = db.prepare('SELECT * FROM playbook_runs WHERE id = ?').get(runId) as any;
    if (!run || run.status !== 'paused') return;

    db.prepare('UPDATE playbook_runs SET status = ? WHERE id = ?').run('running', runId);
    return this.runPlaybook(runId);
  }
}

let playbookManager: PlaybookManager;

export function getPlaybookManager() {
  if (!playbookManager) playbookManager = new PlaybookManager();
  return playbookManager;
}
