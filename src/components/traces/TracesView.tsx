'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './TracesView.module.scss';

interface RunRow {
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

interface EventRow {
  id: string;
  seq: number;
  node: string;
  kind: string;
  inputJson: string | null;
  outputJson: string | null;
  retryCount: number;
  latencyMs: number;
  atMs: number;
}

function badgeClass(decision: string | null): string {
  if (decision === 'approve') return styles.approve;
  if (decision === 'deny') return styles.deny;
  if (decision === 'escalate') return styles.escalate;
  return styles.neutral;
}

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export function TracesView() {
  const params = useSearchParams();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selected, setSelected] = useState<string | null>(params.get('run'));
  const [detail, setDetail] = useState<{ run: RunRow; events: EventRow[] } | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/runs');
      if (!res.ok) throw new Error('Failed to load runs');
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch (error) {
      console.error('Error loading runs:', error);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let active = true;
    fetch(`/api/runs/${selected}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load run');
        return r.json();
      })
      .then((d) => {
        if (active) setDetail(d.error ? null : d);
      })
      .catch((error) => {
        console.error('Error loading run:', error);
        if (active) setDetail(null);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  return (
    <div className={styles.layout}>
      <aside className={styles.list} aria-label="Runs">
        <div className={styles.listHead}>
          <h1>Runs</h1>
          <button className={styles.refresh} onClick={() => void loadRuns()}>
            Refresh
          </button>
        </div>
        {runs.length === 0 && <p className={styles.empty}>No runs yet. Use the chat to create one.</p>}
        <ul className={styles.runs}>
          {runs.map((run) => (
            <li key={run.id}>
              <button
                className={selected === run.id ? styles.runActive : styles.run}
                onClick={() => setSelected(run.id)}
              >
                <span className={`${styles.badge} ${badgeClass(run.decision)}`}>
                  {run.decision ?? run.status}
                </span>
                <span className={styles.runMeta}>
                  {run.customerId ?? 'unknown'} · {run.latencyMs}ms · ${run.costUsd.toFixed(4)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={styles.detail}>
        {!detail && <p className={styles.empty}>Select a run to see its trace.</p>}
        {detail && (
          <>
            <div className={styles.summary}>
              <span className={`${styles.badge} ${badgeClass(detail.run.decision)}`}>
                {detail.run.decision ?? detail.run.status}
              </span>
              <dl className={styles.stats}>
                <div>
                  <dt>tokens</dt>
                  <dd>{detail.run.inputTokens + detail.run.outputTokens}</dd>
                </div>
                <div>
                  <dt>cost</dt>
                  <dd>${detail.run.costUsd.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>latency</dt>
                  <dd>{detail.run.latencyMs}ms</dd>
                </div>
              </dl>
            </div>
            <ol className={styles.timeline}>
              {detail.events.map((event) => (
                <TraceEvent key={event.id} event={event} render={pretty} />
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}

function TraceEvent({ event, render }: { event: EventRow; render: (json: string) => string }) {
  const [open, setOpen] = useState(false);
  const hasIO = Boolean(event.inputJson || event.outputJson);
  return (
    <li className={styles.event}>
      <button
        className={styles.eventHead}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={!hasIO}
      >
        <span className={styles.kind}>{event.kind}</span>
        <span className={styles.node}>{event.node}</span>
        {event.retryCount > 0 && <span className={styles.retry}>retry ×{event.retryCount}</span>}
      </button>
      {open && hasIO && (
        <div className={styles.io}>
          {event.inputJson && (
            <pre className={styles.pre}>
              <code>{render(event.inputJson)}</code>
            </pre>
          )}
          {event.outputJson && (
            <pre className={styles.pre}>
              <code>{render(event.outputJson)}</code>
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
