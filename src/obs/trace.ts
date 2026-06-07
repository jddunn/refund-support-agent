import { randomUUID } from 'node:crypto';
import type { Db } from '@/db';
import { appendEvent, createRun, finalizeRun } from '@/db/trace-store';

export interface RunMeta {
  conversationId: string;
  customerId?: string;
}

export type EventKind = 'node' | 'tool' | 'retry' | 'error' | 'guard';

export interface EventInput {
  node: string;
  kind: EventKind;
  input?: unknown;
  output?: unknown;
  retryCount?: number;
  latencyMs?: number;
}

export interface RunSummary {
  decision?: string;
  status: 'ok' | 'error';
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Records one run's lifecycle to the local trace store: a run row, an ordered
 * list of events, and a final summary with token and cost totals. The admin
 * dashboard reads exactly what this writes.
 */
export class Trace {
  readonly runId = randomUUID();
  private seq = 0;
  private readonly startedAtMs = Date.now();

  constructor(
    private readonly db: Db,
    private readonly meta: RunMeta,
  ) {}

  /** Open the run. Call once before the graph starts. */
  async start(): Promise<void> {
    await createRun(this.db, {
      id: this.runId,
      conversationId: this.meta.conversationId,
      customerId: this.meta.customerId,
      startedAtMs: this.startedAtMs,
    });
  }

  /** Append a trace event in order. */
  async event(ev: EventInput): Promise<void> {
    await appendEvent(this.db, {
      id: randomUUID(),
      runId: this.runId,
      seq: this.seq++,
      atMs: Date.now(),
      ...ev,
    });
  }

  /** Close the run with its decision and usage totals. */
  async finish(summary: RunSummary): Promise<void> {
    const endedAtMs = Date.now();
    await finalizeRun(this.db, this.runId, {
      ...summary,
      latencyMs: endedAtMs - this.startedAtMs,
      endedAtMs,
    });
  }
}
