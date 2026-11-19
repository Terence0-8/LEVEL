import { SPORT_CONFIG } from './config'
import type { RecoveryCheck, SportSession } from './session'
import { EXERCISE_BY_ID } from './exercises'
import { MUSCLE_GROUPS, type BodyArea, type MuscleGroup, type SafetyLevel, type SorenessLevel } from './types'
import type { Exercise } from './types'

/**
 * Récupération et sécurité. ESTIMATION NON MÉDICALE : elle ne remplace pas l'avis d'un professionnel de santé.
 * Principe : la sécurité passe avant les objectifs et les récompenses.
 */
const C = SPORT_CONFIG.recovery
const SORE: Record<SorenessLevel, number> = { none: 0, light: 1, moderate: 2, high: 3 }

export interface Block {
  /** Groupe musculaire bloqué, zone corporelle, ou tout (douleur forte non localisée) */
  muscle?: MuscleGroup
  area?: BodyArea
  all?: boolean
  reason: string
}

export interface RecoveryState {
  /** 0–100 ; estimation. */
  index: number
  level: SafetyLevel
  hasCheckToday: boolean
  /** Fatigue locale par groupe, 0–100 */
  localFatigue: Record<MuscleGroup, number>
  blocked: Block[]
  messages: string[]
  volumeFactor: number
  /** Les augmentations de charge et les séances de course exigeantes sont suspendues */
  noProgression: boolean
  disclaimer: string
}

export const RECOVERY_DISCLAIMER = 'Estimation non médicale, basée sur vos réponses et votre historique. En cas de douleur persistante ou inquiétante, consultez un professionnel de santé.'

const dayMs = 86_400_000
const hoursAgo = (iso: string, now: Date) => Math.max(0, (now.getTime() - new Date(iso).getTime()) / 3_600_000)

function exerciseOf(id: string, custom: Exercise[]): Exercise | undefined {
  return EXERCISE_BY_ID[id] ?? custom.find((e) => e.id === id)
}

/** Fatigue locale (0–100) : séries pondérées avec décroissance exponentielle ; la course charge les jambes. */
export function localFatigue(sessions: SportSession[], now: Date, custom: Exercise[] = []): Record<MuscleGroup, number> {
  const acc = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>
  const decay = (h: number) => Math.pow(0.5, h / C.halfLifeHours)
  for (const s of sessions) {
    if (s.status === 'planned' || s.status === 'abandoned') continue
    const base = s.endedAt ?? s.startedAt ?? s.date + 'T12:00:00'
    const h = hoursAgo(base, now)
    if (h > 14 * 24) continue
    const w = decay(h)
    for (const slot of s.slots) for (const l of slot.logs) {
      const ex = exerciseOf(l.exerciseId, custom)
      if (!ex) continue
      const eff = (l.rpe ?? 7) / 7
      for (const g of ex.primary) acc[g] += w * eff
      for (const g of ex.secondary) acc[g] += w * eff * 0.5
    }
    if (s.run) {
      const sets = (s.run.durationSec / 60 / 5) * (s.run.rpe / 5)
      for (const g of ['quadriceps', 'ischios', 'mollets', 'fessiers'] as MuscleGroup[]) acc[g] += w * Math.min(8, sets) * 0.6
    }
    if (s.other) for (const g of s.other.muscles) acc[g] += w * (s.other.minutes / 10) * (s.other.rpe / 6)
  }
  for (const g of MUSCLE_GROUPS) acc[g] = Math.round(Math.min(100, (acc[g] / C.setsFor100) * 100))
  return acc
}

/** Dernière saisie de chaque jour (une réévaluation le même jour remplace la précédente dans le calcul, pas dans l'historique). */
export function latestPerDay(checks: RecoveryCheck[]): RecoveryCheck[] {
  const m = new Map<string, RecoveryCheck>()
  for (const c of [...checks].sort((a, b) => a.at.localeCompare(b.at))) m.set(c.day, c)
  return [...m.values()].sort((a, b) => b.day.localeCompare(a.day))
}

/** Calcule l'état de récupération et de sécurité d'un jour donné. Pur. */
export function evaluateRecovery(opts: { checks: RecoveryCheck[]; sessions: SportSession[]; now: Date; today: string; custom?: Exercise[] }): RecoveryState {
  const { checks, sessions, now, today } = opts
  const local = localFatigue(sessions, now, opts.custom)
  const days = latestPerDay(checks).filter((c) => c.day <= today)
  const check = days.find((c) => c.day === today) ?? null
  const top3 = [...Object.values(local)].sort((a, b) => b - a).slice(0, 3)
  const loadPenalty = Math.min(C.loadPenaltyMax, (top3.reduce((a, b) => a + b, 0) / 3) * (C.loadPenaltyMax / 100))

  let index = 100 - loadPenalty
  if (check) {
    index -= check.fatigue * C.fatiguePenalty + (3 - check.sleep) * C.sleepPenalty + SORE[check.soreness] * C.sorenessPenalty + C.painPenalty[check.pain]
  }
  index = Math.max(0, Math.min(100, Math.round(index)))

  const blocked: Block[] = []
  const messages: string[] = []
  let level = 'NORMAL' as SafetyLevel
  const raise = (l: SafetyLevel) => { if (l === 'ALERTE' || (l === 'VIGILANCE' && level === 'NORMAL')) level = l }
  const isMuscle = (a: string | null): a is MuscleGroup => !!a && (MUSCLE_GROUPS as readonly string[]).includes(a)

  if (check) {
    // Douleur légère répétée sur jours consécutifs, même zone
    let streak = 0
    for (let i = 0; i < days.length; i++) {
      const d = days[i]
      const expected = new Date(new Date(today + 'T12:00:00').getTime() - i * dayMs).toISOString().slice(0, 10)
      if (d.day !== expected || d.pain === 'none') break
      if (d.painArea !== check.painArea) break
      streak++
    }
    const persistent = check.pain !== 'none' && streak >= C.persistentPainDays
    if (check.pain === 'strong' || persistent) {
      raise('ALERTE')
      const reason = check.pain === 'strong' ? 'Douleur importante déclarée.' : `Douleur déclarée ${streak} jours de suite.`
      if (isMuscle(check.painArea)) blocked.push({ muscle: check.painArea, reason })
      else if (check.painArea) blocked.push({ area: check.painArea, reason })
      else blocked.push({ all: true, reason: `${reason} Zone non précisée.` })
      messages.push(`${reason} Ne forcez pas et ne terminez jamais une séance en dépassant une douleur. Évitez de solliciter la zone concernée jusqu’à une nouvelle évaluation ; si elle persiste ou vous inquiète, consultez un professionnel de santé.`)
    } else if (check.pain === 'light') {
      raise('VIGILANCE')
      messages.push('Douleur légère déclarée : évitez les mouvements qui la provoquent, réduisez le volume et surveillez-la.')
    }
    if (check.fatigue === 3 && check.sleep === 0) { raise('ALERTE'); blocked.push({ all: true, reason: 'Fatigue forte et sommeil très mauvais.' }); messages.push('Fatigue forte et sommeil très mauvais : privilégiez le repos aujourd’hui.') }
    else if (check.fatigue >= 2 || check.sleep === 0) { raise('VIGILANCE'); messages.push('Fatigue marquée ou sommeil mauvais : séance allégée recommandée, sans augmentation de charge.') }
    if (check.soreness === 'high') { raise('VIGILANCE'); messages.push('Courbatures importantes : réduisez ou évitez les groupes concernés.') }
    for (const [g, lvl] of Object.entries(check.sorenessAreas) as Array<[MuscleGroup, SorenessLevel]>) {
      if (lvl === 'high') { raise('VIGILANCE'); messages.push(`Courbatures importantes sur ${g}.`) }
    }
  } else {
    messages.push('Questionnaire du jour non rempli : environ 30 secondes pour adapter vos séances en sécurité.')
  }
  if (check && index < C.alertBelow) { raise('ALERTE'); messages.push('Indice de récupération très bas : repos recommandé.') }
  else if (check && index < C.vigilanceBelow) raise('VIGILANCE')

  const volumeFactor = level === 'ALERTE' ? 0 : level === 'VIGILANCE' ? C.vigilanceVolumeFactor : 1
  return {
    index, level, hasCheckToday: !!check, localFatigue: local, blocked, messages,
    volumeFactor, noProgression: level !== 'NORMAL', disclaimer: RECOVERY_DISCLAIMER,
  }
}

/** Un exercice est-il bloqué par l'état de récupération ? */
export function isBlocked(ex: Exercise, state: RecoveryState): string | null {
  for (const b of state.blocked) {
    if (b.all) return b.reason
    if (b.muscle && (ex.primary.includes(b.muscle) || ex.secondary.includes(b.muscle))) return b.reason
    if (b.area && ex.stress.includes(b.area)) return b.reason
  }
  return null
}

export interface RestRecommendation {
  /** Level recommande-t-il le repos de façon pertinente (donc récompensable) ? */
  corroborated: boolean
  reasons: string[]
}

/**
 * Repos « pertinent » : le niveau est VIGILANCE/ALERTE (questionnaire) ET une charge récente objective le justifie
 * (fatigue locale élevée ou plusieurs séances organisées dans les 3 derniers jours). Seules les séances guidées/organisées comptent :
 * une déclaration seule ne suffit pas à déclencher de l'XP. Pure et recalculée à partir de l'historique.
 */
export function restRecommendation(opts: { sessions: SportSession[]; day: string; custom?: Exercise[] }): RestRecommendation {
  const before = opts.sessions.filter((s) => s.date < opts.day && s.origin !== 'unplanned' && s.kind !== 'other' && (s.status === 'completed' || s.status === 'partial'))
  const fat = Math.max(0, ...Object.values(localFatigue(before, new Date(opts.day + 'T20:00:00'), opts.custom ?? [])))
  const recent = before.filter((s) => (new Date(opts.day + 'T12:00:00').getTime() - new Date(s.date + 'T12:00:00').getTime()) / dayMs <= 3).length
  const reasons: string[] = []
  if (fat >= SPORT_CONFIG.xp.restMinLocalFatigue) reasons.push(`charge récente élevée (fatigue locale ${fat}/100)`)
  if (recent >= SPORT_CONFIG.xp.restMinSessionsIn3Days) reasons.push(`${recent} séances dans les 3 derniers jours`)
  return { corroborated: reasons.length > 0, reasons }
}
