'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './PolicyEditor.module.scss';

/**
 * Inline editor for the policy document. Saving writes seed/refund-policy.md
 * and drops the agent's policy cache, so the next get_policy call reads the new
 * text live. The engine rules in src/policy are code; they are the enforcement
 * and do not change here.
 */
export function PolicyEditor() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');

  async function openEditor() {
    try {
      const res = await fetch('/api/policy');
      const data = await res.json();
      setContent(typeof data.content === 'string' ? data.content : '');
      setOpen(true);
      setStatus('');
    } catch {
      setStatus('Could not load the policy.');
    }
  }

  async function save() {
    setStatus('Saving…');
    try {
      const res = await fetch('/api/policy', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Save failed');
      }
      setStatus('Saved. The agent reads this on its next policy lookup.');
      setOpen(false);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
    }
  }

  return (
    <div className={styles.wrap}>
      {!open ? (
        <button className={styles.edit} onClick={() => void openEditor()}>
          Edit policy
        </button>
      ) : (
        <div className={styles.editor}>
          <textarea
            className={styles.textarea}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            aria-label="Policy document"
            rows={18}
          />
          <div className={styles.actions}>
            <button className={styles.save} onClick={() => void save()}>
              Save
            </button>
            <button className={styles.cancel} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className={styles.note} role="status" aria-live="polite">
        {status ||
          'Edits apply live: the agent cites this document through its get_policy tool. The engine rules in code stay the enforcement.'}
      </p>
    </div>
  );
}
