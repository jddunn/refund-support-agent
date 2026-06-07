import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { listRuns } from '@/db/trace-store';

export const runtime = 'nodejs';

/** List recent runs for the admin dashboard. */
export async function GET() {
  const db = await getDb();
  const runs = await listRuns(db, 100);
  return NextResponse.json({ runs });
}
