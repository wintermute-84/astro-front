import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLockedOut, recordFailure } from './ratelimit.ts';

const O = 'https://3dreamlab.com';

function fakes(limit = 3) {
  const hits = new Map<string, number>();
  const store = new Map<string, Response>();
  const limiter = {
    async limit({ key }: { key: string }) {
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      return { success: n <= limit };
    },
  };
  const cache = {
    async match(k: RequestInfo | URL) { return store.get(String(k)); },
    async put(k: RequestInfo | URL, r: Response) { store.set(String(k), r); },
  } as Pick<Cache, 'match' | 'put'>;
  return { limiter, cache };
}

test('first 3 failures pass, 4th locks the IP out', async () => {
  const { limiter, cache } = fakes();
  for (let i = 0; i < 3; i++) assert.equal(await recordFailure(O, '1.2.3.4', limiter, cache), false);
  assert.equal(await isLockedOut(O, '1.2.3.4', cache), false);
  assert.equal(await recordFailure(O, '1.2.3.4', limiter, cache), true);
  assert.equal(await isLockedOut(O, '1.2.3.4', cache), true);
});

test('lockout is per IP', async () => {
  const { limiter, cache } = fakes();
  for (let i = 0; i < 4; i++) await recordFailure(O, '1.2.3.4', limiter, cache);
  assert.equal(await isLockedOut(O, '5.6.7.8', cache), false);
});

test('missing binding never locks out (auth still applies)', async () => {
  const { cache } = fakes();
  assert.equal(await recordFailure(O, '1.2.3.4', undefined, cache), false);
  assert.equal(await isLockedOut(O, '1.2.3.4', cache), false);
});
