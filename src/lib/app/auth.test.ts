import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './testdb.ts';
import { OTP, cleanup, hmacHex, randomCode, requestCode, resendCode, safeEqual, verifyCode } from './otp.ts';
import { completeLogin, deleteUser, endAllSessions, readSession } from './session.ts';
import { approveRequest, createSignupRequest, parseSignup, rejectRequest } from './signup.ts';
import { sendMail } from './mail.ts';

const T0 = 1_760_000_000;
const pepper = 'test-pepper';
const ctx = (now = T0, ip = '192.0.2.1') => ({ pepper, ip, now });

async function allow(db: D1Database, email: string) {
  await db.prepare("INSERT INTO preview_allowlist (email, plan, approved_at) VALUES (?, 'free', ?)").bind(email, T0).run();
}

test('randomCode is 6 digits; safeEqual', () => {
  for (let i = 0; i < 200; i++) assert.match(randomCode(), /^\d{6}$/);
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'ab'), false);
});

test('code is stored as HMAC bound to the login id, never in plain text', async () => {
  const db = testDb();
  await allow(db, 'a@x.io');
  const r = await requestCode(db, 'a@x.io', 'lid1', ctx());
  assert.ok(r.code);
  const row = await db.prepare('SELECT code_hash FROM otp_codes WHERE login_id = ?').bind('lid1').first<string>('code_hash');
  assert.equal(row, await hmacHex(pepper, `lid1:${r.code}`));
  assert.ok(!row!.includes(r.code!));
});

test('verify: right code once, wrong login id fails, expiry fails', async () => {
  const db = testDb();
  await allow(db, 'a@x.io');
  const r = await requestCode(db, 'a@x.io', 'lid1', ctx());
  assert.deepEqual(await verifyCode(db, 'other', r.code!, ctx(T0 + 10)), { ok: false, reason: 'invalid' });
  assert.deepEqual(await verifyCode(db, 'lid1', r.code!, ctx(T0 + 10)), { ok: true, email: 'a@x.io' });
  assert.equal((await verifyCode(db, 'lid1', r.code!, ctx(T0 + 11))).ok, false, 'single use');

  const r2 = await requestCode(db, 'a@x.io', 'lid2', ctx(T0 + 100));
  assert.equal((await verifyCode(db, 'lid2', r2.code!, ctx(T0 + 100 + OTP.TTL_S))).ok, false, 'expired at TTL');
});

test('3 wrong codes per email in 15 min lock out, summed across resends; correct code refused while locked', async () => {
  const db = testDb();
  await allow(db, 'a@x.io');
  const r1 = await requestCode(db, 'a@x.io', 'lid', ctx());
  assert.equal((await verifyCode(db, 'lid', '000000' === r1.code ? '111111' : '000000', ctx(T0 + 1))).ok, false);
  assert.equal((await verifyCode(db, 'lid', 'abc', ctx(T0 + 2))).ok, false);
  const r2 = await resendCode(db, 'lid', ctx(T0 + 61));
  assert.ok(r2.code, 'resend after 60 s issues a new code');
  assert.equal((await verifyCode(db, 'lid', r1.code!, ctx(T0 + 62))).ok, false, 'old code invalid after resend');
  // That was the 3rd failure → locked; the new correct code is refused.
  assert.deepEqual(await verifyCode(db, 'lid', r2.code!, ctx(T0 + 63)), { ok: false, reason: 'locked' });
  assert.equal((await requestCode(db, 'a@x.io', 'lid3', ctx(T0 + 200))).code, null, 'no new codes while locked');
  // Window over: new code works.
  const r3 = await requestCode(db, 'a@x.io', 'lid4', ctx(T0 + OTP.FAIL_WINDOW_S + 70));
  assert.ok(r3.code);
  assert.equal((await verifyCode(db, 'lid4', r3.code!, ctx(T0 + OTP.FAIL_WINDOW_S + 71))).ok, true);
});

test('unknown login ids lock out the same way (no allowlist oracle)', async () => {
  const db = testDb();
  for (let i = 0; i < 2; i++) assert.deepEqual(await verifyCode(db, 'nope', '123456', ctx(T0 + i)), { ok: false, reason: 'invalid' });
  assert.deepEqual(await verifyCode(db, 'nope', '123456', ctx(T0 + 3)), { ok: false, reason: 'locked' });
});

test('allowlist gating: non-allowlisted email gets no code (and no row)', async () => {
  const db = testDb();
  assert.deepEqual(await requestCode(db, 'b@x.io', 'lid', ctx()), { code: null, reason: 'not_allowed' });
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM otp_codes').first('n'), 0);
  assert.equal((await resendCode(db, 'lid', ctx(T0 + 100))).code, null);
});

test('throttles: resend within 60 s, per-email hourly cap, per-IP cap, daily mail cap', async () => {
  const db = testDb();
  await allow(db, 'a@x.io');
  assert.ok((await requestCode(db, 'a@x.io', 'l1', ctx(T0))).code);
  assert.deepEqual(await requestCode(db, 'a@x.io', 'l1', ctx(T0 + 30)), { code: null, reason: 'too_soon' });
  for (let i = 1; i < OTP.SENDS_PER_EMAIL_HOUR; i++) assert.ok((await requestCode(db, 'a@x.io', 'l1', ctx(T0 + 61 * i))).code);
  assert.equal((await requestCode(db, 'a@x.io', 'l1', ctx(T0 + 61 * 5))).code, null);

  const db2 = testDb();
  for (let i = 0; i < OTP.REQUESTS_PER_IP_HOUR; i++) await requestCode(db2, `n${i}@x.io`, 'l', ctx(T0 + i));
  await allow(db2, 'a@x.io');
  assert.deepEqual(await requestCode(db2, 'a@x.io', 'l', ctx(T0 + 50)), { code: null, reason: 'ip_cap' });
  assert.ok((await requestCode(db2, 'a@x.io', 'l', ctx(T0 + 50, '192.0.2.9'))).code, 'other IP fine');

  const db3 = testDb();
  await allow(db3, 'a@x.io');
  for (let i = 0; i < OTP.MAILS_PER_DAY; i++) await db3.prepare("INSERT INTO events (kind, at) VALUES ('mail', ?)").bind(T0).run();
  assert.deepEqual(await requestCode(db3, 'a@x.io', 'l', ctx(T0 + 1)), { code: null, reason: 'daily_cap' });
});

test('sessions: create, read, allowlist revocation, logout-all, fresh token per login', async () => {
  const db = testDb();
  await allow(db, 'a@x.io');
  const s1 = await completeLogin(db, 'a@x.io', T0);
  const s2 = await completeLogin(db, 'a@x.io', T0 + 5);
  assert.equal(s1.userId, s2.userId);
  assert.notEqual(s1.token, s2.token);
  assert.match(s1.userId, /^usr_[0-9a-f]{24}$/);
  assert.deepEqual(await readSession(db, s1.token, T0 + 10), { userId: s1.userId, email: 'a@x.io' });
  assert.equal(await readSession(db, 'forged', T0 + 10), null);
  assert.equal(await readSession(db, undefined, T0 + 10), null);
  assert.equal(await readSession(db, s1.token, T0 + 31 * 86400), null, 'expired');
  const stored = await db.prepare('SELECT token_hash FROM sessions LIMIT 1').first<string>('token_hash');
  assert.ok(stored !== s1.token && stored !== s2.token, 'only hashes stored');

  await endAllSessions(db, s1.userId);
  assert.equal(await readSession(db, s1.token, T0 + 10), null);
  assert.equal(await readSession(db, s2.token, T0 + 10), null);

  const s3 = await completeLogin(db, 'a@x.io', T0 + 20);
  await db.prepare('DELETE FROM preview_allowlist WHERE email = ?').bind('a@x.io').run();
  assert.equal(await readSession(db, s3.token, T0 + 21), null, 'revoked allowlist = no access');
});

test('deleteUser removes user, sessions, allowlist and requests', async () => {
  const db = testDb();
  await allow(db, 'a@x.io');
  await createSignupRequest(db, { email: 'a@x.io', plan: 'free', company: null, note: null }, '192.0.2.1', T0);
  const s = await completeLogin(db, 'a@x.io', T0);
  await deleteUser(db, { userId: s.userId, email: 'a@x.io' });
  for (const t of ['users', 'sessions', 'preview_allowlist', 'signup_requests']) assert.equal(await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first('n'), 0, t);
});

test('signup: parse, dedupe pending, per-IP cap, approve → allowlist, reject', async () => {
  assert.equal(parseSignup({ email: 'x', plan: 'free', consent: true }).ok, false);
  assert.equal(parseSignup({ email: 'a@x.io', plan: 'gold', consent: true }).ok, false);
  assert.equal(parseSignup({ email: 'a@x.io', plan: 'free' }).ok, false, 'consent required');
  assert.deepEqual(parseSignup({ email: ' A@X.io ', plan: 'pro', company: ' Acme ', note: '', consent: true }), {
    ok: true,
    value: { email: 'a@x.io', plan: 'pro', company: 'Acme', note: null },
  });

  const db = testDb();
  const v = { email: 'a@x.io', plan: 'starter' as const, company: null, note: null };
  const id = await createSignupRequest(db, v, '192.0.2.1', T0);
  assert.ok(id);
  assert.equal(await createSignupRequest(db, v, '192.0.2.1', T0 + 1), null, 'duplicate pending');
  for (let i = 0; i < 5; i++) await createSignupRequest(db, { ...v, email: `n${i}@x.io` }, '192.0.2.7', T0);
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM signup_requests WHERE ip = '192.0.2.7'").first('n'), 5);
  assert.equal(await createSignupRequest(db, { ...v, email: 'z@x.io' }, '192.0.2.7', T0 + 2), null, 'ip cap');

  assert.equal(await approveRequest(db, id!, 'pro', T0 + 5), 'a@x.io');
  assert.equal(await approveRequest(db, id!, 'pro', T0 + 6), null, 'only pending');
  assert.equal(await db.prepare('SELECT plan FROM preview_allowlist WHERE email = ?').bind('a@x.io').first('plan'), 'pro');
  assert.equal(await createSignupRequest(db, v, '192.0.2.1', T0 + 10), null, 'already allowlisted');

  const id2 = await createSignupRequest(db, { ...v, email: 'r@x.io' }, '192.0.2.2', T0);
  assert.equal(await rejectRequest(db, id2!, T0 + 1), true);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM preview_allowlist WHERE email = ?').bind('r@x.io').first('n'), 0);
  await cleanup(db, T0 + 91 * 86400);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM signup_requests WHERE id = ?').bind(id2).first('n'), 0, 'old rejected purged');
});

test('sendMail: posts to Resend, respects daily cap, no key = skipped', async () => {
  const db = testDb();
  const calls: RequestInit[] = [];
  const fake = (async (_u: string, init: RequestInit) => (calls.push(init), new Response('{}'))) as unknown as typeof fetch;
  assert.equal(await sendMail(db, {}, { to: 'a@x.io', subject: 's', text: 't' }, T0, fake), false);
  assert.equal(await sendMail(db, { RESEND_OTP_API_KEY: 'k' }, { to: 'a@x.io', subject: 's', text: 't' }, T0, fake), true);
  const body = JSON.parse(String(calls[0].body));
  assert.equal(body.from, '3DreamLab <login@3dreamlab.com>');
  assert.deepEqual(body.to, ['a@x.io']);
  for (let i = 1; i < OTP.MAILS_PER_DAY; i++) await db.prepare("INSERT INTO events (kind, at) VALUES ('mail', ?)").bind(T0).run();
  assert.equal(await sendMail(db, { RESEND_OTP_API_KEY: 'k' }, { to: 'a@x.io', subject: 's', text: 't' }, T0, fake), false, 'cap');
  assert.equal(calls.length, 1);
});
