# Level — Spécification produit

## Vision
Application personnelle de progression combinant **LIFE** (organisation, objectifs, finances), **SPORT** (entraînement, course, récupération) et **RPG** (XP, niveaux, rangs, attributs, prestige). Fonctionnement prioritairement et intégralement hors ligne ; données conservées localement.

## Identité visuelle
Sombre, mystérieuse, élégante ; interface quotidienne sobre, événements RPG spectaculaires (or lumineux). Palette : fond `#0B0D11`, panneaux `#12141A`, cartes `#1E2128`, surfaces `#2A2F37`, or mat `#C9B17A`, or lumineux `#F5D889`, texte `#E8E1D3`, succès `#4CAF7A`, alerte `#E55B5B`, info `#6CA8FF`. Titres : Cinzel ; interface : Inter. Logo : monogramme « L » avec chevron d'ascension.

## Navigation
Accueil · LIFE · SPORT · RPG · Historique ; Profil & réglages en accès secondaire. Mobile : barre inférieure ; desktop (≥ 900 px) : menu latéral. L'accueil est **adaptatif** : Level ordonne les widgets selon échéances, moment de la journée et récupération ; l'utilisateur ne les réorganise pas.

## Périmètre (v0.2)
| Domaine | État |
|---|---|
| Navigation, layouts mobile/desktop, composants | ✅ Opérationnel |
| Journal d'XP append-only (gains, corrections, justification) | ✅ Opérationnel, testé |
| Niveaux, rangs, attributs recalculés depuis le journal | ✅ Opérationnel |
| Quêtes LIFE : créer, modifier, étapes, valider, corriger, archiver, supprimer | ✅ Opérationnel |
| Catégories LIFE (7 initiales, personnalisables) | ✅ Opérationnel |
| Séries et cycles manqués (quotidien / hebdomadaire) | ✅ Calcul + affichage ; analyse des manques : préparée, non exposée |
| Anti-farming (unicité, micro-tâches, effort) | ✅ Mécanismes en place, barèmes provisoires |
| Crédit d'effort sans résultat | 🧩 Moteur + service prêts, **non exposé en UI** |
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

## Équilibrage et anti-farming (barèmes PROVISOIRES, `core/rewards.ts`)
| Mécanisme | Principe |
|---|---|
| Unicité | Une clé de récompense (quête/étape × cycle) ne peut avoir qu'un gain ouvert. |
| Difficulté × effort | Base par difficulté × √(effort / 30 min), borné et arrondi. |
| Découpage neutre | Le nombre d'étapes ne change pas l'XP totale. |
| Priorité neutre | La priorité n'influence pas l'XP. |
| Micro-tâches | Au-delà de 3 quêtes de ≤ 10 min récompensées par jour : récompense réduite (jamais négative). |
| Doublons | Avertissement sur un titre identique à une quête active. |
| Effort sans résultat | Crédit partiel (25 %), déduit de la validation finale (préparé). |

## Règles de jeu (hypothèses v0.1 — modifiables)
- Coût du niveau *n* → *n+1* : `round(100 · n^1.35)` XP. Niveau max 100.
- Niveau **global** calculé sur la somme XP LIFE + SPORT ; LIFE et SPORT ont chacun leur niveau.
- Rangs sur niveau global : E (1) Éveillé · D (10) Initié · C (20) Aguerri · B (35) Vétéran · A (55) Élite · S (80) Souverain.
- Six attributs : Force, Endurance, Vitalité, Discipline, Intellect, Prospérité (échelle 0–100). Valeur = `100·(1−e^(−XP/1500))` sur l'XP de leurs catégories (provisoire).

## Hypothèses prises
- Nom du joueur par défaut « Éveillé » ; modifiable.
- **Changement v0.2** : les données de démo sont désormais **désactivées par défaut** (l'app affiche la progression réelle) ; activables dans les réglages. Démo et réel ne sont jamais mélangés.
