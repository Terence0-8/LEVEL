import type { BodyArea, EquipmentId, Exercise, ExerciseKind, MuscleGroup, Movement, PoseId, TrackMode } from './types'

/**
 * Bibliothèque initiale. Chaque exercice a une raison d'être : un geste distinct, un matériel distinct
 * ou une progression/régression utile. Les pompes classiques sont réservées au circuit HIIT (option utilisateur).
 * Toutes les variantes de POMPES (classiques, inclinées au mur, en piqué, triceps au mur) sont exclues des programmes ordinaires :
 * elles restent dans la bibliothèque mais ne servent qu'aux circuits HIIT full-body, si l'utilisateur les autorise.
 * Profil « Sans matériel » : AUCUN matériel ni mobilier (un mur et le sol suffisent ; un tapis est facultatif et toujours toléré).
 * Le mobilier solide (chaise, table, marche) n'est utilisé que par les profils « Domicile » et « Salle ».
 */
interface Opts {
  mode?: TrackMode
  kind?: ExerciseKind
  /** charge externe (par défaut : poids du corps si aucun matériel de charge) */
  loaded?: boolean
  uni?: boolean
  stress?: BodyArea[]
  step?: number
  classic?: boolean
  pushup?: boolean
  hiit?: boolean
  ins: string[]
  safe: string[]
  prog: string
  alt: string[]
}

const LOAD_EQ: EquipmentId[] = ['dumbbells', 'kettlebell', 'barbell', 'machines', 'cables']

function x(id: string, name: string, primary: MuscleGroup[], secondary: MuscleGroup[], equipment: EquipmentId[], movement: Movement, level: 1 | 2 | 3, pose: PoseId, o: Opts): Exercise {
  const loaded = o.loaded ?? equipment.some((e) => LOAD_EQ.includes(e))
  return {
    id, name, primary, secondary, equipment, movement, level, pose,
    kind: o.kind ?? 'strength', mode: o.mode ?? 'reps', bodyweight: !loaded, unilateral: o.uni, stress: o.stress ?? [],
    instructions: o.ins, safety: o.safe, progression: o.prog, alternatives: o.alt, loadStepKg: o.step,
    classicPushup: o.classic, hiitOnly: o.hiit, pushup: o.pushup,
  }
}

export const EXERCISES: Exercise[] = [
  // ── Pectoraux ───────────────────────────────────────────────
  x('pompes_inclinees', 'Pompes inclinées (mains surélevées)', ['pectoraux'], ['triceps', 'epaules'], [], 'push', 1, 'pushup', {
    kind: 'hiit', hiit: true, pushup: true,
    stress: ['wrist', 'shoulder'], ins: ['Mains sur un mur, un peu plus larges que les épaules, bras tendus (ou sur un support solide plus bas si vous en avez un).', 'Corps gainé en ligne droite, fessiers serrés.', 'Fléchissez les coudes (45°) pour approcher la poitrine du support, puis repoussez.'],
    safe: ['Réservées au circuit HIIT full-body, sur option.', 'Pieds assez loin du mur pour garder le contrôle, sans glisser.', 'Arrêtez si une douleur à l’épaule ou au poignet apparaît.'],
    prog: 'Reculer les pieds, ralentir la descente (3 s), ajouter une pause d’1 s ; avec du mobilier solide, abaisser progressivement la hauteur d’appui.', alt: ['developpe_sol_halteres', 'developpe_elastique', 'dips_chaises'] }),
  x('dips_chaises', 'Dips entre deux chaises', ['triceps'], ['pectoraux', 'epaules'], ['furniture'], 'push', 2, 'triceps_ext', {
    stress: ['shoulder', 'elbow', 'wrist'], ins: ['Deux supports stables, mains sur les bords, jambes tendues ou fléchies.', 'Descendez en gardant le buste proche des supports, coudes vers l’arrière.', 'Remontez en poussant sans verrouiller brutalement les coudes.'],
    safe: ['Ne descendez pas sous 90° de coude si l’épaule tire.', 'Supports verrouillés et antidérapants.'],
    prog: 'Fléchir les genoux (plus facile) puis tendre les jambes ; ralentir la descente ; ajouter une charge sur les cuisses.', alt: ['extension_triceps_halteres', 'extension_triceps_elastique'] }),
  x('developpe_sol_halteres', 'Développé au sol aux haltères', ['pectoraux'], ['triceps', 'epaules'], ['dumbbells'], 'push', 1, 'press_flat', {
    step: 2, stress: ['shoulder'], ins: ['Allongé au sol, genoux fléchis, haltères au-dessus de la poitrine.', 'Descendez jusqu’à ce que les triceps touchent le sol, poignets alignés.', 'Poussez en rapprochant légèrement les haltères en haut.'],
    safe: ['Ne rebondissez pas sur le sol.', 'Choisissez une charge permettant de contrôler la descente.'],
    prog: 'Doublure de progression : atteindre le haut de la plage de répétitions sur toutes les séries, puis augmenter la charge d’un cran.', alt: ['developpe_couche_halteres', 'developpe_elastique'] }),
  x('developpe_couche_halteres', 'Développé couché aux haltères', ['pectoraux'], ['triceps', 'epaules'], ['dumbbells', 'bench'], 'push', 2, 'press_flat', {
    step: 2, stress: ['shoulder'], ins: ['Dos plaqué sur le banc, pieds au sol, omoplates serrées.', 'Descendez les haltères à hauteur de poitrine, coudes à 45–60°.', 'Poussez jusqu’à presque tendre les bras.'],
    safe: ['Demandez de l’aide ou posez les haltères sur les cuisses avant de vous allonger avec des charges lourdes.', 'Aucune douleur d’épaule tolérée.'],
    prog: 'Double progression : monter les répétitions dans la plage, puis la charge.', alt: ['developpe_sol_halteres', 'developpe_couche_barre', 'pec_deck'] }),
  x('developpe_couche_barre', 'Développé couché à la barre', ['pectoraux'], ['triceps', 'epaules'], ['barbell', 'bench', 'rack'], 'push', 3, 'press_flat', {
    step: 2.5, stress: ['shoulder', 'wrist'], ins: ['Yeux sous la barre, omoplates serrées, pieds ancrés.', 'Descendez la barre sur le bas des pectoraux, avant-bras verticaux.', 'Poussez en ligne légèrement oblique vers le rack.'],
    safe: ['Utilisez des sécurités réglées ou un partenaire.', 'Ne bloquez jamais la barre sans sécurités.'],
    prog: 'Ajouter 2,5 kg quand toutes les séries atteignent le haut de la plage avec une technique propre.', alt: ['developpe_couche_halteres', 'pec_deck', 'developpe_sol_halteres'] }),
  x('ecartes_halteres', 'Écartés aux haltères', ['pectoraux'], ['epaules'], ['dumbbells', 'bench'], 'push', 2, 'press_flat', {
    step: 1, stress: ['shoulder'], ins: ['Banc plat, haltères au-dessus de la poitrine, coudes légèrement fléchis.', 'Ouvrez les bras en arc jusqu’à sentir l’étirement des pectoraux.', 'Refermez en gardant la même flexion de coude.'],
    safe: ['Charge légère, amplitude contrôlée.', 'Ne descendez pas sous la ligne des épaules.'], prog: 'Augmenter la charge très progressivement (1 kg) ou ralentir la descente.', alt: ['pec_deck', 'developpe_elastique', 'developpe_couche_halteres'] }),
  x('pec_deck', 'Pec deck (machine)', ['pectoraux'], ['epaules'], ['machines'], 'push', 1, 'press_flat', {
    step: 5, stress: ['shoulder'], ins: ['Réglez le siège : poignées à hauteur de poitrine.', 'Rapprochez les poignées sans hausser les épaules.', 'Revenez lentement jusqu’à l’étirement confortable.'],
    safe: ['Amplitude arrière limitée au confort de l’épaule.'], prog: 'Monter les répétitions, puis la charge d’un cran.', alt: ['ecartes_halteres', 'developpe_couche_halteres', 'developpe_elastique'] }),
  x('developpe_elastique', 'Développé avec élastique', ['pectoraux'], ['triceps', 'epaules'], ['bands'], 'push', 1, 'press_flat', {
    ins: ['Élastique passé dans le dos, mains à hauteur de poitrine.', 'Poussez droit devant vous jusqu’à tendre les bras.', 'Revenez lentement en gardant la tension.'],
    safe: ['Vérifiez l’état de l’élastique avant chaque séance.', 'Ne le lâchez pas sous tension.'], prog: 'Utiliser un élastique plus résistant, se reculer, ou ajouter une pause en fin de course.', alt: ['developpe_sol_halteres', 'ecartes_halteres'] }),
  x('pompes_classiques', 'Pompes classiques (circuit HIIT uniquement)', ['pectoraux'], ['triceps', 'epaules', 'abdominaux'], [], 'push', 2, 'pushup', {
    classic: true, hiit: true, pushup: true, kind: 'hiit', stress: ['wrist', 'shoulder'], ins: ['Mains sous les épaules, corps gainé.', 'Descendez poitrine près du sol, coudes à 45°.', 'Repoussez en gardant la ligne du corps.'],
    safe: ['Réservées au circuit HIIT full-body, sur option.', 'Passez sur les genoux ou en inclinées si la technique se dégrade.'], prog: 'Sans objet hors circuit HIIT.', alt: ['developpe_sol_halteres', 'developpe_elastique'] }),

  // ── Dos ─────────────────────────────────────────────────────
  x('tractions_pronation', 'Tractions en pronation', ['dos'], ['biceps', 'avant_bras'], ['pullup_bar'], 'pull', 3, 'pull_up', {
    stress: ['shoulder', 'elbow'], ins: ['Suspension, mains un peu plus larges que les épaules.', 'Tirez les coudes vers les hanches jusqu’au menton au-dessus de la barre.', 'Redescendez contrôlé jusqu’aux bras presque tendus.'],
    safe: ['Pas d’élan brusque.', 'Redescente complète mais sans relâcher les épaules.'], prog: 'Commencer par des négatives lentes ou un élastique d’assistance ; viser le haut de la plage avant d’ajouter du lest.', alt: ['tirage_vertical', 'rowing_inverse_table', 'rowing_elastique'] }),
  x('tractions_supination', 'Tractions en supination', ['dos', 'biceps'], ['avant_bras'], ['pullup_bar'], 'pull', 3, 'pull_up', {
    stress: ['shoulder', 'elbow'], ins: ['Paumes vers vous, mains à largeur d’épaules.', 'Tirez la poitrine vers la barre.', 'Redescendez lentement.'],
    safe: ['Coudes sensibles : réduisez le volume.'], prog: 'Négatives lentes (4–5 s), puis tractions assistées, puis complètes.', alt: ['tractions_pronation', 'tirage_vertical', 'curl_halteres'] }),
  x('tirage_vertical', 'Tirage vertical (poulie haute)', ['dos'], ['biceps', 'avant_bras'], ['machines'], 'pull', 1, 'pull_up', {
    step: 5, stress: ['shoulder'], ins: ['Cuisses bloquées sous les coussins, buste légèrement incliné.', 'Tirez la barre vers le haut de la poitrine en abaissant les coudes.', 'Remontez lentement sans lâcher la tension.'],
    safe: ['Ne tirez pas derrière la nuque.'], prog: 'Monter les répétitions dans la plage puis la charge.', alt: ['tractions_pronation', 'rowing_elastique', 'rowing_halteres_un_bras'] }),
  x('rowing_halteres_un_bras', 'Rowing haltère un bras', ['dos'], ['biceps', 'avant_bras'], ['dumbbells'], 'pull', 1, 'row_bent', {
    uni: true, step: 2, stress: ['lower_back'], ins: ['Une main et un genou sur un appui stable, dos plat.', 'Tirez l’haltère vers la hanche en gardant le coude proche du corps.', 'Redescendez sans pivoter le buste.'],
    safe: ['Gardez le dos neutre.', 'Charge maîtrisée : pas de balancier.'], prog: 'Double progression (répétitions puis charge).', alt: ['rowing_inverse_table', 'rowing_elastique', 'tirage_horizontal'] }),
  x('rowing_barre', 'Rowing barre penché', ['dos'], ['biceps', 'avant_bras', 'ischios'], ['barbell'], 'pull', 3, 'row_bent', {
    step: 2.5, stress: ['lower_back'], ins: ['Charnière de hanche, dos plat, barre aux genoux.', 'Tirez la barre vers le nombril.', 'Redescendez contrôlé.'],
    safe: ['Abandonnez l’exercice si le bas du dos fatigue avant le dos.', 'Pas de réajustement par à-coups.'], prog: 'Monter les répétitions puis la charge de 2,5 kg.', alt: ['rowing_halteres_un_bras', 'tirage_horizontal', 'rowing_inverse_table'] }),
  x('tirage_horizontal', 'Tirage horizontal (poulie ou machine)', ['dos'], ['biceps', 'epaules'], ['machines'], 'pull', 1, 'row_bent', {
    step: 5, ins: ['Assis, poitrine haute, pieds calés.', 'Tirez les poignées vers le bas de la poitrine en rapprochant les omoplates.', 'Revenez bras presque tendus.'],
    safe: ['Ne vous balancez pas d’avant en arrière.'], prog: 'Monter les répétitions puis la charge.', alt: ['rowing_halteres_un_bras', 'rowing_elastique', 'rowing_inverse_table'] }),
  x('rowing_inverse_table', 'Rowing inversé sous une table solide', ['dos'], ['biceps', 'epaules'], ['furniture'], 'pull', 2, 'row_bent', {
    stress: ['shoulder', 'wrist'], ins: ['Allongé sous le bord d’une table très stable, mains sur le bord.', 'Corps gainé, tirez la poitrine vers la table.', 'Redescendez bras tendus.'],
    safe: ['La table doit supporter votre poids et ne pas glisser ni basculer.', 'Si vous avez un doute : choisissez un autre exercice.'], prog: 'Remonter les pieds / fléchir les genoux (plus facile) ou allonger les jambes (plus dur).', alt: ['rowing_elastique', 'rowing_halteres_un_bras', 'superman'] }),
  x('rowing_elastique', 'Rowing avec élastique', ['dos'], ['biceps', 'epaules'], ['bands'], 'pull', 1, 'row_bent', {
    ins: ['Assis jambes tendues, élastique autour des pieds.', 'Tirez les poignées vers le ventre, omoplates serrées.', 'Relâchez lentement.'],
    safe: ['Contrôlez le retour de l’élastique.'], prog: 'Élastique plus fort, pause 1 s en contraction.', alt: ['rowing_halteres_un_bras', 'rowing_inverse_table', 'face_pull_elastique'] }),
  x('superman', 'Superman', ['dos'], ['fessiers', 'ischios'], ['mat'], 'extension', 1, 'plank', {
    mode: 'time', stress: ['lower_back'], ins: ['Allongé sur le ventre, bras tendus devant.', 'Soulevez simultanément bras et jambes sans cambrer excessivement.', 'Maintenez, puis relâchez.'],
    safe: ['Amplitude modérée, nuque neutre.', 'Arrêtez en cas de gêne lombaire.'], prog: 'Allonger la durée (jusqu’à 45 s), puis alterner bras/jambe opposés.', alt: ['pont_fessier', 'dead_bug', 'rowing_elastique'] }),

  x('ange_inverse', 'Ange inversé au sol', ['dos'], ['epaules', 'fessiers'], ['mat'], 'pull', 1, 'plank', {
    mode: 'time', stress: ['lower_back', 'shoulder'], ins: ['Allongé sur le ventre, bras le long du corps, front vers le sol.', 'Décollez légèrement la poitrine et ramenez les bras en arc vers l’avant, pouces vers le haut.', 'Revenez lentement, en gardant la nuque alignée.'],
    safe: ['Amplitude modérée : ne cambrez pas le bas du dos.', 'Arrêtez en cas de gêne lombaire ou d’épaule.'], prog: 'Allonger la durée (jusqu’à 45 s), ralentir le mouvement, marquer une pause en haut.', alt: ['superman', 'rowing_elastique', 'face_pull_elastique'] }),

  // ── Épaules ─────────────────────────────────────────────────
  x('touche_epaules_planche', 'Touche-épaules en planche', ['epaules'], ['abdominaux'], ['mat'], 'stabilisation', 1, 'plank', {
    mode: 'time', stress: ['wrist', 'shoulder'], ins: ['En planche haute (ou sur les genoux pour faciliter), mains sous les épaules.', 'Touchez l’épaule opposée avec une main en gardant le bassin immobile.', 'Reposez la main, alternez, sans balancer le corps.'],
    safe: ['Écartez davantage les pieds pour plus de stabilité.', 'Arrêtez si le poignet ou l’épaule tire.'], prog: 'Allonger la durée (jusqu’à 45 s), rapprocher les pieds, ralentir les touchers.', alt: ['gainage_planche', 'elevations_laterales_elastique'] }),
  x('developpe_epaules_halteres', 'Développé épaules aux haltères', ['epaules'], ['triceps'], ['dumbbells'], 'push', 2, 'press_overhead', {
    step: 2, stress: ['shoulder', 'lower_back'], ins: ['Assis ou debout, haltères à hauteur d’oreilles.', 'Poussez au-dessus de la tête sans cambrer.', 'Redescendez contrôlé.'],
    safe: ['Gainez les abdominaux.', 'Pas de douleur d’épaule.'], prog: 'Double progression (répétitions puis charge).', alt: ['elevations_laterales', 'developpe_militaire_barre'] }),
  x('developpe_militaire_barre', 'Développé militaire à la barre', ['epaules'], ['triceps', 'abdominaux'], ['barbell', 'rack'], 'push', 3, 'press_overhead', {
    step: 2.5, stress: ['shoulder', 'lower_back', 'wrist'], ins: ['Barre sur le haut de la poitrine, gainage serré.', 'Poussez en passant la tête sous la barre.', 'Verrouillez au-dessus des épaules.'],
    safe: ['Ne cambrez pas : serrez les fessiers.', 'Sécurités du rack réglées.'], prog: 'Ajouter 2,5 kg en haut de plage, technique propre.', alt: ['developpe_epaules_halteres', 'elevations_laterales'] }),
  x('elevations_laterales', 'Élévations latérales', ['epaules'], [], ['dumbbells'], 'push', 1, 'raise_lateral', {
    step: 1, stress: ['shoulder'], ins: ['Debout, haltères le long du corps, coudes légèrement fléchis.', 'Levez les bras sur les côtés jusqu’à la hauteur des épaules.', 'Redescendez lentement.'],
    safe: ['Charge légère : pas d’élan.', 'Ne dépassez pas la ligne des épaules.'], prog: 'Monter les répétitions (12–15) puis +1 kg.', alt: ['elevations_laterales_elastique', 'oiseau_halteres', 'developpe_epaules_halteres'] }),
  x('elevations_laterales_elastique', 'Élévations latérales avec élastique', ['epaules'], [], ['bands'], 'push', 1, 'raise_lateral', {
    stress: ['shoulder'], ins: ['Debout sur l’élastique, une main à chaque extrémité.', 'Levez les bras sur les côtés jusqu’aux épaules.', 'Redescendez en gardant la tension.'],
    safe: ['Fixez bien l’élastique sous les pieds.'], prog: 'Élastique plus résistant ou pause en haut.', alt: ['elevations_laterales', 'face_pull_elastique'] }),
  x('oiseau_halteres', 'Oiseau aux haltères (deltoïdes postérieurs)', ['epaules'], ['dos'], ['dumbbells'], 'pull', 2, 'row_bent', {
    step: 1, stress: ['lower_back', 'shoulder'], ins: ['Buste penché, dos plat, haltères sous la poitrine.', 'Ouvrez les bras en arc jusqu’à la ligne des épaules.', 'Redescendez lentement.'],
    safe: ['Charge légère.', 'Gardez la nuque alignée.'], prog: 'Augmenter les répétitions puis +1 kg.', alt: ['face_pull_elastique', 'elevations_laterales_elastique', 'rowing_elastique'] }),
  x('face_pull_elastique', 'Face pull avec élastique', ['epaules'], ['dos'], ['bands'], 'pull', 1, 'row_bent', {
    stress: ['shoulder'], ins: ['Élastique fixé à hauteur du visage.', 'Tirez vers le visage en écartant les mains, coudes hauts.', 'Revenez lentement.'],
    safe: ['Ne haussez pas les épaules.'], prog: 'Pause 1–2 s en contraction, élastique plus fort.', alt: ['oiseau_halteres', 'rowing_elastique', 'elevations_laterales_elastique'] }),
  x('pompes_piquees', 'Pompes en piqué (épaules)', ['epaules'], ['triceps'], [], 'push', 2, 'press_overhead', {
    kind: 'hiit', hiit: true, pushup: true,
    stress: ['shoulder', 'wrist'], ins: ['Hanches hautes en V inversé, mains et pieds au sol.', 'Fléchissez les coudes pour approcher le sommet du crâne du sol.', 'Repoussez à la verticale.'],
    safe: ['Réservées au circuit HIIT full-body, sur option.', 'Mouvement contrôlé, tête libre.', 'Si le poignet tire, passez à un autre exercice.'], prog: 'Rapprocher les pieds des mains, descente plus lente ; pieds surélevés si vous avez un support solide.', alt: ['developpe_epaules_halteres', 'elevations_laterales_elastique'] }),

  // ── Biceps ──────────────────────────────────────────────────
  x('curl_halteres', 'Curl haltères', ['biceps'], ['avant_bras'], ['dumbbells'], 'flexion', 1, 'curl', {
    step: 1, stress: ['elbow'], ins: ['Debout, coudes près du corps.', 'Fléchissez les coudes en supination.', 'Descendez lentement sans balancer.'],
    safe: ['Pas d’élan du dos.'], prog: 'Double progression ; ralentir la descente.', alt: ['curl_marteau', 'curl_elastique', 'tractions_supination'] }),
  x('curl_marteau', 'Curl marteau', ['biceps', 'avant_bras'], [], ['dumbbells'], 'flexion', 1, 'curl', {
    step: 1, stress: ['elbow'], ins: ['Paumes face à face, coudes fixes.', 'Montez les haltères sans tourner les poignets.', 'Redescendez contrôlé.'],
    safe: ['Poignets neutres.'], prog: 'Double progression.', alt: ['curl_halteres', 'curl_elastique', 'curl_serviette'] }),
  x('curl_elastique', 'Curl avec élastique', ['biceps'], ['avant_bras'], ['bands'], 'flexion', 1, 'curl', {
    stress: ['elbow'], ins: ['Debout sur l’élastique, paumes vers l’avant.', 'Fléchissez les coudes.', 'Relâchez lentement.'],
    safe: ['Élastique en bon état.'], prog: 'Élastique plus fort ou pause en haut.', alt: ['curl_halteres', 'curl_serviette', 'rowing_elastique'] }),
  x('curl_serviette', 'Curl isométrique à la serviette', ['biceps'], ['avant_bras'], [], 'flexion', 1, 'curl', {
    mode: 'time', stress: ['elbow'], ins: ['Serviette sous un pied, tenue des deux mains.', 'Tirez vers le haut en résistant avec la jambe, coudes à 90°.', 'Maintenez la tension.'],
    safe: ['Montée progressive de la tension, sans à-coup.'], prog: 'Allonger les maintiens (20 → 40 s) et augmenter l’intensité de la résistance.', alt: ['curl_elastique', 'rowing_inverse_table', 'curl_halteres'] }),

  // ── Triceps ─────────────────────────────────────────────────
  x('pompes_triceps_mur', 'Pompes triceps contre un mur', ['triceps'], ['pectoraux', 'epaules'], [], 'push', 1, 'pushup', {
    kind: 'hiit', hiit: true, pushup: true,
    stress: ['elbow', 'wrist'], ins: ['Face à un mur, mains rapprochées à hauteur de poitrine, coudes serrés le long du corps.', 'Fléchissez les coudes pour approcher le visage des mains, sans écarter les coudes.', 'Repoussez jusqu’à tendre les bras.'],
    safe: ['Réservées au circuit HIIT full-body, sur option.', 'Pieds assez proches pour éviter de glisser.', 'Arrêtez si le coude tire.'], prog: 'Reculer les pieds, ralentir la descente, ajouter une pause en bas.', alt: ['extension_triceps_elastique', 'extension_triceps_halteres'] }),
  x('extension_triceps_halteres', 'Extension triceps au-dessus de la tête', ['triceps'], [], ['dumbbells'], 'extension', 1, 'triceps_ext', {
    step: 1, stress: ['elbow', 'shoulder'], ins: ['Un haltère tenu à deux mains au-dessus de la tête.', 'Fléchissez les coudes derrière la tête, coudes fixes.', 'Étendez jusqu’en haut.'],
    safe: ['Charge modérée.', 'Gainez pour ne pas cambrer.'], prog: 'Double progression.', alt: ['pushdown_poulie', 'extension_triceps_elastique', 'dips_chaises'] }),
  x('pushdown_poulie', 'Extension à la poulie haute', ['triceps'], [], ['cables'], 'extension', 1, 'triceps_ext', {
    step: 2.5, stress: ['elbow'], ins: ['Coudes collés au corps, poignées à hauteur de poitrine.', 'Poussez vers le bas jusqu’à tendre les bras.', 'Remontez jusqu’à 90°.'],
    safe: ['Ne décollez pas les coudes.'], prog: 'Double progression.', alt: ['extension_triceps_elastique', 'extension_triceps_halteres', 'dips_chaises'] }),
  x('extension_triceps_elastique', 'Extension triceps avec élastique', ['triceps'], [], ['bands'], 'extension', 1, 'triceps_ext', {
    stress: ['elbow'], ins: ['Élastique fixé en hauteur, coudes près du corps.', 'Poussez vers le bas jusqu’à tendre les bras.', 'Remontez lentement.'],
    safe: ['Fixation solide de l’élastique.'], prog: 'Élastique plus fort, pause en bas.', alt: ['pushdown_poulie', 'extension_triceps_halteres', 'dips_chaises'] }),

  // ── Avant-bras ──────────────────────────────────────────────
  x('curl_poignets', 'Curl de poignets', ['avant_bras'], [], ['dumbbells'], 'flexion', 1, 'curl', {
    step: 1, stress: ['wrist'], ins: ['Avant-bras posés sur les cuisses, paumes vers le haut.', 'Fléchissez les poignets, haltère léger.', 'Redescendez lentement.'],
    safe: ['Charge très légère, gestes contrôlés.'], prog: 'Monter à 15–20 répétitions avant d’augmenter.', alt: ['marche_fermier', 'suspension_barre', 'curl_marteau'] }),
  x('marche_fermier', 'Marche du fermier', ['avant_bras'], ['abdominaux', 'epaules'], ['dumbbells'], 'stabilisation', 1, 'carry', {
    mode: 'time', step: 2, ins: ['Un haltère lourd dans chaque main, épaules basses, buste droit.', 'Marchez à petits pas réguliers.', 'Posez les charges avec contrôle.'],
    safe: ['Sol dégagé.', 'Ne cambrez pas.'], prog: 'Allonger la durée (jusqu’à 45 s) puis augmenter la charge.', alt: ['suspension_barre', 'curl_poignets', 'gainage_lateral'] }),
  x('suspension_barre', 'Suspension à la barre', ['avant_bras'], ['dos', 'epaules'], ['pullup_bar'], 'stabilisation', 1, 'hang', {
    mode: 'time', stress: ['shoulder', 'wrist'], ins: ['Suspendez-vous à la barre, épaules actives.', 'Gardez les jambes sans balancer.', 'Redescendez avant la perte de contrôle.'],
    safe: ['Ne sautez pas pour descendre.', 'Arrêtez si l’épaule est douloureuse.'], prog: 'Allonger la durée (jusqu’à 45–60 s), puis suspension à un bras assisté.', alt: ['marche_fermier', 'curl_poignets', 'tractions_pronation'] }),

  x('torsion_serviette', 'Torsion de serviette (préhension)', ['avant_bras'], ['biceps'], [], 'flexion', 1, 'curl', {
    mode: 'time', stress: ['wrist'], ins: ['Serviette roulée tenue à deux mains, bras fléchis devant vous.', 'Tordez la serviette en sens opposé en serrant fort, sans bloquer la respiration.', 'Relâchez, changez de sens.'],
    safe: ['Montée progressive de la force de serrage.', 'Arrêtez si le poignet ou le coude tire.'], prog: 'Allonger la durée (20 → 40 s), utiliser une serviette plus épaisse ou plus humide.', alt: ['curl_poignets', 'marche_fermier', 'suspension_barre'] }),

  // ── Abdominaux ──────────────────────────────────────────────
  x('gainage_planche', 'Planche (gainage)', ['abdominaux'], ['epaules', 'fessiers'], ['mat'], 'stabilisation', 1, 'plank', {
    mode: 'time', stress: ['shoulder'], ins: ['Avant-bras au sol, coudes sous les épaules.', 'Corps en ligne, fessiers et abdominaux serrés.', 'Respirez calmement.'],
    safe: ['Arrêtez dès que le bas du dos se creuse.'], prog: 'Allonger la durée (jusqu’à 60 s) puis passer à des variantes (bras levé, appui réduit).', alt: ['dead_bug', 'gainage_lateral', 'pallof_elastique'] }),
  x('gainage_lateral', 'Gainage latéral', ['abdominaux'], ['epaules', 'fessiers'], ['mat'], 'stabilisation', 2, 'plank', {
    mode: 'time', uni: true, stress: ['shoulder'], ins: ['Sur le côté, avant-bras au sol sous l’épaule.', 'Soulevez le bassin, corps aligné.', 'Maintenez, puis changez de côté.'],
    safe: ['Genoux fléchis pour faciliter.'], prog: 'Allonger la durée, puis lever la jambe du dessus.', alt: ['gainage_planche', 'pallof_elastique', 'dead_bug'] }),
  x('dead_bug', 'Dead bug', ['abdominaux'], [], ['mat'], 'stabilisation', 1, 'plank', {
    ins: ['Sur le dos, bras tendus, cuisses à la verticale.', 'Étendez bras et jambe opposés en gardant le bas du dos plaqué.', 'Revenez, alternez.'],
    safe: ['Amplitude réduite si le bas du dos décolle.'], prog: 'Ralentir, allonger l’amplitude, ajouter une charge légère.', alt: ['gainage_planche', 'releve_genoux_suspendu', 'crunch'] }),
  x('crunch', 'Crunch', ['abdominaux'], [], ['mat'], 'flexion', 1, 'crunch', {
    stress: ['neck'], ins: ['Sur le dos, genoux fléchis, mains près des tempes.', 'Enroulez le haut du dos en expirant.', 'Redescendez lentement.'],
    safe: ['Ne tirez pas sur la nuque.'], prog: 'Monter les répétitions, ralentir, croiser les bras sur la poitrine puis ajouter une charge.', alt: ['dead_bug', 'releve_genoux_suspendu', 'crunch_poulie'] }),
  x('releve_genoux_suspendu', 'Relevé de genoux suspendu', ['abdominaux'], ['avant_bras'], ['pullup_bar'], 'flexion', 3, 'hang', {
    stress: ['shoulder', 'lower_back'], ins: ['Suspendu, épaules actives.', 'Relevez les genoux vers la poitrine en enroulant le bassin.', 'Redescendez sans balancer.'],
    safe: ['Pas d’élan.'], prog: 'Genoux fléchis → jambes tendues ; ralentir la descente.', alt: ['crunch', 'dead_bug', 'gainage_planche'] }),
  x('crunch_poulie', 'Crunch à la poulie', ['abdominaux'], [], ['cables'], 'flexion', 2, 'crunch', {
    step: 2.5, ins: ['À genoux, corde derrière la tête.', 'Enroulez le buste vers le bassin.', 'Remontez lentement.'],
    safe: ['Le mouvement vient des abdominaux, pas des bras.'], prog: 'Double progression.', alt: ['crunch', 'releve_genoux_suspendu', 'pallof_elastique'] }),
  x('pallof_elastique', 'Pallof press (anti-rotation)', ['abdominaux'], ['epaules'], ['bands'], 'rotation', 2, 'rotation', {
    uni: true, ins: ['De profil par rapport à l’élastique fixé à hauteur de poitrine.', 'Poussez les mains devant vous sans pivoter.', 'Revenez, changez de côté.'],
    safe: ['Pieds stables, bassin face à vous.'], prog: 'Reculer, pause de 3 s, élastique plus fort.', alt: ['gainage_lateral', 'gainage_planche', 'bucheron_elastique'] }),
  x('bucheron_elastique', 'Bûcheron avec élastique (rotation)', ['abdominaux'], ['epaules'], ['bands'], 'rotation', 2, 'rotation', {
    uni: true, stress: ['lower_back'], ins: ['Élastique fixé en hauteur, mains jointes.', 'Tirez en diagonale vers la hanche opposée en pivotant le buste.', 'Revenez lentement.'],
    safe: ['Rotation dans le thorax, pas dans le bas du dos.'], prog: 'Élastique plus fort ou contrôle du retour.', alt: ['pallof_elastique', 'gainage_lateral', 'dead_bug'] }),

  // ── Quadriceps ──────────────────────────────────────────────
  x('squat_poids_du_corps', 'Squat au poids du corps', ['quadriceps', 'fessiers'], ['ischios'], [], 'flexion', 1, 'squat', {
    stress: ['knee', 'hip'], ins: ['Pieds largeur d’épaules, pointes légèrement ouvertes.', 'Descendez en poussant les hanches en arrière, genoux dans l’axe des pieds.', 'Remontez en poussant dans le sol.'],
    safe: ['Talons au sol.', 'Réduisez l’amplitude en cas de douleur au genou.'], prog: 'Monter les répétitions, ralentir (3 s), pause en bas, puis passer au squat bulgare.', alt: ['squat_gobelet', 'chaise_murale', 'fentes_arriere'] }),
  x('squat_gobelet', 'Squat gobelet', ['quadriceps', 'fessiers'], ['abdominaux'], ['dumbbells'], 'flexion', 1, 'squat', {
    step: 2, stress: ['knee', 'hip'], ins: ['Haltère tenu contre la poitrine.', 'Descendez en gardant le buste droit.', 'Remontez en poussant les talons.'],
    safe: ['Dos neutre.', 'Charge maîtrisée.'], prog: 'Double progression (répétitions puis charge).', alt: ['squat_poids_du_corps', 'squat_barre', 'presse_cuisses'] }),
  x('squat_barre', 'Squat à la barre', ['quadriceps', 'fessiers'], ['ischios', 'abdominaux'], ['barbell', 'rack'], 'flexion', 3, 'squat', {
    step: 2.5, stress: ['knee', 'hip', 'lower_back'], ins: ['Barre sur les trapèzes, gainage serré.', 'Descendez contrôlé jusqu’à la profondeur maîtrisée.', 'Remontez en gardant le buste stable.'],
    safe: ['Sécurités du rack réglées.', 'Ne dépassez pas la profondeur que vous maîtrisez.'], prog: 'Ajouter 2,5 kg en haut de plage avec technique propre.', alt: ['squat_gobelet', 'presse_cuisses', 'squat_bulgare_halteres'] }),
  x('fentes_arriere', 'Fentes arrière', ['quadriceps', 'fessiers'], ['ischios'], [], 'flexion', 1, 'lunge', {
    uni: true, stress: ['knee', 'hip'], ins: ['Debout, reculez un pied et descendez le genou arrière vers le sol.', 'Genou avant au-dessus de la cheville.', 'Revenez en poussant sur la jambe avant.'],
    safe: ['Appui à portée de main au besoin.'], prog: 'Monter les répétitions, ralentir, puis passer aux fentes avec haltères ou au squat bulgare.', alt: ['squat_bulgare', 'montee_marche', 'squat_poids_du_corps'] }),
  x('squat_bulgare', 'Squat bulgare (pied arrière surélevé)', ['quadriceps', 'fessiers'], ['ischios'], ['furniture'], 'flexion', 2, 'lunge', {
    uni: true, stress: ['knee', 'hip', 'ankle'], ins: ['Pied arrière posé sur une chaise stable.', 'Descendez verticalement sur la jambe avant.', 'Remontez sans pousser avec le pied arrière.'],
    safe: ['Chaise stable, antidérapante.', 'Genou avant dans l’axe du pied.'], prog: 'Monter les répétitions, ralentir, puis ajouter des haltères.', alt: ['squat_bulgare_halteres', 'fentes_arriere', 'montee_marche'] }),
  x('squat_bulgare_halteres', 'Squat bulgare aux haltères', ['quadriceps', 'fessiers'], ['ischios'], ['dumbbells', 'bench'], 'flexion', 2, 'lunge', {
    uni: true, step: 2, stress: ['knee', 'hip', 'ankle'], ins: ['Pied arrière sur le banc, un haltère dans chaque main.', 'Descendez verticalement.', 'Remontez en poussant sur la jambe avant.'],
    safe: ['Charge adaptée à l’équilibre.'], prog: 'Double progression.', alt: ['squat_bulgare', 'squat_gobelet', 'presse_cuisses'] }),
  x('presse_cuisses', 'Presse à cuisses', ['quadriceps'], ['fessiers', 'ischios'], ['machines'], 'flexion', 1, 'squat', {
    step: 5, stress: ['knee', 'hip'], ins: ['Dos et bassin plaqués, pieds largeur d’épaules.', 'Fléchissez les genoux de façon contrôlée.', 'Poussez sans verrouiller les genoux.'],
    safe: ['Ne décollez pas le bassin.', 'Ne verrouillez pas violemment les genoux.'], prog: 'Double progression.', alt: ['squat_gobelet', 'extension_quadriceps', 'squat_bulgare_halteres'] }),
  x('extension_quadriceps', 'Extension de jambes (machine)', ['quadriceps'], [], ['machines'], 'extension', 1, 'squat', {
    step: 5, stress: ['knee'], ins: ['Réglez le dossier : genoux dans l’axe de la machine.', 'Étendez les jambes sans à-coup.', 'Redescendez lentement.'],
    safe: ['Charge modérée si les genoux sont sensibles.'], prog: 'Double progression.', alt: ['presse_cuisses', 'chaise_murale', 'squat_gobelet'] }),
  x('chaise_murale', 'Chaise murale', ['quadriceps'], ['fessiers'], [], 'stabilisation', 1, 'squat', {
    mode: 'time', stress: ['knee'], ins: ['Dos contre un mur, cuisses proches de l’horizontale.', 'Genoux au-dessus des chevilles.', 'Maintenez en respirant.'],
    safe: ['Montez en angle moins profond si le genou tire.'], prog: 'Allonger la durée (30 → 60 s), puis charge sur les cuisses.', alt: ['squat_poids_du_corps', 'montee_marche', 'extension_quadriceps'] }),
  x('montee_marche', 'Montée sur marche (step-up)', ['quadriceps', 'fessiers'], ['mollets'], ['furniture'], 'extension', 1, 'lunge', {
    uni: true, stress: ['knee', 'ankle'], ins: ['Pied entier posé sur une marche ou chaise stable.', 'Montez en poussant sur la jambe d’appui.', 'Redescendez lentement.'],
    safe: ['Support stable, hauteur adaptée.'], prog: 'Rehausser la marche, ralentir la descente, ajouter des haltères.', alt: ['fentes_arriere', 'squat_bulgare', 'squat_poids_du_corps'] }),

  // ── Ischio-jambiers ─────────────────────────────────────────
  x('souleve_roumain_halteres', 'Soulevé de terre roumain aux haltères', ['ischios', 'fessiers'], ['dos'], ['dumbbells'], 'hinge', 2, 'hinge', {
    step: 2, stress: ['lower_back', 'hip'], ins: ['Haltères devant les cuisses, genoux légèrement fléchis.', 'Poussez les hanches en arrière, dos plat, haltères près des jambes.', 'Remontez en serrant les fessiers.'],
    safe: ['Dos neutre en permanence.', 'Descendez seulement jusqu’où le dos reste plat.'], prog: 'Double progression ; ralentir la descente.', alt: ['souleve_roumain_unipodal', 'pont_fessier', 'souleve_roumain_barre'] }),
  x('souleve_roumain_barre', 'Soulevé de terre roumain à la barre', ['ischios', 'fessiers'], ['dos'], ['barbell'], 'hinge', 3, 'hinge', {
    step: 2.5, stress: ['lower_back', 'hip'], ins: ['Barre devant les cuisses, prise à largeur d’épaules.', 'Reculez les hanches, dos plat.', 'Remontez en poussant les hanches vers l’avant.'],
    safe: ['Abandonnez si le dos s’arrondit.'], prog: 'Ajouter 2,5 kg en haut de plage.', alt: ['souleve_roumain_halteres', 'leg_curl_machine', 'pont_fessier'] }),
  x('charniere_poids_du_corps', 'Charnière de hanche au poids du corps', ['ischios', 'fessiers'], ['dos'], [], 'hinge', 1, 'hinge', {
    stress: ['lower_back', 'hip'], ins: ['Debout, pieds largeur de hanches, genoux légèrement fléchis, mains croisées sur la poitrine ou sur les hanches.', 'Poussez les hanches en arrière en gardant le dos plat, jusqu’à sentir l’étirement derrière les cuisses.', 'Remontez en poussant les hanches vers l’avant et en serrant les fessiers.'],
    safe: ['Dos neutre en permanence : descendez seulement tant qu’il reste plat.', 'Mouvement lent, sans à-coup.'], prog: 'Monter les répétitions, ralentir (3 s), marquer une pause en bas, puis passer à la charnière sur une jambe.', alt: ['souleve_roumain_unipodal', 'pont_fessier', 'curl_ischios_serviette'] }),
  x('souleve_roumain_unipodal', 'Charnière unipodale (sans charge)', ['ischios', 'fessiers'], ['abdominaux'], [], 'hinge', 2, 'hinge', {
    uni: true, stress: ['lower_back', 'hip', 'ankle'], ins: ['Debout sur une jambe, appui léger à portée de main.', 'Penchez le buste en levant l’autre jambe, dos plat.', 'Revenez en contractant fessier et ischio.'],
    safe: ['Appui à portée de main.', 'Genou d’appui légèrement fléchi.'], prog: 'Ralentir, allonger l’amplitude, puis ajouter un haltère.', alt: ['pont_fessier_unipodal', 'souleve_roumain_halteres', 'curl_ischios_serviette'] }),
  x('leg_curl_machine', 'Leg curl (machine)', ['ischios'], ['mollets'], ['machines'], 'flexion', 1, 'curl', {
    step: 5, stress: ['knee'], ins: ['Rouleau juste au-dessus des talons.', 'Fléchissez les genoux sans décoller les hanches.', 'Revenez lentement.'],
    safe: ['Pas d’élan.'], prog: 'Double progression.', alt: ['curl_ischios_serviette', 'souleve_roumain_halteres', 'pont_fessier_unipodal'] }),
  x('curl_ischios_serviette', 'Curl ischios avec serviette', ['ischios'], ['fessiers'], ['mat'], 'flexion', 2, 'bridge', {
    stress: ['knee'], ins: ['Sur le dos, talons sur une serviette, sur un sol lisse.', 'Montez le bassin puis faites glisser les talons vers vous.', 'Tendez lentement les jambes.'],
    safe: ['Sol adapté, mouvement lent.', 'Arrêtez en cas de crampe ou de douleur à l’arrière de cuisse.'], prog: 'Allonger la phase de retour, puis passer à une jambe.', alt: ['pont_fessier_unipodal', 'souleve_roumain_unipodal', 'leg_curl_machine'] }),

  // ── Fessiers ────────────────────────────────────────────────
  x('pont_fessier', 'Pont fessier', ['fessiers'], ['ischios'], ['mat'], 'extension', 1, 'bridge', {
    stress: ['lower_back'], ins: ['Sur le dos, genoux fléchis, pieds au sol.', 'Montez le bassin en serrant les fessiers.', 'Redescendez sans poser complètement.'],
    safe: ['Ne cambrez pas : le mouvement vient des fessiers.'], prog: 'Monter les répétitions, pause 2 s, puis passer à une jambe ou ajouter une charge.', alt: ['pont_fessier_unipodal', 'hip_thrust_halteres', 'marche_laterale_elastique'] }),
  x('pont_fessier_unipodal', 'Pont fessier unipodal', ['fessiers'], ['ischios'], ['mat'], 'extension', 2, 'bridge', {
    uni: true, stress: ['lower_back'], ins: ['Une jambe tendue en l’air, pied d’appui près du bassin.', 'Montez le bassin à l’horizontale.', 'Redescendez lentement.'],
    safe: ['Bassin droit : évitez de pivoter.'], prog: 'Ralentir, pause, puis surélever l’épaule d’appui.', alt: ['pont_fessier', 'hip_thrust_halteres', 'souleve_roumain_unipodal'] }),
  x('hip_thrust_halteres', 'Hip thrust avec haltère', ['fessiers'], ['ischios'], ['dumbbells', 'bench'], 'extension', 2, 'bridge', {
    step: 2, stress: ['lower_back', 'hip'], ins: ['Haut du dos sur le banc, haltère sur les hanches.', 'Poussez les hanches jusqu’à l’alignement épaules-genoux.', 'Redescendez contrôlé.'],
    safe: ['Menton rentré, pas de cambrure.'], prog: 'Double progression.', alt: ['pont_fessier', 'hip_thrust_barre', 'souleve_roumain_halteres'] }),
  x('hip_thrust_barre', 'Hip thrust à la barre', ['fessiers'], ['ischios'], ['barbell', 'bench'], 'extension', 3, 'bridge', {
    step: 2.5, stress: ['lower_back', 'hip'], ins: ['Barre protégée sur les hanches, haut du dos sur le banc.', 'Poussez les hanches en serrant les fessiers.', 'Redescendez contrôlé.'],
    safe: ['Utilisez un coussin de barre.', 'Barre stable avant de pousser.'], prog: 'Ajouter 2,5 kg en haut de plage.', alt: ['hip_thrust_halteres', 'pont_fessier_unipodal', 'souleve_roumain_barre'] }),
  x('marche_laterale_elastique', 'Marche latérale avec élastique', ['fessiers'], ['quadriceps'], ['bands'], 'stabilisation', 1, 'squat', {
    stress: ['knee', 'hip'], ins: ['Élastique au-dessus des genoux, genoux légèrement fléchis.', 'Faites des pas latéraux en gardant la tension.', 'Alternez les côtés.'],
    safe: ['Ne laissez pas les genoux rentrer.'], prog: 'Élastique plus fort ou placé aux chevilles.', alt: ['pont_fessier', 'pont_fessier_unipodal', 'squat_poids_du_corps'] }),

  // ── Mollets ─────────────────────────────────────────────────
  x('mollets_debout', 'Mollets debout', ['mollets'], [], [], 'extension', 1, 'calf', {
    stress: ['ankle'], ins: ['Debout, pieds parallèles (sur le bord d’une marche si vous en avez une, sinon au sol), main en appui contre un mur.', 'Montez sur la pointe des pieds.', 'Redescendez lentement, étirement complet.'],
    safe: ['Appui à portée de main.'], prog: 'Monter les répétitions, ralentir (3 s), puis passer à un pied ou ajouter une charge.', alt: ['mollets_unipodal', 'mollets_halteres', 'mollets_assis_machine'] }),
  x('mollets_unipodal', 'Mollets sur un pied', ['mollets'], [], [], 'extension', 2, 'calf', {
    uni: true, stress: ['ankle'], ins: ['Un seul pied d’appui, main contre un mur (sur une marche si vous en avez une).', 'Montez sur la pointe.', 'Redescendez lentement.'],
    safe: ['Appui à portée de main.'], prog: 'Monter les répétitions, puis tenir un haltère.', alt: ['mollets_debout', 'mollets_halteres', 'mollets_assis_machine'] }),
  x('mollets_halteres', 'Mollets aux haltères', ['mollets'], [], ['dumbbells'], 'extension', 1, 'calf', {
    step: 2, stress: ['ankle'], ins: ['Haltères en main, pieds parallèles (avant-pieds sur une marche si vous en avez une).', 'Montez sur la pointe.', 'Redescendez lentement.'],
    safe: ['Appui à portée de main.'], prog: 'Double progression.', alt: ['mollets_debout', 'mollets_unipodal', 'mollets_assis_machine'] }),
  x('mollets_assis_machine', 'Mollets assis (machine)', ['mollets'], [], ['machines'], 'extension', 1, 'calf', {
    step: 5, stress: ['ankle'], ins: ['Genoux sous le coussin, avant-pieds sur la plateforme.', 'Montez sur la pointe.', 'Redescendez jusqu’à l’étirement.'],
    safe: ['Amplitude contrôlée.'], prog: 'Double progression.', alt: ['mollets_debout', 'mollets_halteres', 'mollets_unipodal'] }),

  // ── Mobilité ────────────────────────────────────────────────
  x('etirement_psoas', 'Étirement des fléchisseurs de hanche', ['quadriceps'], ['fessiers'], ['mat'], 'extension', 1, 'stretch', {
    kind: 'mobility', mode: 'time', uni: true, stress: ['knee'], ins: ['Un genou au sol, l’autre pied devant.', 'Basculez le bassin vers l’avant sans cambrer.', 'Maintenez en respirant.'],
    safe: ['Coussin sous le genou.', 'Étirement doux, jamais douloureux.'], prog: 'Allonger le maintien (30 → 60 s).', alt: ['mondial_stretch', '90_90_hanches', 'chat_vache'] }),
  x('rotation_thoracique', 'Rotation thoracique (à quatre pattes)', ['dos'], ['epaules'], ['mat'], 'rotation', 1, 'rotation', {
    kind: 'mobility', uni: true, ins: ['À quatre pattes, une main derrière la tête.', 'Ouvrez le coude vers le plafond en tournant le thorax.', 'Revenez, répétez.'],
    safe: ['Mouvement fluide, sans forcer.'], prog: 'Augmenter l’amplitude et ralentir.', alt: ['chat_vache', 'mondial_stretch', 'passe_elastique'] }),
  x('chat_vache', 'Chat-vache', ['dos'], ['abdominaux'], ['mat'], 'flexion', 1, 'stretch', {
    kind: 'mobility', ins: ['À quatre pattes, mains sous les épaules.', 'Arrondissez le dos en soufflant, puis creusez en inspirant.', 'Enchaînez lentement.'],
    safe: ['Amplitude confortable.'], prog: 'Augmenter l’amplitude progressivement.', alt: ['rotation_thoracique', 'etirement_psoas', 'mondial_stretch'] }),
  x('90_90_hanches', 'Rotations de hanche 90/90', ['fessiers'], ['quadriceps'], ['mat'], 'rotation', 2, 'stretch', {
    kind: 'mobility', mode: 'time', stress: ['hip', 'knee'], ins: ['Assis, jambes à 90° devant et sur le côté.', 'Penchez le buste vers la jambe avant en gardant le dos long.', 'Basculez d’un côté à l’autre.'],
    safe: ['Pas de douleur au genou.', 'Coussin sous les fessiers si besoin.'], prog: 'Allonger les maintiens, puis décoller les mains.', alt: ['etirement_psoas', 'mondial_stretch', 'chat_vache'] }),
  x('mondial_stretch', 'Fente-rotation « world’s greatest stretch »', ['fessiers'], ['dos', 'ischios', 'epaules'], ['mat'], 'rotation', 1, 'stretch', {
    kind: 'mobility', uni: true, ins: ['Grande fente, mains au sol.', 'Ouvrez le bras intérieur vers le plafond.', 'Reculez les hanches pour étirer l’arrière de cuisse.'],
    safe: ['Mouvement lent et contrôlé.'], prog: 'Allonger le temps de maintien dans chaque position.', alt: ['etirement_psoas', 'rotation_thoracique', '90_90_hanches'] }),
  x('passe_elastique', 'Passage d’élastique (épaules)', ['epaules'], ['dos'], ['bands'], 'rotation', 1, 'stretch', {
    kind: 'mobility', stress: ['shoulder'], ins: ['Élastique large entre les mains, bras tendus devant.', 'Passez les bras au-dessus de la tête jusque derrière le dos.', 'Revenez sans plier les coudes.'],
    safe: ['Écartez les mains au besoin pour rester sans douleur.'], prog: 'Rapprocher progressivement les mains.', alt: ['rotation_thoracique', 'chat_vache', 'mondial_stretch'] }),

  // ── Circuit HIIT full-body ──────────────────────────────────
  x('burpees_sans_pompe', 'Burpees sans pompe', ['quadriceps', 'epaules'], ['pectoraux', 'abdominaux'], [], 'extension', 2, 'cardio', {
    kind: 'hiit', mode: 'time', stress: ['wrist', 'knee'], ins: ['Descendez en squat, mains au sol.', 'Reculez les pieds en planche, revenez.', 'Sautez en tendant le corps.'],
    safe: ['Rythme maîtrisé, réception en douceur.'], prog: 'Allonger la durée de travail ou raccourcir la récupération.', alt: ['squat_saute', 'mountain_climbers', 'jumping_jacks'] }),
  x('mountain_climbers', 'Mountain climbers', ['abdominaux'], ['epaules', 'quadriceps'], [], 'stabilisation', 1, 'cardio', {
    kind: 'hiit', mode: 'time', stress: ['wrist', 'shoulder'], ins: ['En planche, mains sous les épaules.', 'Ramenez les genoux vers la poitrine en alternance.', 'Gardez les hanches basses.'],
    safe: ['Ralentissez si la technique se dégrade.'], prog: 'Allonger la durée ou accélérer.', alt: ['jumping_jacks', 'burpees_sans_pompe', 'gainage_planche'] }),
  x('jumping_jacks', 'Jumping jacks', ['mollets'], ['epaules', 'quadriceps'], [], 'extension', 1, 'cardio', {
    kind: 'hiit', mode: 'time', stress: ['ankle', 'knee'], ins: ['Debout, sautez en écartant jambes et bras.', 'Revenez pieds joints.', 'Gardez un rythme régulier.'],
    safe: ['Réceptions souples, sol non glissant.'], prog: 'Allonger la durée ou ajouter de l’amplitude.', alt: ['mountain_climbers', 'montee_genoux', 'squat_saute'] }),
  x('squat_saute', 'Squats sautés', ['quadriceps', 'fessiers'], ['mollets'], [], 'extension', 2, 'squat', {
    kind: 'hiit', mode: 'time', stress: ['knee', 'ankle', 'hip'], ins: ['Descendez en squat.', 'Explosez vers le haut.', 'Réceptionnez en douceur, genoux fléchis.'],
    safe: ['Pas de sauts si les genoux sont douloureux.'], prog: 'Allonger la durée ou raccourcir la récupération.', alt: ['squat_poids_du_corps', 'jumping_jacks', 'montee_genoux'] }),
  x('montee_genoux', 'Montées de genoux', ['quadriceps'], ['abdominaux', 'mollets'], [], 'extension', 1, 'cardio', {
    kind: 'hiit', mode: 'time', stress: ['knee', 'ankle'], ins: ['Courez sur place en montant les genoux à la hanche.', 'Bras en opposition.', 'Restez léger sur les appuis.'],
    safe: ['Réduisez l’intensité en cas de gêne au genou.'], prog: 'Allonger la durée ou accélérer.', alt: ['jumping_jacks', 'mountain_climbers', 'squat_saute'] }),
  x('sauts_patineur', 'Sauts de patineur', ['fessiers', 'quadriceps'], ['mollets'], [], 'stabilisation', 2, 'cardio', {
    kind: 'hiit', mode: 'time', uni: true, stress: ['knee', 'ankle'], ins: ['Sautez latéralement d’un pied sur l’autre.', 'Balancez les bras pour l’équilibre.', 'Réceptionnez genou légèrement fléchi.'],
    safe: ['Sol non glissant.'], prog: 'Allonger la durée ou l’amplitude des sauts.', alt: ['jumping_jacks', 'marche_laterale_elastique', 'squat_saute'] }),
]

export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]))
