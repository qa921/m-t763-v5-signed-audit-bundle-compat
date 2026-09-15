'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Gateway } = require('../src/gateway');
const { AuditLog } = require('../src/audit-log');
const { RecoveryStore } = require('../src/recovery-store');
const { HttpTransport } = require('../src/transports/http-transport');
const { StdioTransport } = require('../src/transports/stdio-transport');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gw-http-'));
}

test('real HTTP dispatch path: admission, audit chain, durable intent/result (issues #3 #6 #7 #10)', async () => {
  const store = new RecoveryStore(tmpdir());
  const audit = new AuditLog();
  const httpT = new HttpTransport({ host: '127.0.0.1', port: 0 });
  const stdioT = new StdioTransport({ input: process.stdin, output: process.stdout });
  const gw = new Gateway({ store, audit, http: httpT, stdio: stdioT });
  await httpT.start(gw);

  const res = await fetch(`http://127.0.0.1:${httpT.port}/dispatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'acme', id: 'op-1' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.result.ok, true);

  // audit chain: intent then result, seq/prev derived and linked (issue #3)
  assert.equal(audit.length, 2);
  assert.deepEqual(
    audit.records.map((r) => [r.seq, r.kind]),
    [
      [1, 'intent'],
      [2, 'result'],
    ]
  );
  assert.equal(audit.records[0].prev, 'GENESIS');
  assert.equal(audit.records[1].prev, audit.records[0].hash);
  assert.equal(audit.records[0].key, 'acme:op-1'); // canonical, no %3A (issue #6)

  // durable record: result published with checksum, session never serialized (issues #4 #7)
  const rec = await store.read('acme:op-1');
  assert.equal(rec.state, 'result-written');
  assert.ok(!('session' in rec));
  assert.ok(/^[0-9a-f]{64}$/.test(rec.checksum));

  await gw.close();
});

test('HTTP notification: shared admission, NO response envelope (issues #10 #15)', async () => {
  const store = new RecoveryStore(tmpdir());
  const audit = new AuditLog();
  const httpT = new HttpTransport({ host: '127.0.0.1', port: 0 });
  const stdioT = new StdioTransport({ input: process.stdin, output: process.stdout });
  const gw = new Gateway({ store, audit, http: httpT, stdio: stdioT });
  await httpT.start(gw);

  const res = await fetch(`http://127.0.0.1:${httpT.port}/notify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'acme', id: 'op-notify' }),
  });
  assert.equal(res.status, 204);
  assert.equal(await res.text(), ''); // no response envelope
  // admission/audit shared with requests:
  assert.equal(audit.length, 2);
  assert.equal(audit.records[0].key, 'acme:op-notify');

  await gw.close();
});
