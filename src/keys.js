'use strict';
// Canonical operation keys (contract §1) and read-only legacy bundle key reader (issue #11).

// Canonical key: UTF-8, NFC-normalized `tenant + ':' + operationId`.
// Never percent-encoded (regression: baseline used encodeURIComponent, producing
// silent '%3A' collisions with the contract). Strings that differ only by Unicode
// composition normalize to the SAME canonical key; this is detected and surfaced
// via `aliased` instead of aliasing silently. Strings that normalize differently
// keep distinct keys.
function canonicalKey(tenant, operationId) {
  if (tenant == null || operationId == null) throw new TypeError('tenant and operationId are required');
  const rawTenant = String(tenant);
  const rawId = String(operationId);
  const t = rawTenant.normalize('NFC');
  const i = rawId.normalize('NFC');
  if (t.length === 0 || i.length === 0) throw new TypeError('tenant and operationId must be non-empty');
  if (t.includes(':') || i.includes(':')) throw new TypeError('tenant and operationId must not contain \':\'');
  return { key: `${t}:${i}`, aliased: t !== rawTenant || i !== rawId };
}

// A stored recovery key must already be canonical: NFC, no percent-encoding,
// exactly one ':' separator. Anything else (e.g. fixture r-05 'acme%3Aop-105')
// is treated as malformed state at startup, never silently decoded.
function isCanonicalKey(key) {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (key !== key.normalize('NFC')) return false;
  if (key.includes('%')) return false;
  const parts = key.split(':');
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

// Read-only interpretation of historical bundle keys (issue #11).
// Format 1 keys may be percent-encoded (%2F); format 2 keys are base64url.
// This NEVER writes back to a bundle: sealed bundles are immutable evidence (contract §5).
function readLegacyBundleKey(bundle) {
  if (bundle.format === 1) return decodeURIComponent(bundle.key);
  if (bundle.format === 2) return Buffer.from(bundle.key, 'base64url').toString('utf8');
  throw new Error(`unsupported legacy format: ${bundle.format}`);
}

module.exports = { canonicalKey, isCanonicalKey, readLegacyBundleKey };
