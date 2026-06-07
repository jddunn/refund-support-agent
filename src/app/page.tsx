import Link from 'next/link';
import styles from './home.module.scss';

export default function Home() {
  return (
    <section className={styles.hero}>
      <h1 className={styles.title}>Refund Support Agent</h1>
      <p className={styles.lead}>
        A support agent that decides e-commerce refunds against a written policy. The model explains
        and reasons, but a deterministic engine has the final say, so it holds the line when a
        customer pushes.
      </p>
      <div className={styles.cards}>
        <Link href="/chat" className={styles.card}>
          <h2>Chat</h2>
          <p>Talk to the agent and request a refund.</p>
        </Link>
        <Link href="/admin/traces" className={styles.card}>
          <h2>Traces</h2>
          <p>Every run&apos;s reasoning, tool calls, tokens, cost, and latency.</p>
        </Link>
        <Link href="/admin/policy" className={styles.card}>
          <h2>Policy</h2>
          <p>The refund policy and the red-team results.</p>
        </Link>
      </div>
    </section>
  );
}
