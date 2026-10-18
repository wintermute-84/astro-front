import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDemoInput } from './demo.ts';

test('accepts exactly via + boolean outage', () => {
  assert.deepEqual(parseDemoInput({ via: 'edge', outage: false }), { via: 'edge', outage: false });
  assert.deepEqual(parseDemoInput({ via: 'origin', outage: true }), { via: 'origin', outage: true });
});

test('rejects anything else', () => {
  for (const bad of [
    null, undefined, 'edge', 42, [], {},
    { via: 'edge' },
    { via: 'EDGE', outage: false },
    { via: 'cdn', outage: false },
    { via: 'edge', outage: 'true' },
    { via: 'edge', outage: 1 },
    { via: 'edge', outage: false, slug: 'acme' },
  ]) assert.equal(parseDemoInput(bad), null, JSON.stringify(bad));
});
