'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalKey, isCanonicalKey, readLegacyBundleKey } = require('../src/keys');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'historical-bundles.json');
const FIXTURE_SHA256 = '8aeda3a48669d9b2d7429cca12691f50fa60e7e5051af78d8a9018f40ded7740';

test('canonical key uses NFC tenant:operationId without percent-encoding (issue #6)', () => {
  const { key, aliased } = canonicalKey('acme', 'op-001');
  assert.equal(key, 'acme:op-001');
  assert.equal(aliased, false);
  assert.ok(!key.includes('%'), 'regression: baseline encodeURIComponent produced %3A');
});

test('NFC vs NFD inputs canonicalize without silent aliasing (issues #6)', () => {
  const precomposed = canonicalKey('nfc-é', 'op-007');
  const decomposed = canonicalKey('nfc-é', 'op-007');
  assert.equal(precomposed.key, decomposed.key); // canonical form is shared BY DESIGN
  assert.equal(decomposed.aliased, true); // but the aliasing is surfaced, not silent
  // strings that normalize differently must not alias:
  assert.notEqual(canonicalKey('nfc-é', 'op-007').key, canonicalKey('nfc-é', 'op-008').key);
  assert.notEqual(canonicalKey('acme', 'op-1').key, canonicalKey('acme-west', 'op-1').key);
});

test('canonical key rejects empty or colon-bearing parts', () => {
  assert.throws(() => canonicalKey('', 'op'));
  assert.throws(() => canonicalKey('a:b', 'op'));
});

test('isCanonicalKey validation used at startup', () => {
  assert.equal(isCanonicalKey('acme:op-101'), true);
  assert.equal(isCanonicalKey('acme%3Aop-105'), false); // fixture r-05
  assert.equal(isCanonicalKey('no-separator'), false);
});

test('legacy reader accepts format 1 (%2F) and format 2 (base64url), read-only (issue #11)', () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const byId = Object.fromEntries(fixture.bundles.map((b) => [b.bundleId, b]));
  assert.equal(readLegacyBundleKey(byId['legacy-001']), 'acme/west:op-001'); // format 1, %2F
  assert.equal(readLegacyBundleKey(byId['legacy-003']), 'acme:east:op-003'); // format 2 base64url
  assert.equal(readLegacyBundleKey(byId['legacy-006']), 'tenant-beta:op-006');
  assert.equal(readLegacyBundleKey(byId['legacy-010']), 'acme:op-010'); // format 1, plain
  // sealed evidence is never mutated by reading:
  const sha = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex');
  assert.equal(sha, FIXTURE_SHA256);
});
