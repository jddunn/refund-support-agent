import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '@/db';
import { findCustomer, findOrder } from '@/db/queries';
import { evaluateRefund } from '@/policy/engine';
import { maybeInject } from '@/faults';

/** Per-run context shared by every tool: data access, the clock, and tracing. */
export interface ToolContext {
  db: Db;
  now: Date;
  /** Record a tool call to the run's trace. */
  record: (node: string, input: unknown, output: unknown) => Promise<void>;
  /** Called when a real order is resolved, so the guard can re-validate it. */
  onOrderResolved?: (orderId: string) => void;
}

let cachedPolicy: string | null = null;
function policyText(): string {
  if (cachedPolicy === null) {
    cachedPolicy = readFileSync(join(process.cwd(), 'seed', 'refund-policy.md'), 'utf8');
  }
  return cachedPolicy;
}

function clauseLine(text: string, clause: string): string {
  const hit = text.split('\n').find((line) => line.includes(clause));
  return hit ? hit.trim() : `Clause ${clause} was not found in the policy.`;
}

/**
 * Build the read-only tools the agent uses to gather facts. Each tool records
 * its input and output to the trace, so the admin dashboard shows exactly what
 * the agent looked at.
 */
export function buildTools(ctx: ToolContext) {
  const lookupCustomer = tool(
    async ({ idOrEmail }) => {
      maybeInject('tool_timeout');
      const customer = await findCustomer(ctx.db, idOrEmail);
      const result = customer ?? { found: false, idOrEmail };
      await ctx.record('lookup_customer', { idOrEmail }, result);
      return JSON.stringify(result);
    },
    {
      name: 'lookup_customer',
      description: 'Resolve a customer by id or email. Call this before evaluating any order.',
      schema: z.object({
        idOrEmail: z.string().describe('Customer id (e.g. CUST-1001) or email address'),
      }),
    },
  );

  const getOrder = tool(
    async ({ orderId }) => {
      const order = await findOrder(ctx.db, orderId);
      if (order) ctx.onOrderResolved?.(order.id);
      const result = order ?? { found: false, orderId };
      await ctx.record('get_order', { orderId }, result);
      return JSON.stringify(result);
    },
    {
      name: 'get_order',
      description:
        'Look up an order by id, including its price, final-sale flag, purchase date, and owning customer. Call this for any refund request.',
      schema: z.object({ orderId: z.string().describe('Order id, e.g. ORD-58120') }),
    },
  );

  const getPolicy = tool(
    async ({ clause }) => {
      const text = policyText();
      const result = clause ? clauseLine(text, clause) : text;
      await ctx.record('get_policy', { clause: clause ?? null }, { chars: result.length });
      return result;
    },
    {
      name: 'get_policy',
      description: 'Return the refund policy, or a single clause when a clause id like "§2.1" is provided.',
      schema: z.object({ clause: z.string().optional().describe('Optional clause id, e.g. §2.1') }),
    },
  );

  const checkEligibility = tool(
    async ({ orderId, customerId, requestedAmount }) => {
      const order = await findOrder(ctx.db, orderId);
      if (order) ctx.onOrderResolved?.(order.id);
      const customer = await findCustomer(ctx.db, customerId);
      const verdict = evaluateRefund({
        order,
        customer,
        request: { orderId, customerId, requestedAmount },
        now: ctx.now,
      });
      await ctx.record('check_eligibility', { orderId, customerId, requestedAmount }, verdict);
      return JSON.stringify(verdict);
    },
    {
      name: 'check_eligibility',
      description:
        'Run the deterministic policy engine for an order and return the verdict (approve, deny, or escalate) with the clauses that applied. Use this to confirm a decision before you state it.',
      schema: z.object({
        orderId: z.string(),
        customerId: z.string(),
        requestedAmount: z.number().optional(),
      }),
    },
  );

  return [lookupCustomer, getOrder, getPolicy, checkEligibility];
}
