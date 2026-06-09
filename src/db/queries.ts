import type { Db } from './index';
import type { Customer, Order } from '@/policy/types';
import { maybeInject } from '@/faults';

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
  maybeInject('db_locked');
  return db.get<CustomerRow>(
    'SELECT id, name, email, since, prior_refunds AS priorRefunds FROM customers WHERE id = ? OR email = ?',
    [idOrEmail, idOrEmail],
  );
}

/** Find an order by id, mapping the stored integer flag to a boolean. */
export async function findOrder(db: Db, orderId: string): Promise<Order | undefined> {
  maybeInject('db_locked');
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

/** A customer's order, in the shape the customer card renders. */
export interface CustomerCardOrder {
  id: string;
  item: string;
  category: string;
  price: number;
  finalSale: boolean;
  purchasedAt: string;
  status: string;
}

/** A customer plus their orders: exactly what the agent's tools can read. */
export interface CustomerCard {
  id: string;
  name: string;
  email: string;
  since: string;
  priorRefunds: number;
  orders: CustomerCardOrder[];
}

/**
 * List every customer with their orders, for the chat's "acting as" card. This
 * is a UI read (no fault injection): it shows the operator the same CRM facts
 * the agent sees when it looks a customer up.
 */
export async function listCustomersWithOrders(db: Db): Promise<CustomerCard[]> {
  const customers = await db.all<{
    id: string;
    name: string;
    email: string;
    since: string;
    priorRefunds: number;
  }>('SELECT id, name, email, since, prior_refunds AS priorRefunds FROM customers ORDER BY id');

  const orders = await db.all<{
    id: string;
    customerId: string;
    item: string;
    category: string;
    price: number;
    finalSale: number;
    purchasedAt: string;
    status: string;
  }>(
    `SELECT id, customer_id AS customerId, item, category, price,
            final_sale AS finalSale, purchased_at AS purchasedAt, status
       FROM orders ORDER BY id`,
  );

  return customers.map((customer) => ({
    ...customer,
    orders: orders
      .filter((order) => order.customerId === customer.id)
      .map((order) => ({
        id: order.id,
        item: order.item,
        category: order.category,
        price: order.price,
        finalSale: order.finalSale === 1,
        purchasedAt: order.purchasedAt,
        status: order.status,
      })),
  }));
}
