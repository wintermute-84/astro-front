// /signup requests and the owner's approval (allowlist) in /dashboard/signups.
import { countEvents, logEvent, normEmail, randomHex } from './otp.ts';

export const PLAN_IDS = ['free', 'starter', 'pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const isPlan = (p: unknown): p is PlanId => PLAN_IDS.includes(p as PlanId);

/** Mirror of edge-cache PLANS (contract doc); used for copy and the site-side project cap. */
export const PLANS: Record<PlanId, { label: string; price: string; perDay: number; projects: number; origins: number; rules: number; metricsDays: number; purgesPerDay: number; methods: string; support: string }> = {
  free: { label: 'Free preview', price: '€0', perDay: 1000, projects: 1, origins: 1, rules: 3, metricsDays: 7, purgesPerDay: 3, methods: 'GET, HEAD', support: 'Docs' },
  starter: { label: 'Starter', price: '€99/mo', perDay: 10000, projects: 1, origins: 3, rules: 10, metricsDays: 30, purgesPerDay: 200, methods: 'GET, HEAD, POST reads', support: 'Email, best effort' },
  pro: { label: 'Pro', price: '€299/mo', perDay: 100000, projects: 3, origins: 10, rules: 30, metricsDays: 30, purgesPerDay: 1000, methods: 'GET, HEAD, POST reads', support: '1 business day' },
};

export type SignupInput = { email: string; plan: PlanId; company: string | null; note: string | null };
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseSignup(body: Record<string, unknown>): Parsed<SignupInput> {
  const email = normEmail(body.email);
  const company = String(body.company ?? '').trim();
  const note = String(body.note ?? '').trim();
  if (!email) return { ok: false, error: 'Enter a valid email address.' };
  if (!isPlan(body.plan)) return { ok: false, error: 'Pick a tier.' };
  if (company.length > 100) return { ok: false, error: 'Company: max 100 characters.' };
  if (note.length > 1000) return { ok: false, error: 'Project note: max 1000 characters.' };
  if (body.consent !== true) return { ok: false, error: 'Please accept the privacy notice and terms.' };
  return { ok: true, value: { email, plan: body.plan, company: company || null, note: note || null } };
}

export const SIGNUPS_PER_IP_HOUR = 5;

/** Stores the request unless it's a duplicate or the IP is over its cap. Returns the row id when a new row was made. */
export async function createSignupRequest(db: D1Database, v: SignupInput, ip: string, now: number): Promise<string | null> {
  const ipCount = await countEvents(db, 'signup_req', 'ip', ip, now - 3600);
  await logEvent(db, 'signup_req', v.email, ip, now).run();
  if (ipCount >= SIGNUPS_PER_IP_HOUR) return null;
  const open = await db
    .prepare("SELECT 1 AS x FROM signup_requests WHERE email = ? AND status = 'pending' UNION ALL SELECT 1 FROM preview_allowlist WHERE email = ?")
    .bind(v.email, v.email)
    .first();
  if (open) return null;
  const id = `req_${randomHex(8)}`;
  await db
    .prepare('INSERT INTO signup_requests (id, email, plan, company, note, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, v.email, v.plan, v.company, v.note, ip, now)
    .run();
  return id;
}

export type SignupRow = { id: string; email: string; plan: PlanId; company: string | null; note: string | null; status: string; created_at: number; decided_at: number | null };

export async function listSignupRequests(db: D1Database): Promise<SignupRow[]> {
  const r = await db
    .prepare("SELECT id, email, plan, company, note, status, created_at, decided_at FROM signup_requests ORDER BY status = 'pending' DESC, created_at DESC LIMIT 200")
    .all<SignupRow>();
  return r.results;
}

export async function listAllowlist(db: D1Database) {
  return (await db.prepare('SELECT email, plan, approved_at FROM preview_allowlist ORDER BY approved_at DESC LIMIT 200').all<{ email: string; plan: PlanId; approved_at: number }>()).results;
}

/** Approve a pending request: allowlist the email on `plan`. Returns the email, or null if not pending. */
export async function approveRequest(db: D1Database, id: string, plan: PlanId, now: number): Promise<string | null> {
  const row = await db.prepare("SELECT email FROM signup_requests WHERE id = ? AND status = 'pending'").bind(id).first<string>('email');
  if (!row) return null;
  await db.batch([
    db.prepare("UPDATE signup_requests SET status = 'approved', decided_at = ? WHERE id = ?").bind(now, id),
    db
      .prepare('INSERT INTO preview_allowlist (email, plan, approved_at, request_id) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO UPDATE SET plan = excluded.plan')
      .bind(row, plan, now, id),
  ]);
  return row;
}

export async function rejectRequest(db: D1Database, id: string, now: number): Promise<boolean> {
  const r = await db.prepare("UPDATE signup_requests SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'").bind(now, id).run();
  return r.meta.changes === 1;
}

export async function allowlistPlan(db: D1Database, email: string): Promise<PlanId> {
  const p = await db.prepare('SELECT plan FROM preview_allowlist WHERE email = ?').bind(email).first<string>('plan');
  return isPlan(p) ? p : 'free';
}
