# 3DreamLab One-Pager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Astro blog starter with a brutalist agency one-pager for 3DreamLab, including a Resend-powered contact form on Cloudflare Workers.

**Architecture:** Single `index.astro` composes four section components with shared CSS design tokens. Contact submissions POST to an Astro server endpoint (`/api/contact`) that verifies Turnstile and sends email via Resend. Blog demo, content collections, and unused integrations are removed.

**Tech Stack:** Astro 5, `@astrojs/cloudflare`, Resend SDK, Cloudflare Turnstile, CSS custom properties, Intersection Observer

**Spec:** `docs/superpowers/specs/2026-05-23-3dreamlab-onepager-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/pages/index.astro` | Page shell, imports sections + reveal script |
| `src/components/Nav.astro` | Fixed nav with scroll state |
| `src/components/sections/Hero.astro` | Section 1 — LIGHT.jpg hero |
| `src/components/sections/Services.astro` | Section 2 — red services list |
| `src/components/sections/Infra.astro` | Section 3 — HEAD.jpeg infra |
| `src/components/sections/Contact.astro` | Section 4 — form + client JS |
| `src/pages/api/contact.ts` | POST handler — validate, Turnstile, Resend |
| `src/scripts/reveal.ts` | Scroll reveal + parallax |
| `src/styles/global.css` | Design tokens + base styles |
| `src/consts.ts` | Site title/description |
| `src/components/BaseHead.astro` | Meta, Syne font, OG image |
| `astro.config.mjs` | Site URL, drop MDX |
| `src/env.d.ts` | Env interface for secrets |

---

### Task 1: Remove blog demo and unused dependencies

**Files:**
- Delete: `src/content/blog/`, `src/content.config.ts`, `src/pages/blog/`, `src/pages/about.astro`, `src/pages/rss.xml.js`, `src/layouts/BlogPost.astro`, `src/components/FormattedDate.astro`, `src/components/Header.astro`, `src/components/HeaderLink.astro`, `src/components/Footer.astro`
- Modify: `astro.config.mjs`, `package.json`

- [ ] **Step 1: Delete blog-related files and directories listed above**

- [ ] **Step 2: Update `astro.config.mjs`**

```javascript
// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://3dreamlab.com",
  integrations: [sitemap()],
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
```

- [ ] **Step 3: Update `package.json` dependencies**

Remove `@astrojs/mdx` and `@astrojs/rss`. Add `resend`:

```json
"dependencies": {
  "@astrojs/cloudflare": "12.6.12",
  "@astrojs/sitemap": "3.6.1",
  "astro": "5.16.9",
  "resend": "^4.0.0",
  "typescript": "5.9.3"
}
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`  
Expected: clean install, no missing peer deps

- [ ] **Step 5: Verify build still runs (will fail on index until Task 2 — skip if index broken)**

---

### Task 2: Design system and site constants

**Files:**
- Modify: `src/styles/global.css`, `src/consts.ts`, `src/components/BaseHead.astro`, `src/env.d.ts`

- [ ] **Step 1: Replace `src/consts.ts`**

```typescript
export const SITE_TITLE = "3DreamLab";
export const SITE_DESCRIPTION =
  "Fast e-commerce sites, integrations, and Cloudflare edge infrastructure.";
```

- [ ] **Step 2: Replace `src/styles/global.css`**

```css
@import url("https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap");

:root {
  --red: #ff2400;
  --black: #0a0a0a;
  --white: #ffffff;
  --gray: #888888;
  --gray-dark: #333333;
  --overlay-light: rgba(245, 245, 245, 0.82);
  --overlay-dark: rgba(0, 0, 0, 0.72);
  --font-heading: "Syne", system-ui, sans-serif;
  --font-body: system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.6;
  color: var(--black);
  background: var(--black);
  overflow-x: hidden;
}

h1, h2, h3 {
  font-family: var(--font-heading);
  font-weight: 800;
  line-height: 0.88;
  letter-spacing: -0.03em;
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}

.section {
  position: relative;
  min-height: 55vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 4rem 5vw;
  overflow: hidden;
}

.section--hero { min-height: 60vh; }
.section--services { min-height: 65vh; background: var(--red); color: var(--black); }
.section--infra { min-height: 60vh; color: var(--white); }
.section--contact { min-height: 55vh; background: var(--black); color: var(--white); }

.section__inner {
  position: relative;
  z-index: 2;
  max-width: 1200px;
  width: 100%;
}

.section__bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  will-change: transform;
}

.section__overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.section__overlay--light { background: var(--overlay-light); }
.section__overlay--dark { background: var(--overlay-dark); }

.section__meta {
  position: absolute;
  top: 1.5rem;
  right: 5vw;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.05em;
  opacity: 0.5;
  z-index: 3;
}

.heading-xl {
  font-size: clamp(3rem, 12vw, 7rem);
}

.heading-lg {
  font-size: clamp(2.5rem, 10vw, 5.5rem);
}

.body-text {
  font-size: clamp(0.95rem, 2vw, 1.1rem);
  max-width: 28rem;
  margin-top: 1.25rem;
  line-height: 1.5;
}

.reveal {
  opacity: 0;
  transform: translateY(2rem);
  transition: opacity 0.6s ease-out, transform 0.6s ease-out;
}

.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

.services-list {
  margin-top: 2rem;
  border-top: 1px solid rgba(0, 0, 0, 0.25);
}

.services-list__item {
  display: flex;
  justify-content: space-between;
  padding: 0.85rem 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.15);
  font-size: clamp(0.85rem, 2vw, 1rem);
  font-weight: 600;
}

.services-list__label {
  font-family: var(--font-mono);
  opacity: 0.6;
  margin-right: 1rem;
}

.infra-stats {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  line-height: 1.8;
  opacity: 0.4;
  text-align: right;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 3: Update `src/components/BaseHead.astro`**

Remove Atkinson font preloads. Change default image to `/HEAD.jpeg`. Add Syne is loaded via global.css `@import`.

```astro
---
import '../styles/global.css';

interface Props {
  title: string;
  description: string;
  image?: string;
}

const canonicalURL = new URL(Astro.url.pathname, Astro.site);
const { title, description, image = '/HEAD.jpeg' } = Astro.props;
---

<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta name="generator" content={Astro.generator} />
<link rel="canonical" href={canonicalURL} />
<title>{title}</title>
<meta name="title" content={title} />
<meta name="description" content={description} />
<meta property="og:type" content="website" />
<meta property="og:url" content={Astro.url} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={new URL(image, Astro.url)} />
<meta property="twitter:card" content="summary_large_image" />
<meta property="twitter:url" content={Astro.url} />
<meta property="twitter:title" content={title} />
<meta property="twitter:description" content={description} />
<meta property="twitter:image" content={new URL(image, Astro.url)} />
```

- [ ] **Step 4: Extend `src/env.d.ts`**

```typescript
type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

interface Env {
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  CONTACT_TO_EMAIL: string;
  PUBLIC_TURNSTILE_SITE_KEY: string;
}
```

---

### Task 3: Navigation component

**Files:**
- Create: `src/components/Nav.astro`

- [ ] **Step 1: Create `src/components/Nav.astro`**

```astro
---
import { SITE_TITLE } from '../consts';
---

<nav class="nav" id="nav">
  <a href="#" class="nav__logo">{SITE_TITLE.toUpperCase()}</a>
  <a href="#contact" class="nav__link">Contact</a>
</nav>

<style>
  .nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 5vw;
    font-family: var(--font-heading);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--black);
    background: transparent;
    transition: background 0.3s ease, color 0.3s ease;
  }

  .nav--scrolled {
    background: var(--black);
    color: var(--white);
  }

  .nav__link {
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 0.7rem;
  }

  .nav__link:hover {
    opacity: 0.7;
  }
</style>

<script>
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle('nav--scrolled', window.scrollY > 100);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
</script>
```

---

### Task 4: Section components

**Files:**
- Create: `src/components/sections/Hero.astro`, `Services.astro`, `Infra.astro`, `Contact.astro`

- [ ] **Step 1: Create `src/components/sections/Hero.astro`**

```astro
<section class="section section--hero" id="hero">
  <div class="section__bg" data-parallax style="background-image: url('/LIGHT.jpg')"></div>
  <div class="section__overlay section__overlay--light"></div>
  <span class="section__meta">#F5F5F5 · LIGHT.jpg</span>
  <div class="section__inner">
    <h1 class="heading-xl reveal">
      FAST<br />COMMERCE
    </h1>
    <p class="body-text reveal">
      Lightning-fast e-commerce sites. Zero bloat. Built to convert.
    </p>
  </div>
</section>
```

- [ ] **Step 2: Create `src/components/sections/Services.astro`**

```astro
---
const services = [
  { label: 'A', text: 'E-commerce storefronts' },
  { label: 'B', text: 'Payment & checkout integrations' },
  { label: 'C', text: 'ERP · CRM · inventory sync' },
  { label: 'D', text: 'Headless & custom builds' },
];
---

<section class="section section--services" id="services">
  <span class="section__meta">#FF2400</span>
  <div class="section__inner">
    <h2 class="heading-lg reveal">
      WHAT<br />WE DO
    </h2>
    <div class="services-list reveal">
      {services.map((item) => (
        <div class="services-list__item">
          <span class="services-list__label">{item.label}</span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Step 3: Create `src/components/sections/Infra.astro`**

```astro
<section class="section section--infra" id="infra">
  <div class="section__bg" data-parallax style="background-image: url('/HEAD.jpeg')"></div>
  <div class="section__overlay section__overlay--dark"></div>
  <span class="section__meta">HEAD.jpeg · edge</span>
  <div class="section__inner" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 2rem;">
    <div>
      <h2 class="heading-lg reveal">
        EDGE<br />INFRA
      </h2>
      <p class="body-text reveal" style="color: rgba(255,255,255,0.65);">
        Cloudflare Workers, CDN, D1, R2. Global performance out of the box.
      </p>
    </div>
    <div class="infra-stats reveal">
      latency &lt;50ms<br />
      300+ PoPs<br />
      100/100 LH
    </div>
  </div>
</section>
```

- [ ] **Step 4: Create `src/components/sections/Contact.astro`**

```astro
---
const siteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '';
---

<section class="section section--contact" id="contact">
  <div class="section__inner">
    <span class="section__meta" style="color: var(--gray);">READY?</span>
    <h2 class="heading-lg reveal" id="contact-heading">
      LET'S<br />BUILD
    </h2>

    <form class="contact-form reveal" id="contact-form">
      <div class="field">
        <label for="name">Name</label>
        <input type="text" id="name" name="name" required maxlength="100" autocomplete="name" />
      </div>
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label for="message">Message</label>
        <textarea id="message" name="message" required maxlength="2000" rows="3"></textarea>
      </div>
      {siteKey && (
        <div class="turnstile-wrap" data-sitekey={siteKey} id="turnstile-container"></div>
      )}
      <p class="form-error" id="form-error" hidden></p>
      <button type="submit" class="submit-btn" id="submit-btn">SEND →</button>
    </form>

    <div class="contact-success" id="contact-success" hidden>
      <h2 class="heading-lg">MESSAGE<br />SENT</h2>
      <p class="body-text" style="color: var(--gray);">We'll be in touch soon.</p>
    </div>
  </div>
</section>

<style>
  .contact-form {
    margin-top: 2rem;
    max-width: 28rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .field label {
    display: block;
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    color: var(--gray);
    margin-bottom: 0.4rem;
    text-transform: uppercase;
  }

  .field input,
  .field textarea {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--gray-dark);
    color: var(--white);
    font-family: var(--font-body);
    font-size: 0.95rem;
    padding: 0.5rem 0;
    outline: none;
  }

  .field input:focus,
  .field textarea:focus {
    border-bottom-color: var(--red);
  }

  .field textarea {
    resize: vertical;
    min-height: 4rem;
  }

  .submit-btn {
    align-self: flex-start;
    margin-top: 0.5rem;
    background: var(--red);
    color: var(--black);
    border: none;
    font-family: var(--font-heading);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 0.9rem 1.75rem;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .submit-btn:hover:not(:disabled) { opacity: 0.85; }
  .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .form-error {
    color: var(--red);
    font-size: 0.85rem;
    margin: 0;
  }

  .contact-success {
    margin-top: 2rem;
  }
</style>

<script define:vars={{ siteKey }}>
  const form = document.getElementById('contact-form');
  const success = document.getElementById('contact-success');
  const heading = document.getElementById('contact-heading');
  const errorEl = document.getElementById('form-error');
  const submitBtn = document.getElementById('submit-btn');
  let turnstileToken = '';

  if (siteKey) {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const container = document.getElementById('turnstile-container');
      if (container && window.turnstile) {
        window.turnstile.render(container, {
          sitekey: siteKey,
          callback: (token) => { turnstileToken = token; },
          'expired-callback': () => { turnstileToken = ''; },
        });
      }
    };
    document.head.appendChild(script);
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;

    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      message: form.message.value.trim(),
      turnstileToken,
    };

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      form.hidden = true;
      heading.hidden = true;
      success.hidden = false;
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
    }
  });
</script>
```

---

### Task 5: Scroll reveal and parallax script

**Files:**
- Create: `src/scripts/reveal.ts`

- [ ] **Step 1: Create `src/scripts/reveal.ts`**

```typescript
export function initReveal() {
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.15 }
  );
  reveals.forEach((el) => observer.observe(el));
}

export function initParallax() {
  const layers = document.querySelectorAll<HTMLElement>('[data-parallax]');
  if (!layers.length) return;

  const onScroll = () => {
    layers.forEach((layer) => {
      const rect = layer.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const center = rect.top + rect.height / 2;
      const offset = (center - window.innerHeight / 2) * 0.05;
      layer.style.transform = `translateY(${offset}px) scale(1.1)`;
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
```

---

### Task 6: Main page

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace `src/pages/index.astro`**

```astro
---
import BaseHead from '../components/BaseHead.astro';
import Nav from '../components/Nav.astro';
import Hero from '../components/sections/Hero.astro';
import Services from '../components/sections/Services.astro';
import Infra from '../components/sections/Infra.astro';
import Contact from '../components/sections/Contact.astro';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
---

<!doctype html>
<html lang="en">
  <head>
    <BaseHead title={SITE_TITLE} description={SITE_DESCRIPTION} />
  </head>
  <body>
    <Nav />
    <main>
      <Hero />
      <Services />
      <Infra />
      <Contact />
    </main>
    <script>
      import { initReveal, initParallax } from '../scripts/reveal.ts';
      initReveal();
      initParallax();
    </script>
  </body>
</html>
```

- [ ] **Step 2: Run dev server and verify all four sections render**

Run: `pnpm dev`  
Open: `http://localhost:4321`  
Expected: four sections visible, nav fixed, scroll animations fire

---

### Task 7: Contact API endpoint

**Files:**
- Create: `src/pages/api/contact.ts`

- [ ] **Step 1: Create `src/pages/api/contact.ts`**

```typescript
import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

interface ContactBody {
  name?: string;
  email?: string;
  message?: string;
  turnstileToken?: string;
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function verifyTurnstile(token: string, secret: string, ip: string) {
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  if (ip) formData.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = locals.runtime;
  const env = runtime?.env as Env | undefined;

  if (!env?.RESEND_API_KEY || !env?.CONTACT_TO_EMAIL || !env?.TURNSTILE_SECRET_KEY) {
    return json({ error: 'Server not configured.' }, 500);
  }

  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const name = body.name?.trim() ?? '';
  const email = body.email?.trim() ?? '';
  const message = body.message?.trim() ?? '';
  const turnstileToken = body.turnstileToken ?? '';

  if (!name || name.length > 100) return json({ error: 'Name is required (max 100 chars).' }, 422);
  if (!email || !isValidEmail(email)) return json({ error: 'Valid email is required.' }, 422);
  if (!message || message.length > 2000) return json({ error: 'Message is required (max 2000 chars).' }, 422);
  if (!turnstileToken) return json({ error: 'Captcha verification required.' }, 422);

  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '';
  const turnstileOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);
  if (!turnstileOk) return json({ error: 'Captcha verification failed.' }, 422);

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: '3DreamLab <contact@3dreamlab.com>',
    to: [env.CONTACT_TO_EMAIL],
    replyTo: email,
    subject: `3DreamLab inquiry from ${name}`,
    html: `
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
    `,
  });

  if (error) {
    console.error('Resend error:', error);
    return json({ error: 'Failed to send message.' }, 500);
  }

  return json({ ok: true });
};
```

- [ ] **Step 2: Create `.dev.vars.example`**

```
RESEND_API_KEY=re_xxxxxxxx
TURNSTILE_SECRET_KEY=0x4xxxxxxxx
CONTACT_TO_EMAIL=you@example.com
PUBLIC_TURNSTILE_SITE_KEY=0x4xxxxxxxx
```

- [ ] **Step 3: Add `.dev.vars` to `.gitignore` if not present**

- [ ] **Step 4: Test API locally with curl (requires real secrets in `.dev.vars`)**

Run:
```bash
curl -X POST http://localhost:4321/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","message":"Hello","turnstileToken":"test"}'
```
Expected without real Turnstile: `{ "error": "Captcha verification failed." }` with status 422 — confirms endpoint is live.

---

### Task 8: Final verification and deploy prep

**Files:**
- Modify: `README.md` (optional brief update)

- [ ] **Step 1: Production build**

Run: `pnpm build`  
Expected: succeeds, outputs to `dist/`

- [ ] **Step 2: Dry-run deploy**

Run: `pnpm check`  
Expected: build + tsc + wrangler deploy --dry-run pass

- [ ] **Step 3: Document secrets setup in README**

Add section covering Resend domain verification, Turnstile widget creation, and:
```bash
wrangler secret put RESEND_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put CONTACT_TO_EMAIL
```

Set `PUBLIC_TURNSTILE_SITE_KEY` in `wrangler.json` under `vars` or as a secret depending on preference (public key can be in vars).

- [ ] **Step 4: Manual smoke test after deploy**

Submit form on live site with real Turnstile → confirm email arrives in private inbox.

---

## Self-review checklist

| Spec requirement | Task |
|-----------------|------|
| Editorial asymmetric layout, 55–65vh | Task 2 CSS + Task 4 sections |
| LIGHT.jpg hero, HEAD.jpeg infra | Task 4 Hero + Infra |
| Red #FF2400 services section | Task 2 + Task 4 Services |
| Contact form, no public email | Task 4 Contact + Task 7 API |
| Resend backend | Task 7 |
| Turnstile spam protection | Task 4 Contact + Task 7 |
| Scroll animations | Task 5 + Task 6 |
| Remove blog demo | Task 1 |
| 3dreamlab.com site URL | Task 1 astro.config |
| Nav fixed transparent → solid | Task 3 |

No placeholders remain. All file paths and code blocks are complete.
