'use strict';
const crypto = require('node:crypto');

// Append-only audit chain (contract §4): records append in increasing `seq`,
// `prev` always equals the prior record hash ('GENESIS' for the first).
// seq/prev are DERIVED here, never supplied by callers — fixes the baseline
// defect where recovery appended 'recovered' records without chain linkage (issue #3).
//
// POLICY PENDING: whether recovery itself may emit audit events is an open
// question (PR #20). Until decided, recovery appends NOTHING to this chain.
class AuditLog {
  constructor() {
    this.records = [];
  }

  append({ key, kind }) {
    const prev = this.records.length ? this.records[this.records.length - 1].hash : 'GENESIS';
    const seq = this.records.length + 1;
    const rec = { seq, key, kind, prev };
    rec.hash = crypto.createHash('sha256').update(JSON.stringify(rec)).digest('hex');
    this.records.push(rec);
    return rec;
  }

  get length() {
    return this.records.length;
  }
}

module.exports = { AuditLog };
