import { NextRequest, NextResponse } from 'next/server';
import { getDb, reseedCrm } from '@/db';
import { SESSION_COOKIE, verifySession } from '@/server/session';

export const runtime = 'nodejs';

/** Restore the CRM tables to the seed fixtures. Trace history is kept. */
export async function POST(req: NextRequest) {
  if (!(await verifySession(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = await getDb();
  await reseedCrm(db);
  return NextResponse.json({ ok: true });
}
