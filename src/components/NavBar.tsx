'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './NavBar.module.scss';

const LINKS = [
  { href: '/chat', label: 'Chat' },
  { href: '/admin/traces', label: 'Traces' },
  { href: '/admin/policy', label: 'Policy' },
];

export function NavBar() {
  const path = usePathname() ?? '';
  return (
    <header className={styles.bar}>
      <Link href="/" className={styles.brand}>
        Refund Support Agent
      </Link>
      <nav className={styles.links} aria-label="Primary">
        {LINKS.map((link) => {
          const active = path.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? styles.active : styles.link}
              aria-current={active ? 'page' : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
