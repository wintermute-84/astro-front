import { handle } from '@astrojs/cloudflare/handler';
import { hostRoute } from './lib/storeHost';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const route = hostRoute(new URL(request.url));
    if (route && 'redirect' in route) return Response.redirect(route.redirect, 301);
    if (route) return env.ASSETS.fetch(new Request(new URL(route.rewrite, request.url), request));
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
