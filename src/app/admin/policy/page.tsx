import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { AdversarialGrid } from '@/components/policy/AdversarialGrid';
import styles from './policy.module.scss';

export const runtime = 'nodejs';

/** Render the policy markdown into headings, paragraphs, and lists. */
function renderPolicy(markdown: string): ReactNode[] {
  const lines = markdown.split('\n');
  const out: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = (key: string) => {
    if (paragraph.length) {
      out.push(<p key={key}>{paragraph.join(' ')}</p>);
      paragraph = [];
    }
  };
  const flushList = (key: string) => {
    if (list.length) {
      out.push(
        <ul key={key}>
          {list.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  lines.forEach((line, i) => {
    const text = line.trim().replace(/\*\*/g, '');
    if (text.startsWith('## ')) {
      flushParagraph(`p${i}`);
      flushList(`l${i}`);
      out.push(<h2 key={i}>{text.slice(3)}</h2>);
    } else if (text.startsWith('# ')) {
      flushParagraph(`p${i}`);
      flushList(`l${i}`);
      out.push(<h1 key={i}>{text.slice(2)}</h1>);
    } else if (text.startsWith('- ')) {
      flushParagraph(`p${i}`);
      list.push(text.slice(2));
    } else if (text === '') {
      flushParagraph(`p${i}`);
      flushList(`l${i}`);
    } else {
      flushList(`l${i}`);
      paragraph.push(text);
    }
  });

  flushParagraph('p-end');
  flushList('l-end');
  return out;
}

export default function PolicyPage() {
  let markdown: string;
  try {
    markdown = readFileSync(join(process.cwd(), 'seed', 'refund-policy.md'), 'utf8');
  } catch {
    return (
      <div className={styles.layout}>
        <p>The refund policy could not be loaded.</p>
      </div>
    );
  }
  return (
    <div className={styles.layout}>
      <article className={styles.policy}>{renderPolicy(markdown)}</article>
      <section className={styles.results}>
        <h2>Red-team results</h2>
        <p className={styles.hint}>
          Run <code>npm run stress</code> or the red-team skill to populate results.
        </p>
        <AdversarialGrid />
      </section>
    </div>
  );
}
