// Brute-force guard for /dashboard logins. Only failed attempts that carried
// credentials count: 3 per minute per IP (Workers Rate Limiting binding), then
// a 30-minute lockout flag in the edge cache. While locked out, even correct
// credentials get 429, so a guess can't be confirmed.
// ponytail: binding and Cache API are both per Cloudflare location; add a zone
// WAF rate-limiting rule if attempts ever spread across many locations.
export const LOCKOUT_S = 1800;

type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
type CacheLike = Pick<Cache, 'match' | 'put'>;

const lockKey = (origin: string, ip: string) => `${origin}/__dashboard-lockout/${encodeURIComponent(ip)}`;

export async function isLockedOut(origin: string, ip: string, cache: CacheLike): Promise<boolean> {
  return (await cache.match(lockKey(origin, ip))) !== undefined;
}

/** Counts one failed login; true once this IP is over the limit (and now locked out). */
export async function recordFailure(origin: string, ip: string, limiter: Limiter | undefined, cache: CacheLike): Promise<boolean> {
  if (!limiter) return false;
  const { success } = await limiter.limit({ key: `dashboard-auth:${ip}` });
  if (success) return false;
  await cache.put(lockKey(origin, ip), new Response('locked', { headers: { 'Cache-Control': `max-age=${LOCKOUT_S}` } }));
  return true;
}
