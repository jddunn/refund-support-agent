import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { getDb } from '@/db';
import { aggregateRuns } from '@/db/trace-store';
import styles from './overview.module.scss';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pass rate from the most recent red-team report, or null if none has run. */
function latestRedteam(): { passed: number; total: number } | null {
  try {
    const dir = join(process.cwd(), 'reports', 'redteam');
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    const latest = files[files.length - 1];
    if (!latest) return null;
    const data = JSON.parse(readFileSync(join(dir, latest), 'utf8'));
    const cases: { passed?: boolean }[] = Array.isArray(data.cases) ? data.cases : [];
    return { passed: cases.filter((c) => c.passed).length, total: cases.length };
  } catch {
    return null;
  }
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}

function Decision({ kind, count, pct }: { kind: string; count: number; pct: number }) {
  return (
    <div className={`${styles.decision} ${styles[kind] ?? ''}`}>
      <span className={styles.decisionCount}>{count}</span>
      <span className={styles.decisionLabel}>{kind}</span>
      <span className={styles.decisionPct}>{pct}% of runs</span>
    </div>
  );
}

export default async function AdminOverview() {
  const db = await getDb();
  const m = await aggregateRuns(db);
  const redteam = latestRedteam();
  const pct = (n: number) => (m.total ? Math.round((n / m.total) * 100) : 0);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Overview</h1>

      <div className={styles.grid}>
        <Stat label="Total runs" value={m.total} sub="recorded to the trace store" />
        <Stat
          label="Held the policy line"
          value={redteam ? `${redteam.passed}/${redteam.total}` : '—'}
          sub={redteam ? 'latest red-team suite' : 'run npm run stress'}
        />
        <Stat
          label="Median latency"
          value={`${m.p50LatencyMs}ms`}
          sub={`avg ${m.avgLatencyMs}ms`}
        />
        <Stat
          label="Total cost"
          value={`$${m.totalCostUsd.toFixed(2)}`}
          sub={`${m.totalTokens.toLocaleString()} tokens`}
        />
      </div>

      <h2 className={styles.subtitle}>Decisions</h2>
      <div className={styles.decisions}>
        <Decision kind="approve" count={m.approve} pct={pct(m.approve)} />
        <Decision kind="deny" count={m.deny} pct={pct(m.deny)} />
        <Decision kind="escalate" count={m.escalate} pct={pct(m.escalate)} />
      </div>
    </div>
  );
}
