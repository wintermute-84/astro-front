import type { APIRoute } from 'astro';
import { SESSION_COOKIE, endAllSessions, readSession } from '../../lib/app/session';
import { nowS, siteDb } from '../../lib/app/site';

export const prerender = false;

/** POST only (the middleware refuses cross-site posts). Ends every session of the user, on every device. */
export const POST: APIRoute = async ({ cookies, redirect }) => {
  const db = siteDb();
  const me = await readSession(db, cookies.get(SESSION_COOKIE)?.value, nowS());
  if (me) await endAllSessions(db, me.userId);
  cookies.delete(SESSION_COOKIE, { path: '/app' });
  return redirect('/app/login', 303);
};
