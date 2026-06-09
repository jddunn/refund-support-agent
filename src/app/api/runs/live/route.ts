import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { getLatestRunByConversation } from '@/db/trace-store';

export const runtime = 'nodejs';

/**
 * The latest run for a conversation with its events so far. The chat polls this
 * while a turn is in flight to stream the agent's reasoning steps live: the
 * graph writes each event as it runs, so a read returns the steps completed so
 * far.
 */
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversation');
  if (!conversationId) {
    return NextResponse.json({ error: 'conversation required' }, { status: 400 });
  }
  const db = await getDb();
  const data = await getLatestRunByConversation(db, conversationId);
  return NextResponse.json(data ?? { run: null, events: [] });
}
