import { StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { RefundState, type RefundStateType } from './state';
import { DecisionSchema, type Decision } from './schema';
import { AGENT_SYSTEM_PROMPT, PROPOSE_INSTRUCTION } from './prompts';
import { makeAgentModel, makeFallbackModel, type ModelHandle } from './model-factory';
import { buildTools } from './tools';
import { screenInput } from './screen';
import { guardOutput } from './guardrails';
import { getDb } from '@/db';
import { findCustomer, findOrder } from '@/db/queries';
import { evaluateRefund } from '@/policy/engine';
import type { PolicyVerdict } from '@/policy/types';
import { Trace } from '@/obs/trace';
import { costUsd } from '@/obs/pricing';
import { logger } from '@/obs/logger';
import { maybeInject } from '@/faults';
import { isProviderError, ProviderError } from '@/faults/errors';

const log = logger.child({ module: 'graph' });

export interface RunInput {
  conversationId: string;
  message: string;
  /** The authenticated customer. The guard trusts this, never the model's claim. */
  customerId?: string;
  /** Prior turns, if the conversation is ongoing. */
  history?: BaseMessage[];
  /** Model choice from the UI: 'auto', a model id, or 'openrouter/auto'. */
  model?: string;
}

export interface RunResult {
  runId: string;
  decision: Decision;
  verdict?: PolicyVerdict;
}

/** Running token totals across every model call in a run. */
interface Usage {
  input: number;
  output: number;
}

function accumulate(usage: Usage, message: unknown): void {
  const meta = (message as { usage_metadata?: { input_tokens?: number; output_tokens?: number } })
    ?.usage_metadata;
  if (!meta) return;
  usage.input += meta.input_tokens ?? 0;
  usage.output += meta.output_tokens ?? 0;
}

function lastHumanText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.getType() === 'human') {
      return typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
    }
  }
  return '';
}

function textOf(message: BaseMessage): string {
  return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
}

type ProviderFailureReason = 'provider_500' | 'rate_limit' | 'provider_error';

function providerFailureReason(err: unknown): ProviderFailureReason | undefined {
  if (err instanceof ProviderError) {
    if (err.status === 429) return 'rate_limit';
    if (err.status >= 500) return 'provider_500';
    return 'provider_error';
  }

  const maybeStatus = err as {
    status?: number;
    response?: { status?: number };
    code?: string;
  };
  const status = maybeStatus.status ?? maybeStatus.response?.status;
  if (status === 429) return 'rate_limit';
  if (typeof status === 'number' && status >= 500) return 'provider_500';
  if (maybeStatus.code === 'rate_limit_exceeded') return 'rate_limit';
  if (isProviderError(err)) return 'provider_error';
  return undefined;
}

/** Build a corrected decision from the engine verdict when the model disagreed. */
function rebuildFromVerdict(verdict: PolicyVerdict, orderId: string | null): Decision {
  const reasons = verdict.violations.map((v) => v.reason).join(' ');
  const customerMessage =
    verdict.outcome === 'approve'
      ? 'Your refund has been approved.'
      : verdict.outcome === 'escalate'
        ? `This request needs review by a member of our team and has been escalated. ${reasons}`.trim()
        : `I'm sorry, but this refund cannot be approved. ${reasons}`.trim();
  return {
    decision: verdict.outcome,
    orderId,
    amount: verdict.amount,
    reasoning: `Engine verdict ${verdict.outcome}. Clauses: ${verdict.citations.join(', ') || 'none'}.`,
    policyCitations: verdict.citations,
    customerMessage,
  };
}

/** Reconcile a model proposal against the deterministic engine verdict. */
export function reconcileDecisionWithVerdict(
  proposed: Decision,
  verdict: PolicyVerdict,
  orderId: string | null,
): Decision {
  if (verdict.outcome !== proposed.decision) {
    return rebuildFromVerdict(verdict, orderId);
  }
  return {
    ...proposed,
    amount: verdict.amount,
    policyCitations:
      proposed.policyCitations.length > 0 ? proposed.policyCitations : verdict.citations,
  };
}

const SAFE_DENY: Decision = {
  decision: 'deny',
  orderId: null,
  amount: 0,
  reasoning: 'The agent could not complete the request.',
  policyCitations: [],
  customerMessage:
    "I'm sorry, I couldn't complete that request. Please try again or contact support.",
};

/**
 * Run one customer turn through the graph and return the final decision. The
 * flow is screen -> agent (tool loop) -> propose -> guard -> respond. The guard
 * re-checks the proposal against the deterministic engine and overrides it when
 * they disagree, so the decision the customer sees always matches policy.
 */
export async function runAgent(input: RunInput): Promise<RunResult> {
  const db = await getDb();
  const now = new Date();
  const trace = new Trace(db, {
    conversationId: input.conversationId,
    customerId: input.customerId,
  });
  await trace.start();

  const usage: Usage = { input: 0, output: 0 };

  // Pick the model up front from the UI choice (or AUTO), reusing the injection
  // screen so the router can react to manipulation signals.
  const injectionFlags = screenInput(input.message);
  const turnCount = Math.ceil((input.history?.length ?? 0) / 2);
  let activeHandle: ModelHandle = makeAgentModel(input.model ?? 'auto', {
    injectionFlags,
    message: input.message,
    turnCount,
  });
  await trace.event({
    node: 'model',
    kind: 'node',
    output: {
      id: activeHandle.id,
      provider: activeHandle.provider,
      tier: activeHandle.tier,
      reason: activeHandle.routeReason,
    },
  });

  // The order resolved during the run, captured from the tools so the guard can
  // re-validate even when the model leaves the order out of its decision.
  const resolved: { orderId?: string } = {};

  const tools = buildTools({
    db,
    now,
    record: (node, toolInput, toolOutput) =>
      trace.event({ node, kind: 'tool', input: toolInput, output: toolOutput }),
    onOrderResolved: (orderId) => {
      resolved.orderId = orderId;
    },
  });
  const toolNode = new ToolNode(tools);
  let boundAgent = activeHandle.model.bindTools!(tools);

  async function failOverProvider(node: string, reason: ProviderFailureReason): Promise<boolean> {
    const fallback = makeFallbackModel(activeHandle, reason);
    if (!fallback) return false;

    const previous = {
      id: activeHandle.id,
      provider: activeHandle.provider,
      tier: activeHandle.tier,
    };
    activeHandle = fallback;
    boundAgent = activeHandle.model.bindTools!(tools);
    await trace.event({
      node,
      kind: 'retry',
      output: {
        reason,
        from: previous,
        to: {
          id: activeHandle.id,
          provider: activeHandle.provider,
          tier: activeHandle.tier,
        },
      },
      retryCount: 1,
    });
    return true;
  }

  async function withProviderFailover<T>(
    node: string,
    operation: () => Promise<T>,
    injectFault?: () => void,
  ): Promise<T> {
    try {
      injectFault?.();
      return await operation();
    } catch (err) {
      const reason = providerFailureReason(err);
      if (reason && (await failOverProvider(node, reason))) {
        return operation();
      }
      throw err;
    }
  }

  async function screenNode(state: RefundStateType) {
    const text = lastHumanText(state.messages);
    const flags = screenInput(text);
    await trace.event({ node: 'screen', kind: 'node', input: { text }, output: { flags } });
    return { injectionFlags: flags };
  }

  async function agentNode(state: RefundStateType) {
    const result = (await withProviderFailover(
      'agent',
      () =>
        boundAgent.invoke(state.messages, {
          tags: ['agent'],
          metadata: { runId: trace.runId },
        }),
      () => {
        maybeInject('provider_500');
        maybeInject('rate_limit');
      },
    )) as AIMessage;
    accumulate(usage, result);
    const calls = result.tool_calls ?? [];
    await trace.event({
      node: 'agent',
      kind: 'node',
      output: { toolCalls: calls.map((c) => c.name), text: textOf(result) },
    });
    return { messages: [result] };
  }

  async function proposeNode(state: RefundStateType) {
    let parsed: Decision | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt === 0) maybeInject('llm_malformed');
        const result = await withProviderFailover(
          'propose',
          async () => {
            const structured = activeHandle.model.withStructuredOutput(DecisionSchema, {
              includeRaw: true,
              name: 'decision',
            });
            return structured.invoke([...state.messages, new HumanMessage(PROPOSE_INSTRUCTION)], {
              tags: ['propose'],
            });
          },
          () => {
            maybeInject('provider_500');
            maybeInject('rate_limit');
          },
        );
        accumulate(usage, result.raw);
        parsed = result.parsed as Decision;
        if (attempt > 0) {
          await trace.event({
            node: 'propose',
            kind: 'retry',
            output: { recovered: true },
            retryCount: attempt,
          });
        }
        break;
      } catch (err) {
        if (providerFailureReason(err)) throw err;
        await trace.event({
          node: 'propose',
          kind: 'retry',
          output: { error: String(err) },
          retryCount: attempt + 1,
        });
      }
    }
    const decision = parsed ?? SAFE_DENY;
    await trace.event({ node: 'propose', kind: 'node', output: decision });
    return { proposed: decision };
  }

  async function guardNode(state: RefundStateType) {
    const proposed = state.proposed ?? SAFE_DENY;
    // Prefer the order actually resolved during the run over the model's claim,
    // so the deterministic check runs even when the model omits the order.
    const orderId = proposed.orderId ?? resolved.orderId ?? null;

    if (orderId) {
      const order = await findOrder(db, orderId);
      const customer = state.customerId ? await findCustomer(db, state.customerId) : undefined;
      const verdict = evaluateRefund({
        order,
        customer,
        request: {
          orderId,
          customerId: state.customerId ?? '',
          requestedAmount: proposed.amount > 0 ? proposed.amount : undefined,
        },
        now,
      });

      if (verdict.outcome !== proposed.decision) {
        const corrected = reconcileDecisionWithVerdict(proposed, verdict, orderId);
        await trace.event({
          node: 'guard',
          kind: 'guard',
          input: { proposed: proposed.decision },
          output: { engine: verdict.outcome, overridden: true, citations: verdict.citations },
        });
        return { proposed: corrected, verdict };
      }

      await trace.event({
        node: 'guard',
        kind: 'guard',
        input: { proposed: proposed.decision },
        output: { engine: verdict.outcome, overridden: false, amount: verdict.amount },
      });
      // Cap the amount at what the engine permits, even when the outcome matches.
      return { verdict, proposed: reconcileDecisionWithVerdict(proposed, verdict, orderId) };
    }

    // No order in play: the engine treats a missing order as a §2.3 denial.
    const customer = state.customerId ? await findCustomer(db, state.customerId) : undefined;
    const verdict = evaluateRefund({
      order: undefined,
      customer,
      request: {
        orderId: '',
        customerId: state.customerId ?? '',
        requestedAmount: proposed.amount > 0 ? proposed.amount : undefined,
      },
      now,
    });
    const corrected = reconcileDecisionWithVerdict(proposed, verdict, null);
    await trace.event({
      node: 'guard',
      kind: 'guard',
      input: { proposed: proposed.decision },
      output: {
        engine: verdict.outcome,
        overridden: corrected.decision !== proposed.decision,
        citations: verdict.citations,
      },
    });
    return { proposed: corrected, verdict };
  }

  async function respondNode(state: RefundStateType) {
    const decision = state.proposed ?? SAFE_DENY;
    const guarded = guardOutput(decision.customerMessage);
    const finalDecision = guarded.blocked
      ? { ...decision, customerMessage: guarded.message }
      : decision;
    await trace.event({
      node: 'respond',
      kind: 'node',
      output: {
        decision: finalDecision.decision,
        message: finalDecision.customerMessage,
        outputGuard: guarded.blocked,
      },
    });
    return { messages: [new AIMessage(finalDecision.customerMessage)], proposed: finalDecision };
  }

  function shouldContinue(state: RefundStateType): 'tools' | 'propose' {
    const last = state.messages[state.messages.length - 1] as AIMessage | undefined;
    return last?.tool_calls && last.tool_calls.length > 0 ? 'tools' : 'propose';
  }

  const graph = new StateGraph(RefundState)
    .addNode('screen', screenNode)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('propose', proposeNode)
    .addNode('guard', guardNode)
    .addNode('respond', respondNode)
    .addEdge(START, 'screen')
    .addEdge('screen', 'agent')
    .addConditionalEdges('agent', shouldContinue, { tools: 'tools', propose: 'propose' })
    .addEdge('tools', 'agent')
    .addEdge('propose', 'guard')
    .addEdge('guard', 'respond')
    .addEdge('respond', END)
    .compile();

  // Tell the model which customer it is serving so it can look them up. The
  // guard still trusts only input.customerId, never the model's restatement.
  const systemPrompt = input.customerId
    ? `${AGENT_SYSTEM_PROMPT}\n\nThe customer you are assisting has account id ${input.customerId}. Use this id when you look up the customer and check eligibility.`
    : AGENT_SYSTEM_PROMPT;

  const initial = {
    messages: [
      new SystemMessage(systemPrompt),
      ...(input.history ?? []),
      new HumanMessage(input.message),
    ],
    conversationId: input.conversationId,
    customerId: input.customerId,
  };

  try {
    const finalState = (await graph.invoke(initial, { recursionLimit: 12 })) as RefundStateType;
    const decision = finalState.proposed ?? SAFE_DENY;
    await trace.finish({
      decision: decision.decision,
      status: 'ok',
      inputTokens: usage.input,
      outputTokens: usage.output,
      costUsd: costUsd(activeHandle.id, usage.input, usage.output),
    });
    return { runId: trace.runId, decision, verdict: finalState.verdict };
  } catch (err) {
    log.error({ err: String(err), runId: trace.runId }, 'graph failed');
    await trace.event({ node: 'graph', kind: 'error', output: { error: String(err) } });
    await trace.finish({
      decision: SAFE_DENY.decision,
      status: 'error',
      inputTokens: usage.input,
      outputTokens: usage.output,
      costUsd: costUsd(activeHandle.id, usage.input, usage.output),
    });
    return { runId: trace.runId, decision: SAFE_DENY };
  }
}
