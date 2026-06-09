'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from './AdminNav.module.scss';

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/playground', label: 'Playground' },
  { href: '/admin/traces', label: 'Traces' },
  { href: '/admin/policy', label: 'Policy' },
  { href: '/admin/records', label: 'Records' },
  { href: '/admin/faceoff', label: 'Face-off' },
];

export function AdminNav() {
  const path = usePathname() ?? '';
  const router = useRouter();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className={styles.bar}>
      <Link href="/admin" className={styles.brand}>
        Refund Agent · Admin
      </Link>
      <nav className={styles.links} aria-label="Admin">
        {LINKS.map((link) => {
          // The Overview link matches exactly; the rest match by path prefix.
          const active = link.href === '/admin' ? path === '/admin' : path.startsWith(link.href);
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
        <Link href="/chat" className={styles.link}>
          Consumer chat
        </Link>
        <button className={styles.logout} onClick={() => void logout()}>
          Log out
        </button>
      </nav>
    </header>
  );
}
