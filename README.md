# 3DreamLab

Agency one-pager built with [Astro](https://astro.build) and deployed on [Cloudflare Workers](https://developers.cloudflare.com/workers/). Includes a contact form backed by Resend and Cloudflare Turnstile.

## What it is

Single-page site for 3DreamLab — hero, services, infrastructure, and contact sections. The contact form POSTs to `/api/contact`, which verifies Turnstile and sends email via Resend.

## Dev

```bash
pnpm install   # may need: pnpm approve-builds
pnpm dev       # or: npx astro dev
```

Open [http://localhost:4321](http://localhost:4321).

## Build

```bash
npx astro build
```

Output goes to `./dist/`.

## Deploy

```bash
pnpm deploy    # or: wrangler deploy
```

## Secrets setup

### Local development

Copy the example env file and fill in your values:

```bash
cp .dev.vars.example .dev.vars
```

### Production secrets

Set via Wrangler (the top-level config in `wrangler.json` is production, worker `astro-front-production`):

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put CONTACT_TO_EMAIL
wrangler secret put PUBLIC_TURNSTILE_SITE_KEY
```

For local dev, copy `.dev.vars.example` to `.dev.vars` and fill in all four values (including `PUBLIC_TURNSTILE_SITE_KEY`).

### Dashboard (`/dashboard`, private)

Basic auth in `src/middleware.ts` (one function in `src/lib/dashboard/auth.ts`), `noindex`, not in the sitemap. Mock data only (`src/lib/dashboard/mock.ts`) until the edge-cache worker exists. Fails closed: without both secrets every `/dashboard*` request gets 401.

```bash
wrangler secret put DASHBOARD_USER
wrangler secret put DASHBOARD_PASS
```

Local: add both to `.dev.vars`. Checks: `pnpm test` (mock data) and `DASHBOARD_USER=… DASHBOARD_PASS=… node scripts/check-dashboard-auth.mjs <baseUrl>` against `pnpm preview` or a deployed version.

### External setup

- **Resend:** Verify `3dreamlab.com` as a sending domain.
- **Turnstile:** Create a widget for `3dreamlab.com` in the Cloudflare dashboard.

## Commands

| Command | Action |
| :------ | :----- |
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm deploy` | Deploy to Cloudflare Workers |
| `pnpm check` | Build + typecheck + dry-run deploy |
