# AGENTS.md — Instructions permanentes pour Claude Code (projet Level)

Level est une application personnelle de progression (LIFE · SPORT · RPG), inspirée des mécaniques RPG sans reprendre la propriété intellectuelle de Solo Leveling. Documents de référence : `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`.

## Principes non négociables
- **Hors ligne d'abord** : aucune fonctionnalité essentielle ne dépend du réseau, d'une IA distante ou d'un cloud. Pas de backend distant.
- **Données locales** (IndexedDB via Dexie). Les données personnelles ne quittent jamais l'appareil.
- **Règles métier hors de l'UI** : tout calcul (XP, niveaux, rangs, agencement) vit dans `src/core/`, pur et testé.
- **Données fictives isolées** dans `src/mocks/` uniquement, toujours étiquetées « Démo » dans l'UI. `core/` et `data/` n'importent jamais `mocks/`.
- **L'XP vit uniquement dans le journal** (`xpEvents`, append-only). Jamais de solde stocké ni modifié à la main : gains et corrections sont des événements ; tout se recalcule depuis le journal. Toute récompense passe par `core/awards` + `questService` (transaction, clé d'unicité).
- **Aucune pénalité d'XP**, jamais : une quête manquée n'enlève rien. L'analyse d'un manque n'écrit jamais dans le journal d'XP.
- **Pas de réécriture silencieuse** : modifier difficulté/effort/catégorie ne change pas les gains acquis ; toute modification crée une révision.
- **Dates** : `at` = accomplissement déclaré, `recordedAt` = enregistrement ; validation rétroactive LIFE à toute date passée, confirmation au-delà de `retroactiveConfirmAfterDays`.
- **Seuils de niveaux et de rangs** (`xp.ts`, `rank.ts`) : ne pas modifier sans décision explicite (test de non-régression).
- **Barèmes numériques uniquement dans `core/rewards.ts`**, marqués provisoires tant qu'ils ne sont pas calibrés.
- **Sauvegardes** : toute nouvelle table Dexie doit être ajoutée à `TABLE_KEYS` (`core/backupFormat.ts`) et `DB_SCHEMA_VERSION` incrémentée (un test échoue sinon). Ne jamais afficher « récupérable » sans déchiffrement réellement testé. Aucune clé, phrase ou donnée en clair dans les journaux, URLs ou requêtes. Les rapports PDF ne remplacent jamais la sauvegarde.
- **SPORT** : l'XP SPORT passe par `sportService.syncXp` (recalcul déterministe dans `xpEvents`) ; ne jamais écrire d'XP SPORT ailleurs. Barèmes uniquement dans `core/sport/config.ts`. 1 XP SPORT = 1 XP LIFE pour le niveau global. Séances écourtées : XP proportionnelle (pas de seuil en %). 2ᵉ séance du jour : récompensée sous conditions de récupération et anti-farming (`extraSession`). Repos : XP seulement sur recommandation pertinente de Level (`restRecommendation`), jamais sur simple déclaration. Profil « sans matériel » : ni mobilier ni équipement. Sécurité avant récompenses : aucune séance en ALERTE, aucun encouragement à dépasser une douleur, blocage levé seulement par réévaluation. Aucune augmentation de charge sans confirmation. Pompes (TOUTES variantes : classiques, inclinées, au mur, en piqué, triceps) = bibliothèque + circuits HIIT full-body uniquement, si l'utilisateur les autorise ; jamais dans un programme ordinaire. Variantes avec/sans matériel : mêmes objectifs, performances par exercice, jamais de conversion.
- **Orchestration (v0.6)** : le planning ne modifie jamais en silence une échéance, un engagement ou une quête importante ; toute réorganisation est une proposition confirmée, revérifiée à l'écriture (`planningService`) et tracée. Ne jamais remplir artificiellement une journée (marge, ≤ 4 suggestions). Notifications : décision dans `core/notifications` (tranquillité, plafond, déduplication), jamais de promesse de remise en arrière-plan. Pourcentages des bilans = exécution du planning, jamais un jugement de valeur. Dans un callback différé, ne jamais lire `event.target` (lire avant). Réglages de modules non dupliqués dans `/profile`.
- **Objectifs/projets/indicateurs (v0.7)** : `goalService` n'écrit JAMAIS dans `xpEvents` (aucune récompense pour étape, projet, objectif ou indicateur) ; les quêtes rattachées restent des quêtes. Avancement calculé, jamais stocké ; une étape se valide explicitement. Les suppressions détachent (quêtes et XP intacts) après confirmation expliquée. Les échéances ne changent que sur confirmation. Une feuille imbriquée ne doit pas fermer son parent.
- **RPG V1.1 (v0.8)** : tous les seuils, coefficients et bonus vivent dans `core/progressionConfig.ts` (provisoires). Un prestige n'écrit JAMAIS dans `xpEvents` : un cycle est une fenêtre du journal (`core/prestige.ts`) ; niveau et rang de domaine = `domainLevel(XP du cycle, cycle)`, niveau global = `levelFromXp(XP totale)`, jamais de prestige global. Prestige : facultatif, confirmé explicitement, atomique (`rpgService.prestige`), jamais automatique. Les bonus d'XP s'appliquent aux gains futurs seulement (lendemain de l'obtention) et ne réévaluent jamais un événement inscrit. Récompenses uniques (jamais de doublon, jamais d'invention). Succès sans suractivité. Un élément visuel `position: fixed` plein écran se rend en portail dans `<body>`.
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
| `node scripts/smoke.cjs <dossier> <dossier2>` | Test navigateur LIFE + sauvegardes (Playwright) sur `vite preview --port 4173` |
| `node scripts/smoke-sport.cjs <dossier>` | Test navigateur du module SPORT |
| `node scripts/smoke-rpg.cjs <dossier>` | Test navigateur RPG V1.1 (rangs, prestige, récompenses, succès, bilans, hors ligne) |
| `node scripts/smoke-life2.cjs <dossier>` | Test navigateur LIFE V1.1 (objectifs, projets, indicateurs, planning, bilans) |
| `node scripts/smoke-global.cjs <dossier>` | Test navigateur orchestration (accueil, planning, notifications, bilans PDF, hors ligne) |

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
