import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'admin_session';
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours
const ISSUER = 'refund-support-agent';

// A fixed dev secret keeps local use zero-config; set SESSION_SECRET for any
// real deploy. The key is encoded directly (no Node crypto) so this module runs
// on the Edge runtime that middleware uses as well as on Node.
const DEV_SECRET = 'refund-support-agent-dev-session-secret-change-in-production';

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || DEV_SECRET);
}

/** Sign a short-lived admin session token. */
export async function signSession(): Promise<string> {
  return new SignJWT({ admin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

/** Verify an admin session token. True only when valid, unexpired, and ours. */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER });
    return payload.admin === true;
  } catch {
    return false;
  }
}
