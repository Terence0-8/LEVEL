# Changelog

## 1.0.1 — Stabilisation : audit global, fiabilité et validation

Détail complet, gravités et limites : `docs/STABILIZATION_REPORT.md`.

**Corrigé**
- **P1 — Pilotage : références orphelines.** Supprimer un objectif, un projet ou un indicateur LIFE retire désormais ses liens stratégiques dans la même transaction (tracé dans `strategyLog`, action `refs-detached`) ; orientations, priorités, cycles et plans sont conservés. Détection (`orphanRefs`) et nettoyage explicite (`pilotageService.pruneOrphans`) des orphelins existants, carte d'information sur le tableau de bord, avertissement dans les confirmations de suppression.
- **P1 — Performance.** `openAwards` est mémoïsé par tableau de gains : `insights.analyse` passe de 4,7 s à ~0,2 s sur trois ans de données (complexité quadratique supprimée). Règles et valeurs inchangées.
- **P1 — Mise à jour de l'application.** Service worker en mode « prompt » : la mise à jour est proposée (bandeau), jamais imposée pendant une saisie ; données conservées.
- **P2** — Quota de stockage saturé pendant une sauvegarde : message explicite (`storage_full`), aucune sauvegarde existante supprimée. Stockage local indisponible au démarrage : message explicite (`StorageGuard`). Bilans : débordement à 320 px. Contrôle d'accueil de `smoke-life2` insensible à la casse.

**Ajouté (tests et outils)**
- `src/data/stabilization.test.ts` : orphelins, parcours LIFE→RPG, SPORT→RPG avec correction rétroactive, LIFE→PILOTAGE, concurrence et interruption, sauvegarde globale des 35 tables (appareil neuf, base existante, écriture interrompue, quota), migration Dexie depuis chaque version v1–v8.
- `src/core/performance.test.ts` : trois ans de données, seuils larges contre les régressions de complexité.
- `scripts/smoke-stabilisation.cjs` (routes × 3 largeurs, routes invalides, clavier, navigation à sept onglets, gros historique, PWA hors ligne, PDF, stockage indisponible) et `scripts/smoke-update.cjs` (mise à jour du service worker avec saisie et données).
- Version 1.0.1 (`APP_VERSION` des sauvegardes) ; schéma Dexie inchangé (v9), format de sauvegarde inchangé.

**Limites** : voir `docs/STABILIZATION_REPORT.md` (stockage local ≠ protection contre la perte de l'appareil ; pas d'ESLint ; installation sur appareil réel non vérifiée).

## 1.0.0 — PILOTAGE V1 : vision, stratégie et trajectoire personnelle

**Livré**
- **Couche stratégique au-dessus de LIFE** : Vision → Orientations → Priorités → Objectifs → Projets → Quêtes. Pilotage ne crée AUCUN second système d'objectifs, de projets, de tâches, d'indicateurs ou de planning : il **référence par identifiant** les objectifs, projets et indicateurs LIFE (références périmées ignorées), et l'avancement est **toujours calculé** depuis LIFE (`goalProgress`/`projectProgress`), jamais stocké.
- **Vision** (`/pilotage/vision`) : texte libre (titre, description, situation souhaitée, ambitions, aspirations, à préserver, à changer, trois horizons facultatifs), jamais un objectif mesurable. Chaque révision conserve la version précédente (avant/après dans la mémoire stratégique) ; une nouvelle vision archive l'ancienne.
- **Orientations** : importance, horizon, situation actuelle/souhaitée, statuts (À définir, Active, En pause, En réévaluation, Accomplie, Abandonnée), tri, archivage, liens LIFE plusieurs-à-plusieurs. Détacher ou archiver ne supprime jamais un objectif, un projet, une quête ni de l'XP.
- **Priorités** (fondamentale, importante, secondaire) : horizon, échéance, contraintes, temporaire, objectifs rattachés. **Limite souple** de priorités fondamentales actives (3 par défaut, réglable 1–8 dans Profil) : le dépassement demande une confirmation explicite (`over_limit`), jamais un blocage.
- **Plan annuel** (quoi, pourquoi, actions concrètes, résultats attendus, contraintes) et **cycles trimestriels** : un cycle SÉLECTIONNE des éléments existants (priorités, objectifs, projets), ce n'est pas une liste de tâches. **Revue de cycle** : faits mesurés depuis LIFE (objectifs atteints, projets avancés, indicateurs, changements, priorités actives ou sans activité), réponses libres, décisions de l'utilisateur ; clôture du cycle et préparation facultative du suivant, ou du plan de l'année suivante, dans UNE transaction.
- **Capacité** : section « Charge et capacité » qui reprend les constats du planning et de l'analyse (jamais de capacité inventée), qualifiés **certain / probable / estimation** ; la récupération sportive est une contrainte prioritaire ; aucune modification automatique du planning.
- **Intelligence stratégique intégrée au moteur existant** (`core/strategy.ts` appelé par `insights.analyse` et `recommendations.buildRecommendations`, pas de second moteur) : 15 règles (orientation sans objectif, priorité sans objectif, sans activité depuis 28 jours, sans temps consacré, limite dépassée, objectif orphelin, projet à la dérive, calendrier irréaliste, cycle vide ou incohérent à mi-parcours, orientation régulière, progrès peu visibles, changements de cap fréquents, vision non relue). Échantillon minimal exigé, aucune cause psychologique, **un changement de priorité n'est jamais un manque de discipline**. Seules modifications applicables : rétrograder ou mettre en pause une priorité, après confirmation et revérification à l'écriture.
- **Revues périodiques** facultatives (mensuelle désactivée par défaut, trimestrielle, annuelle, libre) ; rappels via le moteur de notifications existant (catégorie « bilans », ton neutre, plafond et tranquillité respectés).
- **Mémoire stratégique** `strategyLog` (append-only, chronologique, filtrable) : visions, orientations, priorités, plans, cycles, revues, décisions libres ; écrite dans la même transaction que chaque changement.
- **Interface** : espace « Pilotage » dans la navigation (7 onglets mobiles), tableau de bord (vision, carte de trajectoire, KPI, cycle du trimestre, cohérence, prochaine revue), Vision, Orientations, Priorités, Cycles, Revues, Historique ; section « Pilotage » en lecture seule dans les fiches objectif et projet LIFE ; réglages dans Profil ; certitude affichée dans l'analyse RPG.
- **Données** : Dexie v9 (`visions`, `orientations`, `priorities`, `annualPlans`, `cycles`, `strategyReviews`, `strategyLog`), tables ajoutées à `TABLE_KEYS`, sauvegardes chiffrées et restauration complètes ; sauvegardes antérieures (≤ v8) restaurables (tables absentes créées vides, test).

**Tests** : 452 tests unitaires et d'intégration (47 nouveaux : calendrier, relations, limite, rappels, faits de revue, règles stratégiques, intégration aux moteurs, service, atomicité, sauvegarde) ; `smoke-pilotage` 57/57 ; non-régression `smoke` 71/71, `smoke-sport` 55/55, `smoke-global` 62/62, `smoke-life2` 56/56, `smoke-rpg` 43/43, `smoke-intel` 54/54. Le contrôle d'accueil de `smoke-life2` est désormais insensible à la casse (échec préexistant : texte rendu en capitales).

**Limites**
- Seuils provisoires (`STRATEGY_CONFIG`, `PILOTAGE_CONFIG`) : à calibrer à l'usage.
- Pas de graphe interactif des relations (carte de trajectoire en liste hiérarchique) ; pas d'export PDF dédié des revues stratégiques (les bilans PDF existants restent séparés des sauvegardes).
- Le rappel de revue part du moteur de notifications : aucune remise en arrière-plan n'est promise (repli dans l'application).
- Un objectif supprimé dans LIFE laisse un identifiant orphelin dans les orientations, ignoré à l'affichage.

## 0.9.0 — RPG V1.2 : événements, immersion et intelligence locale

**Livré**
- **Journal d'événements RPG** (`core/rpgEvents.ts`, `data/eventService.ts`) : 28 types répartis en Progression, LIFE, SPORT, Régularité et évolution ; quatre niveaux d'importance (information, important, majeur, exceptionnel). Chaque événement a un identifiant déterministe unique, une date réelle, une origine, une référence à l'objet, des faits chiffrés et un état de consultation. Une action ordinaire n'est jamais un événement.
- **Cohérence** : détection recalculée depuis les faits ; aucune écriture dans le journal d'XP ; un fait contredit par une correction rend l'événement « révoqué » (conservé, signalé) ; historique reconstitué à la première synchronisation d'une mise à jour (jamais présenté comme nouveau). Prestiges, récompenses et succès réutilisent leurs tables.
- **Centre d'activité** (`/rpg/journal`) : chronologie par mois sans limite d'ancienneté, filtres (Tout, LIFE, SPORT, Progression RPG, Succès et récompenses, Importants), détail contextualisé, accès à la fonctionnalité, « nouveau » / consulté sans suppression.
- **Analyse locale** (`core/insights.ts`) : régularité (jamais la quantité), pauses et reprises sans jugement, tendance de fréquence, semaine inhabituelle ; LIFE (catégories en progression ou laissées de côté, prévu/réalisé, projets bloqués, échéances, indicateurs) ; SPORT (volume, performances, groupes musculaires, fréquence, récupération, charge en hausse) ; transversal (surcharge, échéances rapprochées, capacité, projets accumulés, baisse de réalisation). Fenêtres jour / semaine / mois / tendance longue ; fiabilité selon l'échantillon ; sous le minimum, la règle se tait.
- **Recommandations explicables** (`core/recommendations.ts`) : constat, justification chiffrée, recommandation, bénéfice, confiance. Décisions : accepter, reporter, refuser, ignorer (historique minimal) ; non re-proposées sans changement significatif de la situation. Seule action appliquable : une proposition LIFE existante, après confirmation. **Sécurité SPORT** : aucune reprise ni incitation à s'entraîner si la récupération n'est pas normale.
- **Narration** (`core/narration.ts`) : textes à gabarits déterministes, variés, fondés uniquement sur les faits de l'événement (test : aucun chiffre inventé). Rapports narratifs de bilan (état général, LIFE, SPORT, attributs, accomplissements, difficultés, recommandations, prochaines étapes).
- **Accueil** : une carte « En ce moment » (événement marquant, observation fiable, recommandation) ; la hiérarchie des alertes et la priorité de la récupération sont inchangées. **Événements majeurs** : carte distincte en couche supérieure (visible même sous une feuille).
- **Notifications** (moteur existant) : nouvelle catégorie réglable ; majeurs un par un, importants groupés, informations jamais notifiées ; jamais pour un événement consulté, reconstitué ou ancien ; priorités par type ; une recommandation à la fois ; ton jamais culpabilisant ; tranquillité et plafond respectés.
- **Bilans** : chaque section est étiquetée *Mesuré*, *Estimation*, *Lecture du moteur* ou *Recommandation* (écran et PDF) ; synthèse narrative hebdomadaire et mensuelle ; événements importants du jour.
- **Données** : Dexie v8 (`rpgEvents`, `recommendationStates`), sauvegardes chiffrées, restauration, compatibilité avec les sauvegardes antérieures (tables créées vides, journal reconstitué).

**Limites**
- Les seuils d'analyse, de fiabilité et d'importance sont provisoires (`INSIGHT_CONFIG`, `EVENT_CONFIG`).
- Les observations demandent plusieurs semaines de données : sur un historique court, Level se tait volontairement.
- Pas de détection de causes (motivation, émotion) ; les « lectures du moteur » restent prudentes.
- Les événements ne sont pas recalculés pour des données supprimées en dehors des corrections gérées (ils passent en « révoqués »).

## 0.8.0 — RPG V1.1 : progression, prestige et récompenses

**Livré**
- **Rangs E → SSS** (`core/progressionConfig.ts`, configuration centrale, valeurs provisoires). Niveau global : échelle d'origine (1–100, E1 D10 C20 B35 A55 S80) prolongée par SS 90 et SSS 96 — aucun niveau global acquis ne change. Niveaux de domaine : 36 niveaux, E 1–5 · D 6–10 · C 11–15 · B 16–20 · A 21–25 · S 26–29 · SS 30–33 · SSS 34–36.
- **Prestige LIFE et SPORT indépendants** : proposé au dernier niveau du rang SSS (niveau 36), facultatif, jamais automatique, répétable. Un cycle est une *fenêtre* du journal d'XP (XP enregistrée après le dernier prestige) : le journal n'est jamais modifié, niveau et rang se recalculent toujours (corrections comprises). Nouveau cycle : +20 % d'XP par niveau et par prestige (×1,2 ; ×1,4 ; …), propre au domaine.
- **Écran de confirmation dédié** (`/rpg/prestige/:domaine`) : position, numéro, conservé / réinitialisé, nouveau barème, quatre récompenses proposées, case d'accord explicite ; mise en scène ponctuelle du prestige. Opération atomique (une transaction : prestige + récompense), revérifiée côté service, impossible en double (clé `prestige:<domaine>:<n>`).
- **Récompenses** (catalogue extensible) : bonus d'XP permanents (LIFE ou SPORT seulement, dégressifs 5 · 4 · 3,2 · 2,6 · 2 · 1,6 %, un palier à la fois), titres, personnalisation (effets de montée de niveau, cadres de rang), défis facultatifs ajoutables comme vraies quêtes. Propositions mélangées, de catégories différentes, déterministes, sans doublon ni récompense déjà obtenue ; catalogue épuisé → prestige sans récompense (rien d'inventé).
- **Bonus d'XP non rétroactifs** : appliqués aux gains FUTURS (à partir du lendemain de l'obtention) par le moteur existant (`planCompletion`/`planCredit` pour LIFE, `desiredSportAwards` pour SPORT) ; aucun événement déjà inscrit n'est modifié.
- **22 succès** (catalogue extensible, rareté, description, date d'obtention conservée, jamais en double) et titres ; aucun ne récompense la suractivité.
- **Attributs** : audit LIFE → sept catégories, sept attributs, un par catégorie (nouvel attribut *Relations* pour « Social & relations », jusque-là fusionné avec Vitalité). SPORT : sept attributs inchangés. Description de ce qui fait évoluer chaque attribut.
- **Espace RPG** (`/rpg`) : Progression, Attributs, Distinctions, Récompenses, Prestige (historique indépendant LIFE/SPORT). Accueil : prestiges, rang par domaine, distinctions récentes, alerte de prestige. Profil : résumé des distinctions. Bilans : niveaux par cycle, prestiges, succès, récompenses. Notifications : prestige disponible, succès.
- **Données** : Dexie v7 (`prestiges`, `rpgRewards`, `achievements`), sauvegardes chiffrées complètes, restauration sans perte, hors ligne.

**Migrations et compatibilité**
- Dexie v6 → v7 : trois tables ajoutées ; la catégorie intégrée « Social & relations » passe de Vitalité à Relations *si elle l'avait encore par défaut* (seules les prochaines validations en bénéficient ; les événements passés gardent leur attribut).
- Les sauvegardes d'un schéma antérieur (≤ v6) se restaurent : les tables absentes sont créées vides (test).
- Changement explicite des rangs de domaine : un domaine déjà avancé peut afficher un rang différent (échelle 36 niveaux) ; XP, niveaux (même courbe `100·niveau^1,35`) et niveau global ne changent pas.

**Limites**
- Seuils, coefficients de prestige et catalogue sont provisoires (à calibrer à l'usage).
- Les défis de prestige SPORT sont des quêtes LIFE (l'XP SPORT ne vient que des séances).
- Les succès débloqués sont conservés même si l'événement d'origine est corrigé ensuite (distinction acquise).

## 0.7.0 — Étape 6 : LIFE V1.1 — objectifs, projets et indicateurs

**Opérationnel**
- **Objectifs** (`/life/objectifs`) : titre, description, catégorie, échéance, priorité, importance, statut (À définir, En cours, En pause, Atteint, Abandonné), critères de réussite et étapes intermédiaires validés explicitement, indicateurs associés, tensions déclarées avec d'autres objectifs. Filtres statut/catégorie, détail, modification libre, suppression expliquée.
- **Projets** (`/life/projets`) : statuts À préparer / En cours / En pause / Terminé / Abandonné, objectif parent facultatif, dates, étapes réorganisables avec échéance et blocage, sous-tâches, quêtes rattachées, historique. Structure simple par défaut (un projet peut n'avoir aucune étape).
- **Hiérarchie** Objectif → Projets → Étapes → Quêtes, souple : projet indépendant, quête indépendante, quête rattachée directement à un objectif. Rattachement depuis le projet ou le formulaire de quête (`Quest.goalId/projectId/stepId`).
- **Avancement** calculé sur le réellement accompli (`core/goals.ts`) : une étape n'est jamais « terminée » sans validation explicite (plafond 90 % sinon).
- **Indicateurs** (`/life/indicateurs`) : nombre, montant, durée, pourcentage, unité libre ; cible, fréquence de saisie, historique de mesures corrigeable, graphique d'évolution, progression vers la cible. Aucune XP.
- **XP** : aucune écriture dans le journal par les étapes, projets, objectifs ou indicateurs (testé). Les quêtes rattachées restent de vraies quêtes récompensées par le moteur existant.
- **Planning** : échéances d'étapes, de projets et d'objectifs comme repères sans durée ; objectifs de long terme toujours visibles ; constats (projet en retard, étape bloquée/en retard, échéance proche, projet inactif 21 j, objectif qui progresse peu, objectifs incompatibles avec les disponibilités, objectifs en tension, trop d'objectifs actifs). Adaptations proposées (décaler une échéance, mettre en pause) appliquées seulement après confirmation, revérifiées et tracées.
- **Bilans** : progression des objectifs, avancement des projets, étapes accomplies, projets bloqués, indicateurs en évolution, écarts prévu/réalisé (semaine et mois ; étapes validées dans le bilan du jour), export PDF inclus.
- **Accueil** : échéances de projets/objectifs et alerte LIFE prioritaire.
- **Données** : Dexie v6 (`goals`, `projects`, `indicators`, `indicatorReadings`), sauvegardes chiffrées et restauration sans perte (testées), hors ligne.
- **Suppression** : conséquences expliquées ; projets et quêtes conservés (détachés), quêtes réalisées et XP jamais touchées.

**Limites assumées / à développer**
- Pas de récompense RPG spécifique pour objectifs/projets (à définir ultérieurement ; aucune récompense automatique).
- Pas de système d'habitudes avancé ni de comptabilité détaillée.
- Les tensions entre objectifs sont déclarées par l'utilisateur ; Level ne les devine pas. L'incompatibilité avec les disponibilités est une estimation (effort restant vs 50 % du temps libre).
- « Modifier l'échéance » et « mettre en pause » sont applicables ; simplifier/réorganiser les étapes ou revoir un objectif ouvrent l'écran concerné (décision manuelle).

**Correctif** : fermer une feuille imbriquée refermait aussi la feuille parente (propagation de l'événement `close`).

## 0.6.0 — Étape 5 : moteur transversal et orchestration globale

**Opérationnel**
- Accueil global adaptatif (`core/dashboard.ts`, `arrangeGlobalHome`) : XP et niveaux LIFE/SPORT avec rang par domaine, quêtes prioritaires (avec raisons), prochaine séance, récupération, échéances, semaine, alertes. Ordre automatique, aucune réorganisation manuelle ; les blocs sans contenu sont masqués.
- Planning central (`/planning`, `core/planning.ts`, `data/planningService.ts`) : semaine LIFE + SPORT + engagements, charge vs capacité (marge conservée), conflits (chevauchement, surcharge, récupération, double séance, jour indisponible, échéance à risque), suggestions plafonnées, propositions à confirmer (déplacer, simplifier, retirer du jour, réorganiser le SPORT par son propre moteur, signaler les reports répétés). Garde-fous re-vérifiés à l'écriture ; trace dans `planningMoves`. Échéances, engagements et quêtes importantes jamais modifiés automatiquement.
- Priorités transversales : urgence, importance, échéance, équilibre des catégories, ancienneté des reports, proxy « long terme ».
- Notifications locales (`core/notifications.ts`, `data/notificationService.ts`) : rappels fixes, quêtes, échéances, sport, récupération, niveaux/rangs, bilans ; tranquillité (passage de minuit), catégories, fréquence (2/4/8 par jour), une seule notification à la fois (écart 30 min), déduplication, notification d'essai, boîte de réception.
- Bilans jour/semaine/mois (`/bilans`, `core/reports`) avec export PDF sans dépendance (`reports/pdf.ts`, `level-bilan-…pdf`, distinct des sauvegardes).
- RPG transversal : rangs LIFE et SPORT indépendants, contrôle de cohérence (`core/rpgConsistency.ts`) accessible dans les réglages.
- Réglages centralisés (`/profile`) : profil, affichage, notifications, planning, résumés LIFE/SPORT (sans duplication), RPG, sécurité/sauvegardes. Préférences stockées dans `settings` (couvertes par les sauvegardes).
- Dexie v5 : `commitments`, `planningMoves`, `notificationLog` (ajoutées aux sauvegardes ; anciennes sauvegardes migrées).

**Limites assumées / à développer**
- Notifications application fermée : impossible sans serveur push ; repli = évaluation tant que l'appli est ouverte + rattrapage à l'ouverture + boîte de réception. Remise système soumise à la permission du navigateur.
- Prestige LIFE/SPORT : non développé (annoncé « à venir » dans le contrôle RPG).
- Module Objectifs absent : le « long terme » repose sur un proxy (quêtes personnelles/exceptionnelles conséquentes).
- Durées LIFE du bilan hebdomadaire : estimées à partir de l'effort prévu des quêtes accomplies.

**Correctifs d'intégration** : valeur lue dans un callback différé après réinitialisation du champ contrôlé (capacité de planning) → champs numériques à validation à la sortie ; mises à jour de réglages fonctionnelles.

## 0.5.2 — Précision finale SPORT V1 : pompes
- Toutes les variantes de pompes (classiques, inclinées au mur, en piqué, triceps au mur) sont exclues des programmes ordinaires ; elles restent dans la bibliothèque (badge « Circuit HIIT uniquement ») et ne servent qu'aux circuits HIIT full-body, si l'utilisateur les autorise (une variante par circuit, selon niveau et semaine).
- Refus dans les séances personnelles et les échanges d'exercice ; plus citées comme alternatives.
- Conséquence documentée : sans matériel ni mobilier, aucun exercice ordinaire pour pectoraux et triceps (couverts en Domicile/Salle).
- Aucun autre changement. Tests : 235 (Vitest). **SPORT V1 clos.**

## 0.5.1 — Arbitrages de validation SPORT (V1)
- Deuxième séance du jour récompensable : récupération NORMALE au départ, ≤ 2 séances récompensées/jour, ≤ 3 supplémentaires/semaine, coefficient ×0,75, ≥ 4 h d'écart ; sinon enregistrée sans XP avec explication.
- Séances écourtées : XP strictement proportionnelle au travail accompli ; fin du seuil de 25 % (seul un travail non significatif, < 3 séries / < 10 min, ne rapporte rien).
- Repos : XP seulement si Level le recommande de façon pertinente (niveau + charge récente objective) ; la déclaration seule ne suffit plus ; explication affichée.
- Profils de matériel : « Sans matériel » sans mobilier ni équipement (pompes inclinées au mur, pompes triceps au mur, pompes en piqué au sol, mollets au sol…) ; mobilier solide réservé à Domicile/Salle ; tapis facultatif. 4 exercices ajoutés pour couvrir tous les groupes dès le niveau débutant (ange inversé, touche-épaules en planche, pompes triceps au mur, charnière au poids du corps).
- Règle de douleur inchangée.
- Tests : 233 (Vitest) ; contrôles navigateur SPORT mis à jour.

## 0.5.0 — Module SPORT
- Profil sportif progressif (niveaux déclaré / mesuré / opérationnel), enregistrement immédiat, jamais bloquant.
- Bibliothèque de ~75 exercices sur 11 groupes (fiches complètes, illustrations SVG locales), préférences (favoris, exclusions, évitements temporaires), exercices et séances personnalisés ; pompes classiques réservées au circuit HIIT.
- Génération adaptative de séances (priorités, récupération, historique, durée, matériel) en deux variantes cohérentes ; séance guidée mobile-first (saisie rapide, repos par horodatages, interruption/reprise, bascule de variante sans perte, correction, écran allumé).
- Progression par recommandations à confirmer (≥ 3 expositions) et cycle adaptatif.
- Course : saisie manuelle, allure calculée, intervalles, propositions prudentes (un levier par semaine, +10 %).
- Planning une séance par jour sans empilement, réorganisation après séance manquée.
- Récupération : questionnaire 30 s, indice (estimation non médicale), fatigue locale, NORMAL/VIGILANCE/ALERTE avec blocage jusqu'à réévaluation.
- XP SPORT dans le **journal existant** (recalcul déterministe `syncXp`), 7 attributs SPORT, radar LIFE/SPORT, records, régularité, repos respecté ; activités imprévues sans XP.
- Statistiques (volume, répartition, records, régularité, course, mensurations) et historique corrigeable avec recalcul.
- Schéma Dexie v4, sauvegardes étendues (8 tables), planificateur de sauvegarde sur les changements SPORT.
- **Correctif** : des modifications rapides du profil pouvaient s'écraser (mise à jour sur copie périmée) ; corrigé et testé.
- Tests : 225 unitaires/intégration (Vitest), 71 + 54 contrôles navigateur (LIFE/sauvegardes + SPORT).

## 0.4.0 — Sécurisation des données et sauvegardes
- Sauvegardes locales chiffrées (AES-256-GCM) dans une base IndexedDB séparée : périodiques, après modification, après opération importante, avant/après restauration ; déduplication ; rétention graduée ; vérification par relecture/déchiffrement à la création et au démarrage.
- Phrase secrète (PBKDF2 600 000) + clé de secours (160 bits) : chiffrement à enveloppe ; test réel du déchiffrement avec les deux secrets à la configuration ; changement de phrase ; réinitialisation depuis l'appareil en dernier recours.
- Export manuel d'un fichier `.levelbackup` chiffré complet, relu et déchiffré avant remise (distinct des PDF de bilans).
- Restauration locale ou depuis un fichier : déchiffrement, vérification, comparaison avec les données actuelles, confirmation explicite, sauvegarde de sécurité, remplacement atomique, vérification après coup, retour arrière automatique.
- Détection de sauvegardes corrompues, tronquées, falsifiées, de format ou schéma plus récents ; migration des schémas plus anciens.
- Page « Sauvegardes » (statut honnête, points de restauration, récupération) et bandeau d'alerte.
- **Validation rétroactive à toute date passée** : confirmation explicite au-delà de 14 jours (UI et moteur), plancher de saisie en 2000 ; les 14 jours restent la fenêtre d'analyse automatique des manques. Tests mis à jour en conséquence.
- Tests : 137 unitaires/intégration (Vitest), 71 contrôles navigateur.

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
