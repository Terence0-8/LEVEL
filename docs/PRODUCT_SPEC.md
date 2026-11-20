# Level — Spécification produit

## Vision
Application personnelle de progression combinant **LIFE** (organisation, objectifs, finances), **SPORT** (entraînement, course, récupération) et **RPG** (XP, niveaux, rangs, attributs, prestige). Fonctionnement prioritairement et intégralement hors ligne ; données conservées localement.

## Identité visuelle
Sombre, mystérieuse, élégante ; interface quotidienne sobre, événements RPG spectaculaires (or lumineux). Palette : fond `#0B0D11`, panneaux `#12141A`, cartes `#1E2128`, surfaces `#2A2F37`, or mat `#C9B17A`, or lumineux `#F5D889`, texte `#E8E1D3`, succès `#4CAF7A`, alerte `#E55B5B`, info `#6CA8FF`. Titres : Cinzel ; interface : Inter. Logo : monogramme « L » avec chevron d'ascension.

## Navigation
Accueil · LIFE · SPORT · Planning · RPG · Bilans · Historique ; Profil & réglages en accès secondaire. Mobile : barre inférieure ; desktop (≥ 900 px) : menu latéral. L'accueil est **adaptatif** : Level ordonne les widgets selon échéances, moment de la journée et récupération ; l'utilisateur ne les réorganise pas.

## Périmètre (v0.5)
| Domaine | État |
|---|---|
| Navigation, layouts mobile/desktop, composants | ✅ Opérationnel |
| Journal d'XP append-only (gains, corrections, justification) | ✅ Opérationnel, testé |
| Niveaux, rangs, attributs recalculés depuis le journal | ✅ Opérationnel |
| Quêtes LIFE : créer, modifier, étapes, valider, corriger, archiver, supprimer | ✅ Opérationnel |
| Catégories LIFE (7 initiales, personnalisables) | ✅ Opérationnel |
| Séries et cycles manqués (quotidien / hebdomadaire) | ✅ Calcul + affichage + analyse |
| Anti-farming (unicité, micro-tâches, effort) | ✅ Mécanismes en place, barèmes provisoires |
| Trois situations : réussite / progression partielle / effort sans objectif atteint | ✅ Opérationnel (feuille « Enregistrer mon travail ») |
| Validation rétroactive à toute date passée (confirmation si ancienne) | ✅ Opérationnel, séries et manques recalculés |
| Bilan des quêtes manquées (cause, décision, historique) | ✅ Opérationnel, sans effet sur l'XP |
| Trace des modifications de quêtes | ✅ Opérationnel |
| Sauvegardes automatiques locales chiffrées (périodiques + après opérations importantes) | ✅ Opérationnel |
| Plusieurs points de restauration, rétention, vérification d'intégrité | ✅ Opérationnel |
| Export manuel d'un fichier chiffré complet (hors PDF) | ✅ Opérationnel |
| Restauration (locale ou fichier) avec revue, confirmation, vérification et retour arrière | ✅ Opérationnel |
| Phrase secrète + clé de secours, test réel de récupération | ✅ Opérationnel |
| Rapports PDF (bilans) | ⏳ Non démarré — **distincts** de la sauvegarde |
| Accueil adaptatif | ✅ sur données réelles ou de démo |
| Persistance locale, PWA hors ligne | ✅ Opérationnel |
| **SPORT** : profil, bibliothèque, musculation guidée, course, planning, récupération, XP, statistiques, historique corrigeable | ✅ Opérationnel (voir « Module SPORT » : limites listées) |
| SPORT : GPS, montre connectée, photos d'exercices, bilans PDF, notifications | ⏳ Non démarré / hors périmètre v0.5 |
| Habitudes avancées, objectifs, budgets | ⏳ Non démarré (volontairement) |
| Prestige, notifications, sauvegardes chiffrées, bilans | ⏳ Non démarré |

## Règles de quêtes LIFE
- **Types** : quotidienne (cycle = jour), hebdomadaire (cycle = semaine ISO), personnelle et exceptionnelle (cycle unique).
- **Champs** : titre, description, catégorie, priorité (organisation uniquement, sans effet sur l'XP), échéance facultative, difficulté, effort estimé, étapes facultatives, récompense XP (calculée), statut (dérivé du journal).
- **Validation** : quête simple en une action ; quête à étapes = XP progressive, la somme des étapes ne dépasse jamais la récompense. « Valider » une quête à étapes valide les étapes restantes.
- **Correction** : explicite (confirmation demandée) ; l'XP est retirée par un événement de correction ; revalidation possible. Suppression : confirmation, XP retirée, trace conservée.
- **Quête manquée** : aucune perte d'XP, jamais de pénalité ; elle interrompt la série et reste disponible pour une analyse ultérieure. Une échéance dépassée est purement informative.
- **Modification** : les gains passés ne sont pas réécrits. Étapes supprimées → leur XP est annulée. Quête simple devenue composée → son gain est annulé puis regagné par les étapes. Changer difficulté/effort/catégorie s'applique aux gains futurs.
- **Catégories → attributs** (hypothèse modifiable par l'utilisateur) : Professionnel→Discipline, Culture & connaissances→Intellect, Économie & finances→Prospérité, Développement personnel→Endurance, Social & relations→Vitalité, Projets personnels→Force, Hygiène de vie→Vitalité. Les catégories s'archivent (pas de suppression) pour préserver l'historique.

## Trois situations de validation
| Situation | Récompense |
|---|---|
| **Réussite complète** | Récompense normale de la quête (moins ce qui a déjà été crédité dans le cycle). |
| **Progression partielle** | Proportionnelle à la part de travail déclarée (10–90 %), **cumulative** : seule la progression nouvelle est récompensée (pas de 10 points minimum entre deux déclarations). |
| **Effort sans objectif atteint** | Réduite mais **non nulle** : au plus 25 % de la récompense, modulée par la durée déclarée rapportée à l'estimation (60 % de ce maximum si aucune durée). Jamais la récompense maximale. |

Saisie : situation, part de travail (partiel), date de réalisation, durée facultative, commentaire facultatif, aperçu de l'XP, puis **confirmation** de l'enregistrement. Tout crédit est **déduit de la validation finale** : le total d'un cycle ne dépasse jamais la récompense de la quête.

**Garde-fous** : refus pour les micro-tâches (≤ 10 min) ; refus si le cycle est déjà validé ; un seul « effort » par quête et par cycle ; progression partielle strictement croissante ; les crédits ne peuvent pas atteindre la réussite complète (plafond 90 %) ; au-delà de 3 déclarations de crédit par jour (toutes quêtes), récompense réduite à 25 % (jamais nulle). Chaque gain peut être annulé par une correction tracée.

## Validation rétroactive
Une quête (ou un crédit) peut être déclarée à **n'importe quelle date passée** ; pas de date future, pas de date avant l'an 2000 (garde-fou de saisie). **Au-delà de 14 jours en arrière, une confirmation explicite est exigée** (« date ancienne »), côté interface et côté moteur. Les 14 jours restent la **fenêtre d'analyse automatique** des quêtes manquées. Le journal conserve : **date d'accomplissement déclarée** (`at`), **date d'enregistrement** (`recordedAt`) et **statut rétroactif** (`retroactive`). Le cycle concerné est celui de la date déclarée ; une clé de cycle ne peut être récompensée qu'une fois : pas de doublon. Séries, cycles manqués et statistiques se recalculent depuis le journal. Une validation d'un cycle passé peut être corrigée (journal des gains → « Annuler »).

## Analyse des quêtes manquées (aucune pénalité XP)
- **Détection** : cycles récurrents passés non validés (fenêtre automatique : 14 derniers cycles) et échéances dépassées des quêtes uniques.
- **Cause** : oubli, manque de temps, difficulté, motivation, imprévu, repos nécessaire (ou « ignorer »).
- **Décision** : rien · **reporter** (nouvelle échéance, ou rattrapage daté pour une récurrente) · **simplifier** (difficulté −1 cran, effort ÷ 2) · **remplacer** (copie + archivage de l'ancienne) · **suspendre** (archivage).
- **Historique** conservé (titre figé, cycle, cause, décision, commentaire) et statistique des causes. Un élément analysé ne réapparaît plus.

## Modifications historiques
Modifier difficulté, effort, catégorie (ou tout autre champ) **ne réécrit jamais silencieusement** les récompenses acquises. Chaque modification crée une **révision** (champ, ancienne et nouvelle valeur, XP déjà acquise et conservée, note), visible dans la quête ; l'éditeur avertit quand de l'XP est déjà acquise. Seules exceptions, explicites et tracées dans le journal : étape supprimée → son gain est annulé ; quête simple devenue composée → son gain est annulé puis regagné par les étapes. Le nouveau barème vaut pour les prochains gains uniquement.

## Équilibrage et anti-farming (barèmes PROVISOIRES, `core/rewards.ts` — valeurs à calibrer, non définitives)
| Mécanisme | Principe |
|---|---|
| Unicité | Une clé de récompense (quête/étape × cycle) ne peut avoir qu'un gain ouvert. |
| Difficulté × effort | Base par difficulté × √(effort / 30 min), borné et arrondi. |
| Découpage neutre | Le nombre d'étapes ne change pas l'XP totale. |
| Priorité neutre | La priorité n'influence pas l'XP. |
| Micro-tâches | Au-delà de 3 quêtes de ≤ 10 min récompensées par jour : récompense réduite (jamais négative). |
| Crédits | Plafonds, pas minimal, un effort par cycle, plafond quotidien (voir ci-dessus). |
| Rétroactif | Confirmation au-delà de 14 jours, une récompense par cycle, traçabilité (date déclarée / enregistrée). |
| Doublons | Avertissement sur un titre identique à une quête active. |

## Règles de jeu (hypothèses v0.1 — modifiables)
- Coût du niveau *n* → *n+1* : `round(100 · n^1.35)` XP. Niveau max 100.
- Niveau **global** calculé sur la somme XP LIFE + SPORT ; LIFE et SPORT ont chacun leur niveau.
- Rangs sur niveau global : E (1) Éveillé · D (10) Initié · C (20) Aguerri · B (35) Vétéran · A (55) Élite · S (80) Souverain.
- Six attributs : Force, Endurance, Vitalité, Discipline, Intellect, Prospérité (échelle 0–100). Valeur = `100·(1−e^(−XP/1500))` sur l'XP de leurs catégories (provisoire).

## Hypothèses prises
- Nom du joueur par défaut « Éveillé » ; modifiable.
- **Changement v0.2** : les données de démo sont désormais **désactivées par défaut** (l'app affiche la progression réelle) ; activables dans les réglages. Démo et réel ne sont jamais mélangés.

## Décisions fonctionnelles validées (retour étape 2)
1. Données de démo : désactivées par défaut, activables dans les réglages, jamais mélangées au réel.
2. Barèmes XP : valeurs actuelles conservées comme **provisoires**, centralisées dans `REWARD_CONFIG` ; seuils de niveaux et de rangs **inchangés** (verrouillés par un test).
3. Crédit d'effort : exposé (trois situations, voir ci-dessus).
4. Validation rétroactive : voir ci-dessus. 5. Analyse des manques : voir ci-dessus. 6. Modifications historiques : voir ci-dessus.

## Sauvegarde et sécurité des données (v0.4)
**Principe** : aucune progression ne doit pouvoir être perdue accidentellement ; aucune donnée ne quitte l'appareil.

| Besoin | Réponse |
|---|---|
| Sauvegardes automatiques | Au démarrage puis toutes les 30 min si la dernière a plus de 24 h ; 60 s après un changement (une par 15 min max) ; 3 s après une opération importante (suppression de quête, annulation d'XP) ; avant et après toute restauration. Une sauvegarde identique à la précédente n'est pas dupliquée. |
| Points de restauration | Les 8 plus récentes, une par jour sur 14 jours, une par semaine sur 8 semaines. Manuelles, exports et initialisation : jamais supprimées automatiquement. 5 sauvegardes « avant restauration » conservées. La plus récente sauvegarde vérifiée n'est jamais supprimée. |
| Chiffrement | AES-256-GCM ; clé de données aléatoire protégée par une **phrase secrète** (PBKDF2, 600 000 itérations) et par une **clé de secours** (160 bits). |
| Intégrité | Authentification GCM (en-tête inclus), somme de contrôle SHA-256, comptages par table, audit du journal d'XP ; relecture et déchiffrement réels à chaque création, re-vérification au démarrage. |
| Export manuel | Fichier `.levelbackup` chiffré, complet (toutes les tables), autonome, relu et déchiffré avec la phrase avant d'être remis. **Distinct des PDF**, réservés aux bilans. |
| Restauration | Choix explicite du point ou du fichier → déchiffrement → vérification → comparaison avec les données actuelles → confirmation → sauvegarde de sécurité automatique → remplacement atomique → vérification après coup → retour arrière automatique en cas d'écart. Jamais silencieuse. |
| Perte de secrets | Phrase oubliée → clé de secours. Les deux perdues, appareil intact → nouveaux secrets (les anciens fichiers restent liés à leurs anciens secrets). Les deux perdus et appareil perdu → données de ces fichiers **irrécupérables** (aucune porte dérobée). |
| Honnêteté | L'interface ne dit « récupération testée » qu'après un déchiffrement réel avec un secret saisi ; sinon « intégrité vérifiée » (clé de l'appareil) ou « cet appareil uniquement ». |

Hypothèses : phrase de 10 caractères minimum ; sans phrase secrète définie, les sauvegardes locales existent mais sont signalées « cet appareil uniquement » et le bandeau d'alerte reste affiché.

## Module SPORT (v0.5)
**Principe** : coaching personnalisé, hors ligne. Level organise, analyse et propose ; l'utilisateur garde le contrôle des objectifs et de toute modification durable. **SPORT réutilise le journal d'XP existant** (`xpEvents`, domaine SPORT) : aucun second moteur. **1 XP SPORT = 1 XP LIFE** pour le niveau global (la somme des deux alimente le niveau global ; LIFE et SPORT gardent leur niveau propre). Barèmes propres à la discipline, **provisoires et centralisés** dans `core/sport/config.ts`.

### Profil sportif (configuration progressive, jamais bloquante)
Expérience, objectifs, priorités musculaires (Développement / Progression / Entretien par groupe), jours et fréquences, durée par séance, matériel (Sans matériel par défaut / Domicile / Salle), contraintes physiques, familles de course, objectif de course, option « pompes dans les circuits HIIT ». Enregistrement immédiat. **Trois niveaux** : *déclaré* (saisi), *mesuré* (issu des séances, indisponible avant 6 séances), *opérationnel* (celui qui pilote Level : prudent, « avancé » plafonné à « intermédiaire » tant qu'il n'est pas démontré, mesure limitée à un cran au-dessus du déclaré). Évaluation progressive : première exposition à un exercice = test **non maximal** (≥ 4 répétitions en réserve / 3 avant l'échec).

### Musculation
| Sujet | Règle |
|---|---|
| Bibliothèque | 11 groupes musculaires, ~75 exercices utiles (musculation, mobilité, circuit HIIT), fiche complète : muscles principaux/secondaires, matériel, famille biomécanique (poussée, tirage, flexion, extension, charnière, rotation, stabilisation), niveau, exécution, sécurité, progression, alternatives, illustration. |
| Images | Illustrations **schématiques** générées localement en SVG (départ / fin, muscles en or) : quelques octets, hors ligne, pas de photographie. |
| Matériel | Un programme = **deux variantes cohérentes** (avec / sans matériel), mêmes groupes et mouvements, même historique. Bascule possible en séance **sans perdre** les séries saisies. Exercices et performances **restent distincts** : aucune conversion répétitions ↔ charge. **Sans matériel** = aucun équipement ni mobilier (le sol et un mur suffisent ; un tapis est facultatif) ; une seule variante. **Domicile** = mobilier solide (chaise, table, marche) + petit matériel choisi, tapis facultatif. **Salle** = tout. La variante « sans matériel » d'un programme n'exige jamais chaise, table ni équipement. |
| Pompes (toutes variantes) | Classiques, inclinées (mains au mur), en piqué, triceps au mur : **exclues de tous les programmes ordinaires** (séances générées, séances personnelles, échanges d'exercice, alternatives proposées). Elles **restent dans la bibliothèque** (badge « Circuit HIIT uniquement ») et ne sont **disponibles que dans les circuits HIIT full-body, si l'utilisateur les autorise dans ses préférences** : une variante par circuit, adaptée au niveau (débutant : variantes simples) et variée d'une semaine à l'autre. |
| Préférences | Favoris, exclusions, évitements temporaires (jusqu'à une date), contraintes physiques, exercices personnalisés, séances personnelles. Exercice impossible → alternative **proposée**, jamais appliquée durablement sans validation (remplacement ponctuel pour la séance seulement). |
| Génération | Adaptative, sans split fixe : priorités × besoin hebdomadaire (14/10/6 séries selon la priorité) × fraîcheur du groupe × fatigue locale × récupération × durée × historique ; équilibre poussée/tirage ; ordre des exercices (polyarticulaires d'abord). |
| Séance guidée | Mobile-first : gros boutons, saisie rapide (répétitions, charge, effort, technique, douleur), chronomètre de repos et de maintien **par horodatages absolus** (exact en arrière-plan), passer / réorganiser / corriger une série / interrompre et reprendre, **sauvegarde après chaque série**, écran maintenu allumé (Screen Wake Lock) quand la plateforme le permet. |
| Progression | Recommandation par exercice après **≥ 3 expositions** (répétitions, charges, technique, effort, récupération, douleurs) : augmenter / maintenir / réduire / récupérer. **Jamais appliquée sans confirmation.** Pas d'augmentation jour après jour (≥ 6 jours entre deux), ni en vigilance/alerte, ni hors phase de développement. La stagnation n'est pas un échec. Douleur → prudence avant tout. |
| Cycle adaptatif | Développement (3 sem.) → consolidation → allègement → reprise ; effet sur volume, charges et autorisation d'augmenter ; redémarrage manuel. |

### Course à pied (indépendante, saisie manuelle)
Familles : endurance fondamentale, fractionné, sortie longue, tempo, récupération active, côtes — **choisies par l'utilisateur** (Level n'ajoute jamais une famille exclue). Enregistré : distance, durée, **allure moyenne calculée**, type, difficulté ressentie, commentaire, **intervalles individuels** du fractionné. Proposition de sortie : premier test prudent (20 min, allure de conversation), puis volume ≤ +10 %/sem., **un seul levier** (volume, sortie longue ou intensité) par semaine, pas d'exigeant en vigilance/alerte, rien en alerte ; une récupération qui dépasse la difficulté permise est signalée et plafonnée en XP. Pas de GPS ni de montre.

### Planning et coordination
Une séance par jour ; musculation prioritaire dans les arbitrages ; jours disponibles respectés ; séance manquée → réorganisation du reste de la semaine **sans empiler** (aucune pénalité) ; séances prévues préparées au dernier moment avec les données du jour. Seconde séance le même jour : possible exceptionnellement, **à l'initiative de l'utilisateur**. Elle **rapporte de l'XP** si la récupération la permettait au départ (niveau NORMAL), avec les protections ci-dessous (voir XP).

### Récupération et sécurité (estimation non médicale)
Questionnaire d'environ 30 s : fatigue (4 niveaux), sommeil (4), courbatures (aucune/légères/modérées/importantes, zone facultative), douleur inhabituelle (non/légère/importante, zone). Combiné à la charge des séances (**fatigue locale par groupe** à décroissance exponentielle, distincte de la fatigue générale). Trois niveaux : **NORMAL / VIGILANCE / ALERTE**. Alerte (douleur importante, douleur légère 3 jours de suite dans la même zone, fatigue forte + sommeil très mauvais, indice très bas) : la zone concernée (muscle, articulation, ou tout si non localisée) est **bloquée jusqu'à réévaluation** (nouvelle saisie) ; aucune séance proposée ; une séance prévue voit ses exercices bloqués écartés au démarrage. La sécurité passe avant les objectifs et les récompenses ; aucun encouragement à dépasser une douleur.

### XP et attributs SPORT (barèmes provisoires)
| Récompense | Règle |
|---|---|
| Séance terminée / écourtée | Base × part du travail réalisé × facteur de durée : **strictement proportionnelle** au travail accompli, sans seuil en pourcentage. Seule une séance **sans travail significatif** (moins de 3 séries ; moins de 10 min de course) est enregistrée sans XP (paramètres provisoires). |
| 2ᵉ séance du jour | Récompensée si : niveau de récupération **NORMAL au départ** (mémorisé), au plus **2 séances récompensées par jour** et **3 séances supplémentaires par semaine**, coefficient **×0,75**, **≥ 4 h** après la séance précédente (une séance scindée ne double pas la récompense). Sinon : enregistrée, comptée dans la récupération et les statistiques, sans XP, avec la raison affichée. |
| Course | Selon la durée (≥ 10 min) ; récupération active plafonnée. |
| Régularité | Objectif hebdomadaire atteint sur des jours distincts (1/semaine). |
| Records personnels | Après ≥ 3 expositions, amélioration ≥ 2 %, technique propre, sans douleur ; ≤ 2 par séance. |
| Récupération respectée | **Seulement si Level recommande le repos de façon pertinente** : niveau VIGILANCE/ALERTE **et** charge récente objective (fatigue locale élevée ou ≥ 2 séances organisées dans les 3 derniers jours), repos choisi, aucune séance ce jour ; ≤ 2/semaine. Une déclaration personnelle (questionnaire, activité imprévue déclarée) **ne suffit pas** : le repos reste conseillé, sans XP. |
| Progression confirmée | Quand l'utilisateur applique une recommandation (Maîtrise technique) ; ≤ 3/semaine. |
| Activité imprévue | Enregistrée, comptée dans la récupération et les statistiques, **sans XP**. |
Attributs SPORT : Force, Endurance, Discipline (partagés avec LIFE), Mobilité (séances de mobilité), Coordination (circuits HIIT), Maîtrise technique (progressions confirmées), Résilience (repos respecté).

### Statistiques, historique, corrections
Volume (séries, tonnage, répétitions poids du corps, durée), répartition musculaire, records, régularité, progression de course, mensurations facultatives (poids, taille), périodes semaine / mois / 3 mois / année / tout, bilan après séance, bilans hebdomadaire et 30 jours. Historique consultable en détail ; **toute correction** (statut, date, série, suppression) recalcule XP, niveaux, attributs, records et recommandations par **événements de correction tracés** dans le journal (aucune réécriture).

### Limites connues de la v0.5 (à ne pas présenter comme faites)
- Illustrations schématiques, pas de photographies ni d'animations.
- Génération automatique de séances de **mobilité** non fournie (les exercices existent ; séances personnelles possibles). Circuit HIIT : format fixe 6 exercices.
- Séances personnelles : création seulement (pas d'édition de modèle).
- Progression au poids du corps : cible de répétitions/durée ; la variante plus difficile n'est que suggérée en texte.
- Bilans : affichés dans l'application (pas de notification, ni PDF).
- Alertes de fin de repos : vibration seulement ; aucune notification si l'application est en arrière-plan (limite du web sans serveur) — le chronomètre reste exact au retour.
- Mensurations : poids et tour de taille dans le formulaire.
- Barèmes, seuils de récupération, demi-vie de fatigue, seuil de travail significatif, paramètres des séances supplémentaires et de la recommandation de repos : hypothèses à calibrer.

### Arbitrages de validation du module SPORT (V1)
1. **Deuxième séance quotidienne** : peut rapporter de l'XP (pas de règle générale « une séance par jour »), sous conditions de récupération et protections anti-farming (voir XP).
2. **Seuil de 25 %** supprimé : récompense proportionnelle au travail accompli ; seul un travail non significatif (nombre minimal de séries / minutes, provisoire) ne rapporte rien.
3. **Repos** : récompensé seulement sur recommandation pertinente de Level (niveau + charge objective), jamais sur simple déclaration.
4. **Profils de matériel** : « Sans matériel » sans mobilier ni équipement ; « Domicile » avec mobilier solide et petit matériel ; tapis facultatif.
5. **Règle de douleur** inchangée (provisoire) : douleur importante, ou douleur légère 3 jours de suite dans la même zone → ALERTE et blocage jusqu'à réévaluation.
Le module SPORT est considéré comme **livré en V1** ; les autres paramètres numériques restent provisoires et seront calibrés à l'usage.

### Précision finale V1 : pompes
Toutes les variantes de pompes sont exclues des programmes classiques ; elles restent dans la bibliothèque mais ne servent qu'aux circuits HIIT full-body autorisés. **Conséquence assumée** : sans matériel ni mobilier, aucun exercice ordinaire ne cible les **pectoraux** ni les **triceps** (les seules options sans matériel de ces deux groupes sont des pompes) ; avec le profil « Sans matériel », ces deux groupes ne sont donc travaillés que dans le circuit HIIT autorisé. Domicile et Salle les couvrent (développés, écartés, élastiques, dips, extensions).

## Orchestration globale (v0.6)
| Fonction | État |
|---|---|
| Accueil global adaptatif (progression, niveaux/rangs par domaine, priorités, séance, récupération, échéances, semaine, alertes) | ✅ |
| Planning central LIFE + SPORT + engagements, conflits, propositions confirmées | ✅ |
| Priorités transversales, report des tâches secondaires, simplification, reports répétés signalés | ✅ |
| Notifications locales configurables (tranquillité, catégories, fréquence, rappels fixes) | ✅ appli ouverte / ⚠️ pas de remise application fermée (limite PWA, repli en boîte de réception) |
| Bilans jour/semaine/mois + export PDF (distinct des sauvegardes) | ✅ |
| Contrôle de cohérence RPG, rangs indépendants LIFE/SPORT | ✅ |
| Réglages centralisés | ✅ |
| Prestige LIFE/SPORT | ❌ non développé |
| Objectifs de long terme (module dédié) | ❌ proxy seulement |
Règles : les pourcentages d'exécution mesurent la planification, jamais la valeur de la personne ; aucune journée n'est remplie artificiellement ; aucune échéance importante n'est modifiée sans action explicite.

## LIFE V1.1 : objectifs, projets, indicateurs (v0.7)
| Fonction | État |
|---|---|
| Objectifs (statuts, critères, étapes intermédiaires, importance, tensions) | ✅ |
| Projets, étapes réorganisables, sous-tâches, quêtes rattachées, historique | ✅ |
| Hiérarchie Objectif → Projets → Étapes → Quêtes (souple) | ✅ |
| Indicateurs avec historique, cible, fréquence, graphique | ✅ |
| Intégration planning, accueil, bilans, PDF | ✅ |
| Sauvegardes chiffrées et hors ligne | ✅ |
| Récompenses RPG spécifiques objectifs/projets | ❌ non définies (aucune XP automatique) |
| Habitudes avancées, comptabilité détaillée | ❌ hors périmètre |
Règles : seules les quêtes rapportent de l'XP ; valider étape, projet ou objectif n'en rapporte jamais ; une étape n'est terminée que par validation explicite ; Level propose, l'utilisateur confirme toute modification d'échéance.

## RPG V1.1 (v0.8)
| Fonction | État |
|---|---|
| Rangs E, D, C, B, A, S, SS, SSS (global et domaines) | ✅ |
| Prestige LIFE / SPORT indépendant, facultatif, confirmé, atomique, répétable | ✅ |
| Cycles : +20 % d'XP par prestige, journal et attributs conservés | ✅ |
| Récompenses de prestige (bonus d'XP dégressifs, titres, personnalisation, défis) | ✅ |
| Succès, titres, historique des prestiges, espace RPG, accueil, profil, bilans | ✅ |
| Sauvegardes chiffrées et migration depuis les versions antérieures | ✅ |
| Calibrage définitif des seuils et du catalogue | ⏳ à l'usage |
Règles : le niveau global ne fait jamais l'objet d'un prestige ; un prestige ne modifie ni le journal d'XP, ni l'autre domaine, ni la difficulté des quêtes, séances ou objectifs ; les bonus ne s'appliquent qu'aux gains futurs.

### Conditions des succès (provisoires)
Premier pas (1ʳᵉ quête) · Première séance · Niveau 5 LIFE / SPORT · Un cap franchi (rang D) · Élite (rang A) · Niveau global 10 · Renaissance (1ᵉʳ prestige) · Cycles et sagesse (3 prestiges) · Deux voies (prestige LIFE + SPORT) · Rythme tenu (4 semaines à ≥ 3 jours actifs) · Constance (12 semaines) · Un mois / Une année d'ancienneté · 25 / 100 séances · 10 km · Sagesse du repos · Ambition atteinte · Trois ambitions · Projet mené à terme · Mesurer pour comprendre (10 mesures).

## RPG V1.2 (v0.9)
| Fonction | État |
|---|---|
| Journal d'événements importants (progression, LIFE, SPORT, régularité), importance, consultation | ✅ |
| Centre d'activité filtrable, historique illimité | ✅ |
| Analyse locale (régularité, LIFE, SPORT, transversal) proportionnée aux données | ✅ |
| Recommandations explicables, décisions mémorisées, jamais appliquées seules | ✅ |
| Narration contextualisée et récits de bilan fidèles aux faits | ✅ |
| Accueil (carte « En ce moment »), événements majeurs, notifications intelligentes | ✅ |
| Bilans étiquetés (mesuré / estimation / lecture / recommandation), PDF inclus | ✅ |
| Sauvegardes chiffrées et migration | ✅ |
| Chatbot, IA distante, déduction de causes psychologiques | ❌ hors périmètre (volontaire) |
Règles : la sécurité SPORT prime sur toute recommandation ; une pause n'est jamais un échec ; aucune conclusion à partir d'une seule action ; aucune modification sans accord.

## PILOTAGE V1 (v1.0)
- **Principe** : Pilotage relie une vision à long terme aux priorités, objectifs, projets et actions concrètes de LIFE sans les dupliquer. Tout y est facultatif ; Level fonctionne sans.
- **Vision** : texte libre, jamais mesurable, versions conservées. **Orientations** : statuts À définir/Active/En pause/En réévaluation/Accomplie/Abandonnée ; liens plusieurs-à-plusieurs avec objectifs, projets et indicateurs LIFE.
- **Priorités** : fondamentale/importante/secondaire ; limite SOUPLE de priorités fondamentales actives (défaut 3, réglable) : dépassement possible après confirmation.
- **Plan annuel et cycles trimestriels** : sélection d'éléments existants ; revue de cycle (faits mesurés + décisions de l'utilisateur) ; clôture et préparation du suivant atomiques.
- **Intelligence** : mêmes moteurs d'analyse et de recommandation que le RPG (constat, justification, proposition, bénéfice, fiabilité) ; certitude certain/probable/estimation ; aucune conclusion psychologique ; seules applications possibles : rétrograder ou mettre en pause une priorité, après confirmation.
- **Revues** facultatives (mensuelle désactivée par défaut), rappels neutres via les notifications. **Mémoire stratégique** append-only.
- **Garanties** : aucune écriture dans `xpEvents`, aucune modification silencieuse d'échéance, de planning ou d'objectif ; détacher/archiver conserve objectifs, projets, quêtes et XP.

## Fiabilité et stabilisation (v1.0.1)
- **Suppression LIFE et Pilotage** : supprimer un objectif, un projet ou un indicateur retire ses liens stratégiques (tracé) ; rien d'autre n'est supprimé (orientations, priorités, cycles, plans, revues conservés). Les orphelins existants se nettoient sur demande.
- **Mises à jour de l'application** : proposées, jamais imposées ; les données locales ne sont jamais touchées par une mise à jour.
- **Stockage local** : les sauvegardes locales ne protègent pas contre la perte de l'appareil ni l'effacement des données du navigateur ; une copie externe d'un fichier chiffré est nécessaire (voir `docs/STABILIZATION_REPORT.md`, §6–7). Level l'indique dans l'application et ne présente jamais une sauvegarde locale comme une protection contre la perte physique.
- **Stockage indisponible ou saturé** : message explicite, aucune donnée existante supprimée.

