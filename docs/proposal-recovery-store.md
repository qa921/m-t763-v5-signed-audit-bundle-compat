# WIP proposal — recovery store

This proposal is intentionally incomplete and **not approved**.

Suggested direction: separate durable `intent` and `result` records, quarantine unknown outcomes, and retain legacy bundle reader. Open questions: exact fsync/admission ordering; integrity checksum format; retention and release of fenced entries; whether recovery may emit an audit event. The proposal contains no independent durability reviews and no compatibility-run evidence.

Do not merge until the contract, verifier outputs, and two independent reviews are reconciled.