# Changelog

## 0.1.0 — Socle applicatif
- Initialisation Vite + React + TypeScript, PWA hors ligne.
- Identité visuelle : tokens, polices Cinzel/Inter, logo monogramme, composants (cartes, barres, anneaux, radar, histogramme).
- Navigation 5 destinations + profil ; barre inférieure (mobile) / menu latéral (desktop).
- Accueil adaptatif (`core/homeLayout`), quêtes de démo cochables avec annonce de level up.
- Pages LIFE, SPORT, RPG, Historique (structures sur données de démo, modules signalés « en préparation »).
- Moteur XP/niveaux/rangs pur et testé ; persistance Dexie (profil, réglages, état de démo).
- Documentation : AGENTS.md, PRODUCT_SPEC, ARCHITECTURE, CHANGELOG.
- Tests : 15 unitaires (Vitest), 15 contrôles navigateur (`scripts/smoke.cjs`).
