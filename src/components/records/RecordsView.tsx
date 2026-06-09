'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './RecordsView.module.scss';

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
  status: string;
}

type EditValue = number | boolean | string;

/**
 * The live CRM explorer. These rows are the same SQLite tables the agent's
 * tools read, so an edit here changes what the agent sees on its next turn.
 */
export function RecordsView() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/records');
      if (!res.ok) throw new Error('Failed to load records');
      const data = await res.json();
      setCustomers(data.customers ?? []);
      setOrders(data.orders ?? []);
    } catch (error) {
      console.error('Error loading records:', error);
      setStatus('Could not load records.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(table: 'customers' | 'orders', id: string, field: string, value: EditValue) {
    setStatus('Saving…');
    try {
      const res = await fetch('/api/records', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ table, id, field, value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Save failed');
      }
      setStatus(`Saved ${id} · ${field}. The agent sees this on its next turn.`);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
      await load();
    }
  }

  async function reset() {
    setStatus('Resetting to seed…');
    try {
      const res = await fetch('/api/records/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      setStatus('Restored the seed data.');
      await load();
    } catch {
      setStatus('Reset failed');
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Records</h1>
          <p className={styles.lead}>
            The live CRM store (SQLite) the agent reads through its tools. Edits apply immediately:
            change a row, then ask the agent in the chat — it sees the new value. Reset restores the
            seed fixtures.
          </p>
        </div>
        <button className={styles.reset} onClick={() => void reset()}>
          Reset to seed
        </button>
      </div>

      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>

      <h2 className={styles.subtitle}>Customers</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">id</th>
              <th scope="col">name</th>
              <th scope="col">email</th>
              <th scope="col">since</th>
              <th scope="col">prior refunds (editable)</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td className={styles.mono}>{customer.id}</td>
                <td>{customer.name}</td>
                <td className={styles.mono}>{customer.email}</td>
                <td className={styles.mono}>{customer.since}</td>
                <td>
                  <input
                    className={styles.cellInput}
                    type="number"
                    min={0}
                    max={99}
                    defaultValue={customer.priorRefunds}
                    aria-label={`Prior refunds for ${customer.name}`}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isInteger(value) && value !== customer.priorRefunds) {
                        void save('customers', customer.id, 'priorRefunds', value);
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={styles.subtitle}>Orders</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">id</th>
              <th scope="col">customer</th>
              <th scope="col">item</th>
              <th scope="col">price (editable)</th>
              <th scope="col">final sale (editable)</th>
              <th scope="col">purchased (editable)</th>
              <th scope="col">status (editable)</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className={styles.mono}>{order.id}</td>
                <td className={styles.mono}>{order.customerId}</td>
                <td>{order.item}</td>
                <td>
                  <input
                    className={styles.cellInput}
                    type="number"
                    min={0.01}
                    step={0.01}
                    defaultValue={order.price}
                    aria-label={`Price for ${order.id}`}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (value > 0 && value !== order.price) {
                        void save('orders', order.id, 'price', value);
                      }
                    }}
                  />
                </td>
                <td className={styles.center}>
                  <input
                    type="checkbox"
                    className={styles.cellCheck}
                    checked={order.finalSale === 1}
                    aria-label={`Final sale for ${order.id}`}
                    onChange={(event) =>
                      void save('orders', order.id, 'finalSale', event.target.checked)
                    }
                  />
                </td>
                <td>
                  <input
                    className={styles.cellInput}
                    type="date"
                    defaultValue={order.purchasedAt}
                    aria-label={`Purchase date for ${order.id}`}
                    onBlur={(event) => {
                      const value = event.target.value;
                      if (value && value !== order.purchasedAt) {
                        void save('orders', order.id, 'purchasedAt', value);
                      }
                    }}
                  />
                </td>
                <td>
                  <select
                    className={styles.cellInput}
                    value={order.status}
                    aria-label={`Status for ${order.id}`}
                    onChange={(event) =>
                      void save('orders', order.id, 'status', event.target.value)
                    }
                  >
                    <option value="delivered">delivered</option>
                    <option value="shipped">shipped</option>
                    <option value="processing">processing</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
