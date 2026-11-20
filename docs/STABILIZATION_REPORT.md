# Rapport de stabilisation — Level 1.0.1

Date : 20 novembre 2026 · Dépôt : `Terence0-8/LEVEL` · Base : commit `7ba0983` (PILOTAGE V1, 1.0.0).

## 1. État initial (avant toute modification)
| Contrôle | Résultat |
|---|---|
| Versions | application 1.0.0 · Dexie 4.4 (schéma v9) · format de sauvegarde 1 (lecture jusqu'au format 1) |
| TypeScript strict + build de production | OK |
| Tests unitaires et d'intégration | 452/452 |
| Suites navigateur | smoke 71/71 · sport 55/55 · global 62/62 · life2 55/56 (échec préexistant) · rpg 43/43 · intel 54/54 · pilotage 57/57 |
| Lint | **aucun ESLint n'est configuré** : le contrôle statique repose sur TypeScript strict (`noUnusedLocals`, `noUnusedParameters`) |
| Vulnérabilités (`npm audit --omit=dev`) | 0 |
| Dépôt distant | l'adresse `…/level` redirigeait vers `…/LEVEL` : l'origine a été corrigée vers `https://github.com/Terence0-8/LEVEL.git` |

## 2. Périmètre audité
Intégrité LIFE / SPORT / RPG / PILOTAGE / transversal ; opérations critiques et concurrence ; journal XP ; sauvegardes (export, restauration, pannes) ; cohérence des cinq parcours multi-modules ; PWA et hors ligne ; UX mobile et desktop ; performance avec trois ans de données ; qualité technique.

## 3. Anomalies découvertes
| # | Gravité | Anomalie | Cause | Correction |
|---|---|---|---|---|
| 1 | **P1** | Références Pilotage vers un objectif, un projet ou un indicateur LIFE supprimé restaient dans les orientations, priorités, plans et cycles (cas identifié à la livraison PILOTAGE V1). Ignorées à l'affichage, mais jamais détectées ni nettoyées. | La suppression LIFE ne connaissait pas la couche stratégique. | `goalService.deleteGoal/deleteProject/deleteIndicator` retirent désormais les liens **dans la même transaction**, avec une entrée de mémoire stratégique (`refs-detached`, identifiants retirés conservés) ; les orientations, priorités, cycles et plans eux-mêmes sont conservés. Détection (`orphanRefs`) et nettoyage explicite (`pilotageService.pruneOrphans`) pour les orphelins déjà présents ou issus d'une sauvegarde restaurée ; carte d'information sur le tableau de bord ; avertissement dans les confirmations de suppression. |
| 2 | **P1** | `insights.analyse` coûtait **4,7 s** avec trois ans de données (≈ 5 500 gains, 600 quêtes) et se recalcule à chaque minute et à chaque modification : gel de l'interface sur un historique conséquent. | `openAwards(events)` reconstruisait une table de tous les gains à chacun de ses milliers d'appels (quête × jour dans `lifeExecution`, séries, manques) : complexité quadratique. | Résultat mémoïsé par tableau (`WeakMap`, tableaux traités comme immuables, garde sur la longueur) dans `core/ledger.ts`. `analyse` : 4 676 ms → ~200 ms ; valeurs et règles inchangées. |
| 3 | **P1** | Une mise à jour de l'application était activée automatiquement et pouvait recharger la page pendant une saisie. | Service worker en mode `autoUpdate`. | Mode « prompt » : bandeau « Une nouvelle version de Level est prête » (Mettre à jour / Plus tard), jamais de rechargement imposé. Les données IndexedDB n'étaient déjà pas touchées par les mises à jour. |
| 4 | **P2** | Quota de stockage dépassé lors d'une sauvegarde : message technique brut. | Erreur Dexie non traduite. | Code `storage_full` et message clair ; transaction annulée, **aucune sauvegarde existante supprimée** (la rétention n'a pas lieu). |
| 5 | **P2** | Stockage local indisponible à l'ouverture (navigation privée restrictive, stockage désactivé) : écran vide indéfiniment. | Aucun garde au démarrage. | `StorageGuard` : message explicite, rien n'est lu ni écrit, bouton Réessayer. |
| 6 | **P2** | Bilans : débordement horizontal de 20 px à 320 px de large ; `SectionTitle` ne passait pas à la ligne. | Colonnes de grille sans `minmax(0, 1fr)`, titre sans `flex-wrap`. | Corrigé en CSS (changement minimal). |
| 7 | **P2** | `smoke-life2` : contrôle d'accueil sensible à la casse (échec préexistant). | Texte rendu en capitales par CSS. | Expression régulière insensible à la casse. |

Aucune anomalie P0 (perte ou corruption de données, restauration impossible, XP détruite, opération critique non atomique) n'a été trouvée.

## 4. Résultats par audit
**Intégrité des données.** Suppression d'un objectif lié à plusieurs projets : projets, quêtes, XP conservés (test). Les catégories ne se suppriment pas (archivage seul) : l'historique ne peut pas devenir orphelin. Archiver/détacher une orientation, modifier une priorité utilisée dans un cycle, détacher des éléments : données LIFE strictement identiques (test, comparaison canonique).
**XP et RPG.** Double validation d'une quête, d'une séance : une seule récompense (test concurrent). Correction ⇒ événement compensatoire, historique conservé, `auditLedger` vide, niveaux recalculables ; retour au même gain après re-validation. Synchronisation des événements RPG idempotente, y compris simultanée. Prestige simultané, récompenses uniques : couverts par les tests existants et conservés.
**Concurrence et interruption.** Modifications concurrentes de priorités sans perte ; deux créations simultanées de la dernière place de priorité fondamentale : une seule passe sans confirmation ; transaction interrompue (suppression d'objectif) : aucun état partiel.
**Sauvegardes.** Les 35 tables sont non vides dans le scénario global, exportées chiffrées (aucune donnée en clair), restaurées sur un appareil neuf strictement à l'identique (contenu, XP, journal). Restauration sur base existante : sauvegarde de sécurité créée. Écriture interrompue pendant la restauration : transaction annulée, données actuelles intactes. Corrompue, mauvaise phrase, version future, ancienne version : couverts (tests existants + navigateur). Migration Dexie testée depuis **chacune des versions v1 à v8** (schémas relus depuis `LevelDB`).
**PWA / hors ligne.** Manifeste et icônes valides ; service worker actif ; démarrage à froid hors ligne ; navigation dans tous les modules hors ligne ; création de données et export PDF hors ligne ; réouverture après fermeture complète ; scénario de mise à jour (voir ci-dessous).
**Mise à jour avec données non sauvegardées.** `smoke-update` : la version B est installée **en attente**, une bannière la propose, la saisie en cours, la page et les données restent intactes, « Plus tard » ne recharge pas, la validation redémarre l'application avec toutes les données, un seul service worker actif, démarrage hors ligne ensuite.
**UX.** 31 écrans × 3 largeurs (320, 390, 1280 px) sans débordement ; barre à sept onglets lisible dès 320 px (46 px par onglet, aucun texte tronqué, zones ≥ 40 px) ; routes invalides sans écran vide ; modale ouverte au clavier, focus piégé, Échap, retour arrière du navigateur.
**Performance** (Node, trois ans de données, après correction) : progression 23 ms · analyse LIFE 39 ms · observations stratégiques 78 ms · analyse globale 204 ms · bilans semaine/mois 70/78 ms · PDF 5 ms ; navigateur : démarrage à vide 342 ms, gros historique 493 ms, chaque écran < 3 s, aucune tâche longue au repos (188 ms max).

## 5. Tests exécutés (résultats réels)
| Suite | Résultat |
|---|---|
| TypeScript strict + build | OK |
| Tests unitaires et d'intégration | 478 / 478 (dont 23 de stabilisation et 3 de performance) |
| `smoke` · `smoke-sport` · `smoke-global` · `smoke-life2` · `smoke-rpg` · `smoke-intel` · `smoke-pilotage` | 71/71 · 55/55 · 62/62 · 56/56 · 43/43 · 54/54 · 57/57 |
| `smoke-stabilisation` (nouveau) | 33/33 |
| `smoke-update` (nouveau) | 12/12 |

## 6. Limites restantes et risques connus
| Sujet | Précision |
|---|---|
| **Stockage local** | Les sauvegardes locales protègent d'une erreur de manipulation ou d'une base endommagée ; elles sont dans **le même navigateur** que les données. Elles **ne protègent pas** contre la perte, le vol ou la réinitialisation de l'appareil, l'effacement des données du site, la désinstallation du navigateur ni certaines purges automatiques (ex. Safari après une longue inactivité hors installation). `navigator.storage.persist()` est demandé mais non garanti. |
| **Copie externe** | Exporter régulièrement un fichier chiffré (Sauvegardes → Exporter) et le copier hors de l'appareil (autre appareil, clé USB, stockage personnel). Conserver séparément la phrase secrète et la clé de secours : sans elles, le fichier est irrécupérable. Recommandation : après chaque période d'usage important et au moins une fois par mois. |
| **Notifications** | Aucune remise en arrière-plan n'est promise : repli dans l'application. |
| **Plusieurs onglets / versions** | Un onglet ouvert pendant une mise à jour garde l'ancien code jusqu'à son rechargement. Une future évolution de schéma Dexie fermera la connexion de l'ancien onglet (comportement de Dexie) : recharger. |
| **Lint** | Pas d'ESLint ; contrôle par TypeScript strict. |
| **Non vérifié** | Installation sur écran d'accueil et comportement natif d'un appareil réel (Chromium headless uniquement) ; mémoire consommée mesurée seulement indirectement (tâches longues) ; performances sur mobile d'entrée de gamme ; SPORT avec plusieurs années de séances en navigateur (couvert en Node pour LIFE/RPG/Pilotage, séances non incluses dans la mesure de performance). |
| **P3 documentés** | Carte de trajectoire en liste (pas de graphe) ; pas d'export PDF dédié aux revues stratégiques ; les tables sont lues en entier par les requêtes live (acceptable jusqu'à plusieurs dizaines de milliers de gains, mesuré à 5 475). |

## 7. Recommandations d'utilisation
1. Définir la phrase secrète, tester la récupération, conserver la clé de secours hors de l'appareil.
2. Exporter un fichier chiffré au moins une fois par mois et avant tout changement d'appareil ou de navigateur ; le copier ailleurs.
3. Installer l'application depuis le navigateur pour limiter les purges automatiques du stockage.
4. Mettre à jour quand le bandeau le propose, de préférence après avoir terminé une saisie.
5. Après une restauration, consulter le rapport de vérification et la sauvegarde de sécurité créée automatiquement.
