'use strict';
const { canonicalKey } = require('./keys');

// Recovery gateway. HTTP and stdio transports share admission and audit-append
// semantics through admit()/dispatch()/notify() (contract §8).
//
// POLICY PENDING (issue #2 / #16 — two independent durability reviews required):
// the durable ordering of intent-store-write versus audit-append versus transport
// admission is UNCHANGED from the baseline on purpose. The defect is confirmed
// but choosing the durable ordering is a policy decision that is NOT ratified;
// see docs/decisions/2026-09-15-durability-reviews-blocked.md. The sequencing is
// localized in dispatch() so the ratified policy can be applied in exactly one place.
class Gateway {
  constructor({ store, audit, http, stdio }) {
    this.store = store;
    this.audit = audit;
    this.http = http;
    this.stdio = stdio;
    this.closed = false;
    this._closing = null;
    this.metrics = { retriesScheduled: 0 }; // fenced entries never increment this (issue #14)
  }

  // Shared admission for both transports (issues #10/#15).
  async admit(op) {
    if (this.closed) throw new Error('gateway closed');
    return canonicalKey(op.tenant, op.id); // canonical NFC key, never percent-encoded (issue #6)
  }

  async dispatch(op, session) {
    const { key } = await this.admit(op);
    // POLICY PENDING (#2): ordering below intentionally matches the baseline.
    await this.audit.append({ key, kind: 'intent' }); // chain derives seq/prev (issue #3)
    await this.store.writeIntent(key, op); // session is never serialized (issue #7)
    const transport = session.transport === 'stdio' ? this.stdio : this.http;
    const result = await transport.send(op);
    await this.store.publishResult(key, result); // staged + checksum + atomic publish (issue #4)
    await this.audit.append({ key, kind: 'result' });
    return result;
  }

  // Notifications share the full admission/audit/store path but return NO
  // response envelope (contract §8, issue #15).
  async notify(op, session) {
    await this.dispatch(op, session);
    return undefined;
  }

  // Startup recovery. Ambiguous operations are protected (fenced/quarantined),
  // never replayed (contract §7, issues #1/#5/#14/#19).
  // Emits NO audit events — whether recovery may append to the chain is an open
  // policy question (PR #20), so the evidence order is left untouched (issue #3).
  async recover() {
    const report = { fenced: 0, quarantined: 0, retained: 0, retriesScheduled: 0, anomalies: [] };
    for (const entry of await this.store.list()) {
      const v = this.store.inspect(entry);
      if (!v.ok) {
        await this.store.quarantine(entry, v.reason); // malformed state (issue #1)
        report.quarantined++;
        report.anomalies.push({ key: entry.key || null, reason: v.reason });
        continue;
      }
      if (entry.state === 'fenced') continue; // stays fenced, never a retry (issue #14)
      if (entry.downstream === 'unknown') {
        await this.store.fence(entry.key, { reason: 'downstream outcome unknown at crash' }); // issue #19
        report.fenced++;
        report.anomalies.push({ key: entry.key, reason: 'downstream unknown' });
        continue;
      }
      if (entry.state === 'intent-written' && entry.downstream === 'confirmed') {
        await this.store.markRetained(entry.key); // confirmed result, no re-execution (issue #5)
        report.retained++;
        continue;
      }
      // result-written + confirmed: fully durable, nothing to do.
    }
    this.metrics.retriesScheduled = report.retriesScheduled;
    return report;
  }

  // Idempotent, awaited, bounded shared close (contract §8, issue #12):
  // closing twice returns the same promise; both transports are always attempted;
  // admission is stopped immediately so no loop survives a confirmed close.
  async close() {
    if (this._closing) return this._closing;
    this.closed = true;
    this._closing = (async () => {
      const results = await Promise.allSettled([this.http.close(), this.stdio.close()]);
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length) {
        throw new Error('close incomplete: ' + failures.map((f) => String(f.reason)).join('; '));
      }
    })();
    return this._closing;
  }
}

module.exports = { Gateway };
