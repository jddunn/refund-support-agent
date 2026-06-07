import { StateGraph, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { RefundState, type RefundStateType } from './state';
import { DecisionSchema, type Decision } from './schema';
import { AGENT_SYSTEM_PROMPT, PROPOSE_INSTRUCTION } from './prompts';
import { makeModel } from './model-factory';
import { buildTools } from './tools';
import { screenInput } from './screen';
import { getDb } from '@/db';
import { findCustomer, findOrder } from '@/db/queries';
import { evaluateRefund } from '@/policy/engine';
import type { PolicyVerdict } from '@/policy/types';
import { Trace } from '@/obs/trace';
import { costUsd } from '@/obs/pricing';
import { logger } from '@/obs/logger';

const log = logger.child({ module: 'graph' });

export interface RunInput {
  conversationId: string;
  message: string;
  /** The authenticated customer. The guard trusts this, never the model's claim. */
  customerId?: string;
  /** Prior turns, if the conversation is ongoing. */
  history?: BaseMessage[];
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
      return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    }
  }
  return '';
}

function textOf(message: BaseMessage): string {
  return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
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

const SAFE_DENY: Decision = {
  decision: 'deny',
  orderId: null,
  amount: 0,
  reasoning: 'The agent could not complete the request.',
  policyCitations: [],
  customerMessage: "I'm sorry, I couldn't complete that request. Please try again or contact support.",
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
  const trace = new Trace(db, { conversationId: input.conversationId, customerId: input.customerId });
  await trace.start();

  const usage: Usage = { input: 0, output: 0 };
  const handle = makeModel('agent');

  const tools = buildTools({
    db,
    now,
    record: (node, toolInput, toolOutput) =>
      trace.event({ node, kind: 'tool', input: toolInput, output: toolOutput }),
  });
  const toolNode = new ToolNode(tools);
  const boundAgent = handle.model.bindTools!(tools);

  async function screenNode(state: RefundStateType) {
    const text = lastHumanText(state.messages);
    const flags = screenInput(text);
    await trace.event({ node: 'screen', kind: 'node', input: { text }, output: { flags } });
    return { injectionFlags: flags };
  }

  async function agentNode(state: RefundStateType) {
    const result = (await boundAgent.invoke(state.messages, {
      tags: ['agent'],
      metadata: { runId: trace.runId },
    })) as AIMessage;
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
    const structured = handle.model.withStructuredOutput(DecisionSchema, {
      includeRaw: true,
      name: 'decision',
    });
    let parsed: Decision | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await structured.invoke([...state.messages, new HumanMessage(PROPOSE_INSTRUCTION)], {
          tags: ['propose'],
        });
        accumulate(usage, result.raw);
        parsed = result.parsed as Decision;
        if (attempt > 0) {
          await trace.event({ node: 'propose', kind: 'retry', output: { recovered: true }, retryCount: attempt });
        }
        break;
      } catch (err) {
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

    if (proposed.orderId) {
      const order = await findOrder(db, proposed.orderId);
      const customer = state.customerId ? await findCustomer(db, state.customerId) : undefined;
      const verdict = evaluateRefund({
        order,
        customer,
        request: {
          orderId: proposed.orderId,
          customerId: state.customerId ?? '',
          requestedAmount: proposed.amount > 0 ? proposed.amount : undefined,
        },
        now,
      });

      if (verdict.outcome !== proposed.decision) {
        const corrected = rebuildFromVerdict(verdict, proposed.orderId);
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
        output: { engine: verdict.outcome, overridden: false },
      });
      return { verdict };
    }

    // No order in play: an approval is impossible, so block one if proposed.
    if (proposed.decision === 'approve') {
      const corrected: Decision = {
        ...proposed,
        decision: 'deny',
        amount: 0,
        customerMessage:
          "I can't approve a refund without an order number that matches your account. Could you share your order id?",
      };
      await trace.event({
        node: 'guard',
        kind: 'guard',
        output: { overridden: true, reason: 'no order to approve' },
      });
      return { proposed: corrected };
    }

    await trace.event({ node: 'guard', kind: 'guard', output: { overridden: false } });
    return {};
  }

  async function respondNode(state: RefundStateType) {
    const decision = state.proposed ?? SAFE_DENY;
    await trace.event({
      node: 'respond',
      kind: 'node',
      output: { decision: decision.decision, message: decision.customerMessage },
    });
    return { messages: [new AIMessage(decision.customerMessage)] };
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

  const initial = {
    messages: [
      new SystemMessage(AGENT_SYSTEM_PROMPT),
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
      costUsd: costUsd(handle.id, usage.input, usage.output),
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
      costUsd: costUsd(handle.id, usage.input, usage.output),
    });
    return { runId: trace.runId, decision: SAFE_DENY };
  }
}
