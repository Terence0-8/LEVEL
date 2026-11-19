import { dayKey, weekKey } from '../dates'
import type { AttributeId } from '../types'
import { SPORT_CONFIG } from './config'
import { EXERCISE_BY_ID } from './exercises'
import type { SportProfile } from './profile'
import type { ProgressionDecision, RecoveryCheck, SetLog, SportSession } from './session'
import { latestPerDay } from './recovery'
import type { Exercise, SessionKind } from './types'

/**
 * XP SPORT : ce module NE crée PAS de moteur parallèle. Il calcule, de façon déterministe, l'ensemble des récompenses
 * SOUHAITÉES à partir des séances, vérifications et décisions ; `sportService.syncXp` les inscrit dans le journal
 * d'XP existant (`xpEvents`, domaine SPORT) et corrige (annulations tracées) tout écart après une modification de l'historique.
 * 1 XP SPORT = 1 XP LIFE pour le niveau global ; les barèmes ci-dessous sont propres à la discipline et provisoires.
 */
const X = SPORT_CONFIG.xp

export interface DesiredAward {
  key: string
  /** ISO : date d'accomplissement déclarée */
  at: string
  amount: number
  attribute: AttributeId
  /** Identifiant de l'objet récompensé (séance, semaine, jour, décision) */
  sourceId: string
  label: string
  reason: string
  cycleKey: string
}

const KIND_ATTRIBUTE: Record<SessionKind, AttributeId> = { strength: 'force', run: 'endurance', hiit: 'coordination', mobility: 'mobilite', other: 'force' }
const KIND_LABEL: Record<SessionKind, string> = { strength: 'Musculation', run: 'Course', hiit: 'Circuit HIIT', mobility: 'Mobilité', other: 'Activité' }

export const SPORT_KEY_PREFIX = 'sport:'
const noon = (day: string) => new Date(day + 'T12:00:00').toISOString()
const when = (s: SportSession) => (s.endedAt && dayKey(new Date(s.endedAt)) === s.date ? s.endedAt : noon(s.date))
const durationFactor = (minutes: number) => Math.min(X.durationFactorMax, Math.max(X.durationFactorMin, Math.sqrt(minutes / X.durationReferenceMin)))

export const isFinished = (s: SportSession) => s.status === 'completed' || s.status === 'partial'
export const isOrganised = (s: SportSession) => s.origin !== 'unplanned' && s.kind !== 'other'

export function completion(s: SportSession): { done: number; planned: number; ratio: number } {
  if (s.kind === 'run') return { done: 1, planned: 1, ratio: 1 }
  const planned = s.slots.reduce((n, sl) => n + sl.sets, 0)
  const done = s.slots.reduce((n, sl) => n + Math.min(sl.sets, sl.logs.length), 0)
  return { done, planned, ratio: planned ? done / planned : 0 }
}

/** Mesure d'un jeu : e1RM (Epley) pour une charge, répétitions ou durée pour le poids du corps. Jeux propres uniquement. */
export function setMetric(l: SetLog, ex: Exercise | undefined): number | null {
  if (!ex) return null
  if (l.pain && l.pain !== 'none') return null
  if (l.technique !== undefined && l.technique < 2) return null
  if (ex.mode === 'time') return l.durationSec ?? null
  if (ex.bodyweight) return l.reps ?? null
  if (!l.reps || !l.loadKg || l.reps > 12) return null
  return l.loadKg * (1 + l.reps / 30)
}

interface Opts { sessions: SportSession[]; checks: RecoveryCheck[]; decisions: ProgressionDecision[]; profile: SportProfile; custom?: Exercise[] }

/** Toutes les récompenses SPORT que le journal doit contenir, pour l'historique actuel. */
export function desiredSportAwards(o: Opts): DesiredAward[] {
  const out: DesiredAward[] = []
  const exOf = (id: string) => EXERCISE_BY_ID[id] ?? o.custom?.find((c) => c.id === id)
  const sorted = [...o.sessions].filter(isFinished).sort((a, b) => a.date.localeCompare(b.date) || (a.endedAt ?? a.createdAt).localeCompare(b.endedAt ?? b.createdAt))

  const perDay = new Map<string, number>()
  const best = new Map<string, number>()
  const exposures = new Map<string, number>()
  const runBest = { distance: 0, pace: Infinity, runs: 0 }
  const weekDates = new Map<string, Set<string>>()
  const target = Math.max(2, o.profile.availability.strengthPerWeek + o.profile.availability.runsPerWeek)

  for (const s of sorted) {
    const c = completion(s)
    const minutes = s.kind === 'run' ? Math.round((s.run?.durationSec ?? 0) / 60) : s.plannedMinutes
    const eligibleKind = isOrganised(s)
    let rewarded = false
    if (eligibleKind && (perDay.get(s.date) ?? 0) < X.maxRewardedSessionsPerDay) {
      const okRatio = c.ratio >= X.minCompletion
      const okRun = s.kind !== 'run' || minutes >= X.runMinMinutes
      if (okRatio && okRun) {
        let amount = Math.round(X.base[s.kind] * c.ratio * durationFactor(minutes))
        if (s.kind === 'run' && s.run?.family === 'recovery') amount = Math.round(amount * X.recoveryRunCapFactor)
        if (amount > 0) {
          rewarded = true
          perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1)
          out.push({
            key: `sport:session:${s.id}:base`, at: when(s), amount, attribute: KIND_ATTRIBUTE[s.kind], sourceId: s.id, cycleKey: s.date,
            label: `${KIND_LABEL[s.kind]} : ${s.title}`,
            reason: s.kind === 'run' ? `Course ${s.run!.distanceKm} km en ${minutes} min` + (s.run!.family === 'recovery' ? ' (récupération active : récompense plafonnée)' : '')
              : c.ratio >= 1 ? `Séance terminée (${c.done}/${c.planned} séries)` : `Séance écourtée : ${c.done}/${c.planned} séries, récompense proportionnelle (${Math.round(c.ratio * 100)} %)`,
          })
        }
      }
    }

    // Records personnels (séances récompensées uniquement ; expositions et records mis à jour avec TOUTES les séances terminées)
    const prCandidates: Array<{ key: string; ratio: number; label: string; reason: string; attribute: AttributeId }> = []
    if (s.kind === 'run' && s.run) {
      const r = s.run
      if (rewarded && runBest.runs >= X.prMinPriorExposures) {
        if (runBest.distance > 0 && r.distanceKm >= runBest.distance * (1 + X.prMinImprovementPct / 100)) prCandidates.push({ key: `sport:session:${s.id}:pr:run:distance`, ratio: r.distanceKm / runBest.distance, label: 'Record : plus longue sortie', reason: `${r.distanceKm} km (précédent : ${runBest.distance} km)`, attribute: 'endurance' })
        if (r.distanceKm >= 3 && Number.isFinite(runBest.pace) && r.paceSecPerKm <= runBest.pace * (1 - X.prMinImprovementPct / 100) && r.family !== 'recovery') prCandidates.push({ key: `sport:session:${s.id}:pr:run:pace`, ratio: runBest.pace / r.paceSecPerKm, label: 'Record : meilleure allure (≥ 3 km)', reason: `${Math.floor(r.paceSecPerKm / 60)}:${String(r.paceSecPerKm % 60).padStart(2, '0')} /km`, attribute: 'endurance' })
      }
      runBest.runs++
      runBest.distance = Math.max(runBest.distance, r.distanceKm)
      if (r.distanceKm >= 3 && r.family !== 'recovery') runBest.pace = Math.min(runBest.pace, r.paceSecPerKm)
    } else {
      const byEx = new Map<string, SetLog[]>()
      for (const l of s.slots.flatMap((sl) => sl.logs)) byEx.set(l.exerciseId, [...(byEx.get(l.exerciseId) ?? []), l])
      for (const [id, logs] of byEx) {
        const ex = exOf(id)
        const metric = Math.max(0, ...logs.map((l) => setMetric(l, ex) ?? 0))
        const prior = best.get(id)
        if (rewarded && prior && (exposures.get(id) ?? 0) >= X.prMinPriorExposures && metric >= prior * (1 + X.prMinImprovementPct / 100))
          prCandidates.push({ key: `sport:session:${s.id}:pr:${id}`, ratio: metric / prior, label: `Record : ${ex?.name ?? id}`, reason: ex?.mode === 'time' ? `${metric} s tenues` : ex?.bodyweight ? `${metric} répétitions` : `Charge estimée ${Math.round(metric * 10) / 10} kg (précédent ${Math.round(prior * 10) / 10})`, attribute: 'force' })
        if (metric > 0) { best.set(id, Math.max(prior ?? 0, metric)); exposures.set(id, (exposures.get(id) ?? 0) + 1) }
      }
    }
    prCandidates.sort((a, b) => b.ratio - a.ratio).slice(0, X.prMaxPerSession).forEach((p) =>
      out.push({ key: p.key, at: when(s), amount: X.pr, attribute: p.attribute, sourceId: s.id, label: p.label, reason: p.reason, cycleKey: s.date }))

    // Régularité hebdomadaire : jours distincts de séances organisées et récompensées
    if (rewarded) {
      const wk = weekKey(new Date(s.date + 'T12:00:00'))
      const set = weekDates.get(wk) ?? new Set<string>()
      set.add(s.date)
      weekDates.set(wk, set)
      if (set.size === target) out.push({ key: `sport:week:${wk}:regularity`, at: when(s), amount: X.regularityWeek, attribute: 'discipline', sourceId: wk, cycleKey: wk, label: 'Régularité de la semaine', reason: `Objectif de ${target} séances sur des jours distincts atteint` })
    }
  }

  // Respect de la récupération : repos choisi un jour de vigilance/alerte, sans séance ce jour-là, plafonné par semaine
  const restPerWeek = new Map<string, number>()
  const sessionDays = new Set(o.sessions.filter((s) => s.status !== 'abandoned' && s.status !== 'planned').map((s) => s.date))
  for (const c of latestPerDay(o.checks).sort((a, b) => a.day.localeCompare(b.day))) {
    if (!c.restChosen || c.safety === 'NORMAL' || sessionDays.has(c.day)) continue
    const wk = weekKey(new Date(c.day + 'T12:00:00'))
    if ((restPerWeek.get(wk) ?? 0) >= X.restMaxPerWeek) continue
    restPerWeek.set(wk, (restPerWeek.get(wk) ?? 0) + 1)
    out.push({ key: `sport:rest:${c.day}`, at: noon(c.day), amount: X.rest, attribute: 'resilience', sourceId: c.id, cycleKey: c.day, label: 'Repos respecté', reason: `Niveau ${c.safety} : repos choisi plutôt que de forcer` })
  }

  // Progressions confirmées par l'utilisateur (plafond hebdomadaire)
  const progPerWeek = new Map<string, number>()
  for (const d of [...o.decisions].filter((d) => d.applied && d.action === 'increase').sort((a, b) => a.at.localeCompare(b.at))) {
    const wk = weekKey(new Date(d.at))
    if ((progPerWeek.get(wk) ?? 0) >= 3) continue
    progPerWeek.set(wk, (progPerWeek.get(wk) ?? 0) + 1)
    out.push({ key: `sport:progress:${d.id}`, at: d.at, amount: X.progressionConfirmed, attribute: 'maitrise', sourceId: d.id, cycleKey: wk, label: `Progression confirmée : ${exOf(d.exerciseId)?.name ?? d.exerciseId}`, reason: d.reason })
  }
  return out
}
