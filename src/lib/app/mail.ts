// All /signup + /app mail: Resend REST API, sender login@3dreamlab.com, key RESEND_OTP_API_KEY.
// Every send counts toward OTP.MAILS_PER_DAY (Resend free: 100/day per account, shared with the contact form).
import { OTP, logEvent, mailsToday } from './otp.ts';

export type Mail = { to: string; subject: string; text: string; replyTo?: string };
export type MailEnv = { RESEND_OTP_API_KEY?: string };

const FROM = '3DreamLab <login@3dreamlab.com>';

/** true when Resend accepted it. Never throws; failures are logged without the recipient. */
export async function sendMail(db: D1Database, env: MailEnv, mail: Mail, now: number, fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!env.RESEND_OTP_API_KEY) {
    console.warn('mail skipped: RESEND_OTP_API_KEY not set');
    return false;
  }
  if ((await mailsToday(db, now)) >= OTP.MAILS_PER_DAY) {
    console.warn(`mail skipped: daily cap ${OTP.MAILS_PER_DAY} reached`);
    return false;
  }
  await logEvent(db, 'mail', null, null, now).run();
  try {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_OTP_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.replyTo && { reply_to: mail.replyTo }) }),
    });
    if (!res.ok) console.error(`Resend error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.ok;
  } catch (e) {
    console.error('Resend fetch failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

export const codeMail = (to: string, code: string): Mail => ({
  to,
  subject: `${code} is your 3DreamLab login code`,
  text: `Your 3DreamLab login code is ${code}\n\nIt expires in 5 minutes and works once, in the browser where you asked for it.\nIf you didn't try to log in, ignore this email.\n\n3DreamLab · https://3dreamlab.com`,
});

export const approvedMail = (to: string, origin: string): Mail => ({
  to,
  subject: "You're in: 3DreamLab Edge preview",
  text: `Your request for the 3DreamLab Edge preview is approved.\n\nLog in with this email address (we send a one-time code, no password):\n${origin}/app/login\n\nThe preview is free and best effort, see ${origin}/terms/\nQuestions: just reply to this email.\n\n3DreamLab`,
});

export const ownerSignupMail = (to: string, r: { email: string; plan: string; company: string | null; note: string | null }, origin: string): Mail => ({
  to,
  replyTo: r.email,
  subject: oneLine(`Edge preview request: ${r.plan} from ${r.email}`),
  text: `New preview request\n\nEmail: ${r.email}\nTier: ${r.plan}\nCompany: ${r.company ?? '-'}\nNote:\n${r.note ?? '-'}\n\nApprove or reject: ${origin}/dashboard/signups`,
});

export const ownerUpgradeMail = (to: string, u: { email: string; slug: string; plan: string }, origin: string): Mail => ({
  to,
  replyTo: u.email,
  subject: oneLine(`Edge upgrade request: ${u.slug} → ${u.plan}`),
  text: `${u.email} asked to move project ${u.slug} to ${u.plan}.\n\nInvoice manually, then set the plan: ${origin}/dashboard/signups`,
});
