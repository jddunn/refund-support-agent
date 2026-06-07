import { LLMValidationError, ProviderError, RecoverableToolError } from './errors';

/**
 * Fault injection. Off by default. Arm specific faults through the FAULT_INJECT
 * environment variable (a comma-separated list) to exercise the recovery paths
 * deterministically. Nothing here fires unless a fault is explicitly armed, so
 * a normal run is never affected.
 */
export type FaultKind =
  | 'tool_timeout'
  | 'llm_malformed'
  | 'provider_500'
  | 'rate_limit'
  | 'db_locked';

function armedFaults(): Set<string> {
  const raw = process.env.FAULT_INJECT ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Whether a given fault is currently armed. */
export function isFaultArmed(kind: FaultKind): boolean {
  return armedFaults().has(kind);
}

/** Throw the error for a fault when it is armed; otherwise do nothing. */
export function maybeInject(kind: FaultKind): void {
  if (!armedFaults().has(kind)) return;
  switch (kind) {
    case 'tool_timeout':
      throw new RecoverableToolError('Injected fault: tool timeout');
    case 'db_locked':
      throw new RecoverableToolError('Injected fault: database locked');
    case 'llm_malformed':
      throw new LLMValidationError('Injected fault: malformed model output');
    case 'provider_500':
      throw new ProviderError(500, 'Injected fault: provider server error');
    case 'rate_limit':
      throw new ProviderError(429, 'Injected fault: rate limit');
  }
}
