# Changelog

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
