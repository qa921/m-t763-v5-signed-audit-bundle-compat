'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { Gateway } = require('../src/gateway');
const { AuditLog } = require('../src/audit-log');
const { RecoveryStore } = require('../src/recovery-store');
const { HttpTransport } = require('../src/transports/http-transport');
const { StdioTransport } = require('../src/transports/stdio-transport');

function setup() {
  const store = new RecoveryStore(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-stdio-')));
  const audit = new AuditLog();
  const input = new PassThrough();
  const output = new PassThrough();
  let buf = '';
  output.on('data', (c) => {
    buf += c;
  });
  const stdioT = new StdioTransport({ input, output });
  const httpT = new HttpTransport({});
  const gw = new Gateway({ store, audit, http: httpT, stdio: stdioT });
  stdioT.start(gw);
  return { store, audit, input, output, stdioT, httpT, gw, lines: () => buf.split('\n').filter(Boolean) };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('real stdio path: request gets exactly one response envelope (issue #10)', async () => {
  const { input, gw, audit, lines } = setup();
  input.write(JSON.stringify({ id: 1, op: { tenant: 'acme', id: 'op-2' } }) + '\n');
  await wait(100);
  const out = lines();
  assert.equal(out.length, 1);
  const resp = JSON.parse(out[0]);
  assert.equal(resp.id, 1);
  assert.equal(resp.result.ok, true);
  assert.equal(audit.records[0].key, 'acme:op-2'); // shared admission path
  await gw.close();
});

test('stdio notification produces NO response line (issue #15)', async () => {
  const { input, gw, audit, lines } = setup();
  input.write(JSON.stringify({ op: { tenant: 'acme', id: 'op-n1' } }) + '\n'); // no id => notification
  await wait(150);
  assert.equal(lines().length, 0); // no response envelope on stdio
  assert.equal(audit.length, 2); // but admission/audit DID run (shared semantics)
  await gw.close();
});

test('stdio close removes the line listener; second close is harmless (issue #12)', async () => {
  const { stdioT, gw } = setup();
  await gw.close();
  assert.equal(stdioT.closed, true);
  assert.equal(stdioT.rl, null); // listener loop does not survive confirmed close
  await gw.close(); // idempotent
  await stdioT.close();
});
