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
          <h2>Customer chat</h2>
          <p>Talk to the refund agent and request a refund.</p>
        </Link>
        <Link href="/login" className={styles.card}>
          <h2>Admin</h2>
          <p>Traces, policy, and the model playground. Staff login.</p>
        </Link>
      </div>
    </section>
  );
}
