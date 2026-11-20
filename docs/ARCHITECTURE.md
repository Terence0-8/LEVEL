# Architecture technique

## Stack et justification
| Choix | Pourquoi | Conséquence |
|---|---|---|
| Vite + React 19 + TypeScript strict | Rapide, mainstream, mobile-first, sans serveur | SPA statique |
| react-router (HashRouter) | Fonctionne hors ligne et sur tout hébergement statique sans réécriture d'URL | URLs en `#/…` |
| Dexie (IndexedDB) + dexie-react-hooks | Stockage local structuré, versionné, requêtes réactives | Données dans le navigateur ; sauvegarde/export à prévoir |
| vite-plugin-pwa (Workbox) | Installation sur mobile + fonctionnement 100 % hors ligne | Service worker auto-mis à jour |
| WebCrypto (natif) | Chiffrement AES-GCM, PBKDF2, HKDF, SHA-256 sans dépendance, hors ligne | Disponible dans les navigateurs récents et Node ≥ 20 |
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
  data/sportService.ts  Commandes SPORT transactionnelles ; syncXp = recalcul déterministe de l'XP SPORT dans xpEvents
  data/backup/  Sauvegardes : crypto (WebCrypto), backupDb (base séparée), snapshot, backupService, scheduler
  core/sport/ Règles SPORT pures : types, config (barèmes), exercises (bibliothèque), profile (niveaux), recovery, cycle,
             generator, progression, running, planner, xp (récompenses souhaitées), stats, session (modèles)
  features/  home, life (QuestCard, QuestForm, RewardsPanel, CategoriesPanel), sport, rpg, history, profile, shared
  lib/       Utilitaires (formatage)
scripts/     smoke.cjs
```
Sens des dépendances : `features → app/design/core/data/mocks` ; `data → core` ; `core → ∅`.

## Persistance
Base IndexedDB `level`, schéma **v4** : `profile`, `settings`, `demoQuestState` (v1) ; `categories`, `quests`, `xpEvents` (v2) ; `analyses`, `revisions` (v3) ; `sportProfile`, `exercisePrefs`, `customExercises`, `sportSessions`, `recoveryChecks`, `exerciseStates`, `progressionLog`, `bodyMeasures` (v4). Chaque montée de version ajoute des tables sans toucher aux données existantes ; les champs ajoutés aux événements après la v0.2 sont complétés à la lecture par `normalizeEvent`. Les `get()` sont en lecture seule (requis par `useLiveQuery`). Stockage durable demandé via `navigator.storage.persist()`. Sauvegardes chiffrées (WebCrypto) prévues.

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

## Sauvegardes chiffrées (v0.4)
**Fichiers** : `core/backupFormat.ts` (format, compatibilité, migration, audit : pur), `core/backupPolicy.ts` (rétention, santé : pur), `data/backup/*` (E/S et crypto).

**Base séparée** : `level-backups` (tables `backups` = métadonnées, `blobs` = chiffrés, `keystore` = clé de données). Séparée de `level` pour qu'un bug de migration ou une corruption applicative n'emporte pas les points de restauration. **Même origine** : voir risques résiduels.

**Enveloppe** : `{ format, formatVersion, id, createdAt, reason, appVersion, schemaVersion, cipher, iv, ciphertext, keyWraps }`. L'en-tête est authentifié (AAD) : le modifier invalide le déchiffrement. `keyWraps` contient la clé de données encapsulée deux fois (phrase / clé de secours) avec leurs paramètres de dérivation ; il est `null` tant qu'aucune phrase n'est définie. Charge utile chiffrée : toutes les tables (`TABLE_KEYS`, vérifié par test contre `db.tables`), comptages, somme de contrôle canonique (clés triées).

**Cryptographie** : AES-256-GCM (IV 96 bits aléatoire par chiffrement) ; clé de données aléatoire (jamais dérivée d'un mot de passe) ; KEK phrase = PBKDF2-SHA-256 600 000 itérations, sel 128 bits ; KEK clé de secours = HKDF-SHA-256 sur 160 bits aléatoires ; phrase normalisée NFKC ; bornes des itérations lues dans un fichier (1 000 – 10 M) contre les fichiers hostiles. Clé de données de l'appareil stockée comme `CryptoKey` extractable dans IndexedDB (nécessaire pour la ré-encapsulation après changement de phrase).

**Compatibilité** : `formatVersion` (format de fichier) et `schemaVersion` (schéma Dexie, `DB_SCHEMA_VERSION`). Refus d'un format ou d'un schéma plus récent ; schémas plus anciens migrés sans perte (`migrateTables`). **Toute évolution du schéma Dexie ou du format impose : ajouter la table à `TABLE_KEYS`, incrémenter `DB_SCHEMA_VERSION`, étendre `migrateTables` si besoin, ajouter un test.**

**Restauration** : `prepareRestore*` (lecture seule) → `applyRestore` : sauvegarde `pre-restore` vérifiée (sinon abandon), `writeTables` (une transaction : tout ou rien), relecture et vérification (contenu, comptages, XP ; journal signalé), retour arrière si écart, puis sauvegarde `post-restore`. Le planificateur est suspendu pendant l'opération. Les opérations d'écriture du service sont sérialisées.

**Planificateur** : hooks Dexie (création/modification/suppression) → temporisation ; `critical` pour suppression de quête et événement de correction. Aucune opération réseau (testé).

## Risques résiduels connus
- Points de restauration et clé de l'appareil vivent dans le même stockage de navigateur : un effacement des données du site ou une perte de l'appareil les emporte tous. Seul le **fichier exporté** survit, d'où le bandeau d'alerte et les rappels.
- Quelqu'un ayant accès au profil du navigateur peut utiliser la clé de l'appareil : les sauvegardes locales ne protègent pas contre un attaquant local ; le fichier exporté, lui, dépend de la force de la phrase.
- Rien n'oblige l'utilisateur à exporter régulièrement : l'application n'a pas d'accès au système de fichiers en arrière-plan.
- Perte simultanée de la phrase et de la clé de secours (et de l'appareil) = perte définitive, par conception.

## Module SPORT (v0.5)
**Journal partagé, pas de second moteur.** `core/sport/xp.ts#desiredSportAwards` calcule de façon **déterministe** toutes les récompenses SPORT attendues à partir de l'historique (séances, questionnaires, décisions de progression). `sportService.syncXp` (transaction) compare avec les gains ouverts du journal (`awardKey` préfixé `sport:`) et ne fait que : **annuler** (événement de correction opposé, tracé) les gains devenus faux, **inscrire** les manquants. Clés : `sport:session:{id}:base`, `…:pr:{exercice}`, `sport:week:{sem}:regularity`, `sport:rest:{jour}`, `sport:progress:{décision}`. Conséquence : toute correction (statut, date, série, suppression d'une séance) se propage à XP, niveaux, attributs, records (recalculés chronologiquement) sans code de recalcul spécifique ; idempotent (rejouer ne crée rien). Événements SPORT : `source: 'activity'`, `domain: 'SPORT'`, `sourceId` = séance/semaine/jour/décision. Le niveau global est la somme LIFE + SPORT (inchangé).

**Choix de modélisation.**
- Une séance = **un document** (`sportSessions`) contenant ses emplacements (`slots`) et séries : l'enregistrement d'une série est une écriture atomique unique (sauvegarde immédiate).
- Un emplacement porte **deux choix** (`equipment` / `bodyweight`) ; chaque `SetLog` mémorise l'`exerciseId` réellement exécuté : basculer de variante ne perd rien et ne convertit rien. Les statistiques additionnent par groupe musculaire (même historique de développement) mais les performances restent par exercice.
- Chronomètres : `restEndsAt` (horodatage absolu), `startedAt` + `pausedMs`/`pausedAt` ; l'interface ne compte pas, elle **déduit** de l'horloge (exacte après mise en veille).
- Récupération et sécurité sont des **fonctions pures** de (questionnaires, séances, date) : `evaluateRecovery`. Un blocage se lève par réévaluation (la dernière saisie du jour fait foi ; l'historique est conservé).
- Génération pure (`generateStrengthSession`) : n'écrit rien ; le service enregistre. Les séances du planning sont des **coquilles** remplies au dernier moment (données du jour).
- Mises à jour de profil par **fonction sur la dernière version** (transaction) : des modifications rapides ne s'écrasent pas (test de non-régression).
- Illustrations : composant SVG paramétré par « pose » (20 poses), aucune ressource binaire.
- Sauvegardes : les 8 tables SPORT sont dans `TABLE_KEYS` ; schéma de sauvegarde v4 ; migration des sauvegardes plus anciennes (tables vides).

**Dépendances ajoutées : aucune.**

### Ajustements V1 du module SPORT
- **Séances supplémentaires** : `SportSession.safetyAtStart` mémorise le niveau de récupération au démarrage (ou à l'enregistrement d'une course ; pour une saisie rétroactive, celui du questionnaire de ce jour, sinon inconnu = non récompensé). `desiredSportAwards` applique les règles de `SPORT_CONFIG.xp.extraSession` (plafonds jour/semaine, coefficient, délai minimal vérifié quand les deux séances ont des horodatages réels). `explainNoXp` restitue la raison d'une absence d'XP (écran de fin de séance, historique).
- **Proportionnalité** : plus de seuil en pourcentage ; `minSignificantSets` (nombre absolu) écarte seulement l'absence de travail significatif.
- **Repos** : `restRecommendation` (pure) exige un niveau VIGILANCE/ALERTE **et** une charge récente issue de séances organisées ; recalculée à chaque `syncXp`, donc corrigée si l'historique change.
- **Matériel** : `equipmentFor` — variante sans matériel = `['mat']` (le tapis n'est jamais requis en plus d'un autre matériel ; test) ; mobilier solide réservé à Domicile/Salle.

### Pompes : HIIT uniquement (V1 final)
`Exercise.pushup` marque toute variante de pompes (4 exercices) ; ces exercices sont `kind: 'hiit'` + `hiitOnly`. `usablePool` (programmes ordinaires) les exclut explicitement ; `sportService.createPersonalSession` et `swapExerciseInSession` les refusent ; aucune fiche ordinaire ne les cite en alternative (tests). `generateHiit` n'en inclut qu'une par circuit, seulement si `allowPushupsInHiit`, selon le niveau opérationnel et la semaine. Ils restent listés dans la bibliothèque.

## Orchestration transversale (v0.6)
| Brique | Rôle | Emplacement |
|---|---|---|
| Préférences | Planning, notifications, RPG, niveaux « vus » ; fusion assainie | `core/prefs.ts`, `data/prefsService.ts` (table `settings`, clé `appPrefs`) |
| Planning | Plan, conflits, priorités, jour, propositions (pur) | `core/planning.ts` ; commandes `data/planningService.ts` |
| Notifications | `candidates` + `selectNotifications` (pur) ; remise et repli | `core/notifications.ts`, `data/notificationService.ts`, `public/sw-notify.js` |
| Bilans | `ReportDoc` unique → écran + PDF | `core/reports/index.ts`, `core/reports/pdf.ts` |
| Tableau de bord | Agrégation d'accueil, alertes | `core/dashboard.ts`, `core/homeLayout.ts` (`arrangeGlobalHome`) |
| RPG | Rangs par domaine, audit | `core/progression.ts`, `core/rpgConsistency.ts` |

Principes : aucune règle LIFE/SPORT réécrite (le planning lit quêtes, séances et récupération ; la réorganisation SPORT est déléguée à `sportService.applyWeekPlan`, la simplification à `questService.updateQuest`). Toute proposition est confirmée par l'utilisateur, revérifiée à l'écriture et tracée. Les notifications ne se réveillent pas application fermée (limite PWA) : le service décrit honnêtement la capacité (`describeCapability`). Le PDF n'embarque aucune donnée de restauration.

## Objectifs, projets, indicateurs (v0.7)
| Brique | Rôle | Emplacement |
|---|---|---|
| Modèle et règles | Types, avancement, indicateurs, constats, propositions, impact de suppression (pur) | `core/goals.ts` |
| Commandes | Objectifs, projets (étapes/sous-tâches), rattachement de quêtes, indicateurs, propositions confirmées | `data/goalService.ts` |
| Tables | `goals`, `projects` (étapes et sous-tâches intégrées), `indicators`, `indicatorReadings` ; quêtes : champs facultatifs `goalId/projectId/stepId` | `data/db.ts` v6, `core/backupFormat.ts` |
| Planning | Repères `milestone` (sans durée) via `PlanContext.life` | `core/planning.ts` |
| Bilans / accueil | Sections et alertes LIFE | `core/reports`, `core/dashboard.ts` |
| Interface | Ensemble, Objectifs, Projets, Indicateurs ; routes `/life/:section` | `features/life/*` |

Principes : aucun système parallèle (les quêtes, le journal XP, les catégories, le planning et les bilans sont réutilisés) ; `goalService` n'écrit jamais dans `xpEvents` ; un projet est écrit en une transaction fonctionnelle (pas d'écrasement) ; la suppression détache sans jamais supprimer de quête ni d'XP.

## RPG V1.1 : progression, prestige, récompenses (v0.8)
| Brique | Rôle | Emplacement |
|---|---|---|
| Configuration | Rangs E→SSS, échelles global/domaine, +20 %/prestige, bonus 5 % dégressifs, 4 propositions | `core/progressionConfig.ts` (seul endroit des seuils et coefficients) |
| Cycles et prestige | Fenêtre du journal par domaine, éligibilité, historique (pur) | `core/prestige.ts` |
| Catalogue | Récompenses, bonus d'XP, propositions déterministes | `core/prestigeRewards.ts` |
| Succès | Règles pures, titres | `core/achievements.ts` |
| Intégration moteur | `AwardContext.xpBonusPct` (LIFE), `Opts.xpBonus` (SPORT) | `core/awards.ts`, `core/sport/xp.ts`, `data/questService.ts`, `data/sportService.ts` |
| Commandes | Prestige atomique, déblocage des succès | `data/rpgService.ts` |
| Audit | Cycles, doublons, cohérence | `core/rpgConsistency.ts` |
| Interface | `features/rpg/*` (sections, confirmation, mise en scène en portail) | |

Principes : aucun moteur XP parallèle ; le journal n'est jamais réécrit ; le niveau de domaine = `domainLevel(XP du cycle, cycle)` ; le niveau global reste `levelFromXp(XP totale)` ; un bonus s'applique au gain futur (jour d'obtention exclu) ; `rpgService` n'écrit jamais dans `xpEvents` ; tables : `prestiges` (clé `prestige:<domaine>:<n>`), `rpgRewards` (clé = identifiant du catalogue), `achievements` (clé = identifiant).

### Paramètres provisoires
| Paramètre | Valeur |
|---|---|
| Niveaux de domaine | 36 (≈ 193 000 XP au premier cycle, ≈ 3,5 ans à 150 XP/jour) |
| Rangs de domaine (premier niveau) | E1 D6 C11 B16 A21 S26 SS30 SSS34 |
| Rangs globaux | E1 D10 C20 B35 A55 S80 SS90 SSS96 (niveaux 1–100) |
| Coût du cycle n | coût du niveau × (1 + 0,2·(n−1)) |
| Bonus d'XP | 5 %, ×0,8 par palier, 6 paliers (≈ +18 % cumulés) |
| Propositions par prestige | 4 maximum, une par catégorie |

## RPG V1.2 : événements, analyse, recommandations, narration (v0.9)
| Brique | Rôle (pur et déterministe) | Emplacement |
|---|---|---|
| Événements | `detectEvents(ctx)` : tous les faits actuellement vrais, clé unique, date réelle ; filtres du journal | `core/rpgEvents.ts` |
| Analyse | `analyse(ctx, récupération)` : observations (nature, fenêtre, fiabilité, échantillon, signature) | `core/insights.ts` |
| Recommandations | `buildRecommendations`, `filterRecommendations` (décisions et signature) | `core/recommendations.ts` |
| Narration | `narrateEvent`, `reportNarrative` (gabarits, faits uniquement) | `core/narration.ts` |
| Service | `sync` (inscrit les clés manquantes, révoque ce qu'une correction contredit), consultation, décisions | `data/eventService.ts` |
| Bilans | sections étiquetées + synthèse du moteur | `core/reports/index.ts`, `pdf.ts` |
| Notifications | candidats `insights` (moteur existant) | `core/notifications.ts` |
| Interface | `features/rpg/JournalPanel.tsx`, `AnalysisPanel.tsx`, carte d'accueil, carte d'événement majeur (Popover API) | |

Principes : aucun moteur concurrent ; le journal d'XP n'est jamais écrit ; les événements sont une couche d'historique recalculable, les observations et recommandations sont recalculées à chaque affichage (seules les *décisions* sont stockées) ; une recommandation n'applique jamais rien seule ; Level ne déduit aucune cause psychologique ; rien ne dépend du réseau.

### Paramètres provisoires
| Paramètre | Valeur |
|---|---|
| Séries de quêtes (événement) | 7, 30, 100 jours |
| Semaines régulières / régularité sportive | 4, 8, 12, 26 (≥ 3 jours actifs / objectif de séances) |
| Reprise après pause | ≥ 14 jours sans activité |
| Fiabilité | échantillon : faible < moyen < élevé selon la règle (ex. régularité : 6 / 10 semaines) |
| Tendance de fréquence | ≥ 8 semaines d'historique |
| Charge en hausse | ≥ 130 % de la moyenne des 3 semaines précédentes, ≥ 2 séances |
| Report d'une recommandation | 7 jours |
| Notifications | important : groupées ; majeur : une par une ; information : jamais |

## PILOTAGE V1 : vision, stratégie, trajectoire (v1.0)
| Couche | Fichiers | Rôle |
|---|---|---|
| `core` | `pilotage.ts` | Types, libellés, calendrier (trimestres), résolveurs de références LIFE, avancement calculé, relations vues depuis LIFE, faits de revue, rappels `dueReviews` |
| `core` | `strategy.ts` | Règles stratégiques pures (`strategicObservations`, `strategicProposals`), appelées par `insights.analyse` / `recommendations.buildRecommendations` (extension, pas de second moteur) |
| `data` | `pilotageService.ts` | Commandes atomiques (une transaction Dexie + entrée `strategyLog`), limite souple, revues/cycles/années, `applyProposal` revérifié |
| `features` | `pilotage/*` | Tableau de bord, Vision, Orientations, Priorités, Cycles, Revues, Historique ; `LinksSection` dans les fiches LIFE |

- **Données** : Dexie v9, 7 tables (`visions`, `orientations`, `priorities`, `annualPlans`, `cycles`, `strategyReviews`, `strategyLog`), toutes dans `TABLE_KEYS` ; `DB_SCHEMA_VERSION = 9`, `APP_VERSION = 1.0.0`. Les données dérivées (avancement, cohérence, prochaine revue) ne sont jamais persistées ; une revue conserve seulement ses faits (instantané).
- **Références** : les éléments LIFE sont référencés par identifiant ; un identifiant périmé est ignoré par les résolveurs. Détacher ne supprime rien.
- **Mémoire** : `strategyLog` append-only, écrite dans la même transaction que le changement.
- **Notifications** : `NotifContext.reviewsDue` (catégorie « bilans »), calculé à chaque tick avec l'heure courante.
- **Dépendances** : aucune nouvelle dépendance.

