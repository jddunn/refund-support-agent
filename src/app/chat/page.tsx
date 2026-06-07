import { getDb } from '@/db';
import { ChatWindow, type Customer } from '@/components/chat/ChatWindow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const db = await getDb();
  const customers = await db.all<Customer>('SELECT id, name, email FROM customers ORDER BY id');
  return <ChatWindow customers={customers} />;
}
