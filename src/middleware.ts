import { defineMiddleware } from 'astro:middleware';
import type { APIContext, MiddlewareNext } from 'astro';
import { env } from 'cloudflare:workers';
import { createRemoteJWKSet } from 'jose';
import { authorize, type AuthEnv } from './lib/dashboard/auth';
import { LOCKOUT_S, isLockedOut, recordFailure } from './lib/dashboard/ratelimit';
import { takeFlash } from './lib/dashboard/edge';
import { appRoute, isSameOriginWrite } from './lib/app/paths';
import { SESSION_COOKIE, readSession } from './lib/app/session';
import { nowS, siteDb } from './lib/app/site';
import { takeAppFlash } from './lib/app/flash';

const PRIVATE = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };

// No WWW-Authenticate: the browser shouldn't keep prompting while locked out.
const tooMany = () =>
  new Response('Too many failed logins. Try again in 30 minutes.', {
    status: 429,
    headers: { ...PRIVATE, 'Retry-After': String(LOCKOUT_S) },
  });

function isDashboard(pathname: string, routePattern: string) {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {}
  p = p.toLowerCase();
  return p === '/dashboard' || p.startsWith('/dashboard/') || routePattern.startsWith('/dashboard');
}

const withPrivate = (upstream: Response) => {
  // Copy: some responses (e.g. Response.redirect) have immutable headers.
  const res = new Response(upstream.body, upstream);
  for (const [k, v] of Object.entries(PRIVATE)) res.headers.set(k, v);
  return res;
};

// Customer console: login/verify/logout are public, everything else needs an app session.
async function app(ctx: APIContext, next: MiddlewareNext): Promise<Response> {
  const route = appRoute(ctx.url.pathname, ctx.routePattern);
  if (!isSameOriginWrite(ctx.request, ctx.url)) return new Response('Cross-site request refused.', { status: 403, headers: PRIVATE });
  if (route === 'private') {
    const customer = await readSession(siteDb(), ctx.cookies.get(SESSION_COOKIE)?.value, nowS());
    if (!customer) return new Response(null, { status: 303, headers: { ...PRIVATE, Location: '/app/login' } });
    ctx.locals.customer = customer;
    ctx.locals.flash = takeAppFlash(ctx.cookies);
  }
  return withPrivate(await next());
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (appRoute(ctx.url.pathname, ctx.routePattern) !== 'none') return app(ctx, next);
  if (!isDashboard(ctx.url.pathname, ctx.routePattern)) return next();

  const ip = ctx.request.headers.get('cf-connecting-ip') ?? 'unknown';
  const cache = await caches.open('dashboard-lockout');
  if (await isLockedOut(ctx.url.origin, ip, cache)) return tooMany();

  // DEV-only: point Access mode at a local JWKS. Vite folds DEV to false in production builds.
  const devJwks = import.meta.env.DEV && (env as AuthEnv & { ACCESS_DEV_JWKS_URL?: string }).ACCESS_DEV_JWKS_URL;
  const auth = await authorize(ctx.request, env, devJwks ? createRemoteJWKSet(new URL(devJwks)) : undefined);
  if (!auth.ok) {
    // Only attempts that carried credentials count; the first challenge round-trip doesn't.
    const tried = ctx.request.headers.has('authorization') || ctx.request.headers.has('cf-access-jwt-assertion');
    if (tried && (await recordFailure(ctx.url.origin, ip, env.DASHBOARD_AUTH_LIMITER, cache))) return tooMany();
    // Access mode: same page as Access's own block page; no challenge, so no basic-auth prompt.
    if (auth.mode === 'access') return new Response(null, { status: 302, headers: { ...PRIVATE, Location: '/denied/' } });
    return new Response('Authentication required.', {
      status: 401,
      headers: { ...PRIVATE, 'WWW-Authenticate': 'Basic realm="3DreamLab Edge", charset="UTF-8"' },
    });
  }
  ctx.locals.user = auth.user;
  // Read the one-shot toast here: by the time the layout renders, headers may be sent.
  ctx.locals.flash = takeFlash(ctx.cookies);

  // Copy: some responses (e.g. Response.redirect) have immutable headers.
  const upstream = await next();
  const res = new Response(upstream.body, upstream);
  for (const [k, v] of Object.entries(PRIVATE)) res.headers.set(k, v);
  return res;
});
