import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { authorize } from './auth.ts';

const TEAM = 'acme.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const ACCESS = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const BASIC = { DASHBOARD_USER: 'owner', DASHBOARD_PASS: 'hunter2' };
const basicHeader = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

let key: CryptoKey;
let otherKey: CryptoKey;
let keys: ReturnType<typeof createLocalJWKSet>;

before(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] });
});

type Opts = { aud?: string; iss?: string; exp?: string | number; email?: string | null; signWith?: CryptoKey };

function token(o: Opts = {}) {
  return new SignJWT(o.email === null ? {} : { email: o.email ?? 'me@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(o.iss ?? `https://${TEAM}`)
    .setAudience(o.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(o.exp ?? '5m')
    .sign(o.signWith ?? key);
}

const req = (headers: Record<string, string> = {}) => new Request('https://3dreamlab.com/dashboard', { headers });
const withToken = async (o?: Opts) => req({ 'cf-access-jwt-assertion': await token(o) });

test('access: valid token -> ok with email', async () => {
  const r = await authorize(await withToken(), ACCESS, keys);
  assert.deepEqual(r, { ok: true, user: { email: 'me@example.com', via: 'access' } });
});

test('access: team domain with scheme and trailing slash is normalised', async () => {
  const r = await authorize(await withToken(), { ...ACCESS, ACCESS_TEAM_DOMAIN: `https://${TEAM}/` }, keys);
  assert.equal(r.ok, true);
});

const bad: [string, () => Opts][] = [
  ['wrong aud', () => ({ aud: 'other-aud' })],
  ['wrong iss', () => ({ iss: 'https://evil.cloudflareaccess.com' })],
  ['expired', () => ({ exp: Math.floor(Date.now() / 1000) - 60 })],
  ['bad signature', () => ({ signWith: otherKey })],
  ['no email claim', () => ({ email: null })],
];
for (const [name, opts] of bad) {
  test(`access: ${name} -> denied (403 mode)`, async () => {
    assert.deepEqual(await authorize(await withToken(opts()), ACCESS, keys), { ok: false, mode: 'access' });
  });
}

test('access: missing token -> denied', async () => {
  assert.deepEqual(await authorize(req(), ACCESS, keys), { ok: false, mode: 'access' });
});

test('access: garbage token -> denied', async () => {
  const r = await authorize(req({ 'cf-access-jwt-assertion': 'not.a.jwt' }), ACCESS, keys);
  assert.deepEqual(r, { ok: false, mode: 'access' });
});

test('access: JWKS fetch failure -> denied, not allowed', async () => {
  const broken = (async () => {
    throw new Error('jwks down');
  }) as unknown as typeof keys;
  assert.deepEqual(await authorize(await withToken(), ACCESS, broken), { ok: false, mode: 'access' });
});

test('access configured + correct basic header -> denied', async () => {
  const r = await authorize(req({ authorization: basicHeader('owner', 'hunter2') }), { ...ACCESS, ...BASIC }, keys);
  assert.deepEqual(r, { ok: false, mode: 'access' });
});

test('access configured + valid token + basic secrets -> access user', async () => {
  const r = await authorize(await withToken(), { ...ACCESS, ...BASIC }, keys);
  assert.equal(r.ok && r.user.via, 'access');
});

test('access unset: basic still works', async () => {
  const r = await authorize(req({ authorization: basicHeader('owner', 'hunter2') }), BASIC);
  assert.deepEqual(r, { ok: true, user: { email: 'owner', via: 'basic' } });
});

test('access unset: wrong basic password -> denied (401 mode)', async () => {
  const r = await authorize(req({ authorization: basicHeader('owner', 'nope') }), BASIC);
  assert.deepEqual(r, { ok: false, mode: 'basic' });
});

test('only one Access var set -> falls back to basic', async () => {
  const r = await authorize(req({ authorization: basicHeader('owner', 'hunter2') }), { ACCESS_AUD: AUD, ...BASIC });
  assert.equal(r.ok && r.user.via, 'basic');
});

test('nothing configured -> denied', async () => {
  assert.deepEqual(await authorize(req({ authorization: basicHeader('', '') }), {}), { ok: false, mode: 'basic' });
  assert.deepEqual(await authorize(await withToken(), {}), { ok: false, mode: 'basic' });
});
