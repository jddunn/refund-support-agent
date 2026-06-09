import { describe, expect, it } from 'vitest';
import { guardOutput } from './guardrails';

describe('guardOutput', () => {
  it('leaves normal customer messages unchanged', () => {
    expect(guardOutput('Your refund has been approved.')).toEqual({
      message: 'Your refund has been approved.',
      blocked: false,
    });
  });

  it('blocks replies that appear to leak system instructions', () => {
    const result = guardOutput(
      'You are a customer support agent and you must follow the written refund policy.',
    );

    expect(result.blocked).toBe(true);
    expect(result.message).not.toContain('customer support agent');
    expect(result.message).toContain('refund requests');
  });
});
