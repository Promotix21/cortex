import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

export type ShadowEventType =
  | 'run:start'
  | 'run:end'
  | 'plan'
  | 'reflect'
  | 'tool'
  | 'chunk'
  | 'error'
  | 'impact'
  | 'test:start'
  | 'test:end';

export interface ShadowEvent {
  id: string;
  runId: string;
  projectId: string;
  sessionId?: string;
  type: ShadowEventType;
  ts: number;
  payload: unknown;
}

class OrchestratorEventBus extends EventEmitter {
  private ringBuffer: ShadowEvent[] = [];
  private readonly MAX_BUFFER = 500;

  emitEvent(ev: Omit<ShadowEvent, 'id' | 'ts'>) {
    const event: ShadowEvent = { ...ev, id: uuid(), ts: Date.now() };
    this.ringBuffer.push(event);
    if (this.ringBuffer.length > this.MAX_BUFFER) {
      this.ringBuffer.shift();
    }
    this.emit('shadow', event);
    return event;
  }

  getRecent(sinceTs?: number, projectId?: string): ShadowEvent[] {
    return this.ringBuffer.filter(e =>
      (sinceTs === undefined || e.ts > sinceTs) &&
      (projectId === undefined || e.projectId === projectId)
    );
  }
}

export const shadowBus: OrchestratorEventBus = new OrchestratorEventBus();
shadowBus.setMaxListeners(50);
