#!/usr/bin/env node

const usage = `Usage: node scripts/check-dashboard-auth.mjs <baseUrl>
Environment: DASHBOARD_USER, DASHBOARD_PASS`;

function fail(msg) {
  console.log(`FAIL ${msg}`);
  return false;
}

function pass(msg) {
  console.log(`PASS ${msg}`);
  return true;
}

function basicAuth(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

async function main() {
  const baseUrl = process.argv[2];
  const user = process.env.DASHBOARD_USER;
  const password = process.env.DASHBOARD_PASS;

  if (!baseUrl || !user || !password) {
    console.error(usage);
    process.exit(2);
  }

  const base = baseUrl.replace(/\/$/, '');
  let ok = true;

  async function check(label, url, options, predicate) {
    try {
      const res = await fetch(url, { ...options, redirect: 'manual' });
      const result = await predicate(res);
      if (result) {
        pass(label);
      } else {
        ok = fail(label);
      }
    } catch (err) {
      ok = fail(`${label} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const paths401 = ['/dashboard', '/dashboard/ui', '/dashboard/anything/deep'];
  for (const path of paths401) {
    await check(
      `GET ${path} without auth -> 401 Basic`,
      `${base}${path}`,
      {},
      (res) =>
        res.status === 401 &&
        String(res.headers.get('www-authenticate') ?? '')
          .toLowerCase()
          .startsWith('basic'),
    );
  }

  for (const path of ['/%64ashboard', '/DASHBOARD', '/dashboard/']) {
    await check(`GET ${path} without auth -> never 200`, `${base}${path}`, {}, (res) => res.status !== 200);
  }

  await check(
    'GET /dashboard wrong password -> 401',
    `${base}/dashboard`,
    { headers: { Authorization: basicAuth(user, 'wrong-password-xyz') } },
    (res) => res.status === 401,
  );

  await check(
    'GET /dashboard correct auth -> 200, noindex',
    `${base}/dashboard`,
    { headers: { Authorization: basicAuth(user, password) } },
    async (res) => {
      if (res.status !== 200) return false;
      const robots = res.headers.get('x-robots-tag') ?? '';
      if (!robots.toLowerCase().includes('noindex')) return false;
      const body = await res.text();
      return body.includes('<meta name="robots" content="noindex');
    },
  );

  await check(
    'GET /dashboardx without auth -> not 401',
    `${base}/dashboardx`,
    {},
    (res) => res.status !== 401,
  );

  await check(
    'GET / -> 200, no x-robots-tag',
    `${base}/`,
    {},
    (res) => res.status === 200 && res.headers.get('x-robots-tag') == null,
  );

  await check(
    'GET /sitemap-0.xml -> 200, no /dashboard',
    `${base}/sitemap-0.xml`,
    {},
    async (res) => {
      if (res.status !== 200) return false;
      const body = await res.text();
      return !body.includes('/dashboard');
    },
  );

  process.exit(ok ? 0 : 1);
}

main();
