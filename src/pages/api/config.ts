import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime?.env as Env | undefined;

  return new Response(
    JSON.stringify({
      turnstileSiteKey: env?.PUBLIC_TURNSTILE_SITE_KEY ?? '',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
