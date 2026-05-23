import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

interface ContactBody {
  name?: string;
  email?: string;
  message?: string;
  turnstileToken?: string;
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeSubjectValue(str: string) {
  return str.replace(/[\r\n]+/g, ' ').trim();
}

async function verifyTurnstile(token: string, secret: string, ip: string) {
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  if (ip) formData.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = locals.runtime;
  const env = runtime?.env as Env | undefined;

  if (!env?.RESEND_API_KEY || !env?.CONTACT_TO_EMAIL || !env?.TURNSTILE_SECRET_KEY) {
    return json({ error: 'Server not configured.' }, 500);
  }

  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const name = body.name?.trim() ?? '';
  const email = body.email?.trim() ?? '';
  const message = body.message?.trim() ?? '';
  const turnstileToken = body.turnstileToken ?? '';

  if (!name || name.length > 100) return json({ error: 'Name is required (max 100 chars).' }, 422);
  if (!email || !isValidEmail(email)) return json({ error: 'Valid email is required.' }, 422);
  if (!message || message.length > 2000) return json({ error: 'Message is required (max 2000 chars).' }, 422);
  if (!turnstileToken) return json({ error: 'Captcha verification required.' }, 422);

  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '';
  const turnstileOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);
  if (!turnstileOk) return json({ error: 'Captcha verification failed.' }, 422);

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: '3DreamLab <contact@3dreamlab.com>',
    to: [env.CONTACT_TO_EMAIL],
    replyTo: email,
    subject: `3DreamLab inquiry from ${sanitizeSubjectValue(name)}`,
    html: `
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
    `,
  });

  if (error) {
    console.error('Resend error:', error);
    return json({ error: 'Failed to send message.' }, 500);
  }

  return json({ ok: true });
};
