import type { Db } from './index';

/** A run summary, one row per customer turn. Drives the admin list view. */
export interface RunRow {
  id: string;
  conversationId: string;
  customerId: string | null;
  decision: string | null;
  status: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  startedAtMs: number;
  endedAtMs: number | null;
}

/** A single trace event: a node ran, a tool was called, a retry happened. */
export interface TraceEventRow {
  id: string;
  runId: string;
  seq: number;
  node: string;
  kind: string;
  inputJson: string | null;
  outputJson: string | null;
  retryCount: number;
  latencyMs: number;
  atMs: number;
}

/** Open a run before the graph starts. */
export async function createRun(
  db: Db,
  run: { id: string; conversationId: string; customerId?: string; startedAtMs: number },
): Promise<void> {
  await db.run(
    `INSERT INTO agent_runs (id, conversation_id, customer_id, status, started_at_ms)
     VALUES (?, ?, ?, 'ok', ?)`,
    [run.id, run.conversationId, run.customerId ?? null, run.startedAtMs],
  );
}

/** Append one trace event. Inputs and outputs are stored as JSON text. */
export async function appendEvent(
  db: Db,
  ev: {
    id: string;
    runId: string;
    seq: number;
    node: string;
    kind: string;
    input?: unknown;
    output?: unknown;
    retryCount?: number;
    latencyMs?: number;
    atMs: number;
  },
): Promise<void> {
  await db.run(
    `INSERT INTO agent_trace_events
       (id, run_id, seq, node, kind, input_json, output_json, retry_count, latency_ms, at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ev.id,
      ev.runId,
      ev.seq,
      ev.node,
      ev.kind,
      ev.input === undefined ? null : JSON.stringify(ev.input),
      ev.output === undefined ? null : JSON.stringify(ev.output),
      ev.retryCount ?? 0,
      ev.latencyMs ?? 0,
      ev.atMs,
    ],
  );
}

/** Finalize a run with its decision and usage totals. */
export async function finalizeRun(
  db: Db,
  id: string,
  summary: {
    decision?: string;
    status: 'ok' | 'error';
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
    endedAtMs: number;
  },
): Promise<void> {
  await db.run(
    `UPDATE agent_runs
        SET decision = ?, status = ?, input_tokens = ?, output_tokens = ?,
            cost_usd = ?, latency_ms = ?, ended_at_ms = ?
      WHERE id = ?`,
    [
      summary.decision ?? null,
      summary.status,
      summary.inputTokens,
      summary.outputTokens,
      summary.costUsd,
      summary.latencyMs,
      summary.endedAtMs,
      id,
    ],
  );
}

/** Most recent runs, newest first. */
export async function listRuns(db: Db, limit = 50): Promise<RunRow[]> {
  return db.all<RunRow>(
    `SELECT id, conversation_id AS conversationId, customer_id AS customerId, decision, status,
            input_tokens AS inputTokens, output_tokens AS outputTokens, cost_usd AS costUsd,
            latency_ms AS latencyMs, started_at_ms AS startedAtMs, ended_at_ms AS endedAtMs
       FROM agent_runs
      ORDER BY started_at_ms DESC
      LIMIT ?`,
    [limit],
  );
}

/** One run with its full ordered event timeline. */
export async function getRun(
  db: Db,
  id: string,
): Promise<{ run: RunRow; events: TraceEventRow[] } | null> {
  const run = await db.get<RunRow>(
    `SELECT id, conversation_id AS conversationId, customer_id AS customerId, decision, status,
            input_tokens AS inputTokens, output_tokens AS outputTokens, cost_usd AS costUsd,
            latency_ms AS latencyMs, started_at_ms AS startedAtMs, ended_at_ms AS endedAtMs
       FROM agent_runs
      WHERE id = ?`,
    [id],
  );
  if (!run) return null;

  const events = await db.all<TraceEventRow>(
    `SELECT id, run_id AS runId, seq, node, kind, input_json AS inputJson, output_json AS outputJson,
            retry_count AS retryCount, latency_ms AS latencyMs, at_ms AS atMs
       FROM agent_trace_events
      WHERE run_id = ?
      ORDER BY seq ASC`,
    [id],
  );
  return { run, events };
}

/** Aggregate stats across completed runs, for the admin overview dashboard. */
export interface RunMetrics {
  total: number;
  approve: number;
  deny: number;
  escalate: number;
  other: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  totalCostUsd: number;
  totalTokens: number;
}

export async function aggregateRuns(db: Db): Promise<RunMetrics> {
  const rows = await db.all<{
    decision: string | null;
    latencyMs: number;
    costUsd: number;
    tokens: number;
  }>(
    `SELECT decision, latency_ms AS latencyMs, cost_usd AS costUsd,
            (input_tokens + output_tokens) AS tokens
       FROM agent_runs
      WHERE ended_at_ms IS NOT NULL`,
  );
  const total = rows.length;
  const countOf = (decision: string) => rows.filter((r) => r.decision === decision).length;
  const approve = countOf('approve');
  const deny = countOf('deny');
  const escalate = countOf('escalate');
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    total,
    approve,
    deny,
    escalate,
    other: total - approve - deny - escalate,
    avgLatencyMs: total ? Math.round(latencies.reduce((a, b) => a + b, 0) / total) : 0,
    p50LatencyMs: total ? latencies[Math.floor((total - 1) / 2)] : 0,
    totalCostUsd: rows.reduce((a, r) => a + r.costUsd, 0),
    totalTokens: rows.reduce((a, r) => a + r.tokens, 0),
  };
}

/** The latest run for a conversation with its events, for the live chat drawer. */
export async function getLatestRunByConversation(
  db: Db,
  conversationId: string,
): Promise<{ run: RunRow; events: TraceEventRow[] } | null> {
  const run = await db.get<RunRow>(
    `SELECT id, conversation_id AS conversationId, customer_id AS customerId, decision, status,
            input_tokens AS inputTokens, output_tokens AS outputTokens, cost_usd AS costUsd,
            latency_ms AS latencyMs, started_at_ms AS startedAtMs, ended_at_ms AS endedAtMs
       FROM agent_runs
      WHERE conversation_id = ?
      ORDER BY started_at_ms DESC
      LIMIT 1`,
    [conversationId],
  );
  if (!run) return null;
  const events = await db.all<TraceEventRow>(
    `SELECT id, run_id AS runId, seq, node, kind, input_json AS inputJson, output_json AS outputJson,
            retry_count AS retryCount, latency_ms AS latencyMs, at_ms AS atMs
       FROM agent_trace_events
      WHERE run_id = ?
      ORDER BY seq ASC`,
    [run.id],
  );
  return { run, events };
}
