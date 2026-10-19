import type { APIRoute } from 'astro';
import { env, waitUntil } from 'cloudflare:workers';
import { createSignupRequest, parseSignup } from '../../lib/app/signup';
import { OTP } from '../../lib/app/otp';
import { ownerSignupMail, sendMail } from '../../lib/app/mail';
import { isSameOriginWrite } from '../../lib/app/paths';
import { clientIp, nowS, siteDb, verifyTurnstile } from '../../lib/app/site';

export const prerender = false;

// Errors come back as 200 + { error } so the browser console stays clean; the page shows them.
const json = (data: Record<string, unknown>) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Same answer for new, duplicate and throttled requests: nothing here reveals who asked before. */
export const POST: APIRoute = async ({ request, url }) => {
  if (!isSameOriginWrite(request, url)) return new Response('Cross-site request refused.', { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' });
  }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' });
  const parsed = parseSignup(body);
  if (!parsed.ok) return json({ error: parsed.error });
  const ip = clientIp(request);
  if (!(await verifyTurnstile(String(body.turnstileToken ?? ''), ip))) return json({ error: 'The captcha check failed. Try again.' });

  const db = siteDb();
  const now = nowS();
  const id = await createSignupRequest(db, parsed.value, ip, now);
  if (id && env.CONTACT_TO_EMAIL) waitUntil(sendMail(db, env, ownerSignupMail(env.CONTACT_TO_EMAIL, parsed.value, url.origin), now, OTP.OWNER_MAILS_UNTIL));
  return json({ ok: true });
};
