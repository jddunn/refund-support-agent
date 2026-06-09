import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

/** Wire format for prior chat turns sent from the browser to the API. */
export const ChatHistoryEntrySchema = z.object({
  role: z.enum(['customer', 'agent']),
  text: z.string(),
});

/** Bounded history payload. The latest customer message is sent separately. */
export const ChatHistorySchema = z.array(ChatHistoryEntrySchema).max(20);

export type ChatHistoryEntry = z.infer<typeof ChatHistoryEntrySchema>;

/** Convert browser chat history to LangChain messages for the next agent turn. */
export function toAgentHistory(history: ChatHistoryEntry[]): BaseMessage[] {
  return history
    .map((turn) => ({ ...turn, text: turn.text.trim() }))
    .filter((turn) => turn.text.length > 0)
    .map((turn) =>
      turn.role === 'customer' ? new HumanMessage(turn.text) : new AIMessage(turn.text),
    );
}
