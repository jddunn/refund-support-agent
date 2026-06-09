import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runAgent } from '@/agent/graph';
import { getDb } from '@/db';
import { getRun } from '@/db/trace-store';
import { availableModelOptions } from '@/agent/models';

export const runtime = 'nodejs';

// The models the face-off runs, in display order. Each is included only when its
// provider has a key configured.
const FACEOFF_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-8', 'gpt-4.1'];

/** Run the same refund request through every configured model, in parallel. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const customerId = typeof body?.customerId === 'string' ? body.customerId : undefined;
  const message = typeof body?.message === 'string' ? body.message : '';
  if (!message.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const available = new Set(availableModelOptions().map((o) => o.id));
  const models = FACEOFF_MODELS.filter((m) => available.has(m));
  const db = await getDb();

  const results = await Promise.all(
    models.map(async (model) => {
      try {
        const result = await runAgent({
          conversationId: `faceoff-${model}-${randomUUID()}`,
          message,
          customerId,
          model,
        });
        const detail = await getRun(db, result.runId);
        return {
          model,
          decision: result.decision.decision,
          message: result.decision.customerMessage,
          citations: result.decision.policyCitations,
          costUsd: detail?.run.costUsd ?? 0,
          latencyMs: detail?.run.latencyMs ?? 0,
          tokens: (detail?.run.inputTokens ?? 0) + (detail?.run.outputTokens ?? 0),
          runId: result.runId,
        };
      } catch {
        return {
          model,
          decision: 'error',
          message: 'This model failed to respond.',
          citations: [] as string[],
          costUsd: 0,
          latencyMs: 0,
          tokens: 0,
          runId: null,
        };
      }
    }),
  );

  return NextResponse.json({ results });
}
