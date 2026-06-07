/**
 * Build and seed the local database, then report the row counts. The app also
 * seeds itself on first run, so this script is only needed if you want to seed
 * ahead of time or confirm the data loaded.
 *
 *   npm run seed
 */
import { getDb } from '@/db';

async function main(): Promise<void> {
  const db = await getDb();
  const customers = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM customers');
  const orders = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM orders');
  console.log(`Seeded ${customers?.n ?? 0} customers and ${orders?.n ?? 0} orders.`);
}

void main();
