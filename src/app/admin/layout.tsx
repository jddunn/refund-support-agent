import type { ReactNode } from 'react';
import { AdminNav } from '@/components/AdminNav';

// Every /admin page is gated by middleware and shares the admin navigation.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
