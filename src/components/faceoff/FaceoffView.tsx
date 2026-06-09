'use client';

import { useState } from 'react';
import styles from './FaceoffView.module.scss';

interface Customer {
  id: string;
  name: string;
}

interface Result {
  model: string;
  decision: string;
  message: string;
  citations: string[];
  costUsd: number;
  latencyMs: number;
  tokens: number;
}

export function FaceoffView({ customers }: { customers: Customer[] }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [message, setMessage] = useState('I would like a refund for my order ORD-58120.');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  async function run() {
    if (!message.trim() || loading) return;
    setLoading(true);
    setResults(null);
    try {
      const res = await fetch('/api/faceoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId, message }),
      });
      const data = await res.json();
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const decisions = new Set((results ?? []).map((r) => r.decision));
  const consensus = results && results.length > 1 && decisions.size === 1;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Model face-off</h1>
      <p className={styles.lead}>
        Run the same request through every configured model. Because the deterministic guard
        rebuilds the decision from policy, they reach the same verdict regardless of which model
        proposed it.
      </p>

      <div className={styles.controls}>
        <select
          className={styles.picker}
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          aria-label="Customer"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id})
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label="Refund request"
          placeholder="Refund request…"
        />
        <button
          className={styles.run}
          onClick={() => void run()}
          disabled={loading || !message.trim()}
        >
          {loading ? 'Running…' : 'Run face-off'}
        </button>
      </div>

      {consensus && (
        <div className={styles.consensus}>
          All models agree: <b>{[...decisions][0]}</b> — the engine guarantees it.
        </div>
      )}

      {loading && (
        <p className={styles.hint}>Running the agent on each model in parallel… (a few seconds)</p>
      )}

      {results && results.length > 0 && (
        <div className={styles.grid}>
          {results.map((r) => (
            <div key={r.model} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.model}>{r.model}</span>
                <span className={`${styles.badge} ${styles[r.decision] ?? styles.neutral}`}>
                  {r.decision}
                </span>
              </div>
              <p className={styles.message}>{r.message}</p>
              {r.citations.length > 0 && (
                <p className={styles.cite}>Policy: {r.citations.join(', ')}</p>
              )}
              <dl className={styles.meta}>
                <div>
                  <dt>cost</dt>
                  <dd>${r.costUsd.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>latency</dt>
                  <dd>{r.latencyMs}ms</dd>
                </div>
                <div>
                  <dt>tokens</dt>
                  <dd>{r.tokens}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
