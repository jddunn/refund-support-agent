import type { EvaluationContext, PolicyVerdict, Violation } from './types';
import { RULES } from './rules';

/**
 * Evaluate a refund request against every policy rule and return a final
 * verdict. Deterministic and total: it collects all violations, then resolves
 * the outcome by precedence (a denial outranks an escalation, which outranks an
 * approval). No ordering of rules can be gamed, and the same inputs always
 * produce the same verdict.
 *
 * This is the source of truth. The agent's model proposes a decision and
 * explains it, but the guard reconciles that proposal against this verdict, and
 * this verdict wins.
 */
export function evaluateRefund(ctx: EvaluationContext): PolicyVerdict {
  const violations: Violation[] = [];
  for (const rule of RULES) {
    const violation = rule.evaluate(ctx);
    if (violation) violations.push(violation);
  }

  const hasDeny = violations.some((v) => v.effect === 'deny');
  const hasEscalate = violations.some((v) => v.effect === 'escalate');

  let outcome: PolicyVerdict['outcome'] = 'approve';
  if (hasDeny) outcome = 'deny';
  else if (hasEscalate) outcome = 'escalate';

  // Permitted amount: nothing on a deny, otherwise the requested figure capped
  // at the price paid (§3.6). A human finalizes the figure on an escalate.
  const price = ctx.order?.price ?? 0;
  const requested = ctx.request.requestedAmount ?? price;
  const amount = outcome === 'deny' ? 0 : Math.min(requested, price);

  return {
    outcome,
    amount,
    violations,
    citations: [...new Set(violations.map((v) => v.clause))],
  };
}
