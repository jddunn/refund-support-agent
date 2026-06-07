import type { EvaluationContext, PolicyRule, Violation } from './types';

/** Whole days between two dates (a minus b), floored. */
function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

/** Parse an ISO `YYYY-MM-DD` date at UTC midnight for stable day math. */
function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

const RETURN_WINDOW_DAYS = 30;
const ESCALATION_LIMIT_USD = 500;
const SERIAL_REFUND_THRESHOLD = 3;

/** Limits referenced by the rules, exported so the UI can display them. */
export const POLICY_CONSTANTS = {
  RETURN_WINDOW_DAYS,
  ESCALATION_LIMIT_USD,
  SERIAL_REFUND_THRESHOLD,
} as const;

/**
 * The refund rules. The engine runs all of them and resolves the final outcome
 * by precedence (deny > escalate > approve), so the order here only affects the
 * order of citations, never the decision.
 */
export const RULES: PolicyRule[] = [
  {
    clause: '§2.3',
    // The order must exist.
    evaluate({ order }: EvaluationContext): Violation | null {
      if (order) return null;
      return { clause: '§2.3', effect: 'deny', reason: 'The order could not be found.' };
    },
  },
  {
    clause: '§2.3',
    // The order must belong to the requesting customer.
    evaluate({ order, request }: EvaluationContext): Violation | null {
      if (!order) return null; // the missing-order case is handled above
      if (order.customerId === request.customerId) return null;
      return { clause: '§2.3', effect: 'deny', reason: 'The order belongs to a different customer.' };
    },
  },
  {
    clause: '§2.1',
    // Final-sale items are never refundable.
    evaluate({ order }: EvaluationContext): Violation | null {
      if (!order || !order.finalSale) return null;
      return {
        clause: '§2.1',
        effect: 'deny',
        reason: 'The item was a final-sale purchase and is not refundable.',
      };
    },
  },
  {
    clause: '§2.2',
    // The order must be within the 30-day return window.
    evaluate({ order, now }: EvaluationContext): Violation | null {
      if (!order) return null;
      const age = daysBetween(now, parseDay(order.purchasedAt));
      if (age <= RETURN_WINDOW_DAYS) return null;
      return {
        clause: '§2.2',
        effect: 'deny',
        reason: `The ${RETURN_WINDOW_DAYS}-day return window has passed (the order is ${age} days old).`,
      };
    },
  },
  {
    clause: '§3.4',
    // Refunds over the limit require human escalation.
    evaluate({ order, request }: EvaluationContext): Violation | null {
      if (!order) return null;
      const amount = request.requestedAmount ?? order.price;
      if (amount <= ESCALATION_LIMIT_USD) return null;
      return {
        clause: '§3.4',
        effect: 'escalate',
        reason: `Refunds over $${ESCALATION_LIMIT_USD} require human review.`,
      };
    },
  },
  {
    clause: '§3.5',
    // Serial refunders are escalated for review.
    evaluate({ customer }: EvaluationContext): Violation | null {
      if (!customer || customer.priorRefunds < SERIAL_REFUND_THRESHOLD) return null;
      return {
        clause: '§3.5',
        effect: 'escalate',
        reason: `The customer has ${customer.priorRefunds} prior refunds and requires human review.`,
      };
    },
  },
];
