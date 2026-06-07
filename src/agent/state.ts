import { Annotation } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { PolicyVerdict } from '@/policy/types';
import type { Decision } from './schema';

/**
 * Graph state. Each node reads a subset and returns a partial update;
 * LangGraph merges updates through each channel's reducer. `messages` and
 * `injectionFlags` append; the scalar channels overwrite.
 */
export const RefundState = Annotation.Root({
  /** The running message list for the tool-calling loop. */
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  /** The conversation this turn belongs to. */
  conversationId: Annotation<string>(),
  /** The resolved customer id, once known. */
  customerId: Annotation<string | undefined>(),
  /** The classified intent of the customer's message. */
  intent: Annotation<'refund_request' | 'question' | 'other' | undefined>(),
  /** Heuristic flags raised by the input screen (injection attempts, etc.). */
  injectionFlags: Annotation<string[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  /** The model's proposed decision, before the guard. */
  proposed: Annotation<Decision | undefined>(),
  /** The engine's verdict, set by the guard and treated as final. */
  verdict: Annotation<PolicyVerdict | undefined>(),
});

/** The concrete state type flowing through the graph. */
export type RefundStateType = typeof RefundState.State;
