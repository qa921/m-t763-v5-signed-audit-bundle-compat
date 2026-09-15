'use strict';
const http = require('node:http');

// Real HTTP transport. Listens on the configured interface (default loopback
// 127.0.0.1 — the intended interface for this gateway).
// Admission and audit semantics are shared with stdio via gateway.dispatch/notify
// (contract §8, issue #10). Notifications get HTTP 204 with an EMPTY body —
// no response envelope (contract §8, issue #15).
class HttpTransport {
  constructor({ host = '127.0.0.1', port = 0, gateway = null, downstream = null } = {}) {
    this.host = host;
    this.port = port;
    this.gateway = gateway;
    this.downstream = downstream || (async (op) => ({ ok: true, echo: op }));
    this.server = null;
    this.listening = false;
  }

  async start(gateway) {
    if (gateway) this.gateway = gateway;
    this.server = http.createServer((req, res) => {
      this._handle(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, resolve);
    });
    this.listening = true;
    this.port = this.server.address().port;
    return this;
  }

  async _handle(req, res) {
    const body = await readBody(req);
    const op = JSON.parse(body || '{}');
    if (req.method === 'POST' && req.url === '/notify') {
      await this.gateway.notify(op, { transport: 'http' });
      res.writeHead(204);
      res.end(); // no response envelope for notifications
      return;
    }
    if (req.method === 'POST' && req.url === '/dispatch') {
      const result = await this.gateway.dispatch(op, { transport: 'http' });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result }));
      return;
    }
    res.writeHead(404);
    res.end();
  }

  // Downstream call performed by the gateway dispatch path.
  async send(op) {
    return this.downstream(op);
  }

  // Awaited, idempotent and bounded: safe to call twice, never waits forever.
  async close() {
    const server = this.server;
    if (!server) {
      this.listening = false;
      return;
    }
    this.server = null;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000); // bounded close
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.listening = false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = { HttpTransport };
