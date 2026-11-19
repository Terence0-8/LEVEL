import { addDays, dayKey, mondayOf, weekKey } from '../dates'
import { EXERCISE_BY_ID } from './exercises'
import type { BodyMeasure, SportSession } from './session'
import { completion, isFinished, setMetric } from './xp'
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from './types'
import { runsOf } from './running'

export type StatRange = 'week' | 'month' | '3months' | 'year' | 'all'
export const RANGE_LABEL: Record<StatRange, string> = { week: 'Semaine', month: 'Mois', '3months': '3 mois', year: 'Année', all: 'Tout' }

export function rangeStart(range: StatRange, now: Date): string | null {
  if (range === 'all') return null
  if (range === 'week') return dayKey(mondayOf(now))
  const days = range === 'month' ? 30 : range === '3months' ? 91 : 365
  return dayKey(addDays(now, -days))
}

export const inRange = (sessions: SportSession[], range: StatRange, now: Date) => {
  const from = rangeStart(range, now)
  return sessions.filter((s) => isFinished(s) && (!from || s.date >= from) && s.date <= dayKey(now))
}

const exOf = (id: string, custom: Exercise[]) => EXERCISE_BY_ID[id] ?? custom.find((c) => c.id === id)

/** Volume : séries, tonnage (charges), répétitions au poids du corps, durée. Les sessions imprévues comptent dans les statistiques. */
export function volume(sessions: SportSession[], custom: Exercise[] = []) {
  let sets = 0, tonnageKg = 0, bodyweightReps = 0, minutes = 0, count = 0
  for (const s of sessions) {
    count++
    minutes += s.kind === 'run' ? (s.run?.durationSec ?? 0) / 60 : s.kind === 'other' ? s.other?.minutes ?? 0 : s.plannedMinutes
    for (const l of s.slots.flatMap((sl) => sl.logs)) {
      sets++
      const ex = exOf(l.exerciseId, custom)
      if (ex && !ex.bodyweight && l.reps && l.loadKg) tonnageKg += l.reps * l.loadKg
      else if (l.reps) bodyweightReps += l.reps
    }
  }
  return { sets, tonnageKg: Math.round(tonnageKg), bodyweightReps, minutes: Math.round(minutes), count }
}

/** Répartition musculaire : séries pondérées (principal 1, secondaire 0,5), variantes avec/sans matériel confondues. */
export function muscleSplit(sessions: SportSession[], custom: Exercise[] = []): Record<MuscleGroup, number> {
  const out = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>
  for (const s of sessions) for (const l of s.slots.flatMap((sl) => sl.logs)) {
    const ex = exOf(l.exerciseId, custom)
    ex?.primary.forEach((g) => { out[g] += 1 })
    ex?.secondary.forEach((g) => { out[g] += 0.5 })
  }
  return out
}

export interface SeriesPoint { label: string; value: number }

/** Série du volume (séries) : par jour sur une semaine, par semaine au-delà. */
export function setsSeries(sessions: SportSession[], range: StatRange, now: Date): SeriesPoint[] {
  const done = inRange(sessions, range, now)
  const perDay = range === 'week'
  const buckets = new Map<string, number>()
  const start = range === 'all' ? (done[0] ? new Date(done[0].date + 'T12:00:00') : now) : new Date((rangeStart(range, now) ?? dayKey(now)) + 'T12:00:00')
  const steps: string[] = []
  for (let d = perDay ? start : mondayOf(start); d <= now; d = addDays(d, perDay ? 1 : 7)) { const k = perDay ? dayKey(d) : weekKey(d); steps.push(k); buckets.set(k, 0) }
  for (const s of done) {
    const k = perDay ? s.date : weekKey(new Date(s.date + 'T12:00:00'))
    const n = s.slots.reduce((a, sl) => a + sl.logs.length, 0) || (s.kind === 'run' ? 0 : 0)
    buckets.set(k, (buckets.get(k) ?? 0) + n)
  }
  return steps.map((k) => ({ label: k, value: buckets.get(k) ?? 0 }))
}

export interface PersonalRecord { id: string; label: string; value: string; date: string; kind: 'strength' | 'run' }

export function personalRecords(sessions: SportSession[], custom: Exercise[] = []): PersonalRecord[] {
  const out: PersonalRecord[] = []
  const best = new Map<string, { m: number; date: string }>()
  for (const s of [...sessions].filter(isFinished).sort((a, b) => a.date.localeCompare(b.date)))
    for (const l of s.slots.flatMap((sl) => sl.logs)) {
      const m = setMetric(l, exOf(l.exerciseId, custom))
      if (m !== null && m > (best.get(l.exerciseId)?.m ?? 0)) best.set(l.exerciseId, { m, date: s.date })
    }
  for (const [id, b] of best) {
    const ex = exOf(id, custom)!
    out.push({ id, kind: 'strength', label: ex.name, date: b.date, value: ex.mode === 'time' ? `${b.m} s` : ex.bodyweight ? `${b.m} rép.` : `≈ ${Math.round(b.m * 10) / 10} kg (1RM estimé)` })
  }
  const runs = runsOf(sessions)
  if (runs.length) {
    const far = runs.reduce((a, s) => (s.run!.distanceKm > a.run!.distanceKm ? s : a))
    out.push({ id: 'run-distance', kind: 'run', label: 'Plus longue sortie', date: far.date, value: `${far.run!.distanceKm} km` })
    const fast = runs.filter((s) => s.run!.distanceKm >= 3 && s.run!.family !== 'recovery')
    if (fast.length) { const f = fast.reduce((a, s) => (s.run!.paceSecPerKm < a.run!.paceSecPerKm ? s : a)); out.push({ id: 'run-pace', kind: 'run', label: 'Meilleure allure (≥ 3 km)', date: f.date, value: `${Math.floor(f.run!.paceSecPerKm / 60)}:${String(f.run!.paceSecPerKm % 60).padStart(2, '0')} /km` }) }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/** Fréquence et régularité : séances par semaine, semaines actives, série de semaines atteignant l'objectif. */
export function regularity(sessions: SportSession[], target: number, now: Date) {
  const done = sessions.filter((s) => isFinished(s) && s.kind !== 'other')
  const perWeek = new Map<string, Set<string>>()
  for (const s of done) { const k = weekKey(new Date(s.date + 'T12:00:00')); perWeek.set(k, (perWeek.get(k) ?? new Set()).add(s.date)) }
  let streak = 0
  for (let d = mondayOf(now), i = 0; i < 200; d = addDays(d, -7), i++) {
    const n = perWeek.get(weekKey(d))?.size ?? 0
    if (n >= Math.max(1, target)) streak++
    else if (i === 0) continue // la semaine en cours n'interrompt pas la série
    else break
  }
  const weeks = [...perWeek.values()]
  return { activeWeeks: weeks.length, avgPerWeek: weeks.length ? Math.round((weeks.reduce((a, s) => a + s.size, 0) / weeks.length) * 10) / 10 : 0, streakWeeks: streak }
}

export function runSeries(sessions: SportSession[], range: StatRange, now: Date) {
  return runsOf(inRange(sessions, range, now)).map((s) => ({ date: s.date, pace: s.run!.paceSecPerKm, km: s.run!.distanceKm, family: s.run!.family }))
}

export function measureSeries(measures: BodyMeasure[], field: 'weightKg' | 'waistCm' | 'chestCm' | 'armCm' | 'thighCm'): SeriesPoint[] {
  return [...measures].filter((m) => typeof m[field] === 'number').sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ label: m.date, value: m[field] as number }))
}

// ── Bilans ──────────────────────────────────────────────────────
export function sessionDebrief(s: SportSession, all: SportSession[], custom: Exercise[] = []): string[] {
  const out: string[] = []
  const c = completion(s)
  if (s.kind === 'run' && s.run) {
    out.push(`${s.run.distanceKm} km en ${Math.round(s.run.durationSec / 60)} min, allure moyenne ${Math.floor(s.run.paceSecPerKm / 60)}:${String(s.run.paceSecPerKm % 60).padStart(2, '0')} /km.`)
    out.push(`Difficulté ressentie : ${s.run.rpe}/10.`)
  } else if (s.kind === 'other') out.push(`Activité enregistrée (${s.other?.minutes ?? 0} min, effort ${s.other?.rpe ?? 0}/10) : prise en compte dans la récupération et les statistiques, sans XP.`)
  else {
    out.push(`${c.done}/${c.planned} séries réalisées (${Math.round(c.ratio * 100)} %).`)
    const sets = s.slots.flatMap((sl) => sl.logs)
    const rpe = sets.map((l) => l.rpe).filter((v): v is number => typeof v === 'number')
    if (rpe.length) out.push(`Effort moyen : ${(rpe.reduce((a, b) => a + b, 0) / rpe.length).toFixed(1)}/10.`)
    const skipped = s.slots.filter((sl) => sl.status === 'skipped').length
    if (skipped) out.push(`${skipped} exercice${skipped > 1 ? 's' : ''} passé${skipped > 1 ? 's' : ''}.`)
    if (sets.some((l) => l.pain && l.pain !== 'none')) out.push('Une douleur a été signalée : surveillez-la et privilégiez la prudence.')
    const prev = all.filter((p) => p.id !== s.id && isFinished(p) && p.date < s.date && p.kind === s.kind).length
    out.push(prev === 0 ? 'Première séance de ce type : elle sert de base de mesure.' : `${prev + 1}ᵉ séance de ce type.`)
  }
  void custom
  return out
}

export function periodReview(sessions: SportSession[], from: string, to: string, custom: Exercise[] = []) {
  const done = sessions.filter((s) => isFinished(s) && s.date >= from && s.date <= to)
  const v = volume(done, custom)
  const runs = runsOf(done)
  const km = Math.round(runs.reduce((a, s) => a + s.run!.distanceKm, 0) * 10) / 10
  const split = muscleSplit(done, custom)
  const top = (Object.entries(split) as Array<[MuscleGroup, number]>).sort((a, b) => b[1] - a[1]).filter(([, n]) => n > 0).slice(0, 3)
  const neglected = (Object.entries(split) as Array<[MuscleGroup, number]>).filter(([, n]) => n === 0).map(([g]) => g)
  return { sessions: v.count, sets: v.sets, minutes: v.minutes, km, topGroups: top.map(([g]) => g), neglected }
}
