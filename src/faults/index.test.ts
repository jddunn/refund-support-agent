import { afterEach, describe, expect, it } from 'vitest';
import { LLMValidationError, isProviderError } from './errors';
import { maybeInject } from './index';

const ORIGINAL_ENV = { ...process.env };

describe('fault injection helpers', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('fires an armed fault once so recovery can be observed', () => {
    process.env.FAULT_INJECT = 'llm_malformed';

    expect(() => maybeInject('llm_malformed')).toThrow(LLMValidationError);
    expect(() => maybeInject('llm_malformed')).not.toThrow();
  });

  it('recognizes common provider error shapes', () => {
    expect(isProviderError({ status: 503 })).toBe(true);
    expect(isProviderError({ name: 'RateLimitError' })).toBe(true);
    expect(isProviderError(new Error('plain'))).toBe(false);
  });

  it('treats billing exhaustion as a provider failure so the agent fails over', () => {
    expect(
      isProviderError(new Error('400 Your credit balance is too low to access the Anthropic API.')),
    ).toBe(true);
    expect(isProviderError(new Error('429 insufficient_quota'))).toBe(true);
  });
});
