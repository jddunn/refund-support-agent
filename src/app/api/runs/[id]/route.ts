import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { getRun } from '@/db/trace-store';

export const runtime = 'nodejs';

/** Return one run with its full event timeline. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const data = await getRun(db, id);
  if (!data) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  return NextResponse.json(data);
}
