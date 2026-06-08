import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The admin password. Defaults to "admin" for local and demo use; set
 * ADMIN_PASSWORD to a strong value for any real deploy. The environment is the
 * secret store, so the password is never committed.
 *
 * For a multi-user system you would not compare against an env value: store a
 * per-user salted hash (bcrypt or argon2) and verify with that library's
 * compare function. This single-gate design keeps the demo simple.
 */
function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'admin';
}

/**
 * Constant-time password check. Both sides are hashed to a fixed length first
 * so the comparison cannot leak the password length, and timingSafeEqual avoids
 * leaking how many leading characters matched.
 */
export function checkPassword(submitted: string): boolean {
  const a = createHash('sha256').update(submitted).digest();
  const b = createHash('sha256').update(adminPassword()).digest();
  return timingSafeEqual(a, b);
}
