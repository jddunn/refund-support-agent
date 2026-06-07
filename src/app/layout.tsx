import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.scss';
import { NavBar } from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'Refund Support Agent',
  description: 'A refund support agent with a deterministic policy guard.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
