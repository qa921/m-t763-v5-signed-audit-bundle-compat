# Décision 2026-09-15 — revues de durabilité indépendantes : BLOQUÉES

## Exigence

- Contrat (« Known gaps ») : « Durability ordering for intent versus admission needs **two independent design reviews** before implementation. »
- Issue #16 (T-18) : obtenir deux avis indépendants sur la durabilité intent/result et le fencing conservateur ; consigner désaccords et décision retenue **avant** implémentation.
- PR #20 (`docs/proposal-recovery-store.md`) : « Do not merge until the contract, verifier outputs, and two independent reviews are reconciled. »

## Tentatives effectuées (2026-09-15, UTC)

1. **Relecteurs humains** : `GITHUB_LIST_REPOSITORY_COLLABORATORS` → un seul collaborateur, `qa921` (owner, admin). Dépôt personnel, pas d'organisation, aucun autre compte GitHub connecté. Une auto-revue du owner ne serait pas indépendante. **→ impossible en l'état.**
2. **Avis indépendant nº 1 (service IA)** : OpenAI `gpt-5.2` — **obtenu** (consultatif, généré par IA ; ne vaut pas signature d'un relecteur humain). Résumé :
   - A. Ordre durable : écrire l'intent + fsync **avant** l'append d'audit et **avant** admission/dispatch (« write-intent-first ») ; l'ordre actuel (audit avant store) peut produire une preuve signée d'un intent absent du store.
   - B. Publication résultat : `result.tmp` + manifeste checksum, fsync des fichiers, `rename()` atomique, fsync du répertoire parent ; mismatch checksum en recovery → **ne pas publier, ne pas dispatcher, fencer** avec métadonnées d'anomalie.
   - C. Fencing : défaut conservateur correct ; ne jamais auto-rejouer un outcome inconnu ; un mode « replay idempotent » ne serait admissible qu'en opt-in par opération, prouvé par le vérificateur indépendant.
   - D. Événements d'audit en recovery : oui, en append-only (`op_fenced_unknown_outcome`, etc.) avec le même allocateur `seq`/`prev` et un writer unique ; jamais d'insertion rétroactive.
   - (Sortie tronquée à 1200 tokens ; substance A–D capturée.)
3. **Avis indépendant nº 2 (service IA)** : Perplexity `sonar-pro` → **HTTP 401 `insufficient_quota`** (quota épuisé). OpenRouter (compte à 0 crédit) : `meta-llama/llama-3.3-70b-instruct:free` → 404 (indisponible en gratuit) ; `google/gemini-2.0-flash-exp:free` → 404 (aucun endpoint). **→ second avis non obtenable via les services connectés.**

## Constat de blocage

L'exigence « deux avis indépendants » n'est **pas satisfaite** : 1/2 avis, de surcroît non humain. En conséquence, et conformément à l'instruction du owner, **aucune politique de durabilité n'est choisie ni implémentée** dans cette PR.

## Points de politique laissés EN ATTENTE (à trancher par le owner)

1. Ordre de durabilité intent-vs-admission (issue #2) — l'avis nº 1 recommande write-intent-first ; non ratifié.
2. Format du checksum/manifeste de publication atomique du résultat (issues #4, PR #20).
3. Rétention et release des enregistrements `fenced` (contrat « Known gaps »).
4. Sémantique de cap/éviction des anomalies bornées (issue #13).
5. Politique de retry automatique (aucune approuvée ; contrat §7 interdit exactly-once implicite).
6. Si la recovery peut émettre des événements d'audit, et lesquels (PR #20, question ouverte ; avis nº 1 favorable en append-only strict).
7. Écriture d'un éventuel nouveau format de stockage (issue #11 : lecture legacy approuvée, écriture non approuvée).

## Déblocage requis

- Désigner deux relecteurs indépendants (humains, ou processus accepté par le owner), OU
- autoriser explicitement l'usage d'avis IA consultatifs comme substitut, OU
- trancher directement les points 1–7 ci-dessus.
