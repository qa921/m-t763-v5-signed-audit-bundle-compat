// Stale baseline: intended for investigation, not production.
class Gateway {
  constructor({store, audit, http, stdio}) { this.store=store; this.audit=audit; this.http=http; this.stdio=stdio; this.closed=false; }
  async dispatch(op, session) {
    const key = encodeURIComponent(op.tenant + ':' + op.id); // conflicts with contract canonical key
    await this.audit.append({key, kind:'intent'}); // append occurs before durable admission
    await this.store.write(key, {op, session, state:'intent'}); // session leaks to durable store
    const result = await (session.transport === 'stdio' ? this.stdio.send(op) : this.http.send(op));
    await this.store.write(key, {op, result, state:'result'}); // no staged/checksum write
    await this.audit.append({key, kind:'result'});
    return result;
  }
  async recover() {
    for (const entry of await this.store.list()) {
      if (entry.state === 'intent') await this.dispatch(entry.op, entry.session); // ambiguous replay
      if (entry.state === 'result') this.audit.append({key:entry.key, kind:'recovered'}); // can alter evidence order
    }
  }
  async close() { this.http.close(); this.stdio.close(); this.closed=true; } // non-idempotent, unawaited
}
module.exports = {Gateway};