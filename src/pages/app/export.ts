import type { APIRoute } from 'astro';
import { crpc } from '../../lib/app/edge';
import { siteDb } from '../../lib/app/site';
import { setAppFlash } from '../../lib/app/flash';

export const prerender = false;

/** GDPR export: the site account plus every project's export from the edge, as one JSON download. */
export const GET: APIRoute = async ({ locals, cookies, redirect }) => {
  const fail = (msg: string) => (setAppFlash(cookies, { kind: 'err', message: msg }), redirect('/app/settings', 303));
  const me = locals.customer!;
  const db = siteDb();
  const account = await db.prepare('SELECT id, email, created_at, last_login_at FROM users WHERE id = ?').bind(me.userId).first();
  const access = await db.prepare('SELECT plan, approved_at FROM preview_allowlist WHERE email = ?').bind(me.email).first();
  const requests = (await db.prepare('SELECT plan, company, note, status, created_at, decided_at FROM signup_requests WHERE email = ?').bind(me.email).all()).results;
  const list = await crpc((api) => api.listMyProjects(me.userId));
  if (!list.ok) return fail(`Export failed: ${list.error}`);
  const projects = [];
  for (const p of list.data) {
    const r = await crpc((api) => api.exportProject(me.userId, p.slug));
    if (!r.ok) return fail(`Export of ${p.slug} failed: ${r.error}`);
    projects.push(r.data);
  }
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), account, access, signupRequests: requests, projects }, null, 2);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="3dreamlab-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
};
