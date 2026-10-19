// /app sessions: D1 keeps SHA-256(token); the 32-byte token lives only in the cookie.
// A new token is minted on every login (no fixation); logout ends all of the user's sessions.
import { randomHex, sha256Hex } from './otp.ts';

export const SESSION_COOKIE = 'app_session';
export const LOGIN_COOKIE = 'login_id';
export const SESSION_TTL_S = 30 * 86400;
export const LOGIN_TTL_S = 600;

export const cookieOpts = (maxAge: number) => ({ path: '/app', httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge });

export type Customer = { userId: string; email: string };

const tokenB64 = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** After a verified code: create the user on first login, then mint a fresh session token. */
export async function completeLogin(db: D1Database, email: string, now: number): Promise<{ userId: string; token: string }> {
  await db
    .prepare('INSERT INTO users (id, email, created_at, last_login_at) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO UPDATE SET last_login_at = excluded.last_login_at')
    .bind(`usr_${randomHex(12)}`, email, now, now)
    .run();
  const userId = (await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<string>('id'))!;
  const token = tokenB64();
  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_S)
    .run();
  return { userId, token };
}

/** Valid session of a still-allowlisted user, else null. Removing the allowlist entry locks the user out. */
export async function readSession(db: D1Database, token: string | undefined, now: number): Promise<Customer | null> {
  if (!token || token.length > 64) return null;
  const row = await db
    .prepare(
      `SELECT u.id AS userId, u.email AS email FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN preview_allowlist a ON a.email = u.email
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(await sha256Hex(token), now)
    .first<Customer>();
  return row ?? null;
}

export async function endAllSessions(db: D1Database, userId: string) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

/** GDPR delete: user, sessions, codes, allowlist entry and signup requests. Edge projects are deleted by the caller first. */
export async function deleteUser(db: D1Database, user: Customer) {
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.userId),
    db.prepare('DELETE FROM otp_codes WHERE email = ?').bind(user.email),
    db.prepare('DELETE FROM preview_allowlist WHERE email = ?').bind(user.email),
    db.prepare('DELETE FROM signup_requests WHERE email = ?').bind(user.email),
    db.prepare('DELETE FROM events WHERE subject = ?').bind(user.email),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.userId),
  ]);
}
