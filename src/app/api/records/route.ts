import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { SESSION_COOKIE, verifySession } from '@/server/session';

export const runtime = 'nodejs';

/** The CRM records the agent reads, for the admin records explorer. */
export async function GET() {
  const db = await getDb();
  const customers = await db.all(
    'SELECT id, name, email, since, prior_refunds AS priorRefunds FROM customers ORDER BY id',
  );
  const orders = await db.all(
    `SELECT id, customer_id AS customerId, item, category, price,
            final_sale AS finalSale, purchased_at AS purchasedAt, status
       FROM orders ORDER BY id`,
  );
  return NextResponse.json({ customers, orders });
}

// Editable fields, one schema per (table, field) pair so values are validated
// by shape. Everything else is read-only by design.
const EditSchema = z.discriminatedUnion('field', [
  z.object({
    table: z.literal('customers'),
    id: z.string().min(1),
    field: z.literal('priorRefunds'),
    value: z.number().int().min(0).max(99),
  }),
  z.object({
    table: z.literal('orders'),
    id: z.string().min(1),
    field: z.literal('price'),
    value: z.number().positive().max(1_000_000),
  }),
  z.object({
    table: z.literal('orders'),
    id: z.string().min(1),
    field: z.literal('finalSale'),
    value: z.boolean(),
  }),
  z.object({
    table: z.literal('orders'),
    id: z.string().min(1),
    field: z.literal('purchasedAt'),
    value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  }),
  z.object({
    table: z.literal('orders'),
    id: z.string().min(1),
    field: z.literal('status'),
    value: z.enum(['delivered', 'shipped', 'processing']),
  }),
]);

// Column names per allowlisted field; the SQL is assembled only from this map,
// never from request input.
const COLUMNS: Record<string, { table: string; column: string }> = {
  priorRefunds: { table: 'customers', column: 'prior_refunds' },
  price: { table: 'orders', column: 'price' },
  finalSale: { table: 'orders', column: 'final_sale' },
  purchasedAt: { table: 'orders', column: 'purchased_at' },
  status: { table: 'orders', column: 'status' },
};

/** Edit one allowlisted field. Admin session required; the agent reads it live. */
export async function PATCH(req: NextRequest) {
  if (!(await verifySession(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = EditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid edit' }, { status: 400 });
  }

  const { table, id, field, value } = parsed.data;
  const target = COLUMNS[field];
  if (!target || target.table !== table) {
    return NextResponse.json({ error: 'Field not editable' }, { status: 400 });
  }

  const stored = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  const db = await getDb();
  const result = await db.run(`UPDATE ${target.table} SET ${target.column} = ? WHERE id = ?`, [
    stored,
    id,
  ]);
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Row not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CreateSchema = z.discriminatedUnion('table', [
  z.object({
    table: z.literal('customers'),
    id: z.string().regex(/^CUST-\d{3,6}$/),
    name: z.string().min(1).max(80),
    email: z.string().email().max(120),
    since: z.string().regex(DATE_RE),
    priorRefunds: z.number().int().min(0).max(99),
  }),
  z.object({
    table: z.literal('orders'),
    id: z.string().regex(/^ORD-\d{3,6}$/),
    customerId: z.string().min(1),
    item: z.string().min(1).max(120),
    category: z.string().min(1).max(40),
    price: z.number().positive().max(1_000_000),
    finalSale: z.boolean(),
    purchasedAt: z.string().regex(DATE_RE),
    status: z.enum(['delivered', 'shipped', 'processing']),
  }),
]);

/** Add a customer or an order. Admin session required. */
export async function POST(req: NextRequest) {
  if (!(await verifySession(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid record' }, { status: 400 });
  }
  const db = await getDb();
  const row = parsed.data;

  const exists = await db.get(`SELECT id FROM ${row.table} WHERE id = ?`, [row.id]);
  if (exists) return NextResponse.json({ error: `${row.id} already exists` }, { status: 409 });

  if (row.table === 'customers') {
    await db.run(
      'INSERT INTO customers (id, name, email, since, prior_refunds) VALUES (?, ?, ?, ?, ?)',
      [row.id, row.name, row.email, row.since, row.priorRefunds],
    );
  } else {
    const customer = await db.get('SELECT id FROM customers WHERE id = ?', [row.customerId]);
    if (!customer) {
      return NextResponse.json({ error: `${row.customerId} does not exist` }, { status: 400 });
    }
    await db.run(
      `INSERT INTO orders (id, customer_id, item, category, price, final_sale, purchased_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.customerId,
        row.item,
        row.category,
        row.price,
        row.finalSale ? 1 : 0,
        row.purchasedAt,
        row.status,
      ],
    );
  }
  return NextResponse.json({ ok: true });
}

const DeleteSchema = z.object({
  table: z.enum(['customers', 'orders']),
  id: z.string().min(1),
});

/** Delete a customer (and their orders) or a single order. Admin session required. */
export async function DELETE(req: NextRequest) {
  if (!(await verifySession(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid delete' }, { status: 400 });
  }
  const db = await getDb();
  const { table, id } = parsed.data;
  if (table === 'customers') {
    await db.run('DELETE FROM orders WHERE customer_id = ?', [id]);
  }
  const result = await db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Row not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
