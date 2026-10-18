import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { checkBasicAuth } from './lib/dashboard/auth';

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

  const ok = await checkBasicAuth(ctx.request.headers.get('authorization'), env.DASHBOARD_USER, env.DASHBOARD_PASS);
  if (!ok) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { ...PRIVATE, 'WWW-Authenticate': 'Basic realm="3DreamLab Edge", charset="UTF-8"' },
    });
  }

  // Copy: some responses (e.g. Response.redirect) have immutable headers.
  const upstream = await next();
  const res = new Response(upstream.body, upstream);
  for (const [k, v] of Object.entries(PRIVATE)) res.headers.set(k, v);
  return res;
});
