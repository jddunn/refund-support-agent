import { describe, expect, it } from 'vitest';
import { reconcileDecisionWithVerdict } from './graph';
import type { Decision } from './schema';
import type { PolicyVerdict } from '@/policy/types';

describe('reconcileDecisionWithVerdict', () => {
  it('turns a no-order escalation into the engine denial', () => {
    const proposed: Decision = {
      decision: 'escalate',
      orderId: null,
      amount: 0,
      reasoning: 'No order was provided, so a human should look.',
      policyCitations: [],
      customerMessage: 'A human should review this.',
    };
    const verdict: PolicyVerdict = {
      outcome: 'deny',
      amount: 0,
      violations: [
        {
          clause: '§2.3',
          effect: 'deny',
          reason: 'The order could not be found.',
        },
      ],
      citations: ['§2.3'],
    };

    const reconciled = reconcileDecisionWithVerdict(proposed, verdict, null);

    expect(reconciled.decision).toBe('deny');
    expect(reconciled.policyCitations).toEqual(['§2.3']);
    expect(reconciled.customerMessage).toContain('could not be found');
  });
});
