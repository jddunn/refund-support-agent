'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import styles from './ChatWindow.module.scss';

export interface Customer {
  id: string;
  name: string;
  email: string;
}

interface Message {
  role: 'customer' | 'agent';
  text: string;
  decision?: 'approve' | 'deny' | 'escalate';
  runId?: string;
  citations?: string[];
}

export function ChatWindow({ customers }: { customers: Customer[] }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Generate the conversation id on the client only, to avoid an SSR mismatch.
  useEffect(() => {
    setConversationId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading || !conversationId) return;
    setMessages((prev) => [...prev, { role: 'customer', text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, message: text, customerId }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          text: data.message ?? data.error ?? 'No response.',
          decision: data.decision,
          runId: data.runId,
          citations: data.citations,
        },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: 'agent', text: 'Network error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <label htmlFor="customer" className={styles.pickerLabel}>
          Acting as
        </label>
        <select
          id="customer"
          className={styles.picker}
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name} ({customer.id})
            </option>
          ))}
        </select>
      </div>

      <div className={styles.log} ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && (
          <p className={styles.empty}>Ask for a refund. Try an order id like ORD-58120.</p>
        )}
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'customer' ? styles.customer : styles.agent}>
            {message.decision && (
              <span className={`${styles.badge} ${styles[message.decision]}`}>{message.decision}</span>
            )}
            <p className={styles.text}>{message.text}</p>
            {message.citations && message.citations.length > 0 && (
              <p className={styles.cite}>Policy: {message.citations.join(', ')}</p>
            )}
            {message.runId && (
              <a className={styles.traceLink} href={`/admin/traces?run=${message.runId}`}>
                view trace
              </a>
            )}
          </div>
        ))}
        {loading && (
          <div className={styles.agent}>
            <p className={styles.text}>Working…</p>
          </div>
        )}
      </div>

      <div className={styles.composer}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message…"
          rows={2}
          aria-label="Message"
        />
        <button
          className={styles.send}
          onClick={() => void send()}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </section>
  );
}
