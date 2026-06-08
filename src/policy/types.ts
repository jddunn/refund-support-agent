/**
 * Domain types for the refund policy. These mirror the shape of the seeded CRM
 * data (seed/customers.json) and are the inputs the policy engine reasons over.
 * They carry no framework or storage concern, so the engine stays pure and
 * testable on its own.
 */

/** A single order belonging to a customer. */
export interface Order {
  id: string;
  /** Owning customer id. Used to confirm the requester actually owns the order. */
  customerId: string;
  item: string;
  category: string;
  /** Amount paid, in dollars. */
  price: number;
  /** Final-sale items are never refundable (policy §2.1). */
  finalSale: boolean;
  /** Purchase date, ISO `YYYY-MM-DD`. Anchors the return window (policy §2.2). */
  purchasedAt: string;
  status: 'delivered' | 'shipped' | 'processing' | 'cancelled';
}

/** A customer record. */
export interface Customer {
  id: string;
  name: string;
  email: string;
  /** Account creation date, ISO `YYYY-MM-DD`. */
  since: string;
  /** Count of prior refunds. Drives the serial-refunder escalation (policy §3.2). */
  priorRefunds: number;
}

/** What the customer is asking for. */
export interface RefundRequest {
  /** The order the refund is requested against. */
  orderId: string;
  /** The customer making the request. */
  customerId: string;
  /** Free-text reason supplied by the customer. Informational only. */
  reason?: string;
  /**
   * Amount requested, in dollars. When the customer does not name a figure the
   * engine treats the request as the full order price.
   */
  requestedAmount?: number;
}

/** Decision outcomes, ordered by precedence: deny > escalate > approve. */
export type Outcome = 'approve' | 'deny' | 'escalate';

/** A rule violation, traceable back to the policy clause that produced it. */
export interface Violation {
  /** Clause id in refund-policy.md, e.g. `§2.1`. */
  clause: string;
  /** Whether the clause forces a denial or an escalation. */
  effect: 'deny' | 'escalate';
  /** Human-readable explanation, surfaced in traces and to the customer. */
  reason: string;
}

/** The engine's verdict for a request. The agent treats this as final. */
export interface PolicyVerdict {
  outcome: Outcome;
  /** The amount the engine permits (0 on a deny). */
  amount: number;
  /** Every clause that fired, in evaluation order. */
  violations: Violation[];
  /** Distinct clause ids cited back to the customer and shown in the trace. */
  citations: string[];
}

/** Everything a rule needs to evaluate one request. */
export interface EvaluationContext {
  /** The resolved order, or undefined when it could not be found. */
  order?: Order;
  /** The resolved customer, or undefined when not found. */
  customer?: Customer;
  request: RefundRequest;
  /** The moment the request is evaluated. Injected so verdicts are deterministic. */
  now: Date;
}

/** A single policy rule. Pure: depends only on its context. */
export interface PolicyRule {
  /** Clause id this rule enforces. */
  clause: string;
  /** Returns a violation when the rule forbids the refund, or null otherwise. */
  evaluate(ctx: EvaluationContext): Violation | null;
}
