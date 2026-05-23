# 3DreamLab Agency One-Pager — Design Spec

**Date:** 2026-05-23  
**Status:** Approved  
**Domain:** https://3dreamlab.com

## Goal

Replace the Astro blog starter with a single-page agency site for 3DreamLab — fast e-commerce, integrations, and Cloudflare edge infrastructure. Minimal brutalist aesthetic inspired by editorial/Swiss poster design.

## Page Structure

Single route: `src/pages/index.astro`. No blog, about, RSS, or content collections.

### Fixed navigation

- Position: fixed top, full width
- Left: `3DREAMLAB` wordmark (links to top)
- Right: `Contact` anchor (scrolls to Section 4)
- Behavior: transparent over hero; transitions to solid `#0A0A0A` background after ~100px scroll

### Sections

| # | ID | Height | Background | Headline | Body |
|---|-----|--------|------------|----------|------|
| 1 | `hero` | ~60vh | `/LIGHT.jpg` + `rgba(245,245,245,0.82)` overlay | **FAST COMMERCE** | Lightning-fast e-commerce sites. Zero bloat. Built to convert. |
| 2 | `services` | ~65vh | `#FF2400` solid | **WHAT WE DO** | A–D list with 1px dividers (see Services copy) |
| 3 | `infra` | ~60vh | `/HEAD.jpeg` + `rgba(0,0,0,0.72)` overlay | **EDGE INFRA** | Cloudflare Workers, CDN, D1, R2. Global performance out of the box. |
| 4 | `contact` | ~55vh | `#0A0A0A` solid | **LET'S BUILD** | Contact form (see Contact) |

### Services list (Section 2)

| Label | Text |
|-------|------|
| A | E-commerce storefronts |
| B | Payment & checkout integrations |
| C | ERP · CRM · inventory sync |
| D | Headless & custom builds |

### Metadata accents

Small monospace labels in section corners (decorative, not interactive):

- Section 1: `#F5F5F5 · LIGHT.jpg`
- Section 2: `#FF2400`
- Section 3: `HEAD.jpeg · edge` + `latency <50ms · 300+ PoPs · 100/100 LH`

## Visual Design

### Typography

- **Headings:** Bold condensed sans — **Syne** (Google Fonts, weights 700/800)
- **Body:** System UI stack (`system-ui, sans-serif`)
- **Metadata:** Monospace (`ui-monospace, monospace`)
- Headings: oversized, `line-height: 0.85–0.9`, tight negative letter-spacing, deliberate line breaks

### Color palette

| Token | Value | Usage |
|-------|-------|-------|
| `--red` | `#FF2400` | Services section, CTA button |
| `--black` | `#0A0A0A` | Contact section, nav scrolled |
| `--white` | `#FFFFFF` | Text on dark backgrounds |
| `--overlay-light` | `rgba(245,245,245,0.82)` | Hero image mute |
| `--overlay-dark` | `rgba(0,0,0,0.72)` | Infra image mute |

### Motion

- **Scroll reveal:** Intersection Observer adds `.visible` class → `opacity` + `translateY` transition on headings (CSS, ~600ms ease-out)
- **Parallax:** Background images translate Y by ~5% relative to scroll (minimal JS in `index.astro` or small inline script)
- **No** animation libraries

### Form styling

- Bottom-border inputs (no boxes), uppercase micro-labels
- Red `#FF2400` submit button with black text
- Success state replaces form with **MESSAGE SENT** heading (white)
- No email address displayed anywhere on the site

## Contact Form & Email Backend

### Form fields

- Name (required, max 100 chars)
- Email (required, valid format)
- Message (required, max 2000 chars)
- Cloudflare Turnstile widget (required)

### API endpoint

`POST /api/contact` — Astro server endpoint, `export const prerender = false`

**Request body (JSON):**
```json
{
  "name": "Jane Doe",
  "email": "jane@company.com",
  "message": "We need a Shopify rebuild.",
  "turnstileToken": "..."
}
```

**Success response:** `{ "ok": true }`  
**Error response:** `{ "error": "Human-readable message" }` with appropriate HTTP status (400, 422, 500)

### Processing flow

1. Parse and validate JSON body
2. Verify Turnstile token via Cloudflare siteverify API (`TURNSTILE_SECRET_KEY`)
3. Send email via Resend SDK:
   - `from`: `contact@3dreamlab.com` (verified domain in Resend)
   - `to`: value of `CONTACT_TO_EMAIL` secret (private inbox)
   - `reply_to`: submitter's email
   - `subject`: `3DreamLab inquiry from {name}`
   - `html`: formatted name, email, message
4. Return JSON response

### Secrets (Wrangler / `.dev.vars`)

| Variable | Exposure | Purpose |
|----------|----------|---------|
| `RESEND_API_KEY` | Secret | Resend API authentication |
| `TURNSTILE_SECRET_KEY` | Secret | Server-side Turnstile verification |
| `CONTACT_TO_EMAIL` | Secret | Private inbox destination |
| `PUBLIC_TURNSTILE_SITE_KEY` | Public env | Turnstile widget site key |

Set production secrets via `wrangler secret put`. Local dev via `.dev.vars` (gitignored).

## File Changes

### Remove

- `src/content/blog/` (all posts)
- `src/content.config.ts`
- `src/pages/blog/` (index + slug)
- `src/pages/about.astro`
- `src/pages/rss.xml.js`
- `src/layouts/BlogPost.astro`
- `src/components/FormattedDate.astro`
- `src/components/Header.astro`, `HeaderLink.astro`, `Footer.astro`
- Dependencies: `@astrojs/mdx`, `@astrojs/rss`

### Add

- `src/components/Nav.astro`
- `src/components/sections/Hero.astro`
- `src/components/sections/Services.astro`
- `src/components/sections/Infra.astro`
- `src/components/sections/Contact.astro`
- `src/pages/api/contact.ts`
- `src/scripts/reveal.ts` (scroll reveal + parallax)

### Modify

- `src/pages/index.astro` — compose all sections
- `src/styles/global.css` — new design system
- `src/consts.ts` — 3DreamLab title/description
- `src/components/BaseHead.astro` — Syne font, default OG image `/HEAD.jpeg`, remove Atkinson preloads
- `astro.config.mjs` — site URL, remove mdx integration
- `package.json` — add `resend`, remove mdx/rss
- `src/env.d.ts` — extend `Env` interface with secrets

### Keep unchanged

- `wrangler.json` (routes/deploy config)
- `@astrojs/cloudflare` adapter
- `@astrojs/sitemap` integration
- `public/HEAD.jpeg`, `public/LIGHT.jpg`, `public/favicon.svg`

## SEO & Meta

- `SITE_TITLE`: `3DreamLab`
- `SITE_DESCRIPTION`: `Fast e-commerce sites, integrations, and Cloudflare edge infrastructure.`
- `astro.config.mjs` `site`: `https://3dreamlab.com`
- OG image: `/HEAD.jpeg`

## Pre-Deploy Checklist (manual)

1. Verify `3dreamlab.com` in Resend; add DKIM/SPF DNS records in Cloudflare
2. Create Turnstile widget for `3dreamlab.com` in Cloudflare dashboard
3. Set Wrangler secrets: `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `CONTACT_TO_EMAIL`
4. Set `PUBLIC_TURNSTILE_SITE_KEY` in wrangler vars or `.dev.vars`
5. Run `pnpm build && pnpm deploy`

## Out of Scope

- Blog, CMS, analytics, i18n, admin panel
- Queue-based email delivery
- Multiple pages or routing
- Cloudflare Email Service binding (Resend chosen)
