import { getDb } from '@/db';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { listCustomersWithOrders } from '@/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The consumer chat: pure customer experience. AUTO model, no admin controls.
export default async function ChatPage() {
  const db = await getDb();
  const customers = await listCustomersWithOrders(db);
  return <ChatWindow customers={customers} />;
}
