import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY ?? '',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
