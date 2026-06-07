import { z } from 'zod';

/**
 * The structured decision the model must produce. Bound to the model with
 * `withStructuredOutput`, so a response that does not match this shape fails
 * validation and triggers a re-prompt. The guard later reconciles this proposal
 * against the deterministic engine.
 */
export const DecisionSchema = z.object({
  decision: z.enum(['approve', 'deny', 'escalate']),
  /** The order this decision concerns, or null when none was identified. */
  orderId: z.string().nullable(),
  /** Refund amount in dollars. Zero for a deny. */
  amount: z.number().nonnegative(),
  /** The model's internal reasoning, shown in the admin trace. */
  reasoning: z.string().min(1),
  /** Policy clause ids the model relied on, e.g. ["§2.1"]. */
  policyCitations: z.array(z.string()),
  /** The reply shown to the customer. */
  customerMessage: z.string().min(1),
});

export type Decision = z.infer<typeof DecisionSchema>;
