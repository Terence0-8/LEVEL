import { dayKey, isDayKey, weekKey } from '@/core/dates'
import { openAwards, planAward, planReversal, type XpEvent } from '@/core/ledger'
import { cycleInfo } from '@/core/sport/cycle'
import { EXERCISE_BY_ID } from '@/core/sport/exercises'
import { generateHiit, generateStrengthSession, hasEquipmentVariant, suggestAlternative, type Pref } from '@/core/sport/generator'
import { defaultProfile, measuredLevel, type SportProfile } from '@/core/sport/profile'
import { planWeek } from '@/core/sport/planner'
import { evaluateRecovery, isBlocked, type RecoveryState } from '@/core/sport/recovery'
import type { Recommendation } from '@/core/sport/progression'
import { buildRun, type RunInput } from '@/core/sport/running'
import type { BodyMeasure, ExerciseState, ProgressionDecision, RecoveryCheck, SessionSlot, SetLog, SportSession, Variant } from '@/core/sport/session'
import type { BodyArea, Exercise, Level3, MuscleGroup, PainLevel, SorenessLevel } from '@/core/sport/types'
import { completion, desiredSportAwards, isFinished, SPORT_KEY_PREFIX } from '@/core/sport/xp'
import { db, type LevelDB } from './db'
import type { ServiceDeps } from './questService'

/**
 * Commandes SPORT. Chaque commande est UNE transaction IndexedDB ; les performances sont enregistrées immédiatement
 * (sauvegarde après chaque série). L'XP passe EXCLUSIVEMENT par le journal `xpEvents` via `syncXp`.
 */
export type SportErrorCode = 'not_found' | 'invalid' | 'alert' | 'nothing_available' | 'in_use' | 'invalid_date' | 'blocked' | 'bad_state'
export class SportError extends Error {
  constructor(public code: SportErrorCode, message: string) { super(message) }
}

const defaultDeps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }

export interface CheckInput {
  fatigue: Level3
  sleep: Level3
  soreness: SorenessLevel
  sorenessAreas?: Partial<Record<MuscleGroup, SorenessLevel>>
  pain: PainLevel
  painArea?: MuscleGroup | BodyArea | null
}

export interface SetInput {
  exerciseId: string
  reps?: number
  loadKg?: number
  durationSec?: number
  rpe?: number
  technique?: 1 | 2 | 3
  pain?: PainLevel
}

export function createSportService(database: LevelDB = db, deps: ServiceDeps = defaultDeps) {
  const { now, id } = deps
  const stores = () => [database.sportProfile, database.exercisePrefs, database.customExercises, database.sportSessions, database.recoveryChecks, database.exerciseStates, database.progressionLog, database.bodyMeasures, database.xpEvents]
  const tx = <T>(fn: () => Promise<T>) => database.transaction('rw', stores(), fn)
  const stamp = () => now().toISOString()
  const today = () => dayKey(now())

  async function profile(): Promise<SportProfile> { return (await database.sportProfile.get('me')) ?? defaultProfile(stamp()) }

  async function context() {
    const [prof, prefs, custom, sessions, checks, states, decisions] = await Promise.all([
      profile(), database.exercisePrefs.toArray(), database.customExercises.toArray(), database.sportSessions.toArray(),
      database.recoveryChecks.toArray(), database.exerciseStates.toArray(), database.progressionLog.toArray(),
    ])
    const n = now()
    const recovery = evaluateRecovery({ checks, sessions, now: n, today: dayKey(n), custom })
    const cycle = cycleInfo(prof.cycleStartWeek, n)
    const measured = measuredLevel(sessions, decisions.filter((d) => d.applied && d.action === 'increase').length, n)
    return { prof, prefs, custom, sessions, checks, states, decisions, recovery, cycle, measured, now: n }
  }

  async function getSession(sid: string): Promise<SportSession> {
    const s = await database.sportSessions.get(sid)
    if (!s) throw new SportError('not_found', 'Séance introuvable.')
    return s
  }
  const save = async (s: SportSession) => { s.updatedAt = stamp(); await database.sportSessions.put(s); return s }

  // ── Synchronisation de l'XP SPORT avec le journal (recalcul déterministe) ─────
  async function syncXpUnsafe() {
    const [prof, sessions, checks, decisions, custom] = await Promise.all([profile(), database.sportSessions.toArray(), database.recoveryChecks.toArray(), database.progressionLog.toArray(), database.customExercises.toArray()])
    const desired = new Map(desiredSportAwards({ sessions, checks, decisions, profile: prof, custom }).map((d) => [d.key, d]))
    let events = await database.xpEvents.where('awardKey').startsWith(SPORT_KEY_PREFIX).toArray()
    const at = now()
    let reversed = 0, awarded = 0
    for (const [key, ev] of openAwards(events)) {
      const d = desired.get(key)
      if (d && d.amount === ev.amount && d.attribute === ev.attribute && d.at === ev.at) continue
      const plan = planReversal(events, key, { id: id(), at: at.toISOString(), reason: d ? 'Recalcul après correction de l’historique sportif' : 'Séance ou élément corrigé, modifié ou supprimé : XP retirée' })
      if (!plan.ok) continue
      await database.xpEvents.add(plan.value.reversal)
      await database.xpEvents.update(plan.value.originalId, { status: 'reversed', reversedByEventId: plan.value.reversal.id })
      events = [...events.map((e) => (e.id === plan.value.originalId ? { ...e, status: 'reversed' as const, reversedByEventId: plan.value.reversal.id } : e)), plan.value.reversal]
      reversed++
    }
    const openNow = openAwards(events)
    for (const d of desired.values()) {
      if (openNow.has(d.key)) continue
      const plan = planAward(events, {
        id: id(), source: 'activity', sourceId: d.sourceId, questId: null, stepId: null, awardKey: d.key, cycleKey: d.cycleKey, domain: 'SPORT',
        categoryId: null, attribute: d.attribute, amount: d.amount, baseAmount: d.amount, micro: false, at: d.at, recordedAt: at.toISOString(),
        retroactive: dayKey(new Date(d.at)) < dayKey(at), credit: null, percent: null, durationMinutes: null, note: '', reason: d.reason, label: d.label,
      })
      if (!plan.ok) continue
      await database.xpEvents.add(plan.value)
      events = [...events, plan.value]
      awarded++
    }
    return { awarded, reversed }
  }

  const api = {
    // ── Profil et préférences ───────────────────────────────────
    getProfile: profile,
    /** Met à jour le profil. Une fonction reçoit la DERNIÈRE version enregistrée : des modifications rapides ne s'écrasent jamais. */
    saveProfile: (patch: Partial<Omit<SportProfile, 'id'>> | ((current: SportProfile) => Partial<Omit<SportProfile, 'id'>>)) => tx(async () => {
      const cur = await profile()
      const p = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch), id: 'me' as const, updatedAt: stamp() }
      if (p.availability.strengthPerWeek < 0 || p.availability.strengthPerWeek > 7 || p.availability.runsPerWeek < 0 || p.availability.runsPerWeek > 7) throw new SportError('invalid', 'Fréquence hebdomadaire : de 0 à 7.')
      if (p.sessionMinutes !== null && (p.sessionMinutes < 10 || p.sessionMinutes > 180)) throw new SportError('invalid', 'Durée par séance : de 10 à 180 minutes.')
      await database.sportProfile.put(p)
      return p
    }),
    setPref: (exerciseId: string, status: Pref['status'] | null, until?: string | null) => tx(async () => {
      if (status === null) await database.exercisePrefs.delete(exerciseId)
      else {
        if (status === 'avoid_temp' && until && !isDayKey(until)) throw new SportError('invalid_date' as SportErrorCode, 'Date invalide.')
        await database.exercisePrefs.put({ exerciseId, status, until: status === 'avoid_temp' ? until ?? null : null })
      }
    }),
    saveCustomExercise: (input: Omit<Exercise, 'id' | 'custom' | 'hiitOnly' | 'classicPushup'> & { id?: string }) => tx(async () => {
      const name = input.name.trim()
      if (!name || name.length > 60) throw new SportError('invalid', 'Donnez un nom de 60 caractères maximum.')
      if (!input.primary.length) throw new SportError('invalid', 'Choisissez au moins un muscle principal.')
      const ex: Exercise = { ...input, id: input.id ?? `custom-${id()}`, name, custom: true, hiitOnly: false, classicPushup: false }
      await database.customExercises.put(ex)
      return ex
    }),
    deleteCustomExercise: (exerciseId: string) => tx(async () => {
      const used = (await database.sportSessions.toArray()).some((s) => s.slots.some((sl) => sl.logs.some((l) => l.exerciseId === exerciseId)))
      if (used) throw new SportError('in_use', 'Cet exercice figure dans votre historique : excluez-le plutôt que de le supprimer.')
      await database.customExercises.delete(exerciseId)
      await database.exercisePrefs.delete(exerciseId)
    }),
    startNewCycle: () => tx(async () => api.saveProfile({ cycleStartWeek: weekKey(now()) })),

    // ── Génération des séances ───────────────────────────────────
    generateStrength: (o: { minutes?: number; focus?: MuscleGroup[]; date?: string } = {}) => tx(async () => {
      const c = await context()
      if (c.recovery.level === 'ALERTE') throw new SportError('alert', 'Alerte de récupération : aucune séance de musculation n’est proposée tant que vous ne vous êtes pas réévalué(e).')
      const r = generateStrengthSession({ profile: c.prof, prefs: c.prefs, custom: c.custom, recovery: c.recovery, sessions: c.sessions, states: c.states, now: c.now, cycle: c.cycle, minutes: o.minutes, focus: o.focus, measured: c.measured })
      if (!r.slots.length) throw new SportError('nothing_available', r.notes[0] ?? 'Aucun exercice disponible.')
      const s: SportSession = {
        id: id(), kind: 'strength', origin: 'generated', date: o.date ?? today(), status: 'planned',
        title: `Musculation · ${r.focus.slice(0, 3).join(', ')}`, plannedMinutes: r.minutes,
        variant: hasEquipmentVariant(c.prof) ? 'equipment' : 'bodyweight', slots: r.slots, startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null,
        notes: '', createdAt: stamp(), updatedAt: stamp(),
      }
      await database.sportSessions.add(s)
      return { session: s, notes: r.notes }
    }),
    generateHiit: (minutes = 20) => tx(async () => {
      const c = await context()
      if (c.recovery.level === 'ALERTE') throw new SportError('alert', 'Alerte de récupération : pas de circuit HIIT aujourd’hui.')
      const h = generateHiit(c.prof, c.recovery, minutes, c.now)
      const s: SportSession = {
        id: id(), kind: 'hiit', origin: 'generated', date: today(), status: 'planned', title: 'Circuit HIIT full-body', plannedMinutes: minutes, variant: 'bodyweight',
        slots: h.slots, hiit: h.hiit, startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: stamp(), updatedAt: stamp(),
      }
      await database.sportSessions.add(s)
      return { session: s, notes: h.notes }
    }),
    /** Séance personnelle : exercices choisis par l'utilisateur (aucune adaptation automatique de la sélection). */
    createPersonalSession: (title: string, exerciseIds: string[], sets = 3) => tx(async () => {
      const c = await context()
      if (!title.trim() || !exerciseIds.length) throw new SportError('invalid', 'Donnez un titre et au moins un exercice.')
      const all = [...Object.values(EXERCISE_BY_ID), ...c.custom]
      if (exerciseIds.some((eid) => all.find((e) => e.id === eid)?.pushup)) throw new SportError('invalid', 'Les pompes (toutes variantes) sont réservées aux circuits HIIT full-body.')
      const slots: SessionSlot[] = exerciseIds.flatMap((eid, i) => {
        const ex = all.find((e) => e.id === eid)
        if (!ex) return []
        const st = c.states.find((x) => x.exerciseId === eid)
        const choice = { exerciseId: eid, loadKg: st?.workingLoadKg ?? null, repsMin: st?.repsMin ?? (ex.bodyweight ? 8 : 8), repsMax: st?.repsMax ?? (ex.bodyweight ? 15 : 12), durationSec: ex.mode === 'time' ? 40 : undefined, restSec: ex.mode === 'time' ? 45 : 90 }
        return [{ id: `slot-${i + 1}-${ex.primary[0] ?? 'dos'}`, group: ex.primary[0] ?? 'dos', movement: ex.movement, sets, equipment: ex.bodyweight ? null : choice, bodyweight: ex.bodyweight ? choice : null, status: 'pending' as const, logs: [] }]
      })
      const mobilityOnly = slots.length > 0 && slots.every((sl) => { const e = all.find((x) => x.id === (sl.equipment ?? sl.bodyweight)!.exerciseId); return e?.kind === 'mobility' })
      const s: SportSession = { id: id(), kind: mobilityOnly ? 'mobility' : 'strength', origin: 'personal', date: today(), status: 'planned', title: title.trim(), plannedMinutes: Math.max(15, slots.length * 8), variant: slots.some((x) => x.equipment) ? 'equipment' : 'bodyweight', slots, startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: stamp(), updatedAt: stamp() }
      await database.sportSessions.add(s)
      return s
    }),
    /** Alternative proposée pour un exercice impossible : l'appelant demande validation avant tout changement durable. */
    alternativeFor: async (exerciseId: string, variant: Variant): Promise<Exercise | null> => {
      const c = await context()
      return suggestAlternative(exerciseId, { profile: c.prof, prefs: c.prefs, custom: c.custom, recovery: c.recovery, now: c.now, measured: c.measured }, variant)
    },
    /** Remplace UN exercice dans la séance courante (non durable). Les séries déjà saisies restent liées à leur exercice. */
    swapExerciseInSession: (sid: string, slotId: string, variant: Variant, newExerciseId: string) => tx(async () => {
      const s = await getSession(sid)
      const slot = s.slots.find((x) => x.id === slotId)
      if (!slot) throw new SportError('not_found', 'Exercice introuvable.')
      const prev = (variant === 'equipment' ? slot.equipment : slot.bodyweight)
      const ex = EXERCISE_BY_ID[newExerciseId] ?? (await database.customExercises.get(newExerciseId))
      if (!ex) throw new SportError('not_found', 'Exercice introuvable.')
      if (ex.pushup) throw new SportError('invalid', 'Les pompes (toutes variantes) sont réservées aux circuits HIIT full-body.')
      const st = await database.exerciseStates.get(newExerciseId)
      const next = { exerciseId: newExerciseId, loadKg: st?.workingLoadKg ?? null, repsMin: st?.repsMin ?? prev?.repsMin ?? 8, repsMax: st?.repsMax ?? prev?.repsMax ?? 12, durationSec: ex.mode === 'time' ? 40 : undefined, restSec: prev?.restSec ?? 75 }
      if (variant === 'equipment') slot.equipment = next
      else slot.bodyweight = next
      return save(s)
    }),

    // ── Déroulement d'une séance ─────────────────────────────────
    /** Remplit une séance prévue (planning) avec une séance adaptée, au moment de la faire. */
    prepareSession: (sid: string) => tx(async () => {
      const s = await getSession(sid)
      if (s.slots.length || s.kind !== 'strength') return s
      const c = await context()
      if (c.recovery.level === 'ALERTE') throw new SportError('alert', 'Alerte de récupération : séance non préparée.')
      const r = generateStrengthSession({ profile: c.prof, prefs: c.prefs, custom: c.custom, recovery: c.recovery, sessions: c.sessions, states: c.states, now: c.now, cycle: c.cycle, measured: c.measured })
      if (!r.slots.length) throw new SportError('nothing_available', r.notes[0] ?? 'Aucun exercice disponible.')
      s.slots = r.slots; s.plannedMinutes = r.minutes; s.title = `Musculation · ${r.focus.slice(0, 3).join(', ')}`; s.variant = hasEquipmentVariant(c.prof) ? 'equipment' : 'bodyweight'
      return save(s)
    }),
    startSession: (sid: string) => tx(async () => {
      const s = await getSession(sid)
      if (s.status === 'completed' || s.status === 'partial' || s.status === 'abandoned') throw new SportError('bad_state', 'Cette séance est terminée.')
      const c = await context()
      const skipped: string[] = []
      if (s.status === 'planned') {
        const all = [...Object.values(EXERCISE_BY_ID), ...c.custom]
        for (const slot of s.slots) {
          const choices = [slot.equipment, slot.bodyweight].filter(Boolean).map((x) => all.find((e) => e.id === x!.exerciseId)).filter((e): e is Exercise => !!e)
          const reasons = choices.map((e) => isBlocked(e, c.recovery)).filter((r): r is string => !!r)
          if (choices.length && reasons.length === choices.length) { slot.status = 'skipped'; skipped.push(`${choices[0].name} : ${reasons[0]}`) }
        }
        if (s.slots.length && s.slots.every((sl) => sl.status === 'skipped')) throw new SportError('blocked', `Séance bloquée par la sécurité : ${skipped.join(' ; ')}`)
        if (c.recovery.level === 'ALERTE' && !s.slots.length) throw new SportError('alert', 'Alerte de récupération : séance non démarrée.')
        s.startedAt = stamp(); s.date = s.date < today() ? today() : s.date
        s.safetyAtStart = c.recovery.level
      } else if (s.status === 'paused' && s.pausedAt) { s.pausedMs += now().getTime() - new Date(s.pausedAt).getTime(); s.pausedAt = null }
      s.status = 'active'
      return { session: await save(s), skippedForSafety: skipped }
    }),
    pauseSession: (sid: string) => tx(async () => { const s = await getSession(sid); if (s.status !== 'active') return s; s.status = 'paused'; s.pausedAt = stamp(); s.restEndsAt = null; return save(s) }),
    resumeSession: (sid: string) => tx(async () => { const s = await getSession(sid); if (s.status !== 'paused') return s; if (s.pausedAt) s.pausedMs += now().getTime() - new Date(s.pausedAt).getTime(); s.pausedAt = null; s.status = 'active'; return save(s) }),

    /** Enregistre une série (sauvegarde immédiate). Retourne la séance mise à jour et une éventuelle mise en garde de sécurité. */
    logSet: (sid: string, slotId: string, input: SetInput) => tx(async () => {
      const s = await getSession(sid)
      const slot = s.slots.find((x) => x.id === slotId)
      if (!slot) throw new SportError('not_found', 'Exercice introuvable.')
      if (s.status === 'completed' || s.status === 'abandoned') throw new SportError('bad_state', 'Séance terminée : corrigez-la depuis l’historique.')
      if (![slot.equipment?.exerciseId, slot.bodyweight?.exerciseId].includes(input.exerciseId)) throw new SportError('invalid', 'Exercice hors de cet emplacement.')
      for (const [k, v] of [['reps', input.reps], ['loadKg', input.loadKg], ['durationSec', input.durationSec]] as const) if (v !== undefined && !(v >= 0 && v < 100000)) throw new SportError('invalid', `Valeur invalide : ${k}.`)
      const log: SetLog = { n: slot.logs.length + 1, slotId, exerciseId: input.exerciseId, reps: input.reps, loadKg: input.loadKg, durationSec: input.durationSec, rpe: input.rpe, technique: input.technique, pain: input.pain ?? 'none', at: stamp() }
      slot.logs.push(log)
      slot.status = slot.logs.length >= slot.sets ? 'done' : 'pending'
      const choice = [slot.equipment, slot.bodyweight].find((c) => c?.exerciseId === input.exerciseId)
      s.restEndsAt = input.pain === 'strong' || slot.status === 'done' && s.slots.every((x) => x.status !== 'pending') ? null : new Date(now().getTime() + (choice?.restSec ?? 60) * 1000).toISOString()
      if (s.status === 'planned') { s.status = 'active'; s.startedAt = s.startedAt ?? stamp(); if (s.safetyAtStart === undefined) s.safetyAtStart = (await context()).recovery.level }
      await save(s)
      return { session: s, caution: input.pain === 'strong' ? 'Douleur importante : arrêtez cet exercice. Ne forcez jamais pour terminer la séance. Signalez-la dans le questionnaire de récupération.' : input.pain === 'light' ? 'Douleur légère signalée : allégez ou choisissez une alternative, et surveillez-la.' : null }
    }),
    updateSet: (sid: string, slotId: string, n: number, patch: Partial<SetInput>) => tx(async () => {
      const s = await getSession(sid)
      const l = s.slots.find((x) => x.id === slotId)?.logs.find((x) => x.n === n)
      if (!l) throw new SportError('not_found', 'Série introuvable.')
      Object.assign(l, patch)
      await save(s)
      if (isFinished(s)) await syncXpUnsafe()
      return s
    }),
    deleteSet: (sid: string, slotId: string, n: number) => tx(async () => {
      const s = await getSession(sid)
      const slot = s.slots.find((x) => x.id === slotId)
      if (!slot) throw new SportError('not_found', 'Exercice introuvable.')
      slot.logs = slot.logs.filter((l) => l.n !== n).map((l, i) => ({ ...l, n: i + 1 }))
      slot.status = slot.logs.length >= slot.sets ? 'done' : slot.status === 'skipped' ? 'skipped' : 'pending'
      await save(s)
      if (isFinished(s)) await syncXpUnsafe()
      return s
    }),
    skipSlot: (sid: string, slotId: string, skipped: boolean) => tx(async () => { const s = await getSession(sid); const sl = s.slots.find((x) => x.id === slotId); if (sl) sl.status = skipped ? 'skipped' : sl.logs.length >= sl.sets ? 'done' : 'pending'; return save(s) }),
    reorderSlots: (sid: string, order: string[]) => tx(async () => {
      const s = await getSession(sid)
      const map = new Map(s.slots.map((x) => [x.id, x]))
      s.slots = [...order.flatMap((i) => (map.has(i) ? [map.get(i)!] : [])), ...s.slots.filter((x) => !order.includes(x.id))]
      return save(s)
    }),
    /** Bascule avec/sans matériel pendant la séance : les séries déjà saisies sont conservées, rattachées à leur exercice. */
    switchVariant: (sid: string, variant: Variant) => tx(async () => { const s = await getSession(sid); s.variant = variant; return save(s) }),
    setRest: (sid: string, seconds: number | null) => tx(async () => { const s = await getSession(sid); s.restEndsAt = seconds === null ? null : new Date(now().getTime() + seconds * 1000).toISOString(); return save(s) }),
    finishSession: (sid: string, notes = '') => tx(async () => {
      const s = await getSession(sid)
      if (s.status === 'completed' || s.status === 'partial' || s.status === 'abandoned') return { session: s, xp: { awarded: 0, reversed: 0 } }
      if (s.pausedAt) { s.pausedMs += now().getTime() - new Date(s.pausedAt).getTime(); s.pausedAt = null }
      const c = completion(s)
      s.status = c.done === 0 ? 'abandoned' : c.ratio >= 1 ? 'completed' : 'partial'
      s.endedAt = stamp(); s.restEndsAt = null; s.notes = notes || s.notes
      await save(s)
      return { session: s, xp: await syncXpUnsafe() }
    }),
    abandonSession: (sid: string) => tx(async () => { const s = await getSession(sid); s.status = 'abandoned'; s.endedAt = stamp(); s.restEndsAt = null; await save(s); return syncXpUnsafe() }),

    // ── Course (saisie manuelle) ─────────────────────────────────
    logRun: (input: RunInput & { date?: string; organised?: boolean; plannedSessionId?: string; notes?: string }) => tx(async () => {
      const built = buildRun(input)
      if (!built.ok) throw new SportError('invalid', built.error)
      const date = input.date ?? today()
      if (!isDayKey(date) || date > today()) throw new SportError('invalid_date' as SportErrorCode, 'Date invalide (pas dans le futur).')
      const c = await context()
      const planned = input.plannedSessionId ? await database.sportSessions.get(input.plannedSessionId) : undefined
      const s: SportSession = planned && planned.status === 'planned' ? planned : {
        id: id(), kind: 'run', origin: 'unplanned', date, status: 'completed', title: '', plannedMinutes: 0, variant: 'bodyweight', slots: [], startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: stamp(), updatedAt: stamp(),
      }
      s.kind = 'run'; s.run = built.run; s.date = date; s.status = 'completed'; s.endedAt = new Date(date + 'T12:00:00').toISOString()
      // Niveau de sécurité au moment de la sortie : état actuel, ou questionnaire de ce jour-là pour une saisie rétroactive (inconnu sinon)
      s.safetyAtStart = date === today() ? c.recovery.level : c.checks.filter((k) => k.day === date).sort((a, b) => a.at.localeCompare(b.at)).at(-1)?.safety ?? null
      s.origin = planned ? 'planned' : input.organised === false ? 'unplanned' : 'generated'
      s.title = `${built.run.distanceKm} km`; s.plannedMinutes = Math.round(built.run.durationSec / 60); s.notes = input.notes ?? ''
      if (c.recovery.level !== 'NORMAL' && ['interval', 'tempo', 'hills'].includes(built.run.family)) built.warnings.push('Séance exigeante enregistrée un jour de vigilance : écoutez votre récupération.')
      await database.sportSessions.put(s)
      return { session: s, warnings: built.warnings, xp: await syncXpUnsafe() }
    }),
    /** Activité imprévue : prise en compte dans récupération et statistiques, sans XP. */
    logUnplanned: (o: { title: string; minutes: number; rpe: number; muscles?: MuscleGroup[]; date?: string }) => tx(async () => {
      if (!o.title.trim() || !(o.minutes >= 5 && o.minutes <= 600) || !(o.rpe >= 1 && o.rpe <= 10)) throw new SportError('invalid', 'Titre, durée (5–600 min) et effort (1–10) requis.')
      const date = o.date ?? today()
      if (!isDayKey(date) || date > today()) throw new SportError('invalid_date' as SportErrorCode, 'Date invalide (pas dans le futur).')
      const s: SportSession = { id: id(), kind: 'other', origin: 'unplanned', date, status: 'completed', title: o.title.trim(), plannedMinutes: o.minutes, variant: 'bodyweight', slots: [], other: { minutes: o.minutes, rpe: o.rpe, muscles: o.muscles ?? [] }, startedAt: null, endedAt: new Date(date + 'T12:00:00').toISOString(), pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: stamp(), updatedAt: stamp() }
      await database.sportSessions.add(s)
      return s
    }),

    // ── Planning ─────────────────────────────────────────────────
    /** Recalcule le planning de la semaine : remplace les séances prévues non commencées, sans empiler. */
    applyWeekPlan: () => tx(async () => {
      const c = await context()
      const plan = planWeek({ profile: c.prof, sessions: c.sessions, recovery: c.recovery, now: c.now })
      const wk = weekKey(c.now)
      const stale = c.sessions.filter((s) => s.status === 'planned' && weekKey(new Date(s.date + 'T12:00:00')) === wk && s.origin === 'planned' && s.date >= today() && !s.slots.some((sl) => sl.logs.length))
      await database.sportSessions.bulkDelete(stale.map((s) => s.id))
      const created: SportSession[] = plan.slots.map((p) => ({
        id: id(), kind: p.kind, origin: 'planned' as const, date: p.date, status: 'planned' as const, title: p.kind === 'strength' ? 'Musculation prévue' : 'Course prévue', plannedMinutes: c.prof.sessionMinutes ?? 45,
        variant: 'bodyweight' as const, slots: [], startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, runFamilyPlanned: p.family, notes: '', createdAt: stamp(), updatedAt: stamp(),
      }))
      await database.sportSessions.bulkAdd(created)
      return { plan, created: created.length }
    }),

    // ── Récupération ─────────────────────────────────────────────
    /** Questionnaire quotidien (~30 s). Une réévaluation le même jour ajoute une saisie (l'historique est conservé). */
    saveCheck: (input: CheckInput) => tx(async () => {
      const c = await context()
      const base: RecoveryCheck = {
        id: id(), day: today(), fatigue: input.fatigue, sleep: input.sleep, soreness: input.soreness, sorenessAreas: input.sorenessAreas ?? {},
        pain: input.pain, painArea: input.pain === 'none' ? null : input.painArea ?? null, safety: 'NORMAL', index: 100, restChosen: false, at: stamp(),
      }
      const st = evaluateRecovery({ checks: [...c.checks, base], sessions: c.sessions, now: c.now, today: today(), custom: c.custom })
      const check = { ...base, safety: st.level, index: st.index }
      await database.recoveryChecks.add(check)
      await syncXpUnsafe()
      return { check, state: st as RecoveryState }
    }),
    /** « Je me repose » un jour de vigilance/alerte : respect pertinent de la récupération (XP plafonnée, sans farming). */
    chooseRest: () => tx(async () => {
      const checks = (await database.recoveryChecks.where('day').equals(today()).toArray()).sort((a, b) => a.at.localeCompare(b.at))
      const last = checks.at(-1)
      if (!last) throw new SportError('bad_state', 'Remplissez d’abord le questionnaire du jour.')
      await database.recoveryChecks.update(last.id, { restChosen: true })
      return syncXpUnsafe()
    }),

    // ── Progression ──────────────────────────────────────────────
    /** Applique ou refuse une recommandation. Rien n'est jamais appliqué sans cette confirmation explicite. */
    decideProgression: (rec: Recommendation, accept: boolean) => tx(async () => {
      const d: ProgressionDecision = { id: id(), exerciseId: rec.exerciseId, action: rec.action, from: rec.from, to: rec.to, unit: rec.unit, reason: rec.reason, applied: accept && rec.action !== 'hold', at: stamp() }
      if (d.applied && rec.to !== null) {
        const prev = await database.exerciseStates.get(rec.exerciseId)
        const next: ExerciseState = { exerciseId: rec.exerciseId, workingLoadKg: rec.unit === 'kg' ? rec.to : prev?.workingLoadKg ?? null, repsMin: prev?.repsMin ?? 8, repsMax: rec.unit === 'reps' ? rec.to : prev?.repsMax ?? 12, lastIncreaseAt: rec.action === 'increase' ? d.at : prev?.lastIncreaseAt ?? null, updatedAt: d.at }
        await database.exerciseStates.put(next)
      }
      await database.progressionLog.add(d)
      await syncXpUnsafe()
      return d
    }),
    setWorkingLoad: (exerciseId: string, loadKg: number | null) => tx(async () => {
      const prev = await database.exerciseStates.get(exerciseId)
      await database.exerciseStates.put({ exerciseId, workingLoadKg: loadKg, repsMin: prev?.repsMin ?? 8, repsMax: prev?.repsMax ?? 12, lastIncreaseAt: prev?.lastIncreaseAt ?? null, updatedAt: stamp() })
    }),

    // ── Historique : consultation détaillée et correction ─────────
    /** Corrige une séance (titre, date, notes, statut) puis recalcule XP, niveaux, attributs, records. */
    correctSession: (sid: string, patch: Partial<Pick<SportSession, 'title' | 'date' | 'notes' | 'status'>> & { run?: RunInput }) => tx(async () => {
      const s = await getSession(sid)
      if (patch.date !== undefined) { if (!isDayKey(patch.date) || patch.date > today()) throw new SportError('invalid_date' as SportErrorCode, 'Date invalide (pas dans le futur).'); s.date = patch.date; if (s.endedAt) s.endedAt = new Date(patch.date + 'T12:00:00').toISOString() }
      if (patch.title !== undefined) s.title = patch.title.trim() || s.title
      if (patch.notes !== undefined) s.notes = patch.notes
      if (patch.status !== undefined && ['completed', 'partial', 'abandoned'].includes(patch.status)) s.status = patch.status
      if (patch.run && s.kind === 'run') { const b = buildRun(patch.run); if (!b.ok) throw new SportError('invalid', b.error); s.run = b.run; s.title = `${b.run.distanceKm} km`; s.plannedMinutes = Math.round(b.run.durationSec / 60) }
      await save(s)
      return { session: s, xp: await syncXpUnsafe() }
    }),
    deleteSession: (sid: string) => tx(async () => { await getSession(sid); await database.sportSessions.delete(sid); return syncXpUnsafe() }),
    syncXp: () => tx(syncXpUnsafe),

    // ── Mesures corporelles (facultatives) ──────────────────────
    addMeasure: (m: Omit<BodyMeasure, 'id'>) => tx(async () => {
      if (!isDayKey(m.date) || m.date > today()) throw new SportError('invalid_date' as SportErrorCode, 'Date invalide.')
      const vals = [m.weightKg, m.waistCm, m.chestCm, m.armCm, m.thighCm].filter((v) => v !== undefined)
      if (!vals.length || vals.some((v) => !(v! > 0 && v! < 500))) throw new SportError('invalid', 'Saisissez au moins une mesure valide.')
      const row = { ...m, id: id() }
      await database.bodyMeasures.add(row)
      return row
    }),
    deleteMeasure: (mid: string) => database.bodyMeasures.delete(mid),
  }
  return api
}

export const sportService = createSportService()
export type { XpEvent }
