/**
 * The AUTO router. It picks a model tier from cheap signals before the graph
 * runs. The deterministic guard enforces policy regardless of which model is
 * used, so this is a cost-and-quality optimization, not a safety mechanism: it
 * spends a stronger model only on requests that look harder or adversarial, and
 * the reason is recorded in the trace so the choice is transparent.
 */
export interface RouteContext {
  /** Injection flags raised by the input screen for this message. */
  injectionFlags: string[];
  /** The customer's latest message. */
  message: string;
  /** How many turns the conversation has had so far. */
  turnCount: number;
}

export interface RouteDecision {
  tier: 'fast' | 'strong';
  reason: string;
}

/** Choose a tier for a request. Pure and deterministic. */
export function routeModel(ctx: RouteContext): RouteDecision {
  if (ctx.injectionFlags.length > 0) {
    return { tier: 'strong', reason: `manipulation signals: ${ctx.injectionFlags.join(', ')}` };
  }
  if (ctx.message.length > 400) {
    return { tier: 'strong', reason: 'long or complex request' };
  }
  if (ctx.turnCount >= 3) {
    return { tier: 'strong', reason: 'extended conversation' };
  }
  return { tier: 'fast', reason: 'standard request' };
}
