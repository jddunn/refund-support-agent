import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { clearRuns, listRuns } from '@/db/trace-store';
import { SESSION_COOKIE, verifySession } from '@/server/session';

export const runtime = 'nodejs';

/** List recent runs for the admin dashboard. */
export async function GET() {
  const db = await getDb();
  const runs = await listRuns(db, 100);
  return NextResponse.json({ runs });
}

/** Clear all run history. Admin session required. */
export async function DELETE(req: NextRequest) {
  if (!(await verifySession(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = await getDb();
  await clearRuns(db);
  return NextResponse.json({ ok: true });
}
