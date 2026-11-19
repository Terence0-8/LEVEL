# Level — Spécification produit

## Vision
Application personnelle de progression combinant **LIFE** (organisation, objectifs, finances), **SPORT** (entraînement, course, récupération) et **RPG** (XP, niveaux, rangs, attributs, prestige). Fonctionnement prioritairement et intégralement hors ligne ; données conservées localement.

## Identité visuelle
Sombre, mystérieuse, élégante ; interface quotidienne sobre, événements RPG spectaculaires (or lumineux). Palette : fond `#0B0D11`, panneaux `#12141A`, cartes `#1E2128`, surfaces `#2A2F37`, or mat `#C9B17A`, or lumineux `#F5D889`, texte `#E8E1D3`, succès `#4CAF7A`, alerte `#E55B5B`, info `#6CA8FF`. Titres : Cinzel ; interface : Inter. Logo : monogramme « L » avec chevron d'ascension.

## Navigation
Accueil · LIFE · SPORT · RPG · Historique ; Profil & réglages en accès secondaire. Mobile : barre inférieure ; desktop (≥ 900 px) : menu latéral. L'accueil est **adaptatif** : Level ordonne les widgets selon échéances, moment de la journée et récupération ; l'utilisateur ne les réorganise pas.

## Périmètre (v0.4)
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
| SPORT | 🚧 Structure visuelle sur données de démo uniquement |
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
