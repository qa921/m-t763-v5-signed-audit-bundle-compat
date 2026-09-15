'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Gateway } = require('../src/gateway');
const { AuditLog } = require('../src/audit-log');
const { RecoveryStore, fileNameFor } = require('../src/recovery-store');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'historical-bundles.json');

// Seed a store dir with the fixture recovery records r-01..r-07, exactly as persisted.
function seed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-rec-'));
  const { recoveryRecords } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const rec of recoveryRecords) {
    fs.writeFileSync(path.join(dir, fileNameFor(rec.key)), JSON.stringify(rec));
  }
  // crash-torn staging file must never be promoted or listed (issue #4)
  fs.writeFileSync(path.join(dir, 'orphan.json.tmp'), '{"key":"acme:op-999"');
  return dir;
}

function setup(dir) {
  const store = new RecoveryStore(dir);
  const audit = new AuditLog();
  const noopTransport = { send: async () => ({}), close: async () => {} };
  const gw = new Gateway({ store, audit, http: noopTransport, stdio: noopTransport });
  let dispatchCalls = 0;
  const orig = gw.dispatch.bind(gw);
  gw.dispatch = async (...a) => {
    dispatchCalls++;
    return orig(...a);
  };
  return { store, audit, gw, dispatchCalls: () => dispatchCalls };
}

test('startup recovery: malformed state quarantined, ambiguous fenced, confirmed retained — nothing replayed (issues #1 #4 #5 #7 #14 #19)', async () => {
  const { store, audit, gw, dispatchCalls } = setup(seed());
  const report = await gw.recover();

  // recovery NEVER dispatches (no replay of ambiguous operations)
  assert.equal(dispatchCalls(), 0);
  // recovery emits NO audit events (policy pending — chain order untouched, issue #3)
  assert.equal(audit.length, 0);
  // fenced entries are never counted as scheduled retries (issue #14)
  assert.equal(report.retriesScheduled, 0);
  assert.equal(gw.metrics.retriesScheduled, 0);

  const r01 = await store.read('acme:op-101'); // session leaked (issue #7)
  assert.equal(r01.state, 'fenced');
  assert.equal(r01.anomaly.quarantined, true);
  assert.match(r01.anomaly.reason, /session/);

  const r02 = await store.read('acme:op-102'); // staged result, bad checksum (issue #4)
  assert.equal(r02.state, 'fenced');
  assert.equal(r02.anomaly.quarantined, true);
  assert.match(r02.anomaly.reason, /checksum/);
  assert.notEqual(r02.state, 'result-written'); // never promoted

  const r03 = await store.read('acme:op-103'); // confirmed intent: retained, NOT re-executed (issue #5)
  assert.equal(r03.state, 'retained');

  for (const key of ['acme:op-104', 'acme:op-107']) { // unknown downstream: fenced (issue #19)
    const r = await store.read(key);
    assert.equal(r.state, 'fenced');
    assert.match(r.anomaly.reason, /unknown/);
  }

  const r05 = await store.read('acme%3Aop-105'); // non-canonical key: quarantined (issue #6)
  assert.equal(r05.state, 'fenced');
  assert.match(r05.anomaly.reason, /non-canonical/);

  const r06 = await store.read('acme:op-106'); // already fenced: untouched, still not a retry
  assert.equal(r06.state, 'fenced');
  assert.equal(r06.anomaly, undefined);

  assert.equal(report.quarantined, 3); // r-01, r-02, r-05
  assert.equal(report.fenced, 2); // r-04, r-07
  assert.equal(report.retained, 1); // r-03

  // recovery is idempotent: second run changes nothing
  const again = await gw.recover();
  assert.equal(again.fenced, 0);
  assert.equal(again.quarantined, 0);
  assert.equal(again.retained, 0);
  assert.equal(dispatchCalls(), 0);
});
