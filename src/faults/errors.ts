/**
 * The error taxonomy. Each class signals how a failure should be handled, so
 * the graph can react by class rather than by parsing messages.
 */

/** A transient failure that should be retried with backoff. */
export class RecoverableToolError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = 'RecoverableToolError';
  }
}

/** The model produced output that failed validation; re-prompt with the error. */
export class LLMValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMValidationError';
  }
}

/** A provider returned an error status; the caller may fail over to another provider. */
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** The model tried an action the policy forbids; caught and corrected by the guard. */
export class PolicyViolationAttempt extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyViolationAttempt';
  }
}

/** An unrecoverable failure; the customer receives a safe, generic message. */
export class FatalAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalAgentError';
  }
}

/** True for our injected provider errors and for real provider 4xx/5xx shapes. */
export function isProviderError(err: unknown): boolean {
  if (err instanceof ProviderError) return true;
  const e = err as { status?: number; name?: string } | null;
  if (e && typeof e.status === 'number' && [429, 500, 502, 503, 529].includes(e.status)) {
    return true;
  }
  if (
    e &&
    typeof e.name === 'string' &&
    /ratelimit|overloaded|internalserver|apiconnection/i.test(e.name)
  ) {
    return true;
  }
  return false;
}
