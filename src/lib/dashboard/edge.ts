import { env } from 'cloudflare:workers';
import type { AstroCookies } from 'astro';
import type { EdgeCacheApi } from './contract';
import { list } from './forms';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Every dashboard call to the edge-cache worker goes through here, so a missing
 * binding or a thrown RPC error becomes an error state on the page, never a 500.
 */
export async function rpc<T>(fn: (api: EdgeCacheApi) => Promise<T>): Promise<Result<T>> {
  const api = env.EDGE_CACHE as unknown as EdgeCacheApi | undefined;
  if (!api) return { ok: false, error: 'EDGE_CACHE service binding is missing.' };
  try {
    return { ok: true, data: await fn(api) };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** RPC rejections keep the worker's ValidationError message; strip any "Error:" prefix. */
export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^(?:\w*Error: )+/, '') || 'Unknown error.';
}

// One-shot toast after a POST → redirect. Cookie, not query string, so a link can't inject text.
export type Flash = { kind: 'ok' | 'err'; message: string };
const FLASH = 'dash_flash';

export function setFlash(cookies: AstroCookies, flash: Flash) {
  cookies.set(FLASH, JSON.stringify(flash), { path: '/dashboard', httpOnly: true, sameSite: 'strict', secure: true, maxAge: 60 });
}

export function takeFlash(cookies: AstroCookies): Flash | null {
  const raw = cookies.get(FLASH)?.value;
  if (!raw) return null;
  cookies.delete(FLASH, { path: '/dashboard' });
  try {
    const f = JSON.parse(raw);
    return (f.kind === 'ok' || f.kind === 'err') && typeof f.message === 'string' ? f : null;
  } catch {
    return null;
  }
}

/** Purge from the confirm dialog: the typed slug must match, empty tags = whole tenant ("*"). */
export async function purgeAction(fd: FormData, slug: string, actor: string): Promise<Flash> {
  if (String(fd.get('confirm') ?? '').trim() !== slug) return { kind: 'err', message: `Purge cancelled: type ${slug} to confirm.` };
  const tags = list(String(fd.get('tags') ?? ''));
  const r = await rpc((api) => api.purge(slug, tags.length ? tags : ['*'], actor));
  if (!r.ok) return { kind: 'err', message: `Purge rejected: ${r.error}` };
  if (r.data.result === 'ERR') return { kind: 'err', message: `Purge for ${slug} failed: ${r.data.detail ?? 'unknown error'}. Logged.` };
  return { kind: 'ok', message: `Purged ${r.data.tags.join(', ')} for ${slug}.` };
}
