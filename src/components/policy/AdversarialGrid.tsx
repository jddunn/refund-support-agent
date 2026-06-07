'use client';

import { useEffect, useState } from 'react';
import styles from './AdversarialGrid.module.scss';

interface Case {
  id: string;
  persona: string;
  expect: string;
  note: string;
  message: string;
}

interface ResultRow {
  id: string;
  passed: boolean;
  decision?: string;
}

export function AdversarialGrid() {
  const [cases, setCases] = useState<Case[]>([]);
  const [results, setResults] = useState<Record<string, ResultRow>>({});

  useEffect(() => {
    fetch('/api/adversarial')
      .then((r) => r.json())
      .then((data) => {
        setCases(data.cases ?? []);
        const map: Record<string, ResultRow> = {};
        const rows: ResultRow[] = data.results?.cases ?? [];
        for (const row of rows) map[row.id] = row;
        setResults(map);
      });
  }, []);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">case</th>
          <th scope="col">persona</th>
          <th scope="col">expected</th>
          <th scope="col">result</th>
        </tr>
      </thead>
      <tbody>
        {cases.map((c) => {
          const result = results[c.id];
          const status = !result ? 'not run' : result.passed ? 'pass' : 'fail';
          const cls = status === 'pass' ? styles.pass : status === 'fail' ? styles.fail : styles.notrun;
          return (
            <tr key={c.id}>
              <td>
                <span title={c.message}>{c.id}</span>
              </td>
              <td>{c.persona}</td>
              <td>{c.expect}</td>
              <td>
                <span className={`${styles.status} ${cls}`}>
                  {status}
                  {result?.decision ? ` (${result.decision})` : ''}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
