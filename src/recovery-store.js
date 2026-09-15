'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { isCanonicalKey } = require('./keys');

function fileNameFor(key) {
  return Buffer.from(key, 'utf8').toString('base64url') + '.json';
}

// Durable recovery store. One JSON record per canonical key.
// Writes are tmp-file + fsync + atomic rename + directory fsync, so a result is
// durable only after the staged record AND its checksum are atomically published
// (contract §2, issue #4). Crash-torn '*.tmp' files are never promoted nor listed.
//
// POLICY PENDING (not decided here):
//  - checksum algorithm/format is provisional (sha256 hex) — open question in PR #20;
//  - retention/release of fenced records — owner decision (contract 'Known gaps');
//  - anomaly cap/eviction — owner decision (issue #13); anomalies are retained
//    unbounded rather than inventing an eviction policy.
class RecoveryStore {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  _file(key) {
    return path.join(this.dir, fileNameFor(key));
  }

  async _writeAtomic(file, data) {
    const tmp = file + '.tmp';
    const fh = await fsp.open(tmp, 'w');
    await fh.writeFile(data);
    await fh.sync();
    await fh.close();
    await fsp.rename(tmp, file); // atomic publish
    const dh = await fsp.open(path.dirname(file), 'r');
    await dh.sync();
    await dh.close();
  }

  // Intent record: durable metadata only. `session` is ephemeral and is NEVER
  // serialized into recovery state (contract §3, issue #7).
  async writeIntent(key, op) {
    const rec = { key, op, state: 'intent-written', downstream: 'unknown' };
    await this._writeAtomic(this._file(key), JSON.stringify(rec));
    return rec;
  }

  // Staged result + checksum, atomically published (contract §2, issue #4).
  async publishResult(key, result) {
    const payload = JSON.stringify(result);
    const checksum = crypto.createHash('sha256').update(payload).digest('hex');
    const rec = { key, state: 'result-written', downstream: 'confirmed', result, checksum };
    await this._writeAtomic(this._file(key), JSON.stringify(rec));
    return rec;
  }

  async read(key) {
    try {
      return JSON.parse(await fsp.readFile(this._file(key), 'utf8'));
    } catch {
      return null;
    }
  }

  // Startup listing: unpublished staging ('*.tmp') never surfaces; unreadable
  // entries are reported as malformed instead of crashing startup (issue #1).
  async list() {
    const names = await fsp.readdir(this.dir);
    const out = [];
    for (const n of names) {
      if (n.endsWith('.tmp') || !n.endsWith('.json')) continue;
      try {
        out.push(JSON.parse(await fsp.readFile(path.join(this.dir, n), 'utf8')));
      } catch (e) {
        out.push({ key: null, file: n, state: 'malformed', error: String(e) });
      }
    }
    return out;
  }

  // Startup validation (issue #1). Anything not provably well-formed is rejected
  // for quarantine — never dispatched.
  inspect(entry) {
    if (!entry || typeof entry.key !== 'string') return { ok: false, reason: 'unreadable entry' };
    if (!isCanonicalKey(entry.key)) return { ok: false, reason: 'non-canonical key encoding' };
    if ('session' in entry) return { ok: false, reason: 'ephemeral session serialized in durable state' };
    if (entry.state === 'result.tmp' || entry.state === 'result-staged') {
      const payload = entry.result === undefined ? null : JSON.stringify(entry.result);
      const actual = payload === null ? null : crypto.createHash('sha256').update(payload).digest('hex');
      if (!entry.checksum || entry.checksum !== actual) {
        return { ok: false, reason: 'staged result checksum mismatch' }; // e.g. fixture r-02
      }
    }
    const known = ['intent-written', 'result-written', 'fenced', 'retained'];
    if (!known.includes(entry.state)) return { ok: false, reason: `unknown state: ${entry.state}` };
    return { ok: true };
  }

  // Fence an entry: retain intent + anomaly metadata (contract §7). Fenced entries
  // are never dispatched and never counted as scheduled retries (issue #14).
  async fence(key, anomaly) {
    const cur = (await this.read(key)) || { key };
    const rec = {
      ...cur,
      state: 'fenced',
      anomaly: { ...(cur.anomaly || {}), ...anomaly, fencedAt: new Date().toISOString() },
    };
    await this._writeAtomic(this._file(key), JSON.stringify(rec));
    return rec;
  }

  // Malformed state is quarantined (fenced with quarantine metadata), never
  // dispatched, never deleted (issue #1).
  async quarantine(entry, reason) {
    if (entry && entry.key) return this.fence(entry.key, { quarantined: true, reason });
    return null;
  }

  // Confirmed downstream outcome: retain the durable record WITHOUT re-execution
  // (issue #5). Recovery never calls dispatch for these.
  async markRetained(key) {
    const cur = await this.read(key);
    const rec = { ...cur, state: 'retained', retained: true };
    await this._writeAtomic(this._file(key), JSON.stringify(rec));
    return rec;
  }
}

module.exports = { RecoveryStore, fileNameFor };
