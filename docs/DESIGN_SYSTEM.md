# Système de design — Level V2

Un seul système pour deux thèmes. Les composants n'emploient que des **jetons sémantiques** (`src/design/tokens.css`) : aucune couleur en dur hors jetons.

## Principes
| Principe | Règle |
|---|---|
| La hiérarchie par la place | Ce qui est important est en haut et plus grand ; pas de lueur, de dégradé ni de badge pour l'imposer |
| La couleur a une fonction | Vert = LIFE et actions principales ; bleu = SPORT ; terre cuite = Pilotage ; **or = RPG seulement** (niveau, distinctions, événements) ; rouge/ambre/vert = états |
| Une carte, une couche | Jamais de carte dans une carte ; surface plate + bordure fine |
| Texte | Phrases normales, aucune capitale espacée ; secondaire jamais en dessous de 4,5:1 |
| Mouvement | Seulement en réponse à une action (validation cochée, XP gagnée qui monte) ; réduit si l'utilisateur le demande |

## Palette
| Rôle | Sombre | Clair (ivoire) |
|---|---|---|
| Fond | `#15191F` | `#F5F1E8` |
| Surface principale (cartes) | `#20262E` | `#FFFDF8` |
| Surface secondaire | `#29313A` | `#F0EBE0` |
| Surface claire (pistes, puces) | `#343E49` | `#E4DDCF` |
| Texte / secondaire / discret | `#F2F3F0` / `#ADB7C1` / `#8D98A4` | `#1D242B` / `#4A5560` / `#667380` |
| Accent principal et LIFE | `#78B7A2` | `#2B7A64` |
| SPORT | `#8AA8E8` | `#3A5FB5` |
| Pilotage | `#E69B78` | `#B05F36` |
| Or RPG | `#C9AD72` (fort `#E3CB93`) | `#8A6A22` (fort `#6F5415`) |
| Succès / alerte / erreur | `#65B88A` / `#E5B45F` / `#E47777` | `#2C7D4F` / `#98640F` / `#B43A3A` |

La palette proposée a été conservée pour le thème sombre. Ajustements : surfaces plates sans transparence, texte discret relevé (`#8D98A4`) pour garantir 4,5:1, et un jeu complet assombri pour le thème clair (pas une inversion). Contrastes vérifiés automatiquement par `smoke-v2` sur les deux thèmes.

## Typographie
| Usage | Police | Pourquoi |
|---|---|---|
| Titres, chiffres de niveau | Bricolage Grotesque (variable) | Caractère chaleureux et contemporain, remplace la capitale « luxe » |
| Interface et texte | Figtree (variable) | Très lisible aux petites tailles, ronde sans être enfantine |
Échelle : 30 / 20 / 17 / 15–16 (texte) / 13–14 (secondaire). Titres en casse normale ; 16 px minimum pour le texte courant.

## Composants
| Composant | Rôle |
|---|---|
| `Card` | Surface unique ; variantes `raised`, `event` (RPG, fond or discret), `flat` (état vide en pointillé) |
| `Tabs` | Navigation d'un espace : onglets essentiels + « Plus » (divulgation progressive), couleur du domaine, badge visible même si la section est repliée |
| `Badge` | Un état à la fois ; `rpg` pour l'or, `gold` signifie désormais « accent » |
| `Sheet`, `ConfirmDialog` | Modales (focus piégé, Échap) ; bouton principal plein |
| Barre du bas | 5 espaces ; l'espace actif prend la couleur de son domaine |
| Case de validation | Cercle de la couleur du domaine, rempli avec un léger rebond à la validation ; l'XP gagnée remonte en or |

## Thème
Préférence **propre à l'appareil** (automatique, clair ou sombre) dans Profil & réglages ; appliquée avant le premier rendu (`index.html`), sans clignotement ; non sauvegardée avec les données (un téléphone peut être clair, un ordinateur sombre).

## Accessibilité
Zones tactiles ≥ 36 px (≥ 44 px pour les actions principales), focus visible, rôles ARIA des onglets, aucune information portée par la seule couleur, mouvement réduit respecté.
