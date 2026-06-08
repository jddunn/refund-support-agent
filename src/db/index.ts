import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal async query surface over SQLite. The methods are async on purpose:
 * the agent and API code await every call, so the backing store can change
 * later without touching a single call site.
 */
export interface Db {
  /** First matching row, or undefined. */
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** All matching rows. */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** A write; reports the number of rows affected. */
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  /** Raw multi-statement DDL. Used only to bootstrap the schema. */
  exec(sql: string): Promise<void>;
}

/** Thin async wrapper around a synchronous better-sqlite3 handle. */
class SqliteDb implements Db {
  constructor(private readonly db: Database.Database) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    return { changes: this.db.prepare(sql).run(...params).changes };
  }
  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}

let instance: Db | null = null;

/**
 * Return the process-wide database, creating and seeding it on first call. The
 * file lives under `data/` and is built from `src/db/schema.sql` plus the
 * fixtures in `seed/`, so a fresh clone needs no migration step.
 */
export async function getDb(): Promise<Db> {
  if (instance) return instance;

  // Serverless platforms (e.g. Vercel) only allow writes under /tmp.
  const writableRoot = process.env.VERCEL ? '/tmp' : process.cwd();
  const dataDir = join(writableRoot, 'data');
  mkdirSync(dataDir, { recursive: true });

  const handle = new Database(join(dataDir, 'refund-agent.sqlite'));
  handle.pragma('journal_mode = WAL');

  const db = new SqliteDb(handle);
  await db.exec(readFileSync(join(process.cwd(), 'src/db/schema.sql'), 'utf8'));
  await seedIfEmpty(db);

  instance = db;
  return instance;
}

interface SeedFile {
  customers: Array<{
    id: string;
    name: string;
    email: string;
    since: string;
    priorRefunds: number;
    orders: Array<{
      id: string;
      item: string;
      category: string;
      price: number;
      finalSale: boolean;
      purchasedAt: string;
      status: string;
    }>;
  }>;
}

/** Load seed/customers.json into the CRM tables when the database is empty. */
async function seedIfEmpty(db: Db): Promise<void> {
  const counted = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM customers');
  if (counted && counted.n > 0) return;

  const seedPath = join(process.cwd(), 'seed', 'customers.json');
  const { customers } = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedFile;

  for (const customer of customers) {
    await db.run(
      'INSERT INTO customers (id, name, email, since, prior_refunds) VALUES (?, ?, ?, ?, ?)',
      [customer.id, customer.name, customer.email, customer.since, customer.priorRefunds],
    );
    for (const order of customer.orders) {
      await db.run(
        `INSERT INTO orders (id, customer_id, item, category, price, final_sale, purchased_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order.id,
          customer.id,
          order.item,
          order.category,
          order.price,
          order.finalSale ? 1 : 0,
          order.purchasedAt,
          order.status,
        ],
      );
    }
  }
}
