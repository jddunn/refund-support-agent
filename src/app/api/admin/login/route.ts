import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { checkPassword } from '@/server/password';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from '@/server/session';

export const runtime = 'nodejs';

const Body = z.object({ password: z.string() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!checkPassword(parsed.data.password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
