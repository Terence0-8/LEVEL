import type { EquipmentProfile, Experience, MuscleGroup, RunFamily } from './types'
import { MUSCLE_LABEL, RUN_FAMILY_LABEL } from './types'
import type { SportProfile } from './profile'
import type { SportSession } from './session'
import type { RecoveryState } from './recovery'
import { dayKey, mondayOf } from '../dates'

/**
 * Catalogue de PROGRAMMES SPORT : des modèles qui orientent le moteur existant, sans moteur de progression parallèle.
 * - le choix des exercices, des charges et leur progression restent ceux de SPORT (bibliothèque, contraintes, récupération, double progression) ;
 * - un programme dit QUOI travailler et COMBIEN de séances ; la séance du jour est composée au moment de la démarrer ;
 * - les pompes (toutes variantes) n'y figurent jamais : elles restent réservées aux circuits HIIT full-body explicitement autorisés.
 */
export type ProgramGoal = 'muscle' | 'strength' | 'endurance' | 'run' | 'fitness' | 'restart'
export const PROGRAM_GOAL_LABEL: Record<ProgramGoal, string> = {
  muscle: 'Prendre du muscle', strength: 'Gagner en force', endurance: 'Développer mon endurance', run: 'Courir', fitness: 'Rester en forme', restart: 'Reprendre le sport',
}
export type ProgramCategory = 'strength' | 'run' | 'mixed'
export const PROGRAM_CATEGORY_LABEL: Record<ProgramCategory, string> = { strength: 'Musculation', run: 'Course', mixed: 'Mixtes' }

export interface ProgramSessionDef {
  id: string
  label: string
  kind: 'strength' | 'run' | 'hiit'
  minutes: number
  /** Musculation : groupes travaillés (le moteur choisit les exercices adaptés au matériel, au niveau et aux contraintes) */
  focus?: MuscleGroup[]
  /** Musculation : consigne de séries, répétitions et repos */
  scheme?: string
  /** Course : famille de sortie */
  runFamily?: RunFamily
  /** Consignes techniques */
  cues: string[]
}

/** Progression hebdomadaire de la course : minutes interpolées de début à fin, avec une semaine allégée toutes les quatre semaines. */
export interface RunPlan {
  minutes: Partial<Record<RunFamily, [number, number]>>
  /** Consignes précises des premières semaines (ex. alternance marche/course) */
  weekText?: string[]
  intervalText?: Partial<Record<RunFamily, string>>
}

export interface ProgramTemplate {
  id: string
  v: number
  name: string
  category: ProgramCategory
  goals: ProgramGoal[]
  description: string
  /** Pourquoi ce programme existe (affiché dans la recommandation) */
  why: string
  levels: Experience[]
  weeks: number
  perWeek: number
  minutesPerSession: number
  equipment: EquipmentProfile[]
  split: ProgramSessionDef[]
  run?: RunPlan
  progression: string
  recovery: string
  tags: string[]
}

const S = (id: string, label: string, minutes: number, focus: MuscleGroup[], scheme: string, cues: string[]): ProgramSessionDef => ({ id, label, kind: 'strength', minutes, focus, scheme, cues })
const R = (id: string, label: string, minutes: number, runFamily: RunFamily, cues: string[]): ProgramSessionDef => ({ id, label, kind: 'run', minutes, runFamily, cues })
const H = (id: string, label: string, minutes: number): ProgramSessionDef => ({ id, label, kind: 'hiit', minutes, cues: ['Travaillez à un effort soutenu mais contrôlé : la technique avant la vitesse.', 'Stoppez au moindre signe de douleur.'] })

const G3 = '3 séries · 8–12 répétitions · repos 60–90 s'
const G4 = '3–4 séries · 6–10 répétitions · repos 90–120 s'
const GF = '4–5 séries · 3–6 répétitions · repos 2–3 min'
const GL = '2 séries · 10–12 répétitions · repos 60 s, charge légère'
const CUE_TECH = ['Contrôlez la descente (2 à 3 secondes).', 'Gardez 1 à 2 répétitions en réserve sur chaque série.']
const CUE_WARM = ['Commencez par 5 minutes d’échauffement progressif.']

export const PROGRAM_CATALOG_VERSION = 1
export const PROGRAMS: ProgramTemplate[] = [
  // ── Musculation ──────────────────────────────────────────────
  { id: 'prog.muscu.debutant', v: 1, name: 'Musculation débutant', category: 'strength', goals: ['muscle', 'fitness', 'restart'], description: 'Trois séances corps entier par semaine pour apprendre les mouvements de base.', why: 'Le corps entier trois fois par semaine laisse 48 h de récupération entre les séances : la meilleure base pour débuter.',
    levels: ['beginner'], weeks: 8, perWeek: 3, minutesPerSession: 40, equipment: ['none', 'home', 'gym'],
    split: [S('a', 'Corps entier A', 40, ['quadriceps', 'pectoraux', 'dos', 'abdominaux'], G3, [...CUE_WARM, ...CUE_TECH]), S('b', 'Corps entier B', 40, ['fessiers', 'epaules', 'dos', 'abdominaux'], G3, CUE_TECH), S('c', 'Corps entier C', 40, ['ischios', 'pectoraux', 'biceps', 'triceps'], G3, CUE_TECH)],
    progression: 'Quand toutes les séries atteignent le haut de la fourchette de répétitions, Level vous propose d’augmenter la charge — jamais sans votre confirmation.', recovery: 'Au moins un jour de repos entre deux séances. En vigilance, la séance est allégée ; en alerte, elle n’est pas proposée.', tags: ['débutant', 'corps entier'] },
  { id: 'prog.muscu.general', v: 1, name: 'Développement musculaire général', category: 'strength', goals: ['muscle', 'fitness'], description: 'Trois séances en rotation pour développer l’ensemble du corps.', why: 'Une rotation haut / bas / mixte répartit le volume sur la semaine sans surcharger un groupe.',
    levels: ['beginner', 'intermediate'], weeks: 10, perWeek: 3, minutesPerSession: 45, equipment: ['home', 'gym'],
    split: [S('a', 'Haut du corps', 45, ['pectoraux', 'dos', 'epaules', 'triceps'], G3, CUE_TECH), S('b', 'Bas du corps', 45, ['quadriceps', 'ischios', 'fessiers', 'mollets'], G3, CUE_TECH), S('c', 'Mixte', 45, ['dos', 'pectoraux', 'biceps', 'abdominaux'], G3, CUE_TECH)],
    progression: 'Double progression : d’abord les répétitions, puis la charge, sur proposition de Level et avec votre accord.', recovery: 'Trois séances non consécutives ; la récupération prime sur le calendrier.', tags: ['masse', 'équilibré'] },
  { id: 'prog.muscu.masse', v: 1, name: 'Prise de masse', category: 'strength', goals: ['muscle'], description: 'Quatre séances haut / bas avec davantage de volume pour gagner du muscle.', why: 'Le volume plus élevé et la fréquence haut / bas favorisent la prise de masse chez un pratiquant déjà habitué.',
    levels: ['intermediate', 'advanced'], weeks: 12, perWeek: 4, minutesPerSession: 55, equipment: ['home', 'gym'],
    split: [S('a', 'Haut du corps — poussée', 55, ['pectoraux', 'epaules', 'triceps', 'dos'], G4, CUE_TECH), S('b', 'Bas du corps — quadriceps', 55, ['quadriceps', 'fessiers', 'mollets', 'abdominaux'], G4, CUE_TECH), S('c', 'Haut du corps — tirage', 55, ['dos', 'biceps', 'epaules', 'pectoraux'], G4, CUE_TECH), S('d', 'Bas du corps — chaîne postérieure', 55, ['ischios', 'fessiers', 'quadriceps', 'mollets'], G4, CUE_TECH)],
    progression: 'Le volume n’augmente jamais en même temps que l’intensité ; une semaine plus légère est proposée toutes les quatre à six semaines.', recovery: 'Quatre séances par semaine seulement si la récupération reste normale ; sinon Level allège ou propose du repos.', tags: ['masse', 'volume'] },
  { id: 'prog.muscu.force', v: 1, name: 'Force', category: 'strength', goals: ['strength'], description: 'Trois séances centrées sur les grands mouvements, peu de répétitions, repos longs.', why: 'Peu de mouvements, travaillés lourd et avec beaucoup de repos : l’approche la plus directe pour gagner en force.',
    levels: ['intermediate', 'advanced'], weeks: 10, perWeek: 3, minutesPerSession: 60, equipment: ['gym', 'home'],
    split: [S('a', 'Jambes et tronc', 60, ['quadriceps', 'fessiers', 'abdominaux'], GF, ['Échauffez-vous avec des séries légères avant la charge de travail.', ...CUE_TECH]), S('b', 'Poussée', 60, ['pectoraux', 'epaules', 'triceps'], GF, CUE_TECH), S('c', 'Tirage et chaîne postérieure', 60, ['dos', 'ischios', 'biceps'], GF, CUE_TECH)],
    progression: 'Augmentation de charge par petits paliers, seulement quand les séries sont réussies proprement, et après votre confirmation.', recovery: 'Les repos longs et la récupération complète priment ; aucune séance lourde en vigilance ou en alerte.', tags: ['force'] },
  { id: 'prog.muscu.haut', v: 1, name: 'Haut du corps', category: 'strength', goals: ['muscle', 'strength'], description: 'Deux ou trois séances ciblées sur le haut du corps.', why: 'Pour cibler le haut du corps en laissant le bas récupérer ou être travaillé ailleurs (course, par exemple).',
    levels: ['beginner', 'intermediate'], weeks: 8, perWeek: 3, minutesPerSession: 45, equipment: ['home', 'gym'],
    split: [S('a', 'Poussée', 45, ['pectoraux', 'epaules', 'triceps'], G3, CUE_TECH), S('b', 'Tirage', 45, ['dos', 'biceps', 'epaules'], G3, CUE_TECH), S('c', 'Haut du corps complet', 45, ['pectoraux', 'dos', 'epaules', 'abdominaux'], G3, CUE_TECH)],
    progression: 'Double progression, validée par vous.', recovery: 'Un jour de repos au moins entre deux séances.', tags: ['haut du corps'] },
  { id: 'prog.muscu.bas', v: 1, name: 'Bas du corps', category: 'strength', goals: ['muscle', 'strength'], description: 'Deux ou trois séances ciblées sur les jambes et les fessiers.', why: 'Pour développer les jambes avec un volume maîtrisé et une récupération suffisante entre les séances.',
    levels: ['beginner', 'intermediate'], weeks: 8, perWeek: 2, minutesPerSession: 45, equipment: ['none', 'home', 'gym'],
    split: [S('a', 'Quadriceps et fessiers', 45, ['quadriceps', 'fessiers', 'mollets'], G3, CUE_TECH), S('b', 'Chaîne postérieure', 45, ['ischios', 'fessiers', 'abdominaux'], G3, CUE_TECH)],
    progression: 'Double progression, validée par vous.', recovery: 'Deux séances par semaine, séparées d’au moins deux jours.', tags: ['jambes'] },
  { id: 'prog.muscu.bras', v: 1, name: 'Développement des bras', category: 'strength', goals: ['muscle'], description: 'Trois séances à dominante bras, avec un peu d’épaules et de dos.', why: 'Les bras progressent mieux avec un travail réparti sur plusieurs jours, en complément du tirage et de la poussée.',
    levels: ['beginner', 'intermediate'], weeks: 8, perWeek: 3, minutesPerSession: 40, equipment: ['home', 'gym'],
    split: [S('a', 'Biceps et dos', 40, ['biceps', 'dos', 'avant_bras'], G3, CUE_TECH), S('b', 'Triceps et épaules', 40, ['triceps', 'epaules'], G3, CUE_TECH), S('c', 'Bras complet', 40, ['biceps', 'triceps', 'avant_bras'], G3, CUE_TECH)],
    progression: 'Double progression, validée par vous.', recovery: 'Séances non consécutives ; aucune douleur articulaire tolérée aux coudes ou aux poignets.', tags: ['bras'] },
  { id: 'prog.muscu.reprise', v: 1, name: 'Reprise après interruption', category: 'strength', goals: ['restart', 'fitness'], description: 'Deux séances douces pour retrouver le rythme progressivement.', why: 'Après une pause, mieux vaut recommencer léger : le corps se réadapte vite si on ne brûle pas les étapes.',
    levels: ['beginner', 'intermediate', 'advanced'], weeks: 6, perWeek: 2, minutesPerSession: 35, equipment: ['none', 'home', 'gym'],
    split: [S('a', 'Reprise A', 35, ['quadriceps', 'pectoraux', 'dos'], GL, ['Charges nettement plus légères qu’avant la pause.', ...CUE_WARM]), S('b', 'Reprise B', 35, ['fessiers', 'epaules', 'abdominaux'], GL, ['Arrêtez-vous avant la fatigue : l’objectif est la régularité.'])],
    progression: 'Semaines 1–2 : technique et régularité. Ensuite le volume remonte doucement ; Level propose les augmentations, vous décidez.', recovery: 'Courbatures importantes ou douleur : prolongez la reprise ; Level adapte ou propose du repos.', tags: ['reprise', 'doux'] },
  { id: 'prog.muscu.intermediaire', v: 1, name: 'Musculation intermédiaire', category: 'strength', goals: ['muscle', 'strength', 'fitness'], description: 'Quatre séances haut / bas équilibrées pour progresser régulièrement.', why: 'Un classique haut / bas à quatre séances : assez de volume pour progresser, assez de repos pour récupérer.',
    levels: ['intermediate'], weeks: 10, perWeek: 4, minutesPerSession: 50, equipment: ['home', 'gym'],
    split: [S('a', 'Haut du corps A', 50, ['pectoraux', 'dos', 'epaules'], G4, CUE_TECH), S('b', 'Bas du corps A', 50, ['quadriceps', 'ischios', 'fessiers'], G4, CUE_TECH), S('c', 'Haut du corps B', 50, ['dos', 'pectoraux', 'biceps', 'triceps'], G4, CUE_TECH), S('d', 'Bas du corps B', 50, ['fessiers', 'quadriceps', 'mollets', 'abdominaux'], G4, CUE_TECH)],
    progression: 'Une seule variable monte à la fois (charge ou répétitions), jamais le volume et l’intensité ensemble.', recovery: 'Quatre séances seulement si la récupération est normale.', tags: ['intermédiaire'] },

  // ── Course ───────────────────────────────────────────────────
  { id: 'prog.course.debuter', v: 1, name: 'Débuter la course', category: 'run', goals: ['run', 'endurance', 'restart'], description: 'Huit semaines d’alternance marche et course pour courir 20 à 30 minutes.', why: 'L’alternance marche / course habitue les tendons et le souffle sans vous épuiser.',
    levels: ['beginner'], weeks: 8, perWeek: 3, minutesPerSession: 30, equipment: ['none', 'home', 'gym'],
    split: [R('r1', 'Sortie douce', 25, 'easy', ['Vous devez pouvoir parler en courant.', 'Marchez dès que le souffle manque.']), R('r2', 'Sortie douce', 25, 'easy', ['Terrain plat, allure confortable.']), R('r3', 'Sortie plus longue', 30, 'long', ['Même allure, un peu plus longtemps.'])],
    run: { minutes: { easy: [20, 28], long: [25, 35] }, weekText: ['Semaine 1 : 8 × (1 min de course / 2 min de marche)', 'Semaine 2 : 7 × (2 min de course / 2 min de marche)', 'Semaine 3 : 5 × (3 min de course / 2 min de marche)', 'Semaine 4 : 4 × (5 min de course / 2 min de marche) — semaine allégée', 'Semaine 5 : 3 × (8 min de course / 2 min de marche)', 'Semaine 6 : 2 × (12 min de course / 2 min de marche)', 'Semaine 7 : 20 min de course continue', 'Semaine 8 : 25 à 30 min de course continue'] },
    progression: 'La durée augmente par petits paliers, avec une semaine allégée en semaine 4. Ne rattrapez pas une séance manquée : reprenez au programme.', recovery: 'Jamais deux sorties de suite au début. Douleur au tibia, au genou ou au pied : arrêtez et réévaluez dans Récupération.', tags: ['débutant', 'marche-course'] },
  { id: 'prog.course.endurance', v: 1, name: 'Endurance fondamentale', category: 'run', goals: ['run', 'endurance'], description: 'Huit semaines de sorties à allure facile pour construire un socle d’endurance.', why: 'Le gros du travail d’endurance se fait lentement : c’est ce qui rend toutes les autres séances possibles.',
    levels: ['beginner', 'intermediate'], weeks: 8, perWeek: 3, minutesPerSession: 40, equipment: ['none', 'home', 'gym'],
    split: [R('r1', 'Endurance facile', 35, 'easy', ['Allure de conversation.']), R('r2', 'Récupération active', 30, 'recovery', ['Très facile, presque lent.']), R('r3', 'Sortie longue', 50, 'long', ['Départ lent, régulier sur toute la durée.'])],
    run: { minutes: { easy: [30, 45], recovery: [25, 30], long: [40, 65] } },
    progression: 'Durée totale hebdomadaire en hausse modérée avec une semaine plus légère toutes les quatre semaines.', recovery: 'Une journée de repos entre les sorties ; en vigilance, privilégiez la sortie de récupération.', tags: ['endurance'] },
  { id: 'prog.course.allure', v: 1, name: 'Améliorer son allure', category: 'run', goals: ['run'], description: 'Six semaines mêlant sortie facile, tempo et fractionné.', why: 'Un peu d’intensité bien dosée, entourée de sorties faciles, améliore l’allure sans multiplier les blessures.',
    levels: ['intermediate', 'advanced'], weeks: 6, perWeek: 3, minutesPerSession: 45, equipment: ['none', 'home', 'gym'],
    split: [R('r1', 'Fractionné', 40, 'interval', ['Échauffement 10 min, puis répétitions rapides mais contrôlées, retour au calme 10 min.']), R('r2', 'Endurance facile', 40, 'easy', ['Allure de conversation : la veille d’une séance dure, restez facile.']), R('r3', 'Tempo', 45, 'tempo', ['Allure « confortablement dure » sur la partie centrale.'])],
    run: { minutes: { interval: [35, 45], easy: [35, 45], tempo: [40, 50] }, intervalText: { interval: '6 × (1 min soutenu / 1 min 30 trot lent), puis jusqu’à 8 répétitions', tempo: '15 à 25 min à allure tempo entre échauffement et retour au calme' } },
    progression: 'Une seule séance exigeante augmente à la fois ; semaine plus légère en semaine 4.', recovery: 'Séances dures uniquement si la récupération est normale ; sinon Level les remplace par une sortie facile.', tags: ['allure', 'intensité'] },
  { id: 'prog.course.5km', v: 1, name: 'Préparer un 5 km', category: 'run', goals: ['run'], description: 'Huit semaines pour courir 5 km avec confiance.', why: 'Un plan court et progressif, avec une sortie longue qui monte jusqu’à la distance cible.',
    levels: ['beginner', 'intermediate'], weeks: 8, perWeek: 3, minutesPerSession: 35, equipment: ['none', 'home', 'gym'],
    split: [R('r1', 'Sortie facile', 30, 'easy', ['Allure de conversation.']), R('r2', 'Allure objectif', 30, 'tempo', ['Quelques minutes à l’allure visée pour la course.']), R('r3', 'Sortie longue', 40, 'long', ['Vers 5 km à allure facile.'])],
    run: { minutes: { easy: [25, 35], tempo: [25, 35], long: [30, 45] }, intervalText: { tempo: '3 × 5 min à allure objectif, récupération 2 min trot' } },
    progression: 'La sortie longue approche 5 km vers la semaine 7 ; la dernière semaine est allégée avant l’objectif.', recovery: 'Repos la veille de la course ; sortie de récupération en cas de vigilance.', tags: ['5 km', 'objectif'] },
  { id: 'prog.course.10km', v: 1, name: 'Préparer un 10 km', category: 'run', goals: ['run', 'endurance'], description: 'Dix semaines pour franchir 10 km en sécurité.', why: 'Le volume monte lentement et la sortie longue construit la distance, avec des semaines plus légères pour assimiler.',
    levels: ['intermediate', 'advanced'], weeks: 10, perWeek: 3, minutesPerSession: 45, equipment: ['none', 'home', 'gym'],
    split: [R('r1', 'Sortie facile', 40, 'easy', ['Allure de conversation.']), R('r2', 'Tempo ou fractionné', 40, 'tempo', ['Un bloc à allure soutenue entre échauffement et retour au calme.']), R('r3', 'Sortie longue', 60, 'long', ['Départ lent, constance sur toute la durée.'])],
    run: { minutes: { easy: [35, 50], tempo: [35, 50], long: [50, 80] }, intervalText: { tempo: '2 × 10 min allure tempo, récupération 3 min' } },
    progression: 'Moins de 10 % d’augmentation d’une semaine à l’autre en moyenne, avec une semaine allégée toutes les quatre semaines.', recovery: 'Jamais deux séances dures de suite ; en vigilance ou alerte Level allège ou propose du repos.', tags: ['10 km', 'objectif'] },
  { id: 'prog.course.longues', v: 1, name: 'Sorties longues', category: 'run', goals: ['run', 'endurance'], description: 'Huit semaines pour allonger progressivement votre sortie longue.', why: 'Si vous courez déjà un peu, ce programme ajoute de la durée sans ajouter d’intensité.',
    levels: ['intermediate', 'advanced'], weeks: 8, perWeek: 2, minutesPerSession: 55, equipment: ['none', 'home', 'gym'],
    split: [R('r1', 'Sortie facile', 40, 'easy', ['Allure de conversation.']), R('r2', 'Sortie longue', 70, 'long', ['Emportez de l’eau ; départ lent.'])],
    run: { minutes: { easy: [35, 45], long: [60, 100] } },
    progression: 'La sortie longue gagne quelques minutes par semaine, allégée toutes les quatre semaines.', recovery: 'Lendemain d’une sortie longue : repos ou marche.', tags: ['longue distance'] },
  { id: 'prog.course.reprise', v: 1, name: 'Reprendre progressivement la course', category: 'run', goals: ['restart', 'run'], description: 'Six semaines pour retrouver vos sorties après une pause.', why: 'Après une interruption, les muscles reviennent plus vite que les tendons : on reprend court et facile.',
    levels: ['beginner', 'intermediate', 'advanced'], weeks: 6, perWeek: 3, minutesPerSession: 25, equipment: ['none', 'home', 'gym'],
    split: [R('r1', 'Sortie très facile', 20, 'recovery', ['Plus lent que d’habitude.']), R('r2', 'Sortie facile', 25, 'easy', ['Alternez marche et course si besoin.']), R('r3', 'Sortie facile', 30, 'easy', ['Terrain plat.'])],
    run: { minutes: { recovery: [15, 25], easy: [20, 35] } },
    progression: 'Durée en hausse très progressive ; aucune intensité avant la semaine 5.', recovery: 'Toute gêne persistante : arrêtez et passez par Récupération.', tags: ['reprise'] },

  // ── Mixtes ───────────────────────────────────────────────────
  { id: 'prog.mixte.muscu-course', v: 1, name: 'Musculation et course', category: 'mixed', goals: ['muscle', 'endurance', 'run', 'fitness'], description: 'Deux séances de musculation et deux sorties de course par semaine.', why: 'Alterner force et endurance permet de progresser sur les deux sans surcharger : les sorties restent faciles les jours de jambes.',
    levels: ['intermediate'], weeks: 10, perWeek: 4, minutesPerSession: 45, equipment: ['home', 'gym'],
    split: [S('a', 'Musculation — haut du corps', 45, ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps'], G3, CUE_TECH), R('r1', 'Course facile', 35, 'easy', ['Allure de conversation.']), S('b', 'Musculation — bas du corps', 45, ['quadriceps', 'ischios', 'fessiers', 'abdominaux'], G3, CUE_TECH), R('r2', 'Sortie longue', 50, 'long', ['Départ lent.'])],
    run: { minutes: { easy: [30, 40], long: [40, 60] } },
    progression: 'Une seule des deux familles progresse nettement à la fois ; l’autre est maintenue.', recovery: 'La sortie facile suit la séance de jambes avec un jour de marge ; en vigilance, Level remplace une séance par du repos.', tags: ['mixte', 'force et endurance'] },
  { id: 'prog.mixte.condition', v: 1, name: 'Condition physique générale', category: 'mixed', goals: ['fitness', 'restart', 'endurance'], description: 'Trois séances variées : corps entier, sortie facile et circuit.', why: 'Pour rester en forme sans spécialisation : un peu de force, un peu d’endurance, un peu de cardio.',
    levels: ['beginner', 'intermediate'], weeks: 8, perWeek: 3, minutesPerSession: 35, equipment: ['none', 'home', 'gym'],
    split: [S('a', 'Corps entier', 35, ['quadriceps', 'dos', 'pectoraux', 'abdominaux'], G3, CUE_TECH), R('r1', 'Sortie facile', 30, 'easy', ['Allure de conversation.']), H('h1', 'Circuit full-body', 20)],
    run: { minutes: { easy: [25, 35] } },
    progression: 'Chaque famille progresse doucement ; le circuit reste court et respecte les préférences de votre profil.', recovery: 'Le circuit n’est proposé qu’en récupération normale.', tags: ['forme', 'varié'] },
  { id: 'prog.mixte.muscle-endurance', v: 1, name: 'Muscle et endurance', category: 'mixed', goals: ['muscle', 'endurance'], description: 'Trois séances de musculation et une sortie d’endurance par semaine.', why: 'La musculation reste prioritaire ; une sortie facile entretient le cardio sans gêner la récupération.',
    levels: ['intermediate', 'advanced'], weeks: 10, perWeek: 4, minutesPerSession: 50, equipment: ['home', 'gym'],
    split: [S('a', 'Haut du corps', 50, ['pectoraux', 'dos', 'epaules'], G4, CUE_TECH), S('b', 'Bas du corps', 50, ['quadriceps', 'ischios', 'fessiers'], G4, CUE_TECH), R('r1', 'Sortie d’endurance', 40, 'easy', ['Allure de conversation.']), S('c', 'Mixte', 50, ['dos', 'pectoraux', 'biceps', 'triceps', 'abdominaux'], G4, CUE_TECH)],
    run: { minutes: { easy: [30, 45] } },
    progression: 'Volume de musculation stable pendant que la sortie s’allonge, puis l’inverse.', recovery: 'La sortie d’endurance est toujours facile ; elle saute en cas de vigilance.', tags: ['mixte'] },
  { id: 'prog.mixte.equilibre', v: 1, name: 'Programme équilibré', category: 'mixed', goals: ['fitness', 'muscle', 'endurance', 'restart'], description: 'Trois séances par semaine : force, course et mobilité active.', why: 'Un équilibre simple pour s’entraîner toute l’année sans y penser.',
    levels: ['beginner', 'intermediate'], weeks: 8, perWeek: 3, minutesPerSession: 40, equipment: ['none', 'home', 'gym'],
    split: [S('a', 'Force — corps entier', 40, ['quadriceps', 'dos', 'pectoraux', 'fessiers'], G3, CUE_TECH), R('r1', 'Course facile', 30, 'easy', ['Allure de conversation.']), S('b', 'Force — tronc et épaules', 40, ['abdominaux', 'epaules', 'ischios', 'dos'], G3, CUE_TECH)],
    run: { minutes: { easy: [25, 40] } },
    progression: 'Progression douce et régulière, sans jamais dépasser trois séances par semaine.', recovery: 'Trois séances réparties dans la semaine ; Level propose du repos dès que la récupération l’exige.', tags: ['équilibré'] },
]

export const programById = (id: string) => PROGRAMS.find((p) => p.id === id)

// ── Course : minutes par semaine ──────────────────────────────────────────
/** Minutes cibles d'une sortie à la semaine `week` (1 = première) : interpolation linéaire, semaine allégée toutes les quatre semaines. */
export function runMinutes(t: ProgramTemplate, family: RunFamily, week: number): number | null {
  const r = t.run?.minutes[family]
  if (!r) return null
  const w = Math.min(Math.max(week, 1), t.weeks)
  const at = (k: number) => r[0] + ((r[1] - r[0]) * (k - 1)) / Math.max(1, t.weeks - 1)
  const base = Math.round(at(w))
  if (w % 4 === 0 && w < t.weeks) return Math.round(at(w - 1) * 0.8)
  return base
}
/** Charge hebdomadaire de course (minutes) d'une rotation complète à la semaine donnée */
export function weeklyRunMinutes(t: ProgramTemplate, week: number): number {
  return t.split.filter((s) => s.kind === 'run').reduce((n, s) => n + (runMinutes(t, s.runFamily!, week) ?? s.minutes), 0)
}
export const sessionMinutes = (t: ProgramTemplate, s: ProgramSessionDef, week: number, override?: number | null) =>
  s.kind === 'run' ? runMinutes(t, s.runFamily!, week) ?? s.minutes : override ?? s.minutes

/** Exigence d'un jour donné pour un programme de course : texte de consigne précis (semaines d'initiation, fractionné, tempo) */
export function runInstruction(t: ProgramTemplate, s: ProgramSessionDef, week: number): string {
  const w = Math.min(Math.max(week, 1), t.weeks)
  if (t.run?.weekText?.[w - 1]) return t.run.weekText[w - 1]
  const f = s.runFamily ? t.run?.intervalText?.[s.runFamily] : undefined
  return f ?? `${RUN_FAMILY_LABEL[s.runFamily!]} · ${runMinutes(t, s.runFamily!, w) ?? s.minutes} min à allure facile`
}

// ── Instance : le programme ACTIVÉ par l'utilisateur ─────────────────────
export interface ProgramInstance {
  templateId: string
  templateVersion: number
  name: string
  startedAt: string
  level: Experience
  equipment: EquipmentProfile
  perWeek: number
  /** Jours disponibles (0 = lundi … 6 = dimanche) ; vide = souple */
  days: number[]
  /** Durée par séance de musculation choisie (minutes) ; null = celle du modèle */
  minutes: number | null
  /** Copie du plan du modèle au moment de l'activation : modifier l'instance ne change jamais le catalogue */
  split: ProgramSessionDef[]
  weeks: number
}
export interface ProgramState { active: ProgramInstance | null; history: Array<{ templateId: string; name: string; startedAt: string; endedAt: string; sessionsDone: number }> }
export const EMPTY_PROGRAM_STATE: ProgramState = { active: null, history: [] }

export function sanitizeProgramState(v: unknown): ProgramState {
  const o = (v ?? {}) as Partial<ProgramState>
  const a = o.active
  const ok = a && typeof a === 'object' && typeof a.templateId === 'string' && Array.isArray(a.split) && a.split.length > 0 && typeof a.startedAt === 'string'
  return { active: ok ? (a as ProgramInstance) : null, history: Array.isArray(o.history) ? o.history : [] }
}
/** Instance active seule (pour l'état d'application) */
export const sanitizeProgram = (v: unknown): ProgramInstance | null => sanitizeProgramState(v).active

export interface ProgramAnswers { goal: ProgramGoal; level: Experience; perWeek: number; days: number[]; minutes: number; equipment: EquipmentProfile }

export function instanceFrom(t: ProgramTemplate, a: Pick<ProgramAnswers, 'level' | 'perWeek' | 'days' | 'minutes' | 'equipment'>, now: Date): ProgramInstance {
  return {
    templateId: t.id, templateVersion: t.v, name: t.name, startedAt: now.toISOString(), level: a.level, equipment: a.equipment,
    perWeek: Math.max(1, Math.min(a.perWeek, t.split.length + 1)), days: [...a.days].sort(), minutes: a.minutes === t.minutesPerSession ? null : a.minutes,
    split: t.split.map((s) => ({ ...s, cues: [...s.cues], focus: s.focus ? [...s.focus] : undefined })), weeks: t.weeks,
  }
}

// ── Recommandation ───────────────────────────────────────────────────────
export interface Recommendation { template: ProgramTemplate; score: number; fit: 'ideal' | 'good' | 'possible'; reasons: string[]; cautions: string[] }
const LEVELS: Experience[] = ['beginner', 'intermediate', 'advanced']

/** Classe les programmes selon les réponses : objectif, niveau, matériel, fréquence et durée. Pure et déterministe. Jamais de programme exigeant pour un débutant. */
export function recommendPrograms(a: ProgramAnswers, list: ProgramTemplate[] = PROGRAMS): Recommendation[] {
  const out: Recommendation[] = []
  for (const t of list) {
    if (!t.equipment.includes(a.equipment)) continue
    const li = LEVELS.indexOf(a.level)
    const levelOk = t.levels.includes(a.level)
    const tooHard = a.level === 'beginner' && !t.levels.includes('beginner')
    if (tooHard) continue
    let score = 0; const reasons: string[] = []; const cautions: string[] = []
    const gi = t.goals.indexOf(a.goal)
    if (gi >= 0) { score += 10 - gi * 2 + ((a.goal === 'muscle' || a.goal === 'strength') && t.category === 'strength' ? 1 : a.goal === 'run' && t.category === 'run' ? 1 : 0); reasons.push(`Il répond à votre objectif : ${PROGRAM_GOAL_LABEL[a.goal].toLowerCase()}.`) } else continue
    if (levelOk) { score += 4 + (t.levels.length === 1 ? 2 : 0); reasons.push(`Adapté à votre niveau (${t.levels.map((l) => ({ beginner: 'débutant', intermediate: 'intermédiaire', advanced: 'avancé' }[l])).join(' ou ')}).`) } else {
      const dist = Math.min(...t.levels.map((l) => Math.abs(LEVELS.indexOf(l) - li))); score -= dist * 3
      cautions.push(a.level === 'advanced' ? 'Un peu simple pour votre niveau : vous progresserez avec des charges plus lourdes.' : 'Un peu exigeant pour votre niveau : avancez prudemment.')
    }
    const dFreq = Math.abs(t.perWeek - a.perWeek)
    score -= dFreq * 2
    if (dFreq === 0) reasons.push(`Il correspond à vos ${a.perWeek} séances par semaine.`)
    else if (t.perWeek > a.perWeek) cautions.push(`Il prévoit ${t.perWeek} séances par semaine : vous en visez ${a.perWeek}. Vous pourrez avancer à votre rythme.`)
    else reasons.push(`Il demande ${t.perWeek} séances par semaine : vous avez de la marge.`)
    const dMin = t.minutesPerSession - a.minutes
    if (dMin > 15) { score -= 2; cautions.push(`Séances d’environ ${t.minutesPerSession} min : plus longues que votre durée habituelle.`) }
    out.push({ template: t, score, fit: score >= 12 ? 'ideal' : score >= 6 ? 'good' : 'possible', reasons, cautions })
  }
  return out.sort((x, y) => y.score - x.score || x.template.name.localeCompare(y.template.name))
}

// ── Profil : ce que l'activation change (annoncé avant confirmation) ─────
export function profilePatchFor(inst: ProgramInstance, current: SportProfile): Partial<Omit<SportProfile, 'id'>> {
  const strength = inst.split.filter((s) => s.kind !== 'run')
  const runs = inst.split.filter((s) => s.kind === 'run')
  const goals = new Set(current.goals)
  const t = programById(inst.templateId)
  if (t) for (const g of t.goals.slice(0, 1)) goals.add(({ muscle: 'muscle', strength: 'strength', endurance: 'endurance', run: 'endurance', fitness: 'health', restart: 'health' } as const)[g])
  const focusCount = new Map<MuscleGroup, number>()
  for (const s of strength) for (const m of s.focus ?? []) focusCount.set(m, (focusCount.get(m) ?? 0) + 1)
  const prios: SportProfile['musclePriorities'] = {}
  for (const [m, n] of focusCount) prios[m] = n >= 2 ? 'develop' : 'progress'
  const share = (n: number) => Math.max(n ? 1 : 0, Math.round((inst.perWeek * n) / Math.max(1, inst.split.length)))
  return {
    experience: inst.level, equipmentProfile: inst.equipment, goals: [...goals], musclePriorities: prios, sessionMinutes: inst.minutes ?? t?.minutesPerSession ?? 45,
    availability: { days: inst.days, strengthPerWeek: share(strength.length), runsPerWeek: share(runs.length) },
    runFamilies: runs.length ? [...new Set(runs.map((r) => r.runFamily!))] : current.runFamilies,
  }
}

// ── Prochaine séance ─────────────────────────────────────────────────────
export type NextState = 'ready' | 'lighter' | 'blocked' | 'done-today' | 'week-done' | 'finished'
export interface NextProgramSession {
  state: NextState
  index: number
  session: ProgramSessionDef
  week: number
  minutes: number
  /** Séances du programme déjà terminées cette semaine (lundi → dimanche) */
  doneThisWeek: number
  message: string
}

/** Semaine du programme (1 = première). Jamais inférieure à 1 : l'horloge de l'interface peut retarder de quelques instants sur l'activation. */
export const programWeek = (inst: ProgramInstance, now: Date) => Math.max(1, Math.floor((now.getTime() - new Date(inst.startedAt).getTime()) / (7 * 86_400_000)) + 1)

/** Séances terminées appartenant à CE programme (étiquetées à leur création : jamais les séances libres ni celles d'un programme précédent) */
export const programSessions = (inst: ProgramInstance, sessions: SportSession[]) =>
  sessions.filter((s) => s.status === 'completed' && s.programTag?.startedAt === inst.startedAt)

/**
 * Prochaine séance du programme. La séance suivante ne dépend que des séances TERMINÉES : une séance manquée ne s'empile jamais et n'est jamais « rattrapée »
 * (on reprend la rotation). La récupération est prioritaire : alerte = aucune séance ; vigilance = séance allégée ; objectif hebdomadaire atteint = repos.
 */
export function nextProgramSession(inst: ProgramInstance, sessions: SportSession[], recovery: RecoveryState, now: Date): NextProgramSession {
  const done = programSessions(inst, sessions)
  const index = done.length % inst.split.length
  const session = inst.split[index]
  const week = programWeek(inst, now)
  const today = dayKey(now), monday = dayKey(mondayOf(now))
  const doneThisWeek = done.filter((s) => s.date >= monday).length
  const t = programById(inst.templateId)
  const minutes = t ? sessionMinutes(t, session, Math.min(week, inst.weeks), inst.minutes) : session.minutes
  const base = { index, session, week, minutes, doneThisWeek }
  if (week > inst.weeks && done.length >= inst.weeks * inst.perWeek) return { ...base, state: 'finished', message: 'Programme terminé : bravo ! Vous pouvez le recommencer ou en choisir un autre.' }
  if (done.some((s) => s.date === today)) return { ...base, state: 'done-today', message: 'Séance du jour faite. La suivante sera disponible demain.' }
  if (recovery.level === 'ALERTE') return { ...base, state: 'blocked', message: 'Alerte de récupération : aucune séance aujourd’hui. Reposez-vous et refaites le questionnaire demain.' }
  if (doneThisWeek >= inst.perWeek) return { ...base, state: 'week-done', message: `Objectif de la semaine atteint (${inst.perWeek} séances). Le repos fait partie du programme.` }
  if (recovery.level === 'VIGILANCE') return { ...base, state: 'lighter', message: 'Vigilance : la séance sera allégée pour respecter votre récupération.' }
  const planned = inst.days.length && !inst.days.includes((now.getDay() + 6) % 7)
  return { ...base, state: 'ready', message: planned ? 'Ce n’est pas un de vos jours habituels, mais rien ne vous empêche de la faire.' : 'Prête quand vous l’êtes.' }
}

export const describeSession = (s: ProgramSessionDef) =>
  s.kind === 'strength' ? `${(s.focus ?? []).map((m) => MUSCLE_LABEL[m]).join(', ')}` : s.kind === 'run' ? RUN_FAMILY_LABEL[s.runFamily!] : 'Circuit full-body'
