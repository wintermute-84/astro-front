import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { createRemoteJWKSet } from 'jose';
import { authorize, type AuthEnv } from './lib/dashboard/auth';

const PRIVATE = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };

function isDashboard(pathname: string, routePattern: string) {
  let p = pathname;
  try {
    p = decodeURIComponent(pathname);
  } catch {}
  p = p.toLowerCase();
  return p === '/dashboard' || p.startsWith('/dashboard/') || routePattern.startsWith('/dashboard');
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (!isDashboard(ctx.url.pathname, ctx.routePattern)) return next();

  // DEV-only: point Access mode at a local JWKS. Vite folds DEV to false in production builds.
  const devJwks = import.meta.env.DEV && (env as AuthEnv & { ACCESS_DEV_JWKS_URL?: string }).ACCESS_DEV_JWKS_URL;
  const auth = await authorize(ctx.request, env, devJwks ? createRemoteJWKSet(new URL(devJwks)) : undefined);
  if (!auth.ok) {
    // Access mode: plain 403, no challenge, so browsers don't pop a basic-auth prompt.
    if (auth.mode === 'access') return new Response('Forbidden.', { status: 403, headers: PRIVATE });
    return new Response('Authentication required.', {
      status: 401,
      headers: { ...PRIVATE, 'WWW-Authenticate': 'Basic realm="3DreamLab Edge", charset="UTF-8"' },
    });
  }
  ctx.locals.user = auth.user;

  // Copy: some responses (e.g. Response.redirect) have immutable headers.
  const upstream = await next();
  const res = new Response(upstream.body, upstream);
  for (const [k, v] of Object.entries(PRIVATE)) res.headers.set(k, v);
  return res;
});
