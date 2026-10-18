// The one place dashboard auth is decided.
//   ACCESS_TEAM_DOMAIN + ACCESS_AUD set -> Cloudflare Access JWT only (basic auth ignored)
//   otherwise                            -> basic auth (local dev, or prod before Access exists)
//   nothing usable configured            -> deny
// Workers with static assets get no `ctx.access`, so the JWT is verified here.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type DashboardUser = { email: string; via: 'access' | 'basic' };

export type AuthEnv = {
  DASHBOARD_USER?: string;
  DASHBOARD_PASS?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
};

/** `mode` tells the caller which denial response to send (401 + challenge vs plain 403). */
export type AuthResult = { ok: true; user: DashboardUser } | { ok: false; mode: 'access' | 'basic' };

const enc = new TextEncoder();
const sha256 = (s: string) => crypto.subtle.digest('SHA-256', enc.encode(s));

export async function checkBasicAuth(header: string | null, user?: string, pass?: string): Promise<boolean> {
  if (!user || !pass || !header?.startsWith('Basic ')) return false;
  let given: string;
  try {
    given = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  // Hash both sides: fixed 32-byte digests, compared without early exit.
  const [a, b] = (await Promise.all([sha256(given), sha256(`${user}:${pass}`)])).map((d) => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// One JWKS fetcher per team domain per isolate; jose caches keys and refetches on unknown `kid`.
const jwksByTeam = new Map<string, JWTVerifyGetKey>();
function remoteKeys(team: string) {
  let keys = jwksByTeam.get(team);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    jwksByTeam.set(team, keys);
  }
  return keys;
}

/** Verified Access email, or null. Any failure (bad token, JWKS fetch error) means null. */
async function accessEmail(token: string | null, team: string, aud: string, keys: JWTVerifyGetKey) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: `https://${team}`, audience: aud, algorithms: ['RS256'] });
    return typeof payload.email === 'string' && payload.email ? payload.email : null;
  } catch {
    return null;
  }
}

/** `keys` overrides the remote JWKS: unit tests and the DEV-only local hook, never set in prod. */
export async function authorize(req: Request, env: AuthEnv, keys?: JWTVerifyGetKey): Promise<AuthResult> {
  // Accept "team.cloudflareaccess.com" or "https://team.cloudflareaccess.com/".
  const team = env.ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (team && env.ACCESS_AUD) {
    const email = await accessEmail(req.headers.get('cf-access-jwt-assertion'), team, env.ACCESS_AUD, keys ?? remoteKeys(team));
    return email ? { ok: true, user: { email, via: 'access' } } : { ok: false, mode: 'access' };
  }
  if (await checkBasicAuth(req.headers.get('authorization'), env.DASHBOARD_USER, env.DASHBOARD_PASS)) {
    return { ok: true, user: { email: env.DASHBOARD_USER!, via: 'basic' } };
  }
  return { ok: false, mode: 'basic' };
}
