import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { priceFor } from '@/obs/pricing';

/** Which job a model is being built for. */
export type ModelRole = 'agent' | 'screen';

/** A model plus the metadata the trace layer needs to compute cost. */
export interface ModelHandle {
  model: BaseChatModel;
  id: string;
  provider: 'anthropic' | 'openai';
  pricePer1kInput: number;
  pricePer1kOutput: number;
}

/**
 * Per-role defaults. The decision loop uses a fast, capable model; the input
 * screen uses a cheaper one because it only classifies. Override the decision
 * model with the AGENT_MODEL environment variable.
 */
const DEFAULT_MODELS = {
  anthropic: { agent: 'claude-sonnet-4-6', screen: 'claude-haiku-4-5' },
  openai: { agent: 'gpt-4.1', screen: 'gpt-4o-mini' },
} as const;

const MAX_TOKENS: Record<ModelRole, number> = { agent: 2048, screen: 512 };

/** Pick the provider by whichever key is present (Anthropic first). */
function pickProvider(): 'anthropic' | 'openai' {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  throw new Error('No model provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
}

/**
 * Build a model for a role. Provider is chosen by which key is present, so the
 * app runs against either Anthropic or OpenAI with no code change and no
 * wrong-provider failure mode.
 */
export function makeModel(role: ModelRole): ModelHandle {
  const provider = pickProvider();
  const id =
    role === 'agent' && process.env.AGENT_MODEL
      ? process.env.AGENT_MODEL
      : DEFAULT_MODELS[provider][role];
  const price = priceFor(id);

  const model: BaseChatModel =
    provider === 'anthropic'
      ? new ChatAnthropic({ model: id, maxTokens: MAX_TOKENS[role] })
      : new ChatOpenAI({ model: id, maxTokens: MAX_TOKENS[role] });

  return {
    model,
    id,
    provider,
    pricePer1kInput: price.input,
    pricePer1kOutput: price.output,
  };
}
