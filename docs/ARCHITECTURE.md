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
  core/      Règles métier pures + tests, aucune dépendance : xp, rank, homeLayout, ledger (journal),
             rewards (barèmes), awards (planification des gains), quest, questState (état dérivé), progression, attributes, dates
  data/      Persistance : db.ts (schéma Dexie v2), repositories.ts (profil/réglages), questService.ts (commandes LIFE
             transactionnelles), hooks.ts (live queries)
  mocks/     Données FICTIVES (demoData) + projection UI (demoView). Jamais importé par core/data.
  design/    Tokens, styles globaux, Icon, Logo, composants (Card, ProgressBar…), charts SVG
  app/       App (routes), Shell (navigation, layouts, level-up), AppState (contexte)
  features/  home, life (QuestCard, QuestForm, RewardsPanel, CategoriesPanel), sport, rpg, history, profile, shared
  lib/       Utilitaires (formatage)
scripts/     smoke.cjs
```
Sens des dépendances : `features → app/design/core/data/mocks` ; `data → core` ; `core → ∅`.

## Persistance
Base IndexedDB `level`, schéma **v3** : `profile`, `settings`, `demoQuestState` (v1) ; `categories`, `quests`, `xpEvents` (v2) ; `analyses`, `revisions` (v3). Chaque montée de version ajoute des tables sans toucher aux données existantes ; les champs ajoutés aux événements après la v0.2 sont complétés à la lecture par `normalizeEvent`. Les `get()` sont en lecture seule (requis par `useLiveQuery`). Stockage durable demandé via `navigator.storage.persist()`. Sauvegardes chiffrées (WebCrypto) prévues.

## Journal d'XP (cœur de la progression)
- `xpEvents` est **append-only** et la seule source de vérité : aucun solde n'est stocké. Niveaux, rangs, attributs, XP par domaine/catégorie se **recalculent** (`computeProgression`) en additionnant les événements.
- Champs ajoutés en v0.3 : `recordedAt` (date d'enregistrement), `retroactive`, `credit` (`partial`|`effort`|null), `percent`, `durationMinutes`, `note`. `at` est désormais la date d'accomplissement **déclarée**.
- Événement : `id`, `kind` (`award`|`reversal`), `source` (`quest`|`step`|`activity`|`bonus`), `sourceId`, `questId`, `stepId`, `awardKey`, `cycleKey`, `domain`, `categoryId`, `attribute`, `amount`, `baseAmount` (avant amortissement), `micro`, `at`, `reason`, `label` (intitulé figé), `status` (`valid`|`reversed`), `correctsEventId`, `reversedByEventId`.
- **Correction** = nouvel événement `reversal` (montant opposé, `correctsEventId`) ; l'original passe à `reversed`. Σ des montants = XP courante ; `auditLedger` vérifie que ce total égale la somme des gains non annulés, qu'aucune clé n'a deux gains ouverts, qu'aucune annulation n'est orpheline.
- **Unicité** : `awardKey` = `quest:{id}:{cycle}` ou `step:{questId}:{stepId}:{cycle}`. `planAward` refuse un second gain ouvert ; toutes les commandes sont des transactions Dexie sérialisées (test d'appels concurrents).
- **État dérivé** : une quête « validée », une étape « faite », une série, un statut se déduisent du journal (`questState.ts`). Aucun drapeau stocké à synchroniser.
- Répartition par étapes : part = (récompense − base déjà accordée) ÷ étapes restantes ; la dernière prend le reste → somme = récompense exacte.
- **Date déclarée et cycles** : `AwardContext.doneAt` (date d'accomplissement) détermine le cycle et le jour pour l'anti-farming ; `now` est l'instant d'enregistrement. `resolveDoneAt` refuse futur, format invalide et au-delà de `retroactiveMaxDays`.
- **Crédits** (`core/awards.planCredit`) : `partial:{quête}:{cycle}:{n}` (n jamais réutilisé, même après annulation) et `effort:{quête}:{cycle}`. Base déduite de la validation finale grâce à `baseAmount`. Garde-fous et paramètres dans `REWARD_CONFIG`.
- **Analyses** (`core/missed.ts`) : détection pure (`findMissed`) à partir de quêtes, journal et analyses ; clé d'analyse = quête × cycle (ou `due:{échéance}`). `recordMissedAnalysis` applique la décision (report/simplification/remplacement/suspension) via les mêmes commandes que l'édition, donc avec révision tracée, sans jamais écrire dans le journal d'XP.
- **Révisions** (`core/revision.ts`) : `diffQuest` compare ancien/nouvel état ; une révision est écrite par modification effective, avec l'XP acquise conservée. Supprimées avec la quête.
- Le service `questService` orchestre (lecture du contexte, appel de `core/awards`, écriture) ; les règles restent dans `core/`. `core/rewards.ts` concentre **tous** les barèmes numériques, marqués provisoires.

## Données réelles vs démo
`AppState.progress` expose la progression réelle (journal) ou, si le réglage est actif, celle de `mocks/` : jamais un mélange. SPORT reste alimenté par la démo uniquement.

## Données de démo
`mocks/` est la seule source de données fictives, projetées par `buildDemoView`. Désactivées par défaut depuis la v0.2. SPORT affiche un état vide tant que la démo est masquée.

## Accueil adaptatif
`core/homeLayout.ts` : fonction pure `arrangeHome(contexte)` → widgets triés par priorité avec raison explicite (échéance < 24 h, soirée, séance prévue, récupération basse…).

## Décisions et hypothèses
- Statut de quête dérivé (jamais stocké) ; catégories archivées plutôt que supprimées ; suppression de quête = XP retirée par corrections, quête effacée, journal conservé (libellé figé).
- Snapshot catégorie/attribut dans l'événement : changer la catégorie d'une quête n'altère pas l'historique.
- `crypto.randomUUID()` pour les identifiants (disponible hors ligne, contexte sécurisé/localhost).
- Niveau global = XP LIFE + SPORT (pas de XP globale séparée).
- Animations désactivables (réglage + `prefers-reduced-motion`).
- Responsive : breakpoint unique 900 px (barre inférieure ↔ menu latéral).
- Le test hors ligne de `smoke.cjs` vérifie le rechargement via service worker.
