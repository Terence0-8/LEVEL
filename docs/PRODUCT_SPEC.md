# Level — Spécification produit

## Vision
Application personnelle de progression combinant **LIFE** (organisation, objectifs, finances), **SPORT** (entraînement, course, récupération) et **RPG** (XP, niveaux, rangs, attributs, prestige). Fonctionnement prioritairement et intégralement hors ligne ; données conservées localement.

## Identité visuelle
Sombre, mystérieuse, élégante ; interface quotidienne sobre, événements RPG spectaculaires (or lumineux). Palette : fond `#0B0D11`, panneaux `#12141A`, cartes `#1E2128`, surfaces `#2A2F37`, or mat `#C9B17A`, or lumineux `#F5D889`, texte `#E8E1D3`, succès `#4CAF7A`, alerte `#E55B5B`, info `#6CA8FF`. Titres : Cinzel ; interface : Inter. Logo : monogramme « L » avec chevron d'ascension.

## Navigation
Accueil · LIFE · SPORT · RPG · Historique ; Profil & réglages en accès secondaire. Mobile : barre inférieure ; desktop (≥ 900 px) : menu latéral. L'accueil est **adaptatif** : Level ordonne les widgets selon échéances, moment de la journée et récupération ; l'utilisateur ne les réorganise pas.

## Périmètre v0.1 (socle)
| Domaine | État |
|---|---|
| Navigation, layouts mobile/desktop, composants | ✅ Opérationnel |
| Moteur XP / niveaux / rangs (calcul) | ✅ Opérationnel (testé), alimenté par données de démo |
| Accueil adaptatif | ✅ Opérationnel (règles de priorité), données de démo |
| Persistance locale (profil, réglages) | ✅ Opérationnel |
| Cocher les quêtes de démo | ✅ Persisté, illustre le moteur XP et le level up |
| PWA hors ligne | ✅ Opérationnel |
| LIFE (quêtes, habitudes, budgets) | 🚧 Structure visuelle uniquement |
| SPORT (exercices, programmes, course, récupération) | 🚧 Structure visuelle uniquement |
| Prestige | 🔒 Annoncé, non implémenté |
| Notifications, sauvegardes chiffrées, bilans | ⏳ Non démarré |

## Règles de jeu (hypothèses v0.1 — modifiables)
- Coût du niveau *n* → *n+1* : `round(100 · n^1.35)` XP. Niveau max 100.
- Niveau **global** calculé sur la somme XP LIFE + SPORT ; LIFE et SPORT ont chacun leur niveau.
- Rangs sur niveau global : E (1) Éveillé · D (10) Initié · C (20) Aguerri · B (35) Vétéran · A (55) Élite · S (80) Souverain.
- Six attributs : Force, Endurance, Vitalité, Discipline, Intellect, Prospérité (échelle 0–100). Leur règle d'évolution reste à définir.

## Hypothèses prises
- Nom du joueur par défaut « Éveillé » ; modifiable.
- Données de démo activées par défaut pour juger l'identité visuelle ; masquables dans les réglages.
