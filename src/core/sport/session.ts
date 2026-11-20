import type { BodyArea, EquipmentProfile, Level3, MuscleGroup, Movement, PainLevel, RunFamily, SafetyLevel, SessionKind, SessionOrigin, SessionStatus, SorenessLevel } from './types'

/** Une série saisie. Reste rattachée à l'exercice RÉELLEMENT exécuté (jamais convertie vers un autre exercice). */
export interface SetLog {
  n: number
  slotId: string
  exerciseId: string
  reps?: number
  loadKg?: number
  durationSec?: number
  /** Effort perçu 1–10 */
  rpe?: number
  /** Qualité technique 1 (dégradée) – 3 (propre) */
  technique?: 1 | 2 | 3
  pain?: PainLevel
  at: string
}

export interface SlotChoice {
  exerciseId: string
  /** Charge recommandée (null = à déterminer prudemment à la première exposition) */
  loadKg?: number | null
  repsMin: number
  repsMax: number
  /** Cible de durée (exercices chronométrés) */
  durationSec?: number
  restSec: number
  note?: string
}

/** Un emplacement du programme : même objectif musculaire, deux variantes (avec / sans matériel). */
export interface SessionSlot {
  id: string
  group: MuscleGroup
  movement: Movement
  sets: number
  equipment: SlotChoice | null
  bodyweight: SlotChoice | null
  status: 'pending' | 'done' | 'skipped'
  logs: SetLog[]
}

export interface RunInterval {
  distanceKm?: number
  durationSec: number
  restSec?: number
  label?: string
}

export interface RunData {
  family: RunFamily
  distanceKm: number
  durationSec: number
  paceSecPerKm: number
  /** Difficulté ressentie 1–10 */
  rpe: number
  intervals: RunInterval[]
}

export type Variant = 'equipment' | 'bodyweight'

export interface SportSession {
  id: string
  kind: SessionKind
  origin: SessionOrigin
  /** « YYYY-MM-DD » : jour d'accomplissement (déclaré) */
  date: string
  status: SessionStatus
  title: string
  plannedMinutes: number
  variant: Variant
  slots: SessionSlot[]
  startedAt: string | null
  endedAt: string | null
  /** Durée cumulée en pause (ms) ; `pausedAt` si en pause */
  pausedMs: number
  pausedAt: string | null
  /** Fin du repos en cours (horodatage absolu : robuste à l'arrière-plan et à l'écran verrouillé) */
  restEndsAt: string | null
  run?: RunData
  /** Circuit HIIT */
  hiit?: { workSec: number; restSec: number; rounds: number }
  /** Activité imprévue : durée et effort déclarés */
  other?: { minutes: number; rpe: number; muscles: MuscleGroup[] }
  notes: string
  /** Niveau de sécurité de Level au démarrage (ou à l'enregistrement) : conditionne la récompense d'une 2e séance du jour */
  safetyAtStart?: SafetyLevel | null
  /** Pour les séances prévues par le planning mais pas encore détaillées */
  runFamilyPlanned?: RunFamily
  /** Séance issue d'un programme activé (rattachée à l'instance par sa date d'activation) : sert à suivre la rotation, jamais l'XP */
  programTag?: { templateId: string; startedAt: string; index: number }
  createdAt: string
  updatedAt: string
}

export interface RecoveryCheck {
  id: string
  /** « YYYY-MM-DD » */
  day: string
  /** 0 aucune · 1 légère · 2 marquée · 3 forte */
  fatigue: Level3
  /** 0 très mauvaise · 1 moyenne · 2 bonne · 3 très bonne */
  sleep: Level3
  soreness: SorenessLevel
  sorenessAreas: Partial<Record<MuscleGroup, SorenessLevel>>
  pain: PainLevel
  painArea: MuscleGroup | BodyArea | null
  /** Niveau de sécurité calculé à la saisie (conservé pour la traçabilité) */
  safety: SafetyLevel
  index: number
  /** L'utilisateur a choisi de se reposer en suivant la recommandation */
  restChosen: boolean
  at: string
}

export interface ExerciseState {
  exerciseId: string
  workingLoadKg: number | null
  repsMin: number
  repsMax: number
  lastIncreaseAt: string | null
  updatedAt: string
}

export interface ProgressionDecision {
  id: string
  exerciseId: string
  action: 'increase' | 'hold' | 'decrease' | 'recover'
  from: number | null
  to: number | null
  unit: 'kg' | 'reps' | 's' | null
  reason: string
  /** true si l'utilisateur a appliqué la recommandation */
  applied: boolean
  at: string
}

export interface BodyMeasure {
  id: string
  date: string
  weightKg?: number
  waistCm?: number
  chestCm?: number
  armCm?: number
  thighCm?: number
  note?: string
}

export interface EquipmentSetup {
  profile: EquipmentProfile
}
