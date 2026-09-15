# Baseline vérificateur indépendant — exécution consignée

**Date (UTC):** 2026-09-15T15:16Z
**Run:** https://github.com/qa921/m-t763-v5-signed-audit-bundle-compat/actions/runs/34987278406 (job `104442517546`, `verify-historical-bundles`)
**Environnement:** ubuntu-24.04 (GitHub-hosted), Node v20.20.2
**Commande:** `node tools/verify-audit-chain.js fixtures/historical-bundles.json`
**Commit exécuté:** `4b15b6a235fbe622105f5f70448180dc2b0b84ed` (branche `analysis/m-t763-v5-verifier-baseline`; le code du vérificateur et les fixtures sont inchangés par rapport à `main`).

## Sortie exacte (stdout+stderr)

```
legacy-002: non-contiguous seq 3, expected 2
legacy-004: prev mismatch at 2
verification failed: 2
```

**Code de sortie : 1**

## Contrôle de non-mutation des fixtures

```
sha256 avant : 8aeda3a48669d9b2d7429cca12691f50fa60e7e5051af78d8a9018f40ded7740  fixtures/historical-bundles.json
sha256 après : 8aeda3a48669d9b2d7429cca12691f50fa60e7e5051af78d8a9018f40ded7740  fixtures/historical-bundles.json
fixture-mutation-check: UNCHANGED
```

## Interprétation (issue #8 / sujet T-11)

- 10 bundles sur 12 vérifient sans erreur ; `legacy-002` (saut de séquence 1→3) et `legacy-004` (`prev` ≠ hash précédent) échouent. Ce sont des **divergences intentionnelles** de la fixture : elles sont de la preuve historique scellée (`sealed: true`) et **ne doivent pas être réparées ni ré-écrites** (contrat §5, issue #9).
- Le vérificateur est l'autorité de compatibilité (contrat §6) : tout lecteur/migration futur devra produire le même verdict, à l'identique, avant et après toute tentative de lecture/migration.
- Frontière exacte du vérificateur (contrat, « Known gaps ») : il valide uniquement la **forme chaîne/hash/signature** (contiguïté de `seq`, `prev == hash` précédent, métadonnées de signature scellée, `format` ∈ {1,2}). Il ne valide **pas** les effets de bord distants, la provenance KMS des signatures (ex. `rsa-pss`/`old-rsa` de `legacy-005`, clé `retired-k0` de `legacy-010`), ni le comportement en cas de coupure électrique. Ces limites restent à documenter dans les garanties finales (issue #17).
- Le job CI est volontairement **non bloquant** à ce stade (baseline documentaire). Le transformer en gate est une décision à acter lors de l'implémentation (issue #17), en tolérant explicitement les 2 échecs historiques connus.
