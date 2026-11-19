# Architecture technique

## Stack et justification
| Choix | Pourquoi | Conséquence |
|---|---|---|
| Vite + React 19 + TypeScript strict | Rapide, mainstream, mobile-first, sans serveur | SPA statique |
| react-router (HashRouter) | Fonctionne hors ligne et sur tout hébergement statique sans réécriture d'URL | URLs en `#/…` |
| Dexie (IndexedDB) + dexie-react-hooks | Stockage local structuré, versionné, requêtes réactives | Données dans le navigateur ; sauvegarde/export à prévoir |
| vite-plugin-pwa (Workbox) | Installation sur mobile + fonctionnement 100 % hors ligne | Service worker auto-mis à jour |
| Fontsource (Cinzel, Inter) | Polices embarquées, aucun appel réseau | Poids ajouté au précache |
| CSS Modules + tokens CSS | Pas de lib UI, identité visuelle maîtrisée | Composants maison |
| Vitest + fake-indexeddb | Tests unitaires du cœur métier et de la persistance | — |
| Playwright (outil externe) | Test de fumée navigateur, hors dépendances du projet | `scripts/smoke.cjs` |

Pas d'état global externe (Redux/Zustand) : React Context + requêtes live Dexie suffisent à ce stade.

## Structure
```
src/
  core/      Règles métier pures (xp, rank, homeLayout, types) + tests. Aucune dépendance.
  data/      Persistance : db.ts (schéma Dexie), repositories.ts (accès), hooks.ts (live queries)
  mocks/     Données FICTIVES (demoData) + projection UI (demoView). Jamais importé par core/data.
  design/    Tokens, styles globaux, Icon, Logo, composants (Card, ProgressBar…), charts SVG
  app/       App (routes), Shell (navigation, layouts, level-up), AppState (contexte)
  features/  home, life, sport, rpg, history, profile, shared
  lib/       Utilitaires (formatage)
scripts/     smoke.cjs
```
Sens des dépendances : `features → app/design/core/data/mocks` ; `data → core` ; `core → ∅`.

## Persistance
Base IndexedDB `level`, schéma v1 : `profile` (singleton `me`), `settings` (clé/valeur), `demoQuestState` (uniquement lié à la démo). Les repositories encapsulent Dexie ; l'UI passe par `AppState`. Stockage durable demandé via `navigator.storage.persist()`. Les `get()` sont en lecture seule (requis par `useLiveQuery`).
Évolutions prévues : nouvelles tables via `version(n)`, sauvegardes chiffrées (WebCrypto) en export/import de fichier.

## Données de démo
`mocks/` est la seule source de données fictives, projetées par `buildDemoView` (qui appelle le moteur `core`). Le réglage « Données de démonstration » les masque : les pages affichent alors un état vide. Quand les vraies données arriveront, elles alimenteront la même forme de vue, depuis `data/`.

## Accueil adaptatif
`core/homeLayout.ts` : fonction pure `arrangeHome(contexte)` → widgets triés par priorité avec raison explicite (échéance < 24 h, soirée, séance prévue, récupération basse…).

## Décisions et hypothèses
- Niveau global = XP LIFE + SPORT (pas de XP globale séparée).
- Animations désactivables (réglage + `prefers-reduced-motion`).
- Responsive : breakpoint unique 900 px (barre inférieure ↔ menu latéral).
- Le test hors ligne de `smoke.cjs` vérifie le rechargement via service worker.
