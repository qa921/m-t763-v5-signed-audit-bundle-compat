# Recovery + signed audit compatibility contract (draft)

## Invariants
1. Canonical operation key is UTF-8, NFC-normalized `tenant + ':' + operationId`; strings that normalize differently must not alias silently.
2. A recovery intent is durable only after its append record is fsynced. A result is durable only after the staged result and its checksum are atomically published.
3. `session` is ephemeral. It MUST NOT be serialized in recovery state.
4. Audit records append in increasing `seq`; `prev` must equal the prior record hash. Chain order is never reconstructed by filesystem order.
5. Historical bundles with `format: 1` or `format: 2` and `sealed: true` are immutable evidence. Their bytes, declared hash, signature metadata, and evidence status are read-only.
6. The independent verifier defines compatibility: legacy input must verify unchanged before and after a migration attempt.
7. Any uncertain downstream outcome is `fenced`: retain intent + anomaly metadata, do not dispatch, and do not increment retry metrics. This is explicitly **not exactly-once**.
8. HTTP and stdio transports share dispatch admission and audit append semantics. Notifications receive no response envelope. Closing twice must be harmless; no loop may survive a confirmed close.

## Known gaps / owner decisions
- Release and retention for fenced records are owner decisions; no automatic retry policy is approved.
- Durability ordering for intent versus admission needs two independent design reviews before implementation.
- The verifier validates chain/hash shape only; it does not validate remote side effects, KMS signature provenance, or power-loss behavior.

## Legacy shape
`{format, sealed, bundleId, records:[{seq,key,kind,payload,prev,hash}], signature:{alg,keyId,value}}`

Format 1 keys may contain `%2F`; format 2 keys use base64url. A compatible reader accepts both, but all *new* storage keys must use the canonical encoding described above.