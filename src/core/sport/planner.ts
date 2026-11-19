import { addDays, dayKey, mondayOf, weekKey } from '../dates'
import { DEMANDING_RUN_FAMILIES, type RunFamily } from './types'
import type { SportProfile } from './profile'
import type { RecoveryState } from './recovery'
import type { SportSession } from './session'

export interface PlanSlot { date: string; kind: 'strength' | 'run'; family?: RunFamily }
export interface WeekPlan { slots: PlanSlot[]; dropped: Array<{ kind: 'strength' | 'run'; reason: string }>; notes: string[] }

/**
 * Planning de la semaine. Règles :
 *  - une seule séance par jour (jamais d'empilement) ;
 *  - la musculation est prioritaire dans les arbitrages ;
 *  - les séances déjà réalisées comptent ; les jours passés non réalisés sont perdus, et le reste de la semaine
 *    est réorganisé sans rattraper en empilant ;
 *  - un jour d'alerte n'est pas planifié ; une course exigeante ne précède pas immédiatement une séance de musculation.
 * Pur : retourne un plan, ne l'enregistre pas.
 */
export function planWeek(opts: { profile: SportProfile; sessions: SportSession[]; recovery: RecoveryState; now: Date }): WeekPlan {
  const { profile, sessions, recovery, now } = opts
  const monday = mondayOf(now)
  const wk = weekKey(now)
  const today = dayKey(now)
  const notes: string[] = []
  const dropped: WeekPlan['dropped'] = []

  const inWeek = sessions.filter((s) => weekKey(new Date(s.date + 'T12:00:00')) === wk && s.status !== 'abandoned' && s.kind !== 'other')
  const doneStrength = inWeek.filter((s) => s.status !== 'planned' && ['strength', 'hiit', 'mobility'].includes(s.kind) && s.origin !== 'unplanned').length
  const doneRuns = inWeek.filter((s) => s.status !== 'planned' && s.kind === 'run' && s.origin !== 'unplanned').length
  const occupied = new Set(inWeek.filter((s) => s.status !== 'planned').map((s) => s.date))

  const needStrength = Math.max(0, profile.availability.strengthPerWeek - doneStrength)
  const needRuns = Math.max(0, profile.availability.runsPerWeek - doneRuns)

  const allowed = profile.availability.days.length ? new Set(profile.availability.days) : new Set([0, 1, 2, 3, 4, 5, 6])
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i)
    const key = dayKey(d)
    if (key < today || occupied.has(key) || !allowed.has(i)) continue
    if (key === today && recovery.level === 'ALERTE') { notes.push('Aujourd’hui : alerte de récupération, aucune séance planifiée.'); continue }
    days.push(key)
  }

  const missed = inWeek.filter((s) => s.status === 'planned' && s.date < today).length
  if (missed) notes.push(`${missed} séance${missed > 1 ? 's' : ''} manquée${missed > 1 ? 's' : ''} : le reste de la semaine est réorganisé, sans empiler les entraînements.`)

  const slots: PlanSlot[] = []
  const free = [...days]
  // Musculation d'abord, espacée au mieux
  const pickSpread = (n: number): string[] => {
    if (n <= 0 || !free.length) return []
    const k = Math.min(n, free.length)
    const chosen: string[] = []
    for (let i = 0; i < k; i++) chosen.push(free[Math.round((i * (free.length - 1)) / Math.max(1, k - 1))] ?? free[0])
    return [...new Set(chosen)]
  }
  const strengthDays = pickSpread(needStrength)
  strengthDays.forEach((d) => { slots.push({ date: d, kind: 'strength' }); free.splice(free.indexOf(d), 1) })
  if (needStrength > strengthDays.length) dropped.push({ kind: 'strength', reason: `${needStrength - strengthDays.length} séance(s) de musculation ne tiennent pas dans les jours restants : non empilées.` })

  const runFamilies = profile.runFamilies.length ? profile.runFamilies : []
  let runPlaced = 0
  for (let r = 0; r < needRuns; r++) {
    // préfère un jour qui ne précède pas immédiatement une séance de musculation
    const nextDay = (d: string) => dayKey(addDays(new Date(d + 'T12:00:00'), 1))
    const day = free.find((d) => !strengthDays.includes(nextDay(d))) ?? free[0]
    if (!day) break
    const easyFamily = runFamilies.find((f) => !DEMANDING_RUN_FAMILIES.includes(f)) ?? runFamilies[0]
    slots.push({ date: day, kind: 'run', family: runFamilies.length ? easyFamily : undefined })
    free.splice(free.indexOf(day), 1)
    runPlaced++
  }
  if (needRuns > runPlaced) dropped.push({ kind: 'run', reason: `${needRuns - runPlaced} sortie(s) de course ne tiennent pas dans les jours restants : la musculation est prioritaire, rien n’est empilé.` })
  if (!profile.availability.days.length) notes.push('Aucun jour imposé : planning souple sur toute la semaine.')
  return { slots: slots.sort((a, b) => a.date.localeCompare(b.date)), dropped, notes }
}
