#!/usr/bin/env node
// Independent fixture verifier. It intentionally does not repair or reserialize a bundle.
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(process.argv[2] || 'fixtures/historical-bundles.json', 'utf8'));
let failures = 0;
for (const b of input.bundles) {
  let last = 'GENESIS'; let expected = 1;
  for (const r of b.records) {
    if (r.seq !== expected) { console.error(`${b.bundleId}: non-contiguous seq ${r.seq}, expected ${expected}`); failures++; }
    if (r.prev !== last) { console.error(`${b.bundleId}: prev mismatch at ${r.seq}`); failures++; }
    last = r.hash; expected++;
  }
  if (!b.sealed || !b.signature || !b.signature.value) { console.error(`${b.bundleId}: missing sealed signature metadata`); failures++; }
  if (![1,2].includes(b.format)) { console.error(`${b.bundleId}: unsupported format`); failures++; }
}
if (failures) { console.error(`verification failed: ${failures}`); process.exit(1); }
console.log(`verified ${input.bundles.length} historical bundles without mutation`);