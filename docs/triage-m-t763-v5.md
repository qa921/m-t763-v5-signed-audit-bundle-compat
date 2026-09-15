# Triage M-T763-V5 — issues #1–#19 + PR draft #20

Analyse du 2026-09-15. Références : `docs/contract.md`, `fixtures/historical-bundles.json`, `tools/verify-audit-chain.js`, `docs/prior-state.md`, PR #20 (`docs/proposal-recovery-store.md`).

## 1. Défauts confirmés — corrigeables sans décision de politique

| Issue | Sujet | Défaut | Preuve |
|---|---|---|---|
| #1 | T-04 startup quarantine | Le démarrage ne doit ni crasher ni dispatcher une entrée malformée ; contenir erreurs decode/checksum + anomalie bornée | `recover()` itère `store.list()` sans validation |
| #3 | T-03 ordre de la chaîne d'audit | `recover()` ajoute `recovered` sans dériver `seq`/`prev` → peut corrompre l'ordre de la preuve | `src/gateway.js`, contrat §4 |
| #4 | T-02 publication atomique du résultat | Écriture résultat sans staging ni checksum ; `r-02` (`result.tmp`, checksum `bad`) ne doit jamais être promu | fixture `r-02`, contrat §2 |
| #6 | T-05 clé canonique | `encodeURIComponent(tenant + ':' + id)` entre en conflit avec la clé canonique UTF-8 NFC `tenant:operationId` ; risque d'alias silencieux | contrat §1 ; fixtures `legacy-001` (`%2F`), `legacy-003/004/006/009/011` (base64url), `legacy-007/008` (NFC vs NFD) |
| #7 | T-06 session éphémère | `session` (socket) sérialisée dans le store durable | fixture `r-01`, contrat §3 |
| #12 | T-14 fermeture | `close()` non awaitée, non idempotente ; race HTTP/stdio ; aucune boucle ne doit survivre à une fermeture confirmée | `src/gateway.js`, contrat §8, prior-state 2026-09-11 |
| #14 | T-16 métrique retry | Une entrée `fenced` (`r-06`) ne doit pas être comptée comme retry planifié ; régression à la frontière dispatch/recovery | fixture `r-06`, contrat §7 |
| #15 | T-13 framing notification stdio | Les notifications ne doivent produire aucune enveloppe de réponse ; admission d'audit partagée avec HTTP ; tester la vraie route stdio | contrat §8, prior-state 2026-09-10 |
| #19 | T-07 fencing ambigu | `r-04` et `r-07` (downstream `unknown`) → fence + conservation des métadonnées d'anomalie ; jamais de promesse exactly-once ni de replay par défaut | fixtures `r-04`/`r-07`, contrat §7 |

## 2. Défaut confirmé mais BLOQUÉ par la politique de durabilité

| Issue | Sujet | Statut |
|---|---|---|
| #2 | T-01 intent durable avant admission | L'ordre audit/store est bien défectueux (`audit.append` avant `store.write`), mais **choisir l'ordre durable intent-vs-admission est une décision de politique** qui exige deux revues indépendantes (contrat « Known gaps », issue #16). Voir `docs/decisions/2026-09-15-durability-reviews-blocked.md`. Aucune politique n'est implémentée de notre chef. |

## 3. Exigences de compatibilité / actionables traités dans cette PR

| Issue | Sujet | Traitement |
|---|---|---|
| #8 | T-11 frontière du vérificateur | **Fait** : baseline exécutée et consignée (`docs/verifier-baseline.md`) ; échecs exacts `legacy-002`/`legacy-004` documentés ; preuve scellée non réparée ; non-mutation prouvée par sha256. |
| #9 | T-09 bundle v1 scellé non réécrit | Garanti : aucune écriture sur les bundles scellés ; rejet de la ré-sérialisation des clés (cf. #18). |
| #11 | T-10 lecteur legacy v2 / base64url | À implémenter côté **lecture seule** (accepte `%2F` et base64url). L'écriture d'un nouveau format de stockage n'est **pas** approuvée → laissée au owner. |
| #5 | T-08 recovery sans ré-exécution | À implémenter : `r-03` (downstream `confirmed`) → conserver le résultat durable vérifié sans rappeler `dispatch`. |
| #10 | T-12 tests sur vrais chemins | À faire dans la PR d'implémentation : tests via les vrais chemins HTTP/stdio de dispatch/admission/démarrage (le « vert » précédent utilisait un mock — prior-state 2026-09-13). |
| #17 | T-19 docs/gate de merge | Partiellement adressé ici (baseline + triage + décision). La PR reste **draft** : pas de merge tant que revues indépendantes et checks requis sont absents. |

## 4. Décisions à soumettre au owner (en attente, non tranchées)

| Issue | Sujet | Question ouverte |
|---|---|---|
| #16 | T-18 deux avis indépendants | **Bloqué** — voir decision record. Un seul avis obtenu (IA, consultatif) ; aucun relecteur humain indépendant disponible. |
| #13 | T-15 anomalies bornées | Sémantique de cap/éviction des anomalies non approuvée — ne pas l'inventer. |
| — | contrat « Known gaps » | Rétention/release des enregistrements `fenced` ; ordre de durabilité intent-vs-admission ; politique de retry automatique (aucune approuvée) ; le vérificateur ne couvre pas KMS/effets distants/coupure électrique. |
| — | PR #20 (proposal) | Format du checksum d'intégrité ; si la recovery peut émettre un événement d'audit. Questions restées ouvertes dans la proposal. |

## 5. Doublons / périmés

| Issue | Sujet | Disposition |
|---|---|---|
| #18 | T-17 duplicate: legacy key rewrite | **Déjà fermée** (doublon de #9 + reprend la proposition de ré-écriture de clés rejetée le 2026-09-08). Ne pas rouvrir sans input de migration concret et non scellé. Aucune action. |

## 6. Correspondance avec `docs/prior-state.md`

- 2026-09-08 ré-sérialisation v1→v2 au démarrage → rejetée (risque de mutation de preuve scellée) ; formalisé via #18 fermée.
- 2026-09-10 réponse JSON stdio pour notifications → confirmé #15.
- 2026-09-11 race de fermeture HTTP/stdio → traité comme **un seul défaut** de fermeture partagée #12 (les deux transports partagent l'admission, contrat §8).
- 2026-09-12 « replay idempotent » sans reçu downstream → **pas une preuve** ; le fencing conservateur reste le défaut (#19, #16).
- 2026-09-13 « vert » sur mock dispatcher → invalidé ; exigence de tests réels reprise en #10.
