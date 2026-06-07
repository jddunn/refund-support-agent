import { describe, it, expect } from 'vitest';
import { evaluateRefund } from './engine';
import type { Customer, EvaluationContext, Order, RefundRequest } from './types';

/** Fixed evaluation time so every case is deterministic. */
const NOW = new Date('2026-06-07T00:00:00Z');

/** Build an evaluation context from partial overrides over sensible defaults. */
function ctx(
  order: Partial<Order> | undefined,
  customer: Partial<Customer> | undefined,
  request: Partial<RefundRequest> = {},
): EvaluationContext {
  const fullOrder: Order | undefined = order && {
    id: 'ORD-1',
    customerId: 'CUST-1',
    item: 'Widget',
    category: 'general',
    price: 100,
    finalSale: false,
    purchasedAt: '2026-06-01',
    status: 'delivered',
    ...order,
  };
  const fullCustomer: Customer | undefined = customer && {
    id: 'CUST-1',
    name: 'Test Customer',
    email: 'test@example.com',
    since: '2024-01-01',
    priorRefunds: 0,
    ...customer,
  };
  const fullRequest: RefundRequest = { orderId: 'ORD-1', customerId: 'CUST-1', ...request };
  return { order: fullOrder, customer: fullCustomer, request: fullRequest, now: NOW };
}

describe('evaluateRefund', () => {
  it('approves an in-window, owned, non-final-sale order under the limit', () => {
    const v = evaluateRefund(ctx({}, {}));
    expect(v.outcome).toBe('approve');
    expect(v.amount).toBe(100);
    expect(v.violations).toHaveLength(0);
  });

  it('denies a missing order (§2.3)', () => {
    const v = evaluateRefund(ctx(undefined, {}));
    expect(v.outcome).toBe('deny');
    expect(v.citations).toContain('§2.3');
    expect(v.amount).toBe(0);
  });

  it('denies an order owned by a different customer (§2.3)', () => {
    const v = evaluateRefund(ctx({ customerId: 'CUST-OTHER' }, {}));
    expect(v.outcome).toBe('deny');
    expect(v.citations).toContain('§2.3');
  });

  it('denies a final-sale item (§2.1)', () => {
    const v = evaluateRefund(ctx({ finalSale: true }, {}));
    expect(v.outcome).toBe('deny');
    expect(v.citations).toContain('§2.1');
  });

  it('denies an order past the return window (§2.2)', () => {
    const v = evaluateRefund(ctx({ purchasedAt: '2026-04-10' }, {}));
    expect(v.outcome).toBe('deny');
    expect(v.citations).toContain('§2.2');
  });

  it('treats an order exactly 30 days old as still within the window', () => {
    const v = evaluateRefund(ctx({ purchasedAt: '2026-05-08' }, {}));
    expect(v.outcome).toBe('approve');
  });

  it('escalates a refund over $500 (§3.4)', () => {
    const v = evaluateRefund(ctx({ price: 899 }, {}));
    expect(v.outcome).toBe('escalate');
    expect(v.citations).toContain('§3.4');
  });

  it('escalates a serial refunder with 3 prior refunds (§3.5)', () => {
    const v = evaluateRefund(ctx({}, { priorRefunds: 3 }));
    expect(v.outcome).toBe('escalate');
    expect(v.citations).toContain('§3.5');
  });

  it('does not escalate a customer with 2 prior refunds', () => {
    const v = evaluateRefund(ctx({}, { priorRefunds: 2 }));
    expect(v.outcome).toBe('approve');
  });

  it('denies a request that exceeds the amount paid (§3.6)', () => {
    const v = evaluateRefund(ctx({ price: 100 }, {}, { requestedAmount: 250 }));
    expect(v.outcome).toBe('deny');
    expect(v.citations).toContain('§3.6');
  });

  it('lets a denial outrank an escalation when both apply', () => {
    // Final sale (deny §2.1) and over the limit (escalate §3.4) at once.
    const v = evaluateRefund(ctx({ finalSale: true, price: 640 }, {}));
    expect(v.outcome).toBe('deny');
    expect(v.citations).toContain('§2.1');
    expect(v.citations).toContain('§3.4');
  });

  it('caps the permitted amount at the price on an escalate', () => {
    const v = evaluateRefund(ctx({ price: 700 }, {}, { requestedAmount: 700 }));
    expect(v.outcome).toBe('escalate');
    expect(v.amount).toBe(700);
  });
});
