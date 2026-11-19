/** Types du module SPORT. Aucun import UI ni stockage. */

export const MUSCLE_GROUPS = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'avant_bras', 'abdominaux', 'quadriceps', 'ischios', 'fessiers', 'mollets'] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  pectoraux: 'Pectoraux', dos: 'Dos', epaules: 'Épaules', biceps: 'Biceps', triceps: 'Triceps', avant_bras: 'Avant-bras',
  abdominaux: 'Abdominaux', quadriceps: 'Quadriceps', ischios: 'Ischio-jambiers', fessiers: 'Fessiers', mollets: 'Mollets',
}

/** Familles biomécaniques. */
export type Movement = 'push' | 'pull' | 'flexion' | 'extension' | 'hinge' | 'rotation' | 'stabilisation'
export const MOVEMENT_LABEL: Record<Movement, string> = {
  push: 'Poussée', pull: 'Tirage', flexion: 'Flexion', extension: 'Extension', hinge: 'Charnière de hanche', rotation: 'Rotation', stabilisation: 'Stabilisation',
}

export type EquipmentId = 'furniture' | 'mat' | 'bands' | 'dumbbells' | 'kettlebell' | 'pullup_bar' | 'bench' | 'barbell' | 'rack' | 'machines' | 'cables' | 'dip_bars'
export const EQUIPMENT_LABEL: Record<EquipmentId, string> = {
  furniture: 'Mobilier solide (chaise, table)', mat: 'Tapis (facultatif)', bands: 'Élastiques', dumbbells: 'Haltères', kettlebell: 'Kettlebell', pullup_bar: 'Barre de traction',
  bench: 'Banc', barbell: 'Barre et disques', rack: 'Rack / supports', machines: 'Machines guidées', cables: 'Poulies', dip_bars: 'Barres de dips',
}
export const ALL_EQUIPMENT = Object.keys(EQUIPMENT_LABEL) as EquipmentId[]

export type EquipmentProfile = 'none' | 'home' | 'gym'
export const PROFILE_LABEL: Record<EquipmentProfile, string> = { none: 'Sans matériel', home: 'Domicile', gym: 'Salle' }

/** Zones de contrainte physique (pour écarter les exercices sollicitant la zone). */
export type BodyArea = 'shoulder' | 'elbow' | 'wrist' | 'lower_back' | 'neck' | 'hip' | 'knee' | 'ankle'
export const AREA_LABEL: Record<BodyArea, string> = {
  shoulder: 'Épaule', elbow: 'Coude', wrist: 'Poignet', lower_back: 'Bas du dos', neck: 'Nuque', hip: 'Hanche', knee: 'Genou', ankle: 'Cheville',
}

export type PoseId =
  | 'press_flat' | 'pushup' | 'press_overhead' | 'raise_lateral' | 'row_bent' | 'pull_up' | 'curl' | 'triceps_ext' | 'squat' | 'lunge'
  | 'hinge' | 'bridge' | 'calf' | 'plank' | 'crunch' | 'carry' | 'stretch' | 'cardio' | 'rotation' | 'hang'

export type ExerciseKind = 'strength' | 'mobility' | 'hiit'
export type TrackMode = 'reps' | 'time'

export interface Exercise {
  id: string
  name: string
  primary: MuscleGroup[]
  secondary: MuscleGroup[]
  /** Matériel requis (TOUS). Vide = aucun matériel. */
  equipment: EquipmentId[]
  movement: Movement
  /** 1 débutant · 2 intermédiaire · 3 avancé */
  level: 1 | 2 | 3
  kind: ExerciseKind
  mode: TrackMode
  pose: PoseId
  instructions: string[]
  safety: string[]
  progression: string
  alternatives: string[]
  /** Sans charge externe : la performance se mesure en répétitions ou en durée */
  bodyweight: boolean
  unilateral?: boolean
  /** Pompes classiques : exclues des programmes ordinaires, autorisées seulement dans un circuit HIIT full-body si l'utilisateur le souhaite */
  classicPushup?: boolean
  /** Toute variante de pompes (classiques, inclinées, au mur, en piqué, triceps) : exclue des programmes ordinaires, circuit HIIT full-body seulement, si l'utilisateur l'autorise */
  pushup?: boolean
  hiitOnly?: boolean
  /** Zones sollicitées (filtrage selon les contraintes physiques) */
  stress: BodyArea[]
  /** Pas d'augmentation de charge (kg) */
  loadStepKg?: number
  custom?: boolean
}

export type PriorityLevel = 'develop' | 'progress' | 'maintain'
export const PRIORITY_LABEL: Record<PriorityLevel, string> = { develop: 'Développement', progress: 'Progression', maintain: 'Entretien' }

export type Experience = 'beginner' | 'intermediate' | 'advanced'
export const EXPERIENCE_LABEL: Record<Experience, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé' }

export type RunFamily = 'easy' | 'interval' | 'long' | 'tempo' | 'recovery' | 'hills'
export const RUN_FAMILY_LABEL: Record<RunFamily, string> = {
  easy: 'Endurance fondamentale', interval: 'Fractionné', long: 'Sortie longue', tempo: 'Tempo', recovery: 'Récupération active', hills: 'Côtes',
}
/** Familles « exigeantes » : jamais proposées un jour de vigilance/alerte. */
export const DEMANDING_RUN_FAMILIES: RunFamily[] = ['interval', 'tempo', 'hills']

export type SessionKind = 'strength' | 'run' | 'hiit' | 'mobility' | 'other'
export type SessionStatus = 'planned' | 'active' | 'paused' | 'completed' | 'partial' | 'abandoned'
/** Origine : une séance « organisée » vient du planning ou du générateur ; « imprévue » est une activité libre (sans XP). */
export type SessionOrigin = 'planned' | 'generated' | 'personal' | 'unplanned'

export type Level3 = 0 | 1 | 2 | 3
export type PainLevel = 'none' | 'light' | 'strong'
export type SorenessLevel = 'none' | 'light' | 'moderate' | 'high'
export type SafetyLevel = 'NORMAL' | 'VIGILANCE' | 'ALERTE'
