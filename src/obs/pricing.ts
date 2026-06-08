/**
 * Token pricing, used to turn per-run token counts into a dollar cost shown in
 * the admin dashboard. Anthropic figures are list price per million tokens;
 * OpenAI figures are approximate and should be confirmed before any cost number
 * is treated as exact.
 */

/** Price per 1,000 tokens, in USD. */
export interface ModelPrice {
  input: number;
  output: number;
}

export const PRICING: Record<string, ModelPrice> = {
  // Anthropic list price (per 1M: $5/$25, $3/$15, $1/$5).
  'claude-opus-4-8': { input: 0.005, output: 0.025 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  // OpenAI (approximate; verify against current published pricing).
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  // OpenRouter ids mapped to the underlying model's list price.
  'anthropic/claude-sonnet-4.6': { input: 0.003, output: 0.015 },
  'anthropic/claude-opus-4': { input: 0.005, output: 0.025 },
};

/** Price for a model id, or zero when the model is unknown. */
export function priceFor(modelId: string): ModelPrice {
  return PRICING[modelId] ?? { input: 0, output: 0 };
}

/** Dollar cost of a request given its input and output token counts. */
export function costUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(modelId);
  return (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;
}
