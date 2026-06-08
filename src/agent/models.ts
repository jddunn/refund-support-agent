/**
 * The catalog of models the UI can offer and the runtime can build, plus which
 * providers are configured. This file imports no heavy SDK, so it is safe to
 * read from both server and client code (the client uses the types and the
 * server uses the env-reading helpers).
 */
export type Provider = 'anthropic' | 'openai' | 'openrouter';

export interface ModelOption {
  /** The value stored and sent from the UI. */
  id: string;
  /** Human label for the selector. */
  label: string;
  /** The provider this option uses, or 'auto' for the difficulty router. */
  provider: Provider | 'auto';
}

/** Every selectable option, in display order. */
export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'auto', label: 'Auto (route by difficulty)', provider: 'auto' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'anthropic' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai' },
  { id: 'openrouter/auto', label: 'OpenRouter Auto', provider: 'openrouter' },
];

/** Providers with a key present, in selection-precedence order. */
export function availableProviders(): Provider[] {
  const providers: Provider[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');
  if (process.env.OPENAI_API_KEY) providers.push('openai');
  if (process.env.OPENROUTER_API_KEY) providers.push('openrouter');
  return providers;
}

/** The options the UI should show, given which providers are configured. */
export function availableModelOptions(): ModelOption[] {
  const providers = availableProviders();
  return MODEL_OPTIONS.filter(
    (option) => option.provider === 'auto' || providers.includes(option.provider),
  );
}
