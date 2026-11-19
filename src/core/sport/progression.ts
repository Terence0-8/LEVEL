import { SPORT_CONFIG } from './config'
import type { CycleInfo } from './cycle'
import { EXERCISE_BY_ID } from './exercises'
import type { RecoveryState } from './recovery'
import type { ExerciseState, ProgressionDecision, SetLog, SportSession } from './session'
import type { Exercise } from './types'

const P = SPORT_CONFIG.progression

export interface Exposure {
  sessionId: string
  date: string
  sets: SetLog[]
  avgReps: number
  topReps: number
  loadKg: number | null
  avgRpe: number | null
  avgTechnique: number | null
  pain: 'none' | 'light' | 'strong'
  repsMin: number
  repsMax: number
}

export type ProgAction = 'increase' | 'hold' | 'decrease' | 'recover'

export interface Recommendation {
  exerciseId: string
  action: ProgAction
  reason: string
  from: number | null
  to: number | null
  unit: 'kg' | 'reps' | 's' | null
  exposures: number
  /** Information de prudence prioritaire (douleur…) */
  caution?: string
}

const avg = (xs: ReadonlyArray<number>) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Expositions (séances) à un exercice, du plus ancien au plus récent. Séances terminées ou écourtées uniquement. */
export function exposuresOf(exerciseId: string, sessions: SportSession[]): Exposure[] {
  const out: Exposure[] = []
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))) {
    if (s.status !== 'completed' && s.status !== 'partial') continue
    const logs = s.slots.flatMap((sl) => sl.logs).filter((l) => l.exerciseId === exerciseId)
    if (!logs.length) continue
    const slot = s.slots.find((sl) => sl.logs.some((l) => l.exerciseId === exerciseId))!
    const choice = slot.equipment?.exerciseId === exerciseId ? slot.equipment : slot.bodyweight
    const reps = logs.map((l) => l.reps ?? l.durationSec ?? 0)
    const loads = logs.map((l) => l.loadKg).filter((v): v is number => typeof v === 'number')
    out.push({
      sessionId: s.id, date: s.date, sets: logs, avgReps: avg(reps) ?? 0, topReps: Math.max(...reps),
      loadKg: loads.length ? Math.max(...loads) : null,
      avgRpe: avg(logs.map((l) => l.rpe).filter((v): v is number => typeof v === 'number')),
      avgTechnique: avg(logs.flatMap((l) => (l.technique ? [l.technique as number] : []))),
      pain: logs.some((l) => l.pain === 'strong') ? 'strong' : logs.some((l) => l.pain === 'light') ? 'light' : 'none',
      repsMin: choice?.repsMin ?? 8, repsMax: choice?.repsMax ?? 12,
    })
  }
  return out
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step

export function loadStep(ex: Exercise): number {
  if (ex.loadStepKg) return ex.loadStepKg
  for (const e of ex.equipment) { const s = (P.stepKg as Record<string, number>)[e]; if (s) return s }
  return 2
}

/**
 * Recommandation de progression pour UN exercice. Jamais appliquée automatiquement : l'utilisateur confirme.
 * Prend en compte répétitions, charges, technique, RPE, fatigue/récupération et douleurs. Plusieurs expositions requises ;
 * aucune progression artificielle jour après jour ; la stagnation n'est pas un échec.
 */
export function recommend(opts: { exerciseId: string; sessions: SportSession[]; state?: ExerciseState; recovery: RecoveryState; cycle: CycleInfo; decisions: ProgressionDecision[]; now: Date; custom?: Exercise[] }): Recommendation {
  const ex = EXERCISE_BY_ID[opts.exerciseId] ?? opts.custom?.find((c) => c.id === opts.exerciseId)
  const exposures = exposuresOf(opts.exerciseId, opts.sessions)
  const n = exposures.length
  const last = exposures[n - 1]
  const base = { exerciseId: opts.exerciseId, exposures: n }
  const unit: Recommendation['unit'] = !ex ? null : ex.mode === 'time' ? 's' : ex.bodyweight ? 'reps' : 'kg'
  const current = last ? (unit === 'kg' ? last.loadKg : unit === 's' ? Math.round(last.avgReps) : last.repsMax) : null

  if (!last || !ex) return { ...base, action: 'hold', reason: 'Pas encore d’exposition : faites d’abord une séance avec cet exercice.', from: null, to: null, unit }

  // 1) Sécurité : douleur
  const lastTwo = exposures.slice(-2)
  if (last.pain === 'strong' || (lastTwo.length === 2 && lastTwo.every((e) => e.pain !== 'none'))) {
    return { ...base, action: 'recover', from: current, to: null, unit, reason: 'Douleur déclarée sur cet exercice.', caution: 'Mettez cet exercice en pause et choisissez une alternative qui ne provoque pas la douleur. Si elle persiste ou vous inquiète, consultez un professionnel de santé.' }
  }
  if (last.pain === 'light') {
    const to = unit === 'kg' && current ? roundTo(current * (1 - P.decreasePct / 100), loadStep(ex) || 1) : current
    return { ...base, action: 'decrease', from: current, to, unit, reason: 'Douleur légère déclarée : allégez et surveillez.', caution: 'Évitez la zone douloureuse ; arrêtez si elle augmente.' }
  }
  // 2) Récupération
  if (opts.recovery.level === 'ALERTE') return { ...base, action: 'recover', from: current, to: null, unit, reason: 'Alerte de récupération : pas de progression, privilégiez le repos.' }
  if (opts.recovery.level === 'VIGILANCE') return { ...base, action: 'hold', from: current, to: current, unit, reason: 'Vigilance : maintenez cette charge, sans augmenter.' }
  // 3) Phase du cycle
  if (!opts.cycle.allowIncrease) return { ...base, action: 'hold', from: current, to: current, unit, reason: `Phase « ${opts.cycle.phase === 'consolidation' ? 'consolidation' : opts.cycle.phase === 'deload' ? 'allègement' : 'reprise'} » : on consolide, sans augmenter.` }
  // 4) Plusieurs expositions
  if (n < P.minExposures) return { ...base, action: 'hold', from: current, to: current, unit, reason: `${n} exposition${n > 1 ? 's' : ''} sur ${P.minExposures} nécessaires avant toute recommandation d’augmentation.` }
  // 5) Réduction : deux expositions sous la plage, effort maximal ou technique dégradée
  const lt = exposures.slice(-2)
  const struggling = lt.length === 2 && lt.every((e) => e.avgReps < e.repsMin)
  const tooHard = lt.length === 2 && lt.every((e) => (e.avgRpe ?? 0) >= P.rpeReduce)
  const sloppy = lt.length === 2 && lt.every((e) => (e.avgTechnique ?? 3) < P.techniqueMin)
  if (struggling || tooHard || sloppy) {
    const to = unit === 'kg' && current ? roundTo(current * (1 - P.decreasePct / 100), loadStep(ex) || 1) : unit === 'reps' && current ? Math.max(4, current - 2) : current
    return { ...base, action: 'decrease', from: current, to, unit, reason: sloppy ? 'Technique dégradée sur deux séances : allégez pour la retrouver.' : tooHard ? 'Effort perçu très élevé deux séances de suite : allégez.' : 'Répétitions sous la plage deux séances de suite : allégez pour consolider.' }
  }
  // 6) Augmentation : trois expositions au haut de la plage, effort modéré, technique correcte
  const last3 = exposures.slice(-P.minExposures)
  const topOfRange = last3.every((e) => e.avgReps >= e.repsMax)
  const effortOk = last3.every((e) => (e.avgRpe ?? 0) <= P.rpeIncreaseMax)
  const techOk = last3.every((e) => (e.avgTechnique ?? P.techniqueMin) >= P.techniqueMin)
  const lastInc = opts.decisions.filter((d) => d.exerciseId === opts.exerciseId && d.action === 'increase' && d.applied).map((d) => d.at).sort().pop() ?? opts.state?.lastIncreaseAt ?? null
  const daysSince = lastInc ? (opts.now.getTime() - new Date(lastInc).getTime()) / 86_400_000 : Infinity
  if (topOfRange && effortOk && techOk) {
    if (daysSince < P.minDaysBetweenIncreases) return { ...base, action: 'hold', from: current, to: current, unit, reason: `Dernière augmentation il y a ${Math.floor(daysSince)} j : laissez le corps s’adapter (minimum ${P.minDaysBetweenIncreases} j).` }
    if (unit === 'kg' && current) {
      const step = loadStep(ex)
      return { ...base, action: 'increase', from: current, to: roundTo(current + step, step || 1), unit, reason: `Haut de plage atteint sur ${P.minExposures} séances, effort modéré, technique correcte.` }
    }
    if (unit === 'reps' && current) return { ...base, action: 'increase', from: current, to: current + 2, unit, reason: `Haut de plage atteint sur ${P.minExposures} séances : visez 2 répétitions de plus, ou une variante plus difficile.` }
    if (unit === 's' && current) return { ...base, action: 'increase', from: current, to: current + 5, unit, reason: `Durée tenue proprement sur ${P.minExposures} séances : ajoutez 5 secondes.` }
  }
  // 7) Stagnation : information, pas un échec
  const progress = exposures.slice(-4).map((e) => (e.loadKg ?? 0) * 1000 + e.avgReps)
  const stagnating = exposures.length >= 4 && Math.max(...progress.slice(1)) <= progress[0]
  return { ...base, action: 'hold', from: current, to: current, unit, reason: stagnating ? 'Plateau sur quelques séances : ce n’est pas un échec. Consolidez, variez l’exercice ou soignez la récupération.' : 'Consolidation : continuez à viser le haut de la plage avec une technique propre.' }
}
