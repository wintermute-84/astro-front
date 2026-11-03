import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostRoute } from './storeHost.ts';

const r = (u: string) => hostRoute(new URL(u));

test('store host serves the store pages at its root', () => {
  assert.deepEqual(r('https://store.3dreamlab.com/'), { rewrite: '/store/' });
  assert.deepEqual(r('https://store.3dreamlab.com/fi/'), { rewrite: '/fi/store/' });
  assert.deepEqual(r('https://store.3dreamlab.com/sv'), { rewrite: '/sv/store/' });
});

test('store host keeps assets and API, sends everything else to the main site', () => {
  assert.equal(r('https://store.3dreamlab.com/HEAD2.webp'), null);
  assert.equal(r('https://store.3dreamlab.com/_astro/x.js'), null);
  assert.equal(r('https://store.3dreamlab.com/api/contact'), null);
  assert.deepEqual(r('https://store.3dreamlab.com/privacy/'), { redirect: 'https://3dreamlab.com/privacy/' });
  assert.deepEqual(r('https://store.3dreamlab.com/store/'), { redirect: 'https://3dreamlab.com/store/' });
});

test('main host /store/ redirects to the subdomain, keeping locale and query', () => {
  assert.deepEqual(r('https://3dreamlab.com/store/'), { redirect: 'https://store.3dreamlab.com/' });
  assert.deepEqual(r('https://3dreamlab.com/store'), { redirect: 'https://store.3dreamlab.com/' });
  assert.deepEqual(r('https://3dreamlab.com/fi/store/?a=1'), { redirect: 'https://store.3dreamlab.com/fi/?a=1' });
  assert.equal(r('https://3dreamlab.com/storefront/'), null);
  assert.equal(r('https://3dreamlab.com/'), null);
  assert.equal(r('https://astro-front.vlad-kupriyenko.workers.dev/store/'), null);
});
