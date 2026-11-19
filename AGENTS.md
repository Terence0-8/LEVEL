# AGENTS.md — Instructions permanentes pour Claude Code (projet Level)

Level est une application personnelle de progression (LIFE · SPORT · RPG), inspirée des mécaniques RPG sans reprendre la propriété intellectuelle de Solo Leveling. Documents de référence : `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`.

## Principes non négociables
- **Hors ligne d'abord** : aucune fonctionnalité essentielle ne dépend du réseau, d'une IA distante ou d'un cloud. Pas de backend distant.
- **Données locales** (IndexedDB via Dexie). Les données personnelles ne quittent jamais l'appareil.
- **Règles métier hors de l'UI** : tout calcul (XP, niveaux, rangs, agencement) vit dans `src/core/`, pur et testé.
- **Données fictives isolées** dans `src/mocks/` uniquement, toujours étiquetées « Démo » dans l'UI. `core/` et `data/` n'importent jamais `mocks/`.
- **L'XP vit uniquement dans le journal** (`xpEvents`, append-only). Jamais de solde stocké ni modifié à la main : gains et corrections sont des événements ; tout se recalcule depuis le journal. Toute récompense passe par `core/awards` + `questService` (transaction, clé d'unicité).
- **Aucune pénalité d'XP**, jamais : une quête manquée n'enlève rien.
- **Barèmes numériques uniquement dans `core/rewards.ts`**, marqués provisoires tant qu'ils ne sont pas calibrés.
- **Honnêteté** : ne jamais présenter un module comme fonctionnel s'il ne l'est pas (utiliser `<Notice>`).
- **Peu de dépendances** : justifier toute nouvelle dépendance dans `docs/ARCHITECTURE.md`.
- Ne pas contredire une exigence de `PRODUCT_SPEC.md` sans le signaler et le documenter.

## Commandes
| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Typecheck + build de production (PWA) |
| `npm test` | Tests unitaires et d'intégration (Vitest, fake-indexeddb) |
| `npm run typecheck` | Vérification TypeScript |
| `node scripts/smoke.cjs <dossier>` | Test navigateur (Playwright) sur `vite preview --port 4173` |

## Conventions
- Alias `@/` → `src/`. TypeScript strict. Composants fonctionnels React.
- Style : CSS Modules + tokens (`src/design/tokens.css`). Pas de couleur codée en dur hors tokens.
- Or lumineux (`--c-gold-bright`) réservé aux événements importants (level up, carte héros).
- Dépendances de modules : `features/*` → `design`, `core`, `data`, `mocks` ; `core` ne dépend de rien ; `data` ne dépend que de `core`.
- Écritures Dexie interdites dans une requête `useLiveQuery` (lecture seule).
- Toute évolution de schéma = nouvelle `version(n)` Dexie.
- Interface en français ; code et identifiants en anglais ou français cohérent avec l'existant.

## Avant de terminer une tâche
Tests + build + smoke test passent ; mettre à jour `docs/CHANGELOG.md` et les docs concernées.
