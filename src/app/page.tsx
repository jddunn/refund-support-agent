import Link from 'next/link';
import styles from './home.module.scss';

const GITHUB_URL = 'https://github.com/jddunn/refund-support-agent';

const PIPELINE: { name: string; desc: string; key?: boolean }[] = [
  { name: 'screen', desc: 'flag manipulation attempts' },
  { name: 'agent', desc: 'read policy, look up the order' },
  { name: 'propose', desc: 'a structured decision' },
  { name: 'guard', desc: 'engine re-checks, can override', key: true },
  { name: 'respond', desc: 'a safe, cited reply' },
];

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'The engine has the final say',
    body: 'Final-sale items are never refundable; refunds over the limit always escalate. Those are checks in code, not lines in a prompt, so the model cannot be talked past them.',
  },
  {
    title: 'Every run is auditable',
    body: 'The admin dashboard records each run’s node timeline, every tool’s input and output, retries, token cost, and latency.',
  },
  {
    title: 'It recovers from failure',
    body: 'Provider errors fail over to another model, malformed output is re-prompted, and flaky CRM reads retry — each visible in the trace.',
  },
  {
    title: 'It holds the policy line',
    body: 'A 15-case red-team suite — pleading, fake authority, prompt injection, forged and unowned orders — runs green, every time.',
  },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Refund Support Agent</h1>
        <p className={styles.lead}>
          A support agent that decides e-commerce refunds against a written policy. The model
          explains and reasons, but a deterministic engine has the final say, so it holds the line
          when a customer pushes.
        </p>
        <div className={styles.actions}>
          <Link href="/chat" className={styles.primaryBtn}>
            Open the customer chat
          </Link>
          <Link href="/login" className={styles.secondaryBtn}>
            Admin dashboard
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.ghBtn}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.28-.01-1.02-.02-2-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.22.69.83.57C20.56 22.29 24 17.8 24 12.5 24 5.87 18.63.5 12 .5Z" />
            </svg>
            View on GitHub
          </a>
        </div>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <p className={styles.explain}>
          One customer turn flows through five steps. The model reads the policy, looks up the
          customer and order, and proposes a decision. A deterministic policy engine then rebuilds
          that decision from the rules and overrides anything that conflicts. The model proposes;
          the engine disposes.
        </p>
        <ol className={styles.pipeline}>
          {PIPELINE.map((step) => (
            <li key={step.name} className={`${styles.pipeStep} ${step.key ? styles.stepKey : ''}`}>
              <span className={styles.stepName}>{step.name}</span>
              <span className={styles.stepDesc}>{step.desc}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className={styles.features}>
          {FEATURES.map((feature) => (
            <div key={feature.title} className={styles.feature}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerLinks}>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a
            href={`${GITHUB_URL}/blob/master/docs/ARCHITECTURE.md`}
            target="_blank"
            rel="noreferrer"
          >
            Architecture
          </a>
          <a href={`${GITHUB_URL}/blob/master/docs/STACK.md`} target="_blank" rel="noreferrer">
            Why TypeScript
          </a>
          <a href={`${GITHUB_URL}/blob/master/docs/DEBUGGING.md`} target="_blank" rel="noreferrer">
            Debugging
          </a>
        </div>
        <p className={styles.stack}>
          TypeScript · Next.js · LangGraph.js · deterministic policy engine
        </p>
      </footer>
    </div>
  );
}
