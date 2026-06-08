import { getDb } from '@/db';
import { ChatWindow, type Customer } from '@/components/chat/ChatWindow';
import { availableModelOptions } from '@/agent/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The staff playground: the same chat as consumers, plus the model selector.
export default async function PlaygroundPage() {
  const db = await getDb();
  const customers = await db.all<Customer>('SELECT id, name, email FROM customers ORDER BY id');
  return <ChatWindow customers={customers} models={availableModelOptions()} />;
}
