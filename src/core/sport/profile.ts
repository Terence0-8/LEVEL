import type { BodyArea, EquipmentId, EquipmentProfile, Experience, MuscleGroup, PriorityLevel, RunFamily } from './types'
import type { SportSession } from './session'

export type SportGoal = 'muscle' | 'strength' | 'endurance' | 'fatloss' | 'health' | 'mobility'
export const GOAL_LABEL: Record<SportGoal, string> = {
  muscle: 'Prendre du muscle', strength: 'Gagner en force', endurance: 'Améliorer l’endurance', fatloss: 'Perdre du gras', health: 'Rester en forme', mobility: 'Gagner en mobilité',
}

export interface Constraint {
  id: string
  area: BodyArea
  note: string
  since: string
}

export interface SportProfile {
  id: 'me'
  /** Niveau DÉCLARÉ */
  experience: Experience | null
  goals: SportGoal[]
  musclePriorities: Partial<Record<MuscleGroup, PriorityLevel>>
  availability: {
    /** 0 = lundi … 6 = dimanche ; vide = souple (aucun jour imposé) */
    days: number[]
    strengthPerWeek: number
    runsPerWeek: number
  }
  sessionMinutes: number | null
  equipmentProfile: EquipmentProfile
  homeEquipment: EquipmentId[]
  constraints: Constraint[]
  runFamilies: RunFamily[]
  runGoal: string
  allowPushupsInHiit: boolean
  /** Début du cycle adaptatif (clé de semaine ISO) */
  cycleStartWeek: string | null
  updatedAt: string
}

export const DEFAULT_HOME_EQUIPMENT: EquipmentId[] = ['mat', 'bands', 'dumbbells', 'furniture']

/** Profil par défaut : sans matériel, rien d'obligatoire. L'utilisation du module n'est jamais bloquée. */
export function defaultProfile(now = new Date().toISOString()): SportProfile {
  return {
    id: 'me', experience: null, goals: [], musclePriorities: {},
    availability: { days: [], strengthPerWeek: 3, runsPerWeek: 1 },
    sessionMinutes: null, equipmentProfile: 'none', homeEquipment: DEFAULT_HOME_EQUIPMENT, constraints: [],
    runFamilies: ['easy', 'long', 'recovery'], runGoal: 'Améliorer mon endurance générale', allowPushupsInHiit: false,
    cycleStartWeek: null, updatedAt: now,
  }
}

export interface ProfileStep {
  id: string
  label: string
  done: boolean
}

/** Complétude du profil (informative : jamais bloquante). */
export function profileSteps(p: SportProfile): ProfileStep[] {
  return [
    { id: 'experience', label: 'Expérience sportive', done: p.experience !== null },
    { id: 'goals', label: 'Objectifs', done: p.goals.length > 0 },
    { id: 'priorities', label: 'Priorités musculaires', done: Object.keys(p.musclePriorities).length > 0 },
    { id: 'availability', label: 'Disponibilités', done: p.availability.days.length > 0 },
    { id: 'minutes', label: 'Temps par séance', done: p.sessionMinutes !== null },
    { id: 'equipment', label: 'Matériel', done: p.equipmentProfile !== 'none' || p.updatedAt !== '' },
    { id: 'constraints', label: 'Contraintes physiques', done: true },
    { id: 'run', label: 'Objectif de course', done: p.runFamilies.length > 0 },
  ]
}

export const profileCompleteness = (p: SportProfile) => {
  const steps = profileSteps(p)
  return steps.filter((s) => s.done).length / steps.length
}

// ── Niveaux : déclaré / mesuré / opérationnel ───────────────────────────
const ORDER: Experience[] = ['beginner', 'intermediate', 'advanced']
const idx = (e: Experience) => ORDER.indexOf(e)

export const MEASURE_MIN_SESSIONS = 6

/**
 * Niveau MESURÉ : issu des séances réelles (pas des déclarations). Indisponible avant 6 séances.
 * Score provisoire = volume de pratique (50 %) + régularité sur 8 semaines (30 %) + progressions confirmées (20 %).
 */
export function measuredLevel(sessions: SportSession[], confirmedProgressions: number, now: Date): Experience | null {
  const done = sessions.filter((s) => (s.status === 'completed' || s.status === 'partial') && s.kind !== 'other')
  if (done.length < MEASURE_MIN_SESSIONS) return null
  const cutoff = now.getTime() - 8 * 7 * 86_400_000
  const weeks = new Set(done.filter((s) => new Date(s.date + 'T12:00:00').getTime() >= cutoff).map((s) => Math.floor(new Date(s.date + 'T12:00:00').getTime() / (7 * 86_400_000))))
  const score = Math.min(1, done.length / 40) * 0.5 + Math.min(1, weeks.size / 8) * 0.3 + Math.min(1, confirmedProgressions / 6) * 0.2
  return score < 0.25 ? 'beginner' : score < 0.6 ? 'intermediate' : 'advanced'
}

/**
 * Niveau OPÉRATIONNEL : celui qui pilote la génération. Prudent :
 *  - sans mesure : le niveau déclaré, plafonné à « intermédiaire » (« avancé » se prouve) ; débutant par défaut ;
 *  - avec mesure : la mesure, sans dépasser d'un cran le niveau déclaré.
 */
export function operationalLevel(declared: Experience | null, measured: Experience | null): Experience {
  if (!measured) return declared === 'advanced' ? 'intermediate' : declared ?? 'beginner'
  if (!declared) return measured
  return ORDER[Math.min(idx(measured), idx(declared) + 1)]
}
