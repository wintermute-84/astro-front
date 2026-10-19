import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCreateProject, customerRuleFromForm, customerTestFromForm, pickProject, projectFromForm, purgeFromForm, usageMeter } from './forms.ts';
import type { TenantView } from './contract.ts';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const tv = (slug: string, plan: TenantView['plan'] = 'free'): TenantView => ({
  id: `t_${slug}`, slug, name: slug, kind: 'customer', plan, status: 'active', dailyLimit: 1000, createdAt: '2026-10-19T00:00:00Z', upgradeRequestedPlan: null,
});

test('pickProject only selects from the own list; unknown ?p= falls back to the first', () => {
  const list = [tv('acme-1a2b'), tv('beta-3c4d')];
  assert.equal(pickProject(list, 'beta-3c4d')?.slug, 'beta-3c4d');
  assert.equal(pickProject(list, 'someone-else')?.slug, 'acme-1a2b');
  assert.equal(pickProject(list, null)?.slug, 'acme-1a2b');
  assert.equal(pickProject([], 'x'), null);
});

test('canCreateProject: free and starter 1, pro 3', () => {
  assert.equal(canCreateProject([], 'free'), true);
  assert.equal(canCreateProject([tv('a')], 'free'), false);
  assert.equal(canCreateProject([tv('a', 'starter')], 'starter'), false);
  assert.equal(canCreateProject([tv('a', 'pro'), tv('b')], 'free'), true, 'a pro project lifts the cap');
  assert.equal(canCreateProject([tv('a'), tv('b'), tv('c')], 'pro'), false);
});

test('project form: trimmed name + origin, plan from the allowlist (never the form)', () => {
  assert.deepEqual(projectFromForm(fd({ name: ' Acme ', originUrl: ' https://api.acme.example ', plan: 'pro' }), 'free'), {
    name: 'Acme', originUrl: 'https://api.acme.example', plan: 'free',
  });
});

test('rule form: no tenant/postRead/secret fields, method limited to GET|POST, numbers and lists', () => {
  const r = customerRuleFromForm(fd({ id: '', originId: 'o1', method: 'DELETE', pathPattern: '/v1/stock/*', ttlS: '60', swrS: '', staleIfErrorS: '600', vary: 'query:sku, header:x-a', tags: 'stock', enabled: 'on', tenant: 'evil', secretRef: 'ORIGIN_SECRET_X', postRead: 'on' }));
  assert.deepEqual(Object.keys(r).sort(), ['enabled', 'method', 'originId', 'pathPattern', 'staleIfErrorS', 'swrS', 'tags', 'ttlS', 'vary']);
  assert.equal(r.method, 'GET');
  assert.equal(r.ttlS, 60);
  assert.ok(Number.isNaN(r.swrS), 'empty number → NaN so the edge rejects it');
  assert.deepEqual(r.vary, ['query:sku', 'header:x-a']);
  assert.equal(customerRuleFromForm(fd({ id: 'r1', method: 'POST', enabled: '' })).id, 'r1');
  assert.equal(customerRuleFromForm(fd({ method: 'POST' })).method, 'POST');
  assert.equal(customerRuleFromForm(fd({})).enabled, false);
});

test('test form: GET/HEAD only, query parsed, headers and body dropped', () => {
  const t = customerTestFromForm(fd({ method: 'POST', path: '/v1/x', query: '?sku=A&b=2', headers: 'authorization: x', body: '{}', slug: 'other' }));
  assert.deepEqual(t, { method: 'GET', path: '/v1/x', query: { sku: 'A', b: '2' } });
  assert.equal(customerTestFromForm(fd({ method: 'HEAD', path: '/' })).method, 'HEAD');
});

test('purge form: empty = whole project, tags otherwise', () => {
  assert.deepEqual(purgeFromForm(fd({ tags: '' })), {});
  assert.deepEqual(purgeFromForm(fd({ tags: 'stock, prices' })), { tags: ['stock', 'prices'] });
});

test('usage meter clamps and tones', () => {
  assert.deepEqual(usageMeter(0, 1000), { pct: 0, tone: 'ok' });
  assert.deepEqual(usageMeter(800, 1000), { pct: 80, tone: 'warn' });
  assert.deepEqual(usageMeter(1500, 1000), { pct: 100, tone: 'err' });
  assert.deepEqual(usageMeter(5, 0), { pct: 100, tone: 'err' });
});
