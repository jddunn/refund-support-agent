import type { Db } from './index';
import type { Customer, Order } from '@/policy/types';

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  since: string;
  priorRefunds: number;
}

interface OrderRow {
  id: string;
  customerId: string;
  item: string;
  category: string;
  price: number;
  finalSale: number;
  purchasedAt: string;
  status: Order['status'];
}

/** Find a customer by id or email. */
export async function findCustomer(db: Db, idOrEmail: string): Promise<Customer | undefined> {
  return db.get<CustomerRow>(
    'SELECT id, name, email, since, prior_refunds AS priorRefunds FROM customers WHERE id = ? OR email = ?',
    [idOrEmail, idOrEmail],
  );
}

/** Find an order by id, mapping the stored integer flag to a boolean. */
export async function findOrder(db: Db, orderId: string): Promise<Order | undefined> {
  const row = await db.get<OrderRow>(
    `SELECT id, customer_id AS customerId, item, category, price,
            final_sale AS finalSale, purchased_at AS purchasedAt, status
       FROM orders WHERE id = ?`,
    [orderId],
  );
  if (!row) return undefined;
  return {
    id: row.id,
    customerId: row.customerId,
    item: row.item,
    category: row.category,
    price: row.price,
    finalSale: row.finalSale === 1,
    purchasedAt: row.purchasedAt,
    status: row.status,
  };
}
