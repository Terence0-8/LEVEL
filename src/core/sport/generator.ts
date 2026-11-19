import { mondayOf, weekKey } from '../dates'
import { SPORT_CONFIG } from './config'
import type { CycleInfo } from './cycle'
import { EXERCISES, EXERCISE_BY_ID } from './exercises'
import { operationalLevel, type SportProfile } from './profile'
import { isBlocked, type RecoveryState } from './recovery'
import type { ExerciseState, SessionSlot, SlotChoice, SportSession, Variant } from './session'
import { ALL_EQUIPMENT, MUSCLE_GROUPS, type EquipmentId, type Exercise, type MuscleGroup, type PriorityLevel } from './types'

const G = SPORT_CONFIG.generator

export interface Pref { exerciseId: string; status: 'favorite' | 'excluded' | 'avoid_temp'; until?: string | null }

export interface GenInput {
  profile: SportProfile
  prefs: Pref[]
  custom: Exercise[]
  recovery: RecoveryState
  sessions: SportSession[]
  states: ExerciseState[]
  now: Date
  cycle: CycleInfo
  minutes?: number
  /** Force des groupes (choix explicite de l'utilisateur) */
  focus?: MuscleGroup[]
  measured?: import('./types').Experience | null
}

export interface GenResult {
  slots: SessionSlot[]
  minutes: number
  focus: MuscleGroup[]
  hasEquipmentVariant: boolean
  notes: string[]
  unavailable: Array<{ group: MuscleGroup; reason: string }>
}

const LEVEL_NUM = { beginner: 1, intermediate: 2, advanced: 3 } as const
const PRIO_W: Record<PriorityLevel, number> = { develop: 3, progress: 2, maintain: 1 }

/**
 * Matériel disponible selon la variante. « Sans matériel » = AUCUN équipement ni mobilier (le sol suffit ; le tapis est facultatif).
 * « Domicile » ajoute le mobilier solide et le petit matériel choisi ; « Salle » : tout.
 */
export function equipmentFor(profile: SportProfile, variant: Variant): EquipmentId[] {
  if (variant === 'bodyweight') return ['mat']
  if (profile.equipmentProfile === 'gym') return [...ALL_EQUIPMENT]
  if (profile.equipmentProfile === 'home') return [...new Set<EquipmentId>([...profile.homeEquipment, 'furniture', 'mat'])]
  return []
}

export const hasEquipmentVariant = (profile: SportProfile) => profile.equipmentProfile !== 'none'

const isCompound = (e: Exercise) => e.mode === 'reps' && e.primary.length + e.secondary.length >= 3
const allExercises = (custom: Exercise[]) => [...EXERCISES, ...custom]

/** Ensemble des exercices utilisables pour une variante, après préférences, contraintes, récupération et niveau. */
export function usablePool(input: Pick<GenInput, 'profile' | 'prefs' | 'custom' | 'recovery' | 'now' | 'measured'>, variant: Variant): Exercise[] {
  const { profile, prefs, custom, recovery, now } = input
  const eq = new Set(equipmentFor(profile, variant))
  const excluded = new Set(prefs.filter((p) => p.status === 'excluded').map((p) => p.exerciseId))
  const avoided = new Set(prefs.filter((p) => p.status === 'avoid_temp' && (!p.until || new Date(p.until + 'T23:59:59') >= now)).map((p) => p.exerciseId))
  const favorites = new Set(prefs.filter((p) => p.status === 'favorite').map((p) => p.exerciseId))
  const areas = new Set(profile.constraints.map((c) => c.area))
  const maxLevel = LEVEL_NUM[operationalLevel(profile.experience, input.measured ?? null)] + (profile.experience === 'beginner' ? 0 : 0)
  return allExercises(custom).filter((e) =>
    e.kind === 'strength' && !e.hiitOnly && !e.classicPushup &&
    !excluded.has(e.id) && !avoided.has(e.id) &&
    e.equipment.every((q) => eq.has(q)) &&
    !e.stress.some((a) => areas.has(a)) &&
    !isBlocked(e, recovery) &&
    (e.level <= maxLevel + (favorites.has(e.id) ? 1 : 0)),
  )
}

function setsThisWeek(sessions: SportSession[], now: Date, custom: Exercise[]): Record<MuscleGroup, number> {
  const wk = weekKey(now)
  const out = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>
  for (const s of sessions) {
    if (s.status === 'planned' || s.status === 'abandoned' || weekKey(new Date(s.date + 'T12:00:00')) !== wk) continue
    for (const slot of s.slots) for (const l of slot.logs) {
      const ex = EXERCISE_BY_ID[l.exerciseId] ?? custom.find((c) => c.id === l.exerciseId)
      if (!ex) continue
      ex.primary.forEach((g) => { out[g] += 1 })
      ex.secondary.forEach((g) => { out[g] += 0.5 })
    }
  }
  return out
}

function lastTrainedHours(sessions: SportSession[], now: Date, custom: Exercise[]): Record<MuscleGroup, number> {
  const out = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, Infinity])) as Record<MuscleGroup, number>
  for (const s of sessions) {
    if (s.status === 'planned' || s.status === 'abandoned') continue
    const t = new Date(s.endedAt ?? s.startedAt ?? s.date + 'T12:00:00').getTime()
    const h = (now.getTime() - t) / 3_600_000
    for (const slot of s.slots) {
      if (!slot.logs.length) continue
      for (const l of slot.logs) {
        const ex = EXERCISE_BY_ID[l.exerciseId] ?? custom.find((c) => c.id === l.exerciseId)
        ex?.primary.forEach((g) => { out[g] = Math.min(out[g], h) })
      }
    }
  }
  return out
}

function repRange(ex: Exercise, st: ExerciseState | undefined): [number, number] {
  if (st) return [st.repsMin, st.repsMax]
  if (ex.bodyweight) return [...G.repRange.bodyweight] as [number, number]
  return (isCompound(ex) ? [...G.repRange.compound] : [...G.repRange.isolation]) as [number, number]
}

function choiceFor(ex: Exercise, states: ExerciseState[], cycle: CycleInfo, history: Set<string>): SlotChoice {
  const st = states.find((s) => s.exerciseId === ex.id)
  const [repsMin, repsMax] = repRange(ex, st)
  const restSec = ex.mode === 'time' ? G.restSec.time : ex.bodyweight ? G.restSec.bodyweight : isCompound(ex) ? G.restSec.compound : G.restSec.isolation
  const load = !ex.bodyweight && st?.workingLoadKg ? Math.round(st.workingLoadKg * cycle.loadFactor * 2) / 2 : null
  return {
    exerciseId: ex.id, loadKg: ex.bodyweight ? undefined : load, repsMin, repsMax,
    durationSec: ex.mode === 'time' ? Math.round((G.timeTargetSec[0] + G.timeTargetSec[1]) / 2) : undefined, restSec,
    note: !history.has(ex.id) && !ex.bodyweight && !st?.workingLoadKg
      ? `Première exposition : choisissez une charge très facile (au moins ${SPORT_CONFIG.generator.firstExposureRir} répétitions en réserve). Le test reste non maximal.`
      : !history.has(ex.id) && ex.bodyweight ? 'Première exposition : arrêtez-vous 3 répétitions avant l’échec, pour mesurer votre niveau sans risque.' : undefined,
  }
}

/** Génère une séance de musculation adaptative. Aucun split fixe. Pur. */
export function generateStrengthSession(input: GenInput): GenResult {
  const { profile, recovery, sessions, states, now, cycle, custom } = input
  const notes: string[] = []
  const unavailable: GenResult['unavailable'] = []
  const eqVariant = hasEquipmentVariant(profile)
  const bwPool = usablePool(input, 'bodyweight')
  const eqPool = eqVariant ? usablePool(input, 'equipment') : []
  const favorites = new Set(input.prefs.filter((p) => p.status === 'favorite').map((p) => p.exerciseId))
  const done = new Set(sessions.flatMap((s) => s.slots.flatMap((sl) => sl.logs.map((l) => l.exerciseId))))
  const recentUse = new Map<string, number>()
  sessions.filter((s) => s.kind === 'strength' && s.status !== 'planned').slice(-3).forEach((s) => s.slots.forEach((sl) => sl.logs.forEach((l) => recentUse.set(l.exerciseId, (recentUse.get(l.exerciseId) ?? 0) + 1))))

  const vf = Math.min(recovery.volumeFactor, cycle.volumeFactor)
  const minutes = input.minutes ?? profile.sessionMinutes ?? 45
  if (vf <= 0) return { slots: [], minutes: 0, focus: [], hasEquipmentVariant: eqVariant, notes: ['Récupération insuffisante : aucune séance de musculation n’est proposée aujourd’hui.'], unavailable }
  const target = Math.max(G.minExercises, Math.min(G.maxExercises, Math.floor((minutes * vf) / G.minutesPerExercise)))

  const week = setsThisWeek(sessions, now, custom)
  const since = lastTrainedHours(sessions, now, custom)
  const scores = new Map<MuscleGroup, number>()
  for (const g of MUSCLE_GROUPS) {
    const prio: PriorityLevel = profile.musclePriorities[g] ?? 'maintain'
    const need = Math.max(0, G.weeklySets[prio] - week[g]) / G.weeklySets[prio]
    const rested = since[g] >= G.minHoursBetweenSameGroup && recovery.localFatigue[g] < G.localFatigueMax
    const hasPool = eqPool.some((e) => e.primary.includes(g)) || bwPool.some((e) => e.primary.includes(g))
    if (!hasPool) { unavailable.push({ group: g, reason: 'Aucun exercice utilisable (matériel, exclusions ou contraintes).' }); continue }
    if (input.focus?.length) { if (input.focus.includes(g)) scores.set(g, 10 + PRIO_W[prio]); continue }
    if (!rested) continue
    const freshness = Math.min(1, (Number.isFinite(since[g]) ? since[g] : 240) / 120)
    scores.set(g, PRIO_W[prio] * need * 3 + freshness)
  }

  const used = new Set<string>()
  const slots: SessionSlot[] = []
  const focus: MuscleGroup[] = []
  const pick = (pool: Exercise[], g: MuscleGroup, avoidMovement?: string, wantMovement?: string): Exercise | undefined =>
    pool
      .filter((e) => e.primary.includes(g) && !used.has(e.id))
      .sort((a, b) =>
        (favorites.has(b.id) ? 3 : 0) - (favorites.has(a.id) ? 3 : 0) +
        (wantMovement ? ((b.movement === wantMovement ? 2 : 0) - (a.movement === wantMovement ? 2 : 0)) : 0) +
        (avoidMovement ? ((a.movement === avoidMovement ? 2 : 0) - (b.movement === avoidMovement ? 2 : 0)) : 0) +
        ((recentUse.get(a.id) ?? 0) - (recentUse.get(b.id) ?? 0)) * 0.5 +
        (Number(isCompound(b)) - Number(isCompound(a))) || a.id.localeCompare(b.id))[0]

  const live = new Map(scores)
  for (let i = 0; i < target && live.size; i++) {
    const [g] = [...live.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    const priorMove = slots.filter((s) => s.group === g).map((s) => (s.equipment ?? s.bodyweight)!.exerciseId).map((id) => EXERCISE_BY_ID[id]?.movement ?? custom.find((c) => c.id === id)?.movement)[0]
    const main = eqVariant ? pick(eqPool, g, priorMove) ?? pick(bwPool, g, priorMove) : pick(bwPool, g, priorMove)
    if (!main) { live.delete(g); continue }
    const inEq = eqVariant && eqPool.includes(main)
    const other = inEq ? pick(bwPool, g, undefined, main.movement) : eqVariant ? pick(eqPool, g, undefined, main.movement) : undefined
    const eqEx = inEq ? main : eqVariant ? other : undefined
    const bwEx = inEq ? other : main
    ;[eqEx, bwEx].forEach((e) => e && used.add(e.id))
    const prio = profile.musclePriorities[g] ?? 'maintain'
    const baseSets = G.setsPerExercise[operationalLevel(profile.experience, input.measured ?? null)] - (prio === 'maintain' ? 1 : 0)
    const sets = Math.max(1, Math.round(baseSets * cycle.volumeFactor * (recovery.volumeFactor || 1)))
    slots.push({
      id: `slot-${slots.length + 1}-${g}`, group: g, movement: main.movement, sets,
      equipment: eqEx ? choiceFor(eqEx, states, cycle, done) : null,
      bodyweight: bwEx ? choiceFor(bwEx, states, cycle, done) : null,
      status: 'pending', logs: [],
    })
    if (!focus.includes(g)) focus.push(g)
    live.set(g, (live.get(g) ?? 0) * 0.55)
  }

  // Équilibre poussée / tirage : si poussée sans aucun tirage, on remplace la dernière poussée par un tirage du dos si possible.
  const hasPush = slots.some((s) => s.movement === 'push')
  const hasPull = slots.some((s) => s.movement === 'pull')
  if (hasPush && !hasPull && slots.length >= 3 && !recovery.blocked.some((b) => b.muscle === 'dos')) {
    const mainPool = eqVariant ? eqPool : bwPool
    const back = pick(mainPool, 'dos') ?? pick(bwPool, 'dos')
    if (back) {
      const i = slots.map((s) => s.movement).lastIndexOf('push')
      const inEq = eqVariant && eqPool.includes(back)
      const other = inEq ? pick(bwPool, 'dos', undefined, back.movement) : eqVariant ? pick(eqPool, 'dos', undefined, back.movement) : undefined
      slots[i] = { ...slots[i], id: `slot-${i + 1}-dos`, group: 'dos', movement: back.movement,
        equipment: (inEq ? back : other) ? choiceFor((inEq ? back : other)!, states, cycle, done) : null,
        bodyweight: (inEq ? other : back) ? choiceFor((inEq ? other : back)!, states, cycle, done) : null }
      if (!focus.includes('dos')) focus.push('dos')
      notes.push('Séance équilibrée : un tirage du dos remplace une poussée supplémentaire.')
    }
  }

  slots.sort((a, b) => {
    const ea = EXERCISE_BY_ID[(a.equipment ?? a.bodyweight)!.exerciseId] ?? custom.find((c) => c.id === (a.equipment ?? a.bodyweight)!.exerciseId)
    const eb = EXERCISE_BY_ID[(b.equipment ?? b.bodyweight)!.exerciseId] ?? custom.find((c) => c.id === (b.equipment ?? b.bodyweight)!.exerciseId)
    return Number(!!eb && isCompound(eb)) - Number(!!ea && isCompound(ea))
  })
  slots.forEach((s, i) => { s.id = `slot-${i + 1}-${s.group}` })

  if (recovery.level === 'VIGILANCE') notes.push('Vigilance : volume réduit, pas d’augmentation de charge.')
  if (cycle.phase !== 'development') notes.push(`Phase « ${cycle.phase === 'deload' ? 'allègement' : cycle.phase === 'consolidation' ? 'consolidation' : 'reprise'} » : volume et charges adaptés.`)
  if (!slots.length) notes.push('Aucun groupe musculaire n’est disponible (récupération en cours, exclusions ou matériel). Une séance de mobilité ou une pause est conseillée.')
  return { slots, minutes: estimateMinutes(slots), focus, hasEquipmentVariant: eqVariant, notes, unavailable }
}

export function estimateMinutes(slots: SessionSlot[]): number {
  const sec = slots.reduce((n, s) => { const c = s.equipment ?? s.bodyweight; return n + (c ? s.sets * (45 + c.restSec) : 0) }, 0)
  return Math.round(sec / 60 + 4)
}

/** Circuit HIIT full-body. Les pompes classiques n'y entrent que si l'utilisateur l'a autorisé. */
export function generateHiit(profile: SportProfile, recovery: RecoveryState, minutes = 20): { slots: SessionSlot[]; hiit: { workSec: number; restSec: number; rounds: number }; notes: string[] } {
  const pool = EXERCISES.filter((e) => e.kind === 'hiit' && (!e.classicPushup || profile.allowPushupsInHiit))
    .filter((e) => !isBlocked(e, recovery) && !e.stress.some((a) => profile.constraints.some((c) => c.area === a)))
  const picks = pool.slice(0, 6)
  const workSec = recovery.level === 'VIGILANCE' ? 30 : 40
  const restSec = recovery.level === 'VIGILANCE' ? 30 : 20
  const rounds = Math.max(2, Math.min(4, Math.floor((minutes * 60) / (picks.length * (workSec + restSec)))))
  const slots: SessionSlot[] = picks.map((e, i) => ({
    id: `hiit-${i + 1}`, group: e.primary[0] ?? 'quadriceps', movement: e.movement, sets: rounds, status: 'pending', logs: [],
    equipment: null, bodyweight: { exerciseId: e.id, repsMin: 0, repsMax: 0, durationSec: workSec, restSec },
  }))
  return { slots, hiit: { workSec, restSec, rounds }, notes: profile.allowPushupsInHiit ? ['Les pompes classiques sont incluses dans ce circuit, comme vous l’avez autorisé.'] : ['Les pompes classiques ne sont pas incluses : vous pouvez les autoriser dans votre profil pour les circuits HIIT.'] }
}

/** Alternative proposée quand un exercice est impossible : jamais appliquée durablement sans validation. */
export function suggestAlternative(exerciseId: string, input: Pick<GenInput, 'profile' | 'prefs' | 'custom' | 'recovery' | 'now' | 'measured'>, variant: Variant): Exercise | null {
  const ex = EXERCISE_BY_ID[exerciseId] ?? input.custom.find((c) => c.id === exerciseId)
  if (!ex) return null
  const pool = usablePool(input, variant).filter((e) => e.id !== exerciseId)
  const byList = ex.alternatives.map((id) => pool.find((e) => e.id === id)).find(Boolean)
  return byList ?? pool.find((e) => e.primary.some((g) => ex.primary.includes(g)) && e.movement === ex.movement) ?? pool.find((e) => e.primary.some((g) => ex.primary.includes(g))) ?? null
}

export { mondayOf }
