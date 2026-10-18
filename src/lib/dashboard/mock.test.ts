import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRange,
  formatDuration,
  maxStaleness,
  overview,
  rules,
  OUTCOMES,
} from './mock.ts';

test('parseRange falls back to 24h', () => {
  assert.equal(parseRange(undefined), '24h');
  assert.equal(parseRange(null), '24h');
  assert.equal(parseRange(''), '24h');
  assert.equal(parseRange('bogus'), '24h');
  assert.equal(parseRange('7d'), '7d');
  assert.equal(parseRange('30d'), '30d');
});

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0 s');
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(300), '5 min');
  assert.equal(formatDuration(3900), '1 h 5 min');
  assert.equal(formatDuration(86400), '1 d');
  assert.equal(formatDuration(90000), '1 d 1 h');
});

test('maxStaleness', () => {
  const r = rules('acme')[0];
  assert.deepEqual(maxStaleness(r), {
    normal: r.ttlS + r.swrS,
    outage: r.ttlS + Math.max(r.swrS, r.staleIfErrorS),
  });
});

test('overview is deterministic', () => {
  const a = overview('acme', '24h');
  const b = overview('acme', '24h');
  assert.deepEqual(a, b);
});

test('bucket counts', () => {
  assert.equal(overview('acme', '24h').t.length, 24);
  assert.equal(overview('acme', '7d').t.length, 42);
  assert.equal(overview('acme', '30d').t.length, 30);
});

test('outcome series align with time buckets', () => {
  for (const range of ['24h', '7d', '30d'] as const) {
    const o = overview('nordic-parts', range);
    const n = o.t.length;
    for (const outcome of OUTCOMES) {
      assert.equal(o.outcomes[outcome].length, n);
    }
  }
});

test('p95 greater than p50 for edge and origin', () => {
  const o = overview('demo', '7d');
  for (let i = 0; i < o.t.length; i++) {
    assert.ok(o.latency.edgeP95[i] > o.latency.edgeP50[i]);
    assert.ok(o.latency.originP95[i] > o.latency.originP50[i]);
  }
});

test('STALE-ERROR only in 2-3 consecutive buckets', () => {
  for (const range of ['24h', '7d', '30d'] as const) {
    const o = overview('acme', range);
    const se = o.outcomes['STALE-ERROR'];
    const nonzero = se.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    assert.ok(nonzero.length >= 2 && nonzero.length <= 3);
    for (let k = 1; k < nonzero.length; k++) {
      assert.equal(nonzero[k], nonzero[k - 1] + 1);
    }
    for (let i = 0; i < se.length; i++) {
      if (!nonzero.includes(i)) assert.equal(se[i], 0);
    }
  }
});
