import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localePath, stripLocale } from './i18n.ts';

test('stripLocale removes fi/sv prefix and normalizes trailing slash', () => {
  assert.equal(stripLocale('/'), '/');
  assert.equal(stripLocale('/fi'), '/');
  assert.equal(stripLocale('/fi/'), '/');
  assert.equal(stripLocale('/sv/'), '/');
  assert.equal(stripLocale('/fi/store'), '/store/');
  assert.equal(stripLocale('/fi/store/'), '/store/');
  assert.equal(stripLocale('/store/'), '/store/');
  assert.equal(stripLocale('/store'), '/store/');
});

test('localePath adds locale prefix for non-default locales', () => {
  assert.equal(localePath('en', '/'), '/');
  assert.equal(localePath('fi', '/'), '/fi/');
  assert.equal(localePath('sv', '/'), '/sv/');
  assert.equal(localePath('en', '/store/'), '/store/');
  assert.equal(localePath('fi', '/store/'), '/fi/store/');
  assert.equal(localePath('sv', '/store/'), '/sv/store/');
});
