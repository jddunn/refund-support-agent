import { Suspense } from 'react';
import { TracesView } from '@/components/traces/TracesView';

export default function TracesPage() {
  return (
    <Suspense fallback={<p>Loading runs…</p>}>
      <TracesView />
    </Suspense>
  );
}
