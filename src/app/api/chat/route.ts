import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runAgent } from '@/agent/graph';
import { ChatHistorySchema, toAgentHistory } from '@/agent/history';
import { SESSION_COOKIE, verifySession } from '@/server/session';

// The agent uses native modules and the LLM SDKs, so it runs on the Node runtime.
export const runtime = 'nodejs';

const Body = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1),
  customerId: z.string().optional(),
  model: z.string().optional(),
  history: ChatHistorySchema.optional(),
});

/** Run one customer turn through the agent and return its decision. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const isAdmin = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    const result = await runAgent({
      conversationId: parsed.data.conversationId,
      message: parsed.data.message,
      customerId: parsed.data.customerId,
      history: toAgentHistory(parsed.data.history ?? []),
      model: isAdmin ? parsed.data.model : 'auto',
    });
    return NextResponse.json({
      runId: result.runId,
      decision: result.decision.decision,
      message: result.decision.customerMessage,
      amount: result.decision.amount,
      citations: result.decision.policyCitations,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Agent run failed', detail: String(err) }, { status: 500 });
  }
}
