# Prior review fragments (unresolved)

- 2026-09-08: proposal suggested reserializing v1 keys into v2 on startup. Rejected informally because it might mutate sealed evidence; no decision record exists.
- 2026-09-10: transport maintainer observed stdio emits a JSON response for notifications. Reproduction was attached only in chat; issue is open.
- 2026-09-11: shutdown report says HTTP close can race stdio close. It is unclear whether this is one defect or two.
- 2026-09-12: a contributor claimed replay is idempotent. No downstream receipt was provided, so this is not evidence for replay.
- 2026-09-13: a previous “green” note exercised a mock dispatcher, not the real HTTP/stdio dispatch path.

No reviewer identities, approvals, or owner decisions are recorded here. Two independent durability opinions still need to be obtained and the retained choice documented before implementation.