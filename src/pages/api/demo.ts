import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { EdgeCacheApi } from '../../lib/dashboard/contract';
import { parseDemoInput } from '../../lib/demo';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });

const SLOW_DOWN = 'Easy there. The demo allows 30 calls a minute, try again shortly.';

export const POST: APIRoute = async ({ request }) => {
  // ponytail: per-location limiter (like the dashboard one); add a WAF rule if abuse spreads across locations.
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (env.DEMO_IP_LIMITER && !(await env.DEMO_IP_LIMITER.limit({ key: `demo:${ip}` })).success) {
    return json({ error: SLOW_DOWN }, 429);
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Expected JSON.' }, 415);
  const text = await request.text();
  if (text.length > 200) return json({ error: 'Bad request.' }, 400);
  let input;
  try {
    input = parseDemoInput(JSON.parse(text));
  } catch {}
  if (!input) return json({ error: 'Bad request.' }, 400);

  const edge = env.EDGE_CACHE as unknown as EdgeCacheApi | undefined;
  if (!edge) return json({ error: 'Demo backend is not connected.' }, 503);
  try {
    const r = await edge.demoCall(input);
    // edge-cache has its own per-location limit and reports it as status 429.
    if (r.status === 429) return json({ error: SLOW_DOWN }, 429);
    return json({ outcome: r.outcome, status: r.status, ms: r.ms });
  } catch (e) {
    console.error(JSON.stringify({ msg: 'demoCall failed', error: String(e) }));
    return json({ error: 'Demo backend error. Try again in a moment.' }, 502);
  }
};
