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

/** Parse a stored JSON string into an object, or null. */
function parse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

/** Waterfall bar width, bucketed to 10% steps so it needs no inline style. */
function widthClass(duration: number, max: number): string {
  const bucket = max > 0 ? Math.min(10, Math.max(1, Math.round((duration / max) * 10))) : 1;
  return styles[`w${bucket * 10}`] ?? styles.w10;
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

  const events = detail?.events ?? [];
  const startMs = detail?.run.startedAtMs ?? 0;
  const durations = events.map((e, i) =>
    Math.max(0, e.atMs - (i > 0 ? events[i - 1].atMs : startMs)),
  );
  const maxDur = Math.max(1, ...durations);

  return (
    <div className={styles.layout}>
      <aside className={styles.list} aria-label="Runs">
        <div className={styles.listHead}>
          <h1>Runs</h1>
          <button className={styles.refresh} onClick={() => void loadRuns()}>
            Refresh
          </button>
        </div>
        {runs.length === 0 && (
          <p className={styles.empty}>No runs yet. Use the chat to create one.</p>
        )}
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
                <div>
                  <dt>steps</dt>
                  <dd>{events.length}</dd>
                </div>
              </dl>
            </div>
            <ol className={styles.timeline}>
              {events.map((event, i) => (
                <TraceEvent key={event.id} event={event} duration={durations[i]} maxDur={maxDur} />
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}

function TraceEvent({
  event,
  duration,
  maxDur,
}: {
  event: EventRow;
  duration: number;
  maxDur: number;
}) {
  const [open, setOpen] = useState(false);
  const hasIO = Boolean(event.inputJson || event.outputJson);
  const out = parse(event.outputJson);
  const inp = parse(event.inputJson);

  const flags = event.node === 'screen' && Array.isArray(out?.flags) ? (out.flags as string[]) : [];
  const isModel = event.node === 'model' && typeof out?.id === 'string';
  const isGuard = event.kind === 'guard';
  const guardModel = isGuard && typeof inp?.proposed === 'string' ? (inp.proposed as string) : null;
  const guardEngine = isGuard && typeof out?.engine === 'string' ? (out.engine as string) : null;
  const overridden = isGuard && out?.overridden === true;

  return (
    <li className={styles.event}>
      <button
        className={styles.eventHead}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={!hasIO}
      >
        <span className={`${styles.kind} ${styles[`kind_${event.kind}`] ?? ''}`}>{event.kind}</span>
        <span className={styles.node}>{event.node}</span>
        <span className={styles.bar}>
          <span className={`${styles.barFill} ${widthClass(duration, maxDur)}`} />
        </span>
        <span className={styles.dur}>{duration}ms</span>
        {event.retryCount > 0 && <span className={styles.retry}>retry ×{event.retryCount}</span>}
      </button>

      {flags.length > 0 && (
        <div className={styles.flags}>
          {flags.map((flag) => (
            <span key={flag} className={styles.flag}>
              ⚠ {flag}
            </span>
          ))}
        </div>
      )}

      {isModel && (
        <div className={styles.modelLine}>
          <span className={styles.modelId}>{String(out?.id)}</span>
          {typeof out?.tier === 'string' && <span className={styles.modelTier}>{out.tier}</span>}
          {typeof out?.reason === 'string' && (
            <span className={styles.modelReason}>{out.reason}</span>
          )}
        </div>
      )}

      {guardModel && (
        <div className={`${styles.guardDiff} ${overridden ? styles.guardOverridden : ''}`}>
          <span className={styles.guardSide}>
            model <b>{guardModel}</b>
          </span>
          <span className={styles.guardArrow}>→</span>
          <span className={styles.guardSide}>
            engine <b>{guardEngine ?? '—'}</b>
          </span>
          <span className={styles.guardVerdict}>{overridden ? 'overridden' : 'confirmed'}</span>
        </div>
      )}

      {open && hasIO && (
        <div className={styles.io}>
          {event.inputJson && (
            <pre className={styles.pre}>
              <code>{pretty(event.inputJson)}</code>
            </pre>
          )}
          {event.outputJson && (
            <pre className={styles.pre}>
              <code>{pretty(event.outputJson)}</code>
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
