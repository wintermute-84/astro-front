// Which requests the /app middleware branch handles, and which of those skip the session check.
const PUBLIC = new Set(['/app/login', '/app/verify', '/app/logout']);

const norm = (p: string) => {
  try {
    p = decodeURIComponent(p);
  } catch {}
  return p.toLowerCase().replace(/\/+$/, '') || '/';
};

/** 'none' = not /app; 'public' = login/verify/logout; 'private' = needs a session (incl. unknown /app paths). */
export function appRoute(pathname: string, routePattern: string): 'none' | 'public' | 'private' {
  const p = norm(pathname);
  const under = (x: string) => x === '/app' || x.startsWith('/app/');
  if (!(under(p) || under(routePattern))) return 'none';
  // Public only when the matched route AND the path agree, so odd encodings fall to 'private'.
  return PUBLIC.has(routePattern.replace(/\/+$/, '')) && PUBLIC.has(p) ? 'public' : 'private';
}

/**
 * CSRF belt on top of Astro's checkOrigin (which skips requests without Origin/Sec-Fetch-Site
 * and non-form content types): unsafe methods must come from this origin.
 */
export function isSameOriginWrite(req: Request, url: URL): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  return req.headers.get('origin') === url.origin;
}
