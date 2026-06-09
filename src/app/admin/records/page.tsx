import { RecordsView } from '@/components/records/RecordsView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The records explorer: the live CRM data the agent reads, editable in place.
export default function RecordsPage() {
  return <RecordsView />;
}
