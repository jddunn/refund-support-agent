import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { priceFor } from '@/obs/pricing';
import { availableProviders, type Provider } from './models';
import { routeModel, type RouteContext } from './router';

export type ModelTier = 'fast' | 'strong';

/** A model plus the metadata the trace layer needs to compute cost and explain routing. */
export interface ModelHandle {
  model: BaseChatModel;
  id: string;
  provider: Provider;
  /** AUTO tier used for this model. Concrete selections default to their closest tier. */
  tier: ModelTier;
  pricePer1kInput: number;
  pricePer1kOutput: number;
  /** Why this model was chosen (set when AUTO routed, or on a fallback). */
  routeReason?: string;
}

const MAX_TOKENS = 2048;

/** Per-provider model ids for each tier the AUTO router can pick. */
const TIERS: Record<Provider, Record<ModelTier, string>> = {
  anthropic: { fast: 'claude-sonnet-4-6', strong: 'claude-opus-4-8' },
  openai: { fast: 'gpt-4.1', strong: 'gpt-4.1' },
  openrouter: { fast: 'anthropic/claude-sonnet-4.6', strong: 'anthropic/claude-opus-4' },
};

function primaryProvider(): Provider {
  const available = availableProviders();
  if (available.length === 0) {
    throw new Error(
      'No model provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.',
    );
  }
  return available[0];
}

/** Infer the provider for a concrete model id. */
function providerOf(modelId: string): Provider {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3')) {
    return 'openai';
  }
  return 'openrouter';
}

function buildModel(modelId: string, provider: Provider): BaseChatModel {
  if (provider === 'anthropic') {
    return new ChatAnthropic({ model: modelId, maxTokens: MAX_TOKENS });
  }
  if (provider === 'openrouter') {
    // OpenRouter speaks the OpenAI API, so the OpenAI client points at it.
    return new ChatOpenAI({
      model: modelId,
      maxTokens: MAX_TOKENS,
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: { baseURL: 'https://openrouter.ai/api/v1' },
    });
  }
  return new ChatOpenAI({ model: modelId, maxTokens: MAX_TOKENS });
}

function tierFor(provider: Provider, modelId: string): ModelTier {
  if (modelId === TIERS[provider].strong) return 'strong';
  return 'fast';
}

function handleFor({
  id,
  provider,
  tier,
  routeReason,
}: {
  id: string;
  provider: Provider;
  tier: ModelTier;
  routeReason?: string;
}): ModelHandle {
  const price = priceFor(id);
  return {
    model: buildModel(id, provider),
    id,
    provider,
    tier,
    pricePer1kInput: price.input,
    pricePer1kOutput: price.output,
    routeReason,
  };
}

/**
 * Build the model for a turn from the UI choice (or AUTO) and the route context.
 * `AGENT_MODEL` in the environment overrides everything. A choice whose provider
 * has no key falls back to the primary provider's fast model.
 */
export function makeAgentModel(choice: string, ctx: RouteContext): ModelHandle {
  const requested = process.env.AGENT_MODEL || choice || 'auto';

  let id: string;
  let provider: Provider;
  let tier: ModelTier;
  let routeReason: string | undefined;

  if (requested === 'auto') {
    const route = routeModel(ctx);
    provider = primaryProvider();
    tier = route.tier;
    id = TIERS[provider][tier];
    routeReason = `auto: ${route.reason} -> ${id}`;
  } else if (requested === 'openrouter/auto') {
    provider = 'openrouter';
    id = 'openrouter/auto';
    tier = 'fast';
  } else {
    provider = providerOf(requested);
    id = requested;
    tier = tierFor(provider, id);
    if (!availableProviders().includes(provider)) {
      provider = primaryProvider();
      tier = 'fast';
      id = TIERS[provider].fast;
      routeReason = `requested model unavailable; using ${id}`;
    }
  }

  return handleFor({ id, provider, tier, routeReason });
}

/**
 * Build a replacement handle on the next configured provider. This is used for
 * transient provider failures; it preserves the selected tier so AUTO's routing
 * decision remains transparent across failover.
 */
export function makeFallbackModel(
  current: ModelHandle,
  reason: 'provider_500' | 'rate_limit' | 'provider_error',
): ModelHandle | undefined {
  const provider = availableProviders().find((candidate) => candidate !== current.provider);
  if (!provider) return undefined;

  const id = TIERS[provider][current.tier];
  return handleFor({
    id,
    provider,
    tier: current.tier,
    routeReason: `fallback after ${reason}: ${current.provider}/${current.id} -> ${provider}/${id}`,
  });
}
