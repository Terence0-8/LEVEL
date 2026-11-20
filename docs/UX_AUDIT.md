# Audit UX — point de départ de la V2

Audit réalisé sur la version 1.0.1 (commit `6dbb3a6`), à partir du code des 7 espaces et de 48 captures (vide / usage, 320 à 1280 px) ; 20 captures représentatives sont conservées dans `docs/screenshots/v2/avant/`, les captures « après » (clair et sombre, 320 / 390 / 768 / 1280 px) dans `apres-clair/` et `apres-sombre/`. Aucune couleur n'a été modifiée avant d'avoir établi ce diagnostic.

## 1. Cartographie des problèmes
| # | Écran | Problème constaté | Effet sur l'utilisateur | Traitement V2 |
|---|---|---|---|---|
| 1 | Accueil | **11 cartes** empilées (héros, quêtes, alertes, semaine, « en ce moment », séance, deux domaines, distinctions, récupération, attributs, activités) | Impossible de savoir par où commencer ; défilement long | 3 blocs : progression, **À faire aujourd'hui**, SPORT ; un 4ᵉ « À savoir » seulement s'il y a quelque chose |
| 2 | Accueil | Informations répétées : niveau global + niveaux LIFE/SPORT + rangs + XP trois fois ; récupération affichée même normale | Bruit ; fausse urgence | Un seul bloc RPG ; récupération visible uniquement en vigilance/alerte |
| 3 | Accueil | Statistiques décoratives (attributs, activités récentes, semaine, pourcentages) sans action associée | Aucune action possible | Déplacées dans Progression et Planning |
| 4 | Accueil | Réorganisation « automatique » des widgets expliquée par une phrase technique | Incompréhension | Ordre fixe et lisible ; l'urgent (alerte, récupération) passe devant |
| 5 | Navigation | **7 onglets** mobiles (Accueil, Pilotage, LIFE, SPORT, Planning, RPG, Bilans) + historique caché | Libellés minuscules, fonctions quotidiennes noyées | **5 espaces** : Accueil, LIFE, SPORT, Progression, Pilotage ; Planning, Bilans, Historique sous Progression et dans le menu latéral |
| 6 | LIFE | 8 onglets plats, texte de présentation permanent (« Piloter sans compliquer… ») | Charge cognitive | 4 onglets + « Plus » (divulgation progressive), aucun texte permanent |
| 7 | LIFE | **Aucun contenu prêt** : création manuelle de chaque quête (titre, catégorie, difficulté, durée) | Barrière d'entrée | Bibliothèque de 56 modèles, 6 packs, favoris, recherche, modèles personnels, duplication |
| 8 | LIFE vide | « Aucune quête pour l'instant » + un seul bouton « Créer » | Cul-de-sac | Trois chemins : quêtes prédéfinies, pack, quête personnelle |
| 9 | SPORT | 8 sections plates, tableau de bord de 8 cartes (profil à 25 %, groupes prioritaires, progression générale…) | Écran dense, pas de réponse à « quelle séance ? » | 3 onglets + « Plus » ; carte « prochaine séance » du programme en tête ; détails repliés |
| 10 | SPORT | **Aucun programme prédéfini** : le moteur génère des séances à la demande mais il faut créer son profil et son organisation | Impossible de démarrer sans expertise | 20 programmes, assistant en 5 étapes, activation en un geste, instance personnalisée |
| 11 | SPORT | Fonctions existantes peu visibles (planification de semaine, circuit HIIT, séance personnelle) | Découverte par hasard | Point d'entrée « Programmes » ; les existantes restent accessibles (Musculation, Planning) |
| 12 | Transversal | Titres en capitales espacées (Cinzel), or omniprésent (titres, boutons actifs, onglets, barres, badges, lueurs) | Froid, uniforme, « luxe » artificiel | Typographie sentence case (Bricolage Grotesque + Figtree), or réservé au RPG, accents fonctionnels |
| 13 | Transversal | Dégradés, halos, verre dépoli, cartes imbriquées (carte vide dans carte), ombres sur chaque carte | Aspect générique | Surfaces plates, bordure fine, une seule couche de carte |
| 14 | Transversal | Texte secondaire gris-brun faible sur fond noir | Lisibilité | Contrastes mesurés (voir DESIGN_SYSTEM.md) |
| 15 | Thème | Sombre uniquement | Pas de choix de confort | Clair ivoire + sombre chaud, automatique par défaut |

## 2. Fonctionnalités existantes mais peu visibles (aucune reconstruction)
| Existant | Où | Traitement |
|---|---|---|
| Génération de séance adaptative, double progression, récupération, variantes avec/sans matériel | `sportService`, `core/sport/*` | Réutilisé tel quel : un programme choisit les groupes et le rythme, le moteur compose la séance |
| Planification de semaine sportive | SPORT › Planning | Conservé (sous « Plus ») |
| Quêtes à étapes (progression) | Formulaire de quête | Modèles « en N étapes » dans la bibliothèque |
| Planning central, bilans, historique | 3 onglets de la barre | Regroupés sous Progression, « Semaine » depuis l'accueil |

## 3. Parcours qui exigeaient trop de manipulations
| Parcours V1 | Étapes | V2 |
|---|---|---|
| Première quête | Onglet LIFE → Créer → titre, catégorie, type, difficulté, durée, étapes → enregistrer | Accueil → Choisir des quêtes → Ajouter (2 gestes) |
| Valider une quête | LIFE → trouver la quête → ouvrir → valider | Directement depuis l'accueil (1 geste) |
| Démarrer le sport | SPORT → compléter le profil → préparer une séance → démarrer | Assistant (4 à 5 choix) → Activer → Commencer la séance |
| Changer d'approche | Recréer un profil et des séances | Changer de programme ; l'ancien rejoint l'historique |

## 4. Composants responsables de l'aspect initial
`design/tokens.css` (palette obsidienne + or), `ui.module.css` (carte à dégradé et halo, titres en capitales espacées, badges majuscules), `Shell.module.css` (barre à 7 colonnes, verre dépoli), `global.css` (dégradés d'arrière-plan fixes), `Logo.tsx` (monogramme doré), polices Cinzel + Inter, la quasi-totalité des feuilles de style, qui utilisaient `--c-gold` comme accent par défaut.
