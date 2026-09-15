# M-T763-V5 — Compatibilité des bundles d’audit signés

Ce dépôt est un **état source fictif à investiguer**, pas une implémentation terminée.

## Entrées à rapprocher
- `docs/contract.md` : contrat de conservation/compatibilité, avec exigences non implémentées.
- `fixtures/historical-bundles.json` : 12 bundles historiques scellés et 7 enregistrements de recovery; plusieurs divergences sont intentionnelles.
- `src/gateway.js` : code de recovery/transports volontairement incomplet et potentiellement contradictoire.
- `tools/verify-audit-chain.js` : vérificateur indépendant existant; il est l’autorité sur les bundles historiques.
- Issues #1–#19 : lot de sujets concrets. Certains sont des doublons, certains nécessitent une décision owner, et plusieurs sont des défauts confirmés.

## Règle de sécurité
Un bundle `sealed: true` est une preuve historique : ne pas le réécrire, ne pas régénérer son hash, et ne jamais le marquer compatible sans l’exécuter contre le vérificateur indépendant. Les opérations ambiguës sont à mettre en quarantaine/fenced, pas à rejouer.

## État intentionnel
Aucun plan approuvé, aucune revue de durabilité indépendante, aucun résultat de tests ou de migration n’est pré-rempli. La PR de travail est à créer par l’implémenteur après analyse.