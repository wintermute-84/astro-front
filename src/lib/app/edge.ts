// Every /app call to the edge-cache EdgeCustomerRPC entrypoint goes through here: a missing
// binding or a rejected call becomes an error state, never a 500. userId always comes from
// the session (locals.customer), never from the request.
import { env } from 'cloudflare:workers';
import type { AstroCookies } from 'astro';
import { NOT_FOUND, type CustomerApi, type TenantView, type Verification } from './contract.ts';
import { errorText, type Result } from '../dashboard/edge.ts';
import { pickProject } from './forms.ts';

export async function crpc<T>(fn: (api: CustomerApi) => Promise<T>): Promise<Result<T>> {
  const api = (env as { EDGE_CUSTOMER?: unknown }).EDGE_CUSTOMER as CustomerApi | undefined;
  if (!api) return { ok: false, error: 'The project service is not available yet.' };
  try {
    return { ok: true, data: await fn(api) };
  } catch (e) {
    const msg = errorText(e);
    return { ok: false, error: msg === NOT_FOUND ? 'Project not found.' : msg };
  }
}

/** The user's projects and the selected one (?p= must be one of them; default: first). */
export async function currentProject(userId: string, url: URL): Promise<Result<{ projects: TenantView[]; project: TenantView | null }>> {
  const r = await crpc((api) => api.listMyProjects(userId));
  if (!r.ok) return r;
  return { ok: true, data: { projects: r.data, project: pickProject(r.data, url.searchParams.get('p')) } };
}

// The verification token is stored hashed at the edge, so the copy shown at creation (or after
// "new token") is kept in an HttpOnly cookie for the instructions page. Lost it → rotate.
const VERIFY = 'app_verify';
type Saved = { slug: string; originId: string; v: Verification };

export function saveVerification(cookies: AstroCookies, s: Saved) {
  cookies.set(VERIFY, JSON.stringify(s), { path: '/app', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 14 * 86400 });
}

export function readVerification(cookies: AstroCookies, slug: string, originId: string): Verification | null {
  try {
    const s = JSON.parse(cookies.get(VERIFY)?.value ?? 'null') as Saved | null;
    return s && s.slug === slug && s.originId === originId ? s.v : null;
  } catch {
    return null;
  }
}

export function clearVerification(cookies: AstroCookies) {
  cookies.delete(VERIFY, { path: '/app' });
}
