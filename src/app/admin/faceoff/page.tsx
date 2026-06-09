import { getDb } from '@/db';
import { listCustomersWithOrders } from '@/db/queries';
import { FaceoffView } from '@/components/faceoff/FaceoffView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The model face-off: run one refund request through every configured model.
export default async function FaceoffPage() {
  const db = await getDb();
  const customers = await listCustomersWithOrders(db);
  return <FaceoffView customers={customers.map((c) => ({ id: c.id, name: c.name }))} />;
}
