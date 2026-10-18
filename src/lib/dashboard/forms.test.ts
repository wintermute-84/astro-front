import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldOf, list, originFromForm, ruleFromForm, tenantFromForm, testRequestFromForm } from './forms.ts';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test('list splits on commas and newlines, drops blanks', () => {
  assert.deepEqual(list(' a, b\n\nc ,'), ['a', 'b', 'c']);
  assert.deepEqual(list(''), []);
});

test('tenant form: checkbox presence = enabled', () => {
  assert.deepEqual(tenantFromForm(fd({ slug: ' acme ', name: 'Acme', corsOrigins: 'https://a.example\nhttps://b.example' })), {
    slug: 'acme', name: 'Acme', corsOrigins: ['https://a.example', 'https://b.example'], enabled: false,
  });
  assert.equal(tenantFromForm(fd({ slug: 'x', name: 'X', enabled: 'on' })).enabled, true);
});

test('origin form: no id means create, blanks become null, empty number is NaN', () => {
  const o = originFromForm(fd({ id: '', baseUrl: 'https://erp.example', timeoutMs: '', authHeaderName: '', secretRef: '' }), 'acme');
  assert.equal('id' in o, false);
  assert.equal(o.tenant, 'acme');
  assert.ok(Number.isNaN(o.timeoutMs));
  assert.equal(o.authHeaderName, null);
  assert.equal(o.secretRef, null);
  assert.equal(originFromForm(fd({ id: 'org_1', baseUrl: 'x', timeoutMs: '3000' }), 'acme').id, 'org_1');
});

test('rule form maps numbers, lists and switches', () => {
  const r = ruleFromForm(
    fd({ id: 'r1', originId: 'o1', method: 'POST', pathPattern: '/lookup', ttlS: '30', swrS: '0', staleIfErrorS: '600', vary: 'query:sku, group:x-g', tags: 'pim', postRead: 'on' }),
    'acme',
  );
  assert.deepEqual(r, {
    tenant: 'acme', id: 'r1', originId: 'o1', method: 'POST', pathPattern: '/lookup', ttlS: 30, swrS: 0, staleIfErrorS: 600,
    vary: ['query:sku', 'group:x-g'], postRead: true, tags: ['pim'], enabled: false,
  });
});

test('test request form: query string, header lines, body only for POST', () => {
  const t = testRequestFromForm(fd({ slug: 'demo', method: 'GET', path: '/products', query: '?sku=A&x=1', headers: 'X-Group: b2b\nbad line\n', body: '{}' }));
  assert.deepEqual(t, { slug: 'demo', method: 'GET', path: '/products', query: { sku: 'A', x: '1' }, headers: { 'x-group': 'b2b' } });
  assert.equal(testRequestFromForm(fd({ slug: 'demo', method: 'POST', path: '/lookup', body: '{"a":1}' })).body, '{"a":1}');
});

test('fieldOf places worker messages under the right field', () => {
  const F = ['slug', 'name', 'corsOrigins', 'ttlS', 'swrS', 'vary', 'tags', 'postRead'];
  assert.equal(fieldOf('ttlS must be an integer in 1..604800', F), 'ttlS');
  assert.equal(fieldOf('swrS must be an integer in 0..604800', F), 'swrS');
  assert.equal(fieldOf('POST rules must set postRead: true (explicit read allowlist)', F), 'postRead');
  assert.equal(fieldOf('CORS origin must be scheme://host[:port], got "ftp://x"', F), 'corsOrigins');
  assert.equal(fieldOf('tag "A B" must be 1-32 chars', F), 'tags');
  assert.equal(fieldOf('vary entry "bogus" must be query:<name>', F), 'vary');
  assert.equal(fieldOf('unknown tenant "x"', F), null);
  assert.equal(fieldOf('CORS origin must be …', ['name']), null);
});
