# Notes d'implémentation — correctifs sans ambiguïté (2026-09-15)

Branche `impl/m-t763-v5-recovery-fixes`, empilée sur `analysis/m-t763-v5-verifier-baseline` (PR #21), elle-même rattachée à la proposal #20. **Aucune politique de durabilité n'est choisie ici.**

## Corrigé (indépendant de la politique)

| Issue | Correctif | Test |
|---|---|---|
| #12 | `Gateway.close()` : idempotent (même promesse), awaité, borné (timeout transport), les deux transports toujours tentés (`allSettled`), admission coupée immédiatement | `tests/close.test.js`, `tests/stdio.test.js` |
| #15 | Notifications : HTTP → 204 corps vide ; stdio → aucune ligne de réponse | `tests/http-dispatch.test.js`, `tests/stdio.test.js` |
| #10 | Parité d'admission HTTP/stdio via `admit()`/`dispatch()`/`notify()` partagés ; vrais transports (serveur `node:http` sur 127.0.0.1, NDJSON stdio) au lieu de mocks | `tests/http-dispatch.test.js`, `tests/stdio.test.js` |
| #6 | Clé canonique NFC `tenant:operationId`, jamais percent-encodée ; alias NFC/NFD détecté (`aliased`) au lieu d'être silencieux | `tests/keys.test.js` |
| #3 | `AuditLog` dérive `seq`/`prev` (chaîne sha256) ; recovery n'écrit rien dans la chaîne | `tests/http-dispatch.test.js`, `tests/recovery.test.js` |
| #7 | `writeIntent` ne sérialise jamais `session` ; `r-01` quarantainé au démarrage | `tests/recovery.test.js` |
| #4 | `publishResult` : staging tmp + checksum + rename atomique (+fsync fichier/répertoire) ; `r-02` jamais promu | `tests/recovery.test.js` |
| #1 | `inspect()` + quarantaine au démarrage : état malformé contenu, ni crash ni dispatch | `tests/recovery.test.js` |
| #5 | `r-03` (confirmé) → `retained`, zéro appel `dispatch` | `tests/recovery.test.js` |
| #14 | Entrées `fenced` jamais comptées en retry (`retriesScheduled === 0`) ; `r-06` intacte | `tests/recovery.test.js` |
| #19 | `r-04`/`r-07` fencés avec métadonnées d'anomalie ; aucune promesse exactly-once | `tests/recovery.test.js` |
| #11 | Lecteur legacy lecture seule : format 1 (`%2F`) et format 2 (base64url) | `tests/keys.test.js` |
| #8/#9 | Frontière du vérificateur verrouillée par test (exit 1, 2 erreurs exactes, sha256 fixture inchangé) | `tests/compat.test.js` |

## Explicitement NON fait — dépend de la politique (2 revues indépendantes requises)

1. **#2 — ordre de durabilité intent-vs-admission** : `dispatch()` conserve l'ordre baseline avec marqueur `POLICY PENDING` ; la séquence est localisée à un seul endroit pour appliquer la politique ratifiée plus tard.
2. **Format du checksum** : sha256 hex **provisoire** (question ouverte PR #20).
3. **Événements d'audit en recovery** : aucun émis (question ouverte PR #20) — l'ordre de la preuve est préservé par abstention.
4. **Rétention/release des `fenced`** : tout est conservé, rien n'est supprimé (décision owner, contrat « Known gaps »).
5. **Cap/éviction des anomalies (#13)** : conservation sans borne plutôt qu'inventer une sémantique non approuvée.
6. **Écriture d'un nouveau format de stockage (#11)** : lecture legacy seulement.
7. **Politique de retry automatique** : aucune (contrat §7 — pas d'exactly-once implicite).
