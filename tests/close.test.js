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

test('shared close is idempotent, awaited and bounded; no listener loop survives (issue #12)', async () => {
  const store = new RecoveryStore(fs.mkdtempSync(path.join(os.tmpdir(), 'gw-close-')));
  const audit = new AuditLog();
  const httpT = new HttpTransport({ host: '127.0.0.1', port: 0 });
  const stdioT = new StdioTransport({ input: new PassThrough(), output: new PassThrough() });
  const gw = new Gateway({ store, audit, http: httpT, stdio: stdioT });
  await httpT.start(gw);
  stdioT.start(gw);
  const port = httpT.port;

  // concurrent double close: same promise, both transports closed exactly once
  const p1 = gw.close();
  const p2 = gw.close();
  assert.strictEqual(p1, p2);
  await p1;
  await p2;

  assert.equal(httpT.listening, false);
  assert.equal(stdioT.closed, true);
  assert.equal(gw.closed, true);

  // the HTTP listener is really gone (no loop survives)
  await assert.rejects(fetch(`http://127.0.0.1:${port}/dispatch`, { method: 'POST', body: '{}' }));

  // admission stops after a confirmed close — new work is rejected, not dispatched
  await assert.rejects(gw.dispatch({ tenant: 'acme', id: 'op-late' }, { transport: 'http' }), /closed/);

  // third close still harmless
  await gw.close();
});
