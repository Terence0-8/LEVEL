# Changelog

## 0.3.0 — Stabilisation LIFE et moteur de progression
- Trois situations de validation : réussite complète, progression partielle (proportionnelle, cumulative), effort sans objectif atteint (réduit, non nul) ; feuille « Enregistrer mon travail » (situation, durée et commentaire facultatifs, aperçu, confirmation).
- Garde-fous : micro-tâches exclues, un effort par cycle, progression strictement croissante, plafond avant réussite complète, réduction au-delà de 3 déclarations/jour ; crédits déduits de la validation finale.
- Validation rétroactive (14 jours) : date déclarée, date d'enregistrement et statut conservés ; séries et manques recalculés sans doublon ; annulation d'un gain précis depuis le journal.
- Bilan des quêtes manquées : détection (cycles récurrents, échéances), causes, décisions (reporter, simplifier, remplacer, suspendre), rattrapage daté, historique et statistiques ; aucune pénalité d'XP.
- Révisions de quêtes : trace des modifications, avertissement quand de l'XP est déjà acquise ; règle documentée.
- Paramètres de l'économie centralisés dans `REWARD_CONFIG` ; seuils de niveaux/rangs inchangés et verrouillés par test.
- Schéma Dexie v3 (tables `analyses`, `revisions`). `recordEffort` conservé comme raccourci.
- Tests : 80 unitaires/intégration (Vitest), 42 contrôles navigateur dont création/validation hors ligne.

## 0.2.0 — Moteur de progression et module LIFE initial
- Journal d'XP append-only (`xpEvents`), corrections par événements opposés, audit d'intégrité ; niveaux, rangs, attributs recalculés depuis le journal.
- Quêtes LIFE réelles : 4 types, cycles quotidien/hebdomadaire, étapes, priorité, difficulté, effort, échéance, statut dérivé, séries, cycles manqués (sans pénalité).
- Créer, modifier, valider, corriger (confirmation), archiver, supprimer (confirmation) ; XP progressive par étape sans double attribution.
- 7 catégories initiales personnalisables, liées aux attributs ; onglets Quêtes / Récompenses / Catégories.
- Anti-farming : unicité par clé, amortissement des micro-tâches, effort × difficulté, avertissement de doublon, crédit d'effort (moteur prêt, non exposé).
- Accueil, RPG, Historique basés sur la progression réelle ; annonce « Level up » sur gains réels ; démo désactivée par défaut (changement signalé).
- Schéma Dexie v2 (migration non destructive). Composants `Sheet`/`ConfirmDialog` (dialog natif) et contrôles de formulaire.
- Tests : 48 unitaires/intégration (Vitest), 24 contrôles navigateur.

## 0.1.0 — Socle applicatif
- Initialisation Vite + React + TypeScript, PWA hors ligne.
- Identité visuelle : tokens, polices Cinzel/Inter, logo monogramme, composants (cartes, barres, anneaux, radar, histogramme).
- Navigation 5 destinations + profil ; barre inférieure (mobile) / menu latéral (desktop).
- Accueil adaptatif (`core/homeLayout`), quêtes de démo cochables avec annonce de level up.
- Pages LIFE, SPORT, RPG, Historique (structures sur données de démo, modules signalés « en préparation »).
- Moteur XP/niveaux/rangs pur et testé ; persistance Dexie (profil, réglages, état de démo).
- Documentation : AGENTS.md, PRODUCT_SPEC, ARCHITECTURE, CHANGELOG.
- Tests : 15 unitaires (Vitest), 15 contrôles navigateur (`scripts/smoke.cjs`).
