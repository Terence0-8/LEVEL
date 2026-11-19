# Changelog

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
