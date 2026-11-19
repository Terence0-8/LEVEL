import { SPORT_CONFIG } from './config'
import type { SportProfile } from './profile'
import type { RecoveryState } from './recovery'
import type { RunData, RunInterval, SportSession } from './session'
import { DEMANDING_RUN_FAMILIES, RUN_FAMILY_LABEL, type RunFamily } from './types'
import { weekKey } from '../dates'

const R = SPORT_CONFIG.run

export const paceOf = (distanceKm: number, durationSec: number) => (distanceKm > 0 ? Math.round(durationSec / distanceKm) : 0)

export function formatPace(secPerKm: number): string {
  if (!secPerKm) return '—'
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, '0')} /km`
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export interface RunInput {
  family: RunFamily
  distanceKm: number
  durationSec: number
  rpe: number
  intervals?: RunInterval[]
}

/** Valide et construit les données de course. Retourne une erreur lisible, jamais une exception. */
export function buildRun(input: RunInput): { ok: true; run: RunData; warnings: string[] } | { ok: false; error: string } {
  if (!(input.distanceKm > 0 && input.distanceKm <= 300)) return { ok: false, error: 'Indiquez une distance entre 0,1 et 300 km.' }
  if (!(input.durationSec >= 60 && input.durationSec <= 48 * 3600)) return { ok: false, error: 'Indiquez une durée d’au moins 1 minute.' }
  const pace = paceOf(input.distanceKm, input.durationSec)
  if (pace < 150 || pace > 1200) return { ok: false, error: 'Allure incohérente (entre 2:30 et 20:00 /km) : vérifiez distance et durée.' }
  if (!(input.rpe >= 1 && input.rpe <= 10)) return { ok: false, error: 'Difficulté ressentie : de 1 à 10.' }
  const intervals = (input.intervals ?? []).filter((i) => i.durationSec > 0)
  const warnings: string[] = []
  if (input.family === 'recovery' && input.rpe > R.recoveryRpeMax)
    warnings.push(`Une sortie de récupération doit rester facile (difficulté ≤ ${R.recoveryRpeMax}/10). Elle sera comptée comme récupération active, jamais comme séance exigeante.`)
  return { ok: true, warnings, run: { family: input.family, distanceKm: input.distanceKm, durationSec: input.durationSec, paceSecPerKm: pace, rpe: Math.round(input.rpe), intervals } }
}

export const runsOf = (sessions: SportSession[]) =>
  sessions.filter((s) => s.kind === 'run' && s.run && (s.status === 'completed' || s.status === 'partial')).sort((a, b) => a.date.localeCompare(b.date))

export interface RunWeek { week: string; km: number; minutes: number; count: number; longestKm: number; demanding: number }

export function runWeeks(sessions: SportSession[]): RunWeek[] {
  const m = new Map<string, RunWeek>()
  for (const s of runsOf(sessions)) {
    const wk = weekKey(new Date(s.date + 'T12:00:00'))
    const w = m.get(wk) ?? { week: wk, km: 0, minutes: 0, count: 0, longestKm: 0, demanding: 0 }
    w.km += s.run!.distanceKm; w.minutes += s.run!.durationSec / 60; w.count++; w.longestKm = Math.max(w.longestKm, s.run!.distanceKm)
    if (DEMANDING_RUN_FAMILIES.includes(s.run!.family) && s.run!.family !== 'long') w.demanding++
    m.set(wk, w)
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week))
}

export interface RunSuggestion {
  family: RunFamily
  minutes: number
  distanceKm: number | null
  paceRange: [number, number] | null
  effort: string
  notes: string[]
}

const ORDER_LIGHT: RunFamily[] = ['recovery', 'easy', 'long', 'tempo', 'hills', 'interval']

/** Allure facile estimée (médiane des dernières sorties faciles), si assez de données. */
export function easyPace(sessions: SportSession[]): number | null {
  const easy = runsOf(sessions).filter((s) => ['easy', 'long'].includes(s.run!.family) && s.run!.rpe <= 6).slice(-5).map((s) => s.run!.paceSecPerKm).sort((a, b) => a - b)
  if (easy.length < 2) return null
  return easy[Math.floor(easy.length / 2)]
}

/**
 * Prochaine sortie conseillée. Respecte les familles choisies (n'en ajoute jamais une exclue), le volume récent
 * (≤ +10 %/sem.), un seul levier de progression par semaine, et la récupération (pas de séance exigeante en vigilance/alerte).
 */
export function suggestRun(profile: SportProfile, sessions: SportSession[], recovery: RecoveryState, now: Date): RunSuggestion | null {
  const enabled = ORDER_LIGHT.filter((f) => profile.runFamilies.includes(f))
  if (!enabled.length) return null
  if (recovery.level === 'ALERTE') return null
  const notes: string[] = []
  const weeks = runWeeks(sessions)
  const thisWeek = weeks.find((w) => w.week === weekKey(now))
  const prev = weeks.filter((w) => w.week !== weekKey(now)).slice(-3)
  const pace = easyPace(sessions)
  const runs = runsOf(sessions)

  // Premier test : prudent, non maximal, sur la famille la plus douce choisie.
  if (!runs.length) {
    const f = enabled.includes('easy') ? 'easy' : enabled[0]
    return { family: f, minutes: R.firstTestMinutes, distanceKm: null, paceRange: null, effort: 'Allure de conversation (difficulté 3–4/10)', notes: ['Premier test prudent : courez à une allure où vous pouvez parler. Ce n’est pas un test maximal.'] }
  }

  const baseline = prev.length ? prev.reduce((a, w) => a + w.minutes, 0) / prev.length : thisWeek?.minutes ?? R.firstTestMinutes * 2
  const demandingBlocked = recovery.level !== 'NORMAL'
  const demandingDone = thisWeek?.demanding ?? 0
  const longDone = runs.some((s) => weekKey(new Date(s.date + 'T12:00:00')) === weekKey(now) && s.run!.family === 'long')
  const easyShare = (() => { const rs = runs.slice(-8); const tot = rs.reduce((a, s) => a + s.run!.durationSec, 0); const easy = rs.filter((s) => ['easy', 'recovery', 'long'].includes(s.run!.family)).reduce((a, s) => a + s.run!.durationSec, 0); return tot ? easy / tot : 1 })()

  let family: RunFamily = enabled.includes('easy') ? 'easy' : enabled[0]
  if (recovery.level === 'VIGILANCE' && enabled.includes('recovery')) family = 'recovery'
  else if (!demandingBlocked && easyShare >= R.easyShareMin && demandingDone === 0) {
    const demanding = enabled.filter((f) => DEMANDING_RUN_FAMILIES.includes(f) && f !== 'long')
    if (demanding.length && (thisWeek?.count ?? 0) >= 1) family = demanding[0]
  }
  if (family === 'easy' && enabled.includes('long') && !longDone && (thisWeek?.count ?? 0) >= 2) family = 'long'
  if (demandingBlocked && DEMANDING_RUN_FAMILIES.includes(family) && family !== 'long') family = enabled.includes('easy') ? 'easy' : enabled[0]
  if (family === 'recovery') notes.push('Sortie de récupération : très facile, courte, jamais exigeante.')

  // Un seul levier de progression par semaine : volume, sortie longue ou intensité.
  const lever = (['volume', 'long', 'intensity'] as const)[Number(weekKey(now).slice(-2)) % 3]
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0)
  const recentMin = runs.filter((s) => s.run!.family !== 'recovery').slice(-5).map((s) => s.run!.durationSec / 60)
  const easyRef = Math.max(15, Math.round(median(recentMin) || R.firstTestMinutes))
  const longRef = Math.max(easyRef * 1.3, ...runs.slice(-8).map((s) => s.run!.durationSec / 60))
  const maxNext = baseline * (1 + R.maxWeeklyVolumeIncreasePct / 100)
  const remaining = Math.max(15, maxNext - (thisWeek?.minutes ?? 0))
  const grow = (v: number, on: boolean) => (on ? v * (1 + R.maxWeeklyVolumeIncreasePct / 100) : v)
  let minutes = Math.round(family === 'long' ? grow(longRef, lever === 'long') : family === 'recovery' ? 20 : grow(easyRef, lever === 'volume'))
  minutes = Math.max(15, Math.min(minutes, Math.round(remaining)))
  notes.push(`Cette semaine, un seul levier progresse : ${lever === 'volume' ? 'le volume (+10 % maximum)' : lever === 'long' ? 'la sortie longue' : 'l’intensité'}. Les deux autres restent stables.`)

  const paceRange: [number, number] | null = pace ? (family === 'recovery' ? [pace + 20, pace + 50] : family === 'tempo' ? [pace - 40, pace - 20] : family === 'easy' || family === 'long' ? [pace - 5, pace + 25] : null) : null
  const effort = family === 'recovery' ? 'Très facile (difficulté 2–3/10)' : family === 'easy' || family === 'long' ? 'Allure de conversation (3–5/10)' : family === 'tempo' ? 'Soutenue mais contrôlée (6–7/10)' : family === 'interval' ? 'Intervalles courts à effort élevé, récupérations complètes (7–8/10)' : 'Effort en montée, redescente tranquille (6–7/10)'
  const distanceKm = pace ? Math.round(((minutes * 60) / (paceRange ? (paceRange[0] + paceRange[1]) / 2 : pace)) * 10) / 10 : null
  return { family, minutes, distanceKm, paceRange, effort, notes: [...notes, `Famille proposée : ${RUN_FAMILY_LABEL[family]}.`] }
}
