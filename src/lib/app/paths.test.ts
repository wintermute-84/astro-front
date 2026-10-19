import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appRoute, isSameOriginWrite } from './paths.ts';

test('appRoute: public login/verify/logout, everything else under /app private', () => {
  assert.equal(appRoute('/app/login', '/app/login'), 'public');
  assert.equal(appRoute('/app/verify/', '/app/verify'), 'public');
  assert.equal(appRoute('/app/logout', '/app/logout'), 'public');
  assert.equal(appRoute('/app', '/app'), 'private');
  assert.equal(appRoute('/app/', '/app'), 'private');
  assert.equal(appRoute('/app/settings', '/app/settings'), 'private');
  assert.equal(appRoute('/app/nope', '/404'), 'private', 'unknown /app path still needs a session');
  assert.equal(appRoute('/APP/settings', '/404'), 'private', 'case');
  assert.equal(appRoute('/%61pp/settings', '/404'), 'private', 'encoded');
  assert.equal(appRoute('/app/login/../settings', '/app/settings'), 'private', 'path and route must both be public');
  assert.equal(appRoute('/app/login', '/app/settings'), 'private');
  assert.equal(appRoute('/apple', '/apple'), 'none');
  assert.equal(appRoute('/signup', '/signup'), 'none');
  assert.equal(appRoute('/dashboard', '/dashboard'), 'none');
});

test('isSameOriginWrite: safe methods pass; posts need same-origin', () => {
  const u = new URL('https://3dreamlab.com/app/verify');
  const req = (method: string, h: Record<string, string>) => new Request(u, { method, headers: h });
  assert.equal(isSameOriginWrite(req('GET', { origin: 'https://evil.example' }), u), true);
  assert.equal(isSameOriginWrite(req('POST', { 'sec-fetch-site': 'same-origin' }), u), true);
  assert.equal(isSameOriginWrite(req('POST', { 'sec-fetch-site': 'cross-site', origin: 'https://3dreamlab.com' }), u), false);
  assert.equal(isSameOriginWrite(req('POST', { 'sec-fetch-site': 'same-site' }), u), false);
  assert.equal(isSameOriginWrite(req('POST', { origin: 'https://3dreamlab.com' }), u), true);
  assert.equal(isSameOriginWrite(req('POST', { origin: 'https://evil.example' }), u), false);
  assert.equal(isSameOriginWrite(req('POST', {}), u), false, 'no Origin, no Sec-Fetch-Site');
});
