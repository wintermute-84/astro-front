// Request-scoped helpers for /signup, /app and /dashboard/signups routes.
import { env, waitUntil } from 'cloudflare:workers';
import type { CodeResult } from './otp.ts';
import { codeMail, sendMail } from './mail.ts';

/** Site D1. Missing binding throws → 500, i.e. fail closed. */
export function siteDb(): D1Database {
  if (!env.SITE_DB) throw new Error('SITE_DB binding missing');
  return env.SITE_DB;
}

export const nowS = () => Math.floor(Date.now() / 1000);
export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'unknown';

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  const fd = new FormData();
  fd.append('secret', env.TURNSTILE_SECRET_KEY);
  fd.append('response', token);
  if (ip !== 'unknown') fd.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

/** Per-IP limiter for login/verify posts (namespace 2003). Missing binding throws (fail closed), except in dev. */
export async function otpIpAllowed(ip: string): Promise<boolean> {
  if (!env.OTP_IP_LIMITER) {
    if (import.meta.env.DEV) return true;
    throw new Error('OTP_IP_LIMITER binding missing');
  }
  return (await env.OTP_IP_LIMITER.limit({ key: `otp:${ip}` })).success;
}

/** HMAC key for login codes. Missing secret throws → 500 rather than hashing with "undefined". */
export function otpPepper(): string {
  if (!env.OTP_PEPPER || env.OTP_PEPPER.length < 16) throw new Error('OTP_PEPPER secret missing');
  return env.OTP_PEPPER;
}

/**
 * Issues (or not) and mails a login code after the response is sent. The page answers the same
 * redirect either way, and with all D1 work deferred, timing can't tell allowlisted emails apart.
 */
export function issueCodeLater(db: D1Database, issue: () => Promise<CodeResult>, now: number) {
  waitUntil(
    issue()
      .then(async (r) => {
        if (!r.code) return;
        if (import.meta.env.DEV) console.log(`[DEV] login code for ${r.email}: ${r.code}`);
        await sendMail(db, env, codeMail(r.email, r.code), now);
      })
      .catch((e) => console.error('login code failed:', e instanceof Error ? e.message : e)),
  );
}
