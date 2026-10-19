// One-shot toast for /app POST → redirect (same idea as the dashboard's, scoped to /app).
import type { AstroCookies } from 'astro';
import type { Flash } from '../dashboard/edge';

const FLASH = 'app_flash';

export function setAppFlash(cookies: AstroCookies, flash: Flash) {
  cookies.set(FLASH, JSON.stringify(flash), { path: '/app', httpOnly: true, sameSite: 'strict', secure: true, maxAge: 60 });
}

export function takeAppFlash(cookies: AstroCookies): Flash | null {
  const raw = cookies.get(FLASH)?.value;
  if (!raw) return null;
  cookies.delete(FLASH, { path: '/app' });
  try {
    const f = JSON.parse(raw);
    return (f.kind === 'ok' || f.kind === 'err') && typeof f.message === 'string' ? f : null;
  } catch {
    return null;
  }
}
