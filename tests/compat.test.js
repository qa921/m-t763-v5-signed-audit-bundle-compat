'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(ROOT, 'fixtures', 'historical-bundles.json');
const VERIFIER = path.join(ROOT, 'tools', 'verify-audit-chain.js');
const FIXTURE_SHA256 = '8aeda3a48669d9b2d7429cca12691f50fa60e7e5051af78d8a9018f40ded7740';

// Locks the exact verifier boundary recorded in docs/verifier-baseline.md (issue #8):
// the independent verifier MUST keep failing on the two intentionally divergent
// sealed bundles, and MUST NOT mutate the fixture. If this test changes, the
// compatibility boundary changed and must be re-reviewed.
test('independent verifier boundary on sealed fixtures (issues #8 #9)', () => {
  const before = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex');
  assert.equal(before, FIXTURE_SHA256);

  const run = spawnSync(process.execPath, [VERIFIER, FIXTURE], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /legacy-002: non-contiguous seq 3, expected 2/);
  assert.match(run.stderr, /legacy-004: prev mismatch at 2/);
  assert.match(run.stderr, /verification failed: 2/);

  const after = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex');
  assert.equal(after, FIXTURE_SHA256); // sealed evidence unchanged (issue #9)
});
