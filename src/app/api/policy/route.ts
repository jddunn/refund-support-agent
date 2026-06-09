import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidatePolicyCache } from '@/agent/tools';
import { SESSION_COOKIE, verifySession } from '@/server/session';

export const runtime = 'nodejs';

const POLICY_PATH = () => join(process.cwd(), 'seed', 'refund-policy.md');

/** The raw policy document the agent reads and cites. */
export async function GET() {
  try {
    return NextResponse.json({ content: readFileSync(POLICY_PATH(), 'utf8') });
  } catch {
    return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
  }
}

const Body = z.object({ content: z.string().min(50).max(50_000) });

/**
 * Save the policy document. Admin session required. The agent's get_policy
 * tool reads the new text on its next call (the in-process cache is dropped).
 * The deterministic engine rules in src/policy are code and do not change here.
 */
export async function PUT(req: NextRequest) {
  if (!(await verifySession(req.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
  }
  try {
    writeFileSync(POLICY_PATH(), parsed.data.content, 'utf8');
  } catch {
    // Read-only filesystems (e.g. serverless) cannot persist policy edits.
    return NextResponse.json({ error: 'The policy file is not writable here' }, { status: 500 });
  }
  invalidatePolicyCache();
  return NextResponse.json({ ok: true });
}
