// Email one-time codes for /app login. Pure functions over D1; routes pass env + clock.
//   6 digits, 5-min TTL, one live code per email, bound to a login_id cookie nonce.
//   Stored as HMAC-SHA256(OTP_PEPPER, "<login_id>:<code>"), compared in constant time.
//   3 wrong codes per email in 15 min (summed across resends) → lockout.
// Callers always answer generically: nothing here may change the HTTP response
// depending on whether an email is allowlisted.

export const OTP = {
  TTL_S: 300,
  MAX_FAILS: 3,
  FAIL_WINDOW_S: 900,
  RESEND_AFTER_S: 60,
  SENDS_PER_EMAIL_HOUR: 4,
  REQUESTS_PER_IP_HOUR: 20,
  /** Resend free = 100 mails/day per account, shared with the contact form. */
  MAILS_PER_DAY: 60,
} as const;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export function randomHex(bytes = 16): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Uniform 000000-999999 (rejection sampling, no modulo bias). */
export function randomCode(): string {
  const buf = new Uint32Array(1);
  const max = 4_294_000_000; // largest multiple of 1e6 below 2^32
  do crypto.getRandomValues(buf);
  while (buf[0] >= max);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

export async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Constant time for equal lengths; our inputs are fixed-length hex digests. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function normEmail(raw: unknown): string | null {
  const e = String(raw ?? '').trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export const utcDayStart = (now: number) => now - (now % 86400);

export async function countEvents(db: D1Database, kind: string, by: 'subject' | 'ip', value: string, since: number) {
  return (await db.prepare(`SELECT COUNT(*) AS n FROM events WHERE kind = ? AND ${by} = ? AND at > ?`).bind(kind, value, since).first<number>('n')) ?? 0;
}

export const logEvent = (db: D1Database, kind: string, subject: string | null, ip: string | null, now: number) =>
  db.prepare('INSERT INTO events (kind, subject, ip, at) VALUES (?, ?, ?, ?)').bind(kind, subject, ip, now);

export async function isAllowlisted(db: D1Database, email: string) {
  return (await db.prepare('SELECT 1 AS ok FROM preview_allowlist WHERE email = ?').bind(email).first('ok')) !== null;
}

export async function mailsToday(db: D1Database, now: number) {
  return (await db.prepare('SELECT COUNT(*) AS n FROM events WHERE kind = ? AND at >= ?').bind('mail', utcDayStart(now)).first<number>('n')) ?? 0;
}

type Ctx = { pepper: string; ip: string; now: number };
export type CodeResult = { code: string; email: string } | { code: null; reason: 'ip_cap' | 'not_allowed' | 'locked' | 'too_soon' | 'email_cap' | 'daily_cap' };

/** Issues a code if every gate passes. The caller mails it; the HTTP answer is the same either way. */
export async function requestCode(db: D1Database, email: string, loginId: string, { pepper, ip, now }: Ctx): Promise<CodeResult> {
  const ipReqs = await countEvents(db, 'login_req', 'ip', ip, now - 3600);
  await logEvent(db, 'login_req', email, ip, now).run();
  if (ipReqs >= OTP.REQUESTS_PER_IP_HOUR) return { code: null, reason: 'ip_cap' };
  if (!(await isAllowlisted(db, email))) return { code: null, reason: 'not_allowed' };
  if ((await countEvents(db, 'otp_fail', 'subject', email, now - OTP.FAIL_WINDOW_S)) >= OTP.MAX_FAILS) return { code: null, reason: 'locked' };
  if ((await countEvents(db, 'otp_sent', 'subject', email, now - OTP.RESEND_AFTER_S)) > 0) return { code: null, reason: 'too_soon' };
  if ((await countEvents(db, 'otp_sent', 'subject', email, now - 3600)) >= OTP.SENDS_PER_EMAIL_HOUR) return { code: null, reason: 'email_cap' };
  if ((await mailsToday(db, now)) >= OTP.MAILS_PER_DAY) return { code: null, reason: 'daily_cap' };

  const code = randomCode();
  await db.batch([
    db.prepare('DELETE FROM otp_codes WHERE email = ? OR login_id = ?').bind(email, loginId),
    db
      .prepare('INSERT INTO otp_codes (login_id, email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(loginId, email, await hmacHex(pepper, `${loginId}:${code}`), now, now + OTP.TTL_S),
    logEvent(db, 'otp_sent', email, ip, now),
  ]);
  return { code, email };
}

/** "Resend code" on the verify page: the email comes from the login_id's row, never from the form. */
export async function resendCode(db: D1Database, loginId: string, ctx: Ctx): Promise<CodeResult> {
  const email = await db.prepare('SELECT email FROM otp_codes WHERE login_id = ?').bind(loginId).first<string>('email');
  return email ? requestCode(db, email, loginId, ctx) : { code: null, reason: 'not_allowed' };
}

export type VerifyResult = { ok: true; email: string } | { ok: false; reason: 'invalid' | 'locked' };

export async function verifyCode(db: D1Database, loginId: string, code: string, { pepper, ip, now }: Ctx): Promise<VerifyResult> {
  const row = await db
    .prepare('SELECT email, code_hash, expires_at FROM otp_codes WHERE login_id = ?')
    .bind(loginId)
    .first<{ email: string; code_hash: string; expires_at: number }>();
  // Unknown login ids get their own failure counter, so they lock out exactly like real ones.
  const subject = row?.email ?? `lid:${loginId}`;
  const fails = await countEvents(db, 'otp_fail', 'subject', subject, now - OTP.FAIL_WINDOW_S);
  if (fails >= OTP.MAX_FAILS) return { ok: false, reason: 'locked' };

  const given = /^\d{6}$/.test(code) ? await hmacHex(pepper, `${loginId}:${code}`) : '';
  if (row && row.expires_at > now && safeEqual(given, row.code_hash)) {
    // changes === 1 makes the code single-use even under concurrent submits.
    const del = await db.prepare('DELETE FROM otp_codes WHERE login_id = ? AND code_hash = ?').bind(loginId, row.code_hash).run();
    if (del.meta.changes === 1) return { ok: true, email: row.email };
  }
  await logEvent(db, 'otp_fail', subject, ip, now).run();
  // Keep the row on lockout: it ties this login id to the email's counter (it expires on its own).
  return { ok: false, reason: fails + 1 >= OTP.MAX_FAILS ? 'locked' : 'invalid' };
}

/** Opportunistic cleanup (run after logins): expired codes and sessions, old events and rejected requests. */
export function cleanup(db: D1Database, now: number) {
  return db.batch([
    db.prepare('DELETE FROM otp_codes WHERE expires_at < ?').bind(now - 86400),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('DELETE FROM events WHERE at < ?').bind(now - 30 * 86400),
    db.prepare("DELETE FROM signup_requests WHERE status = 'rejected' AND decided_at < ?").bind(now - 90 * 86400),
  ]);
}
