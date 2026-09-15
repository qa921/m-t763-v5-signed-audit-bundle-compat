'use strict';
const readline = require('node:readline');

// Real stdio transport: NDJSON over an input/output stream pair.
// A line WITH an `id` is a request and gets exactly one response line.
// A line WITHOUT an `id` is a notification and gets NO response line —
// notifications receive no response envelope (contract §8, issue #15).
// Admission/audit semantics are shared with HTTP via the gateway (issue #10).
class StdioTransport {
  constructor({ input, output, gateway = null, downstream = null } = {}) {
    this.input = input;
    this.output = output;
    this.gateway = gateway;
    this.downstream = downstream || (async (op) => ({ ok: true, echo: op }));
    this.rl = null;
    this.closed = false;
  }

  start(gateway) {
    if (gateway) this.gateway = gateway;
    this.rl = readline.createInterface({ input: this.input, terminal: false });
    this.rl.on('line', (line) => {
      this._onLine(line).catch(() => {});
    });
    return this;
  }

  async _onLine(line) {
    if (this.closed) return; // no loop survives a confirmed close
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // malformed input is ignored, never answered
    }
    if (msg.id === undefined) {
      await this.gateway.notify(msg.op, { transport: 'stdio' });
      return; // no response envelope
    }
    try {
      const result = await this.gateway.dispatch(msg.op, { transport: 'stdio' });
      this.output.write(JSON.stringify({ id: msg.id, result }) + '\n');
    } catch (e) {
      this.output.write(JSON.stringify({ id: msg.id, error: String((e && e.message) || e) }) + '\n');
    }
  }

  async send(op) {
    return this.downstream(op);
  }

  // Idempotent: removes the readline listener so nothing survives close (issue #12).
  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.rl) {
      this.rl.removeAllListeners('line');
      this.rl.close();
      this.rl = null;
    }
  }
}

module.exports = { StdioTransport };
