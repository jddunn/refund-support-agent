'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ModelOption } from '@/agent/models';
import type { CustomerCard } from '@/db/queries';
import styles from './ChatWindow.module.scss';

export type Customer = CustomerCard;

/** A scripted demo turn: a customer line plus the captured agent response. */
export interface Scenario {
  id: string;
  persona: string;
  customerId: string;
  customerMessage: string;
  expected: string;
  note: string;
  canned: {
    decision: 'approve' | 'deny' | 'escalate' | string;
    message: string;
    citations: string[];
  };
}

interface Message {
  role: 'customer' | 'agent';
  text: string;
  decision?: 'approve' | 'deny' | 'escalate';
  runId?: string;
  citations?: string[];
}

type DemoMode = 'canned' | 'live';

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function ChatWindow({
  customers,
  models,
  scenarios,
}: {
  customers: Customer[];
  models?: ModelOption[];
  /** When provided, the admin demo runner is shown. */
  scenarios?: Scenario[];
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [model, setModel] = useState('auto');
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Demo runner state
  const [demoMode, setDemoMode] = useState<DemoMode>('canned');
  const [scenarioId, setScenarioId] = useState(scenarios?.[0]?.id ?? '');
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);

  const customer = customers.find((c) => c.id === customerId);
  const scenario = scenarios?.find((s) => s.id === scenarioId);

  useEffect(() => {
    setConversationId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, loading]);

  /** Reset to a fresh conversation as the given customer. */
  function resetConversation(nextCustomerId: string): string {
    const convId = crypto.randomUUID();
    setCustomerId(nextCustomerId);
    setConversationId(convId);
    setMessages([]);
    return convId;
  }

  /** Append a message and reveal its text with a typewriter effect. */
  function typeMessage(message: Omit<Message, 'text'>, full: string): Promise<void> {
    if (prefersReducedMotion() || !full) {
      setMessages((prev) => [...prev, { ...message, text: full }]);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      setMessages((prev) => [...prev, { ...message, text: '' }]);
      const step = Math.min(4, Math.max(1, Math.ceil(full.length / 70)));
      let i = 0;
      const id = setInterval(() => {
        i += step;
        const shown = full.slice(0, i);
        setMessages((prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { ...copy[copy.length - 1], text: shown };
          return copy;
        });
        if (i >= full.length) {
          clearInterval(id);
          resolve();
        }
      }, 16);
    });
  }

  async function callAgent(
    convId: string,
    text: string,
    actingCustomerId: string,
    history: Message[],
  ): Promise<Message> {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: convId,
          message: text,
          customerId: actingCustomerId,
          model,
          history: history.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      return {
        role: 'agent',
        text: data.message ?? data.error ?? 'No response.',
        decision: data.decision,
        runId: data.runId,
        citations: data.citations,
      };
    } catch {
      return { role: 'agent', text: 'Network error. Please try again.' };
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || running || !conversationId) return;
    const history = messages;
    setMessages((prev) => [...prev, { role: 'customer', text }]);
    setInput('');
    setLoading(true);
    const reply = await callAgent(conversationId, text, customerId, history);
    setLoading(false);
    await typeMessage(
      { role: 'agent', decision: reply.decision, runId: reply.runId, citations: reply.citations },
      reply.text,
    );
  }

  /** Play one scripted scenario: type the customer line, then the response. */
  async function playScenario(s: Scenario): Promise<void> {
    const convId = resetConversation(s.customerId);
    await sleep(reduced(260));
    await typeMessage({ role: 'customer' }, s.customerMessage);
    await sleep(reduced(280));

    if (demoMode === 'canned') {
      setLoading(true);
      await sleep(reduced(420));
      setLoading(false);
      await typeMessage(
        {
          role: 'agent',
          decision: s.canned.decision as Message['decision'],
          citations: s.canned.citations,
        },
        s.canned.message,
      );
    } else {
      setLoading(true);
      const reply = await callAgent(convId, s.customerMessage, s.customerId, []);
      setLoading(false);
      await typeMessage(
        { role: 'agent', decision: reply.decision, runId: reply.runId, citations: reply.citations },
        reply.text,
      );
    }
  }

  async function playSelected() {
    if (!scenario || running || loading) return;
    setRunning(true);
    runningRef.current = true;
    await playScenario(scenario);
    runningRef.current = false;
    setRunning(false);
  }

  async function autoRunAll() {
    if (!scenarios || running || loading) return;
    setRunning(true);
    runningRef.current = true;
    for (const s of scenarios) {
      if (!runningRef.current) break;
      setScenarioId(s.id);
      await playScenario(s);
      await sleep(reduced(900));
    }
    runningRef.current = false;
    setRunning(false);
  }

  function stop() {
    runningRef.current = false;
    setRunning(false);
  }

  function reduced(ms: number): number {
    return prefersReducedMotion() ? 0 : ms;
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  if (customers.length === 0) {
    return (
      <section className={styles.wrap}>
        <p className={styles.empty}>No customers available.</p>
      </section>
    );
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.pickerRow}>
        <label htmlFor="customer" className={styles.pickerLabel}>
          Acting as
        </label>
        <select
          id="customer"
          className={styles.picker}
          value={customerId}
          disabled={running}
          onChange={(event) => resetConversation(event.target.value)}
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id})
            </option>
          ))}
        </select>
        {models && models.length > 0 && (
          <>
            <label htmlFor="model" className={styles.pickerLabel}>
              Model
            </label>
            <select
              id="model"
              className={styles.picker}
              value={model}
              disabled={running}
              onChange={(event) => setModel(event.target.value)}
            >
              {models.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {scenarios && scenarios.length > 0 && (
        <div className={styles.demoBar}>
          <div className={styles.demoControls}>
            <span className={styles.demoLabel}>Demo</span>
            <select
              className={styles.picker}
              value={scenarioId}
              disabled={running}
              onChange={(event) => setScenarioId(event.target.value)}
              aria-label="Scenario"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.persona} → {s.expected}
                </option>
              ))}
            </select>
            <div className={styles.seg} role="group" aria-label="Response source">
              <button
                type="button"
                className={demoMode === 'canned' ? styles.segActive : styles.segItem}
                aria-pressed={demoMode === 'canned'}
                disabled={running}
                onClick={() => setDemoMode('canned')}
              >
                Canned
              </button>
              <button
                type="button"
                className={demoMode === 'live' ? styles.segActive : styles.segItem}
                aria-pressed={demoMode === 'live'}
                disabled={running}
                onClick={() => setDemoMode('live')}
              >
                Live
              </button>
            </div>
            {running ? (
              <button type="button" className={styles.demoStop} onClick={stop}>
                Stop
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.demoBtn}
                  onClick={() => void playSelected()}
                >
                  Play turn
                </button>
                <button
                  type="button"
                  className={styles.demoPrimary}
                  onClick={() => void autoRunAll()}
                >
                  Auto-run all
                </button>
              </>
            )}
          </div>
          {scenario && <p className={styles.scenarioNote}>{scenario.note}</p>}
        </div>
      )}

      {customer && (
        <div className={styles.customerCard}>
          <div className={styles.avatar} aria-hidden="true">
            {initialsOf(customer.name)}
          </div>
          <div className={styles.identity}>
            <span className={styles.customerName}>{customer.name}</span>
            <span className={styles.customerEmail}>{customer.email}</span>
          </div>
          <div className={styles.tags}>
            <span className={styles.tag}>since {customer.since.slice(0, 4)}</span>
            <span
              className={`${styles.tag} ${customer.priorRefunds >= 3 ? styles.tagWarn : ''}`}
              title={
                customer.priorRefunds >= 3 ? 'Serial-refunder threshold (policy §3.2)' : undefined
              }
            >
              {customer.priorRefunds} prior refund{customer.priorRefunds === 1 ? '' : 's'}
            </span>
          </div>
          {customer.orders.length > 0 && (
            <ul className={styles.orders}>
              {customer.orders.map((order) => (
                <li key={order.id} className={styles.order}>
                  <span className={styles.orderId}>{order.id}</span>
                  <span className={styles.orderItem}>{order.item}</span>
                  <span className={styles.orderPrice}>${order.price.toFixed(2)}</span>
                  {order.finalSale && <span className={styles.finalSale}>final sale</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        className={styles.log}
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 && (
          <p className={styles.empty}>Ask for a refund. Try an order id like ORD-58120.</p>
        )}
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'customer' ? styles.customer : styles.agent}>
            {message.decision && (
              <span className={`${styles.badge} ${styles[message.decision]}`}>
                {message.decision}
              </span>
            )}
            <p className={styles.text}>{message.text}</p>
            {message.citations && message.citations.length > 0 && (
              <p className={styles.cite}>Policy: {message.citations.join(', ')}</p>
            )}
            {message.runId && (
              <a className={styles.traceLink} href={`/admin/traces?run=${message.runId}`}>
                view trace →
              </a>
            )}
          </div>
        ))}
        {loading && (
          <div className={styles.agent}>
            <span className={styles.typing} aria-label="Agent is thinking">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>

      <div className={styles.composer}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={running ? 'Demo running…' : 'Type a message…'}
          rows={2}
          aria-label="Message"
          disabled={running}
        />
        <button
          className={styles.send}
          onClick={() => void send()}
          disabled={loading || running || !input.trim()}
        >
          Send
        </button>
      </div>
    </section>
  );
}
