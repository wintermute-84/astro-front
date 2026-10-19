// Request-scoped helpers for /signup, /app and /dashboard/signups routes.
import { env } from 'cloudflare:workers';

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

/** Per-IP limiter for login/verify posts (namespace 2003). No binding (local dev without it) = allow. */
export async function otpIpAllowed(ip: string): Promise<boolean> {
  return env.OTP_IP_LIMITER ? (await env.OTP_IP_LIMITER.limit({ key: `otp:${ip}` })).success : true;
}

/** HMAC key for login codes. Missing secret throws → 500 rather than hashing with "undefined". */
export function otpPepper(): string {
  if (!env.OTP_PEPPER || env.OTP_PEPPER.length < 16) throw new Error('OTP_PEPPER secret missing');
  return env.OTP_PEPPER;
}
