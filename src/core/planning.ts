import { addDays, dayKey, daysBetweenKeys } from './dates'
import type { XpEvent } from './ledger'
import { simplifiedValues } from './missed'
import type { PlanningPrefs } from './prefs'
import type { Quest } from './quest'
import { cycleProgress } from './questState'
import type { RecoveryState } from './sport/recovery'
import type { SportSession } from './sport/session'

/**
 * Planning central LIFE + SPORT. Pur. Les programmations internes restent INDÉPENDANTES (LIFE : quêtes ; SPORT : séances et règles
 * de récupération) : ce module les LIT, détecte les conflits et PROPOSE. Aucune modification n'est jamais appliquée en silence :
 * chaque réorganisation est une proposition à confirmer, tracée, et les échéances/engagements importants ne sont jamais déplacés.
 */

export interface Commitment {
  id: string
  title: string
  /** « YYYY-MM-DD » */
  date: string
  /** « HH:MM » ou null (journée) */
  start: string | null
  minutes: number
  important: boolean
  note: string
  createdAt: string
}

export interface PlanMove {
  id: string
  kind: 'quest'
  refId: string
  title: string
  from: string | null
  to: string | null
  at: string
  reason: string
  byLevel: boolean
}

export type ItemKind = 'quest' | 'sport' | 'commitment'

export interface PlanItem {
  id: string
  kind: ItemKind
  refId: string
  title: string
  date: string
  start: string | null
  minutes: number
  /** Engagement ou échéance importante : jamais déplacé automatiquement */
  important: boolean
  /** Non déplaçable par Level (engagements, échéances importantes, routines récurrentes, retards) */
  fixed: boolean
  domain: 'LIFE' | 'SPORT' | 'OTHER'
  categoryId?: string | null
  dueDate?: string | null
  overdue?: boolean
  recurring?: boolean
}

export const isImportantQuest = (q: Quest) => q.priority === 'high'

export interface PlanContext {
  quests: Quest[]
  events: XpEvent[]
  commitments: Commitment[]
  sessions: SportSession[]
  moves: PlanMove[]
  prefs: PlanningPrefs
  /** Jours de disponibilité SPORT (profil sportif) ; vide = souple */
  sportDays: number[]
  recovery: RecoveryState
  now: Date
}

export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7
const dateOf = (key: string) => new Date(key + 'T12:00:00')
export const capacityOn = (prefs: PlanningPrefs, key: string) => (prefs.days.includes(weekdayIndex(dateOf(key))) ? prefs.dailyCapacityMin : 0)
export const usableOn = (prefs: PlanningPrefs, key: string) => Math.round(capacityOn(prefs, key) * (1 - prefs.marginPct / 100))

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = dateOf(from); dayKey(d) <= to; d = addDays(d, 1)) out.push(dayKey(d))
  return out
}

export interface Plan {
  items: PlanItem[]
  /** Quêtes ouvertes sans jour ni échéance : jamais placées automatiquement (on ne remplit pas les journées) */
  backlog: Quest[]
}

/** Éléments du planning sur [from, to]. */
export function buildPlan(ctx: PlanContext, from: string, to: string): Plan {
  const today = dayKey(ctx.now)
  const items: PlanItem[] = []
  const backlog: Quest[] = []
  for (const q of ctx.quests) {
    if (q.archived) continue
    const cp = cycleProgress(q, ctx.events, ctx.now)
    if (cp.completed) continue
    const remaining = Math.max(5, Math.round(q.effortMinutes * (1 - cp.progress)))
    const base = { kind: 'quest' as const, refId: q.id, title: q.title, start: null, domain: 'LIFE' as const, categoryId: q.categoryId, dueDate: q.dueDate }
    if (q.type === 'daily') {
      for (const d of daysBetween(from > today ? from : today, to)) items.push({ ...base, id: `q:${q.id}:${d}`, date: d, minutes: d === today ? remaining : q.effortMinutes, important: false, fixed: true, recurring: true })
      continue
    }
    if (q.type === 'weekly' && !q.plannedFor && !q.dueDate) { backlog.push(q); continue }
    const date = q.plannedFor ?? q.dueDate ?? null
    if (!date) { backlog.push(q); continue }
    const overdue = date < today
    const d = overdue ? today : date
    if (d < from || d > to) continue
    const important = isImportantQuest(q)
    items.push({ ...base, id: `q:${q.id}`, date: d, minutes: remaining, important, fixed: important || overdue, overdue })
  }
  for (const s of ctx.sessions) {
    if (!['planned', 'active', 'paused'].includes(s.status) || s.date < from || s.date > to) continue
    items.push({ id: `s:${s.id}`, kind: 'sport', refId: s.id, title: s.title || (s.kind === 'run' ? 'Course' : 'Musculation'), date: s.date, start: null, minutes: s.plannedMinutes || 45, important: false, fixed: false, domain: 'SPORT' })
  }
  for (const c of ctx.commitments) {
    if (c.date < from || c.date > to) continue
    items.push({ id: `c:${c.id}`, kind: 'commitment', refId: c.id, title: c.title, date: c.date, start: c.start, minutes: c.minutes, important: c.important, fixed: true, domain: 'OTHER' })
  }
  return { items: items.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '99').localeCompare(b.start ?? '99')), backlog }
}

// ── Conflits ─────────────────────────────────────────────────────────
export type ConflictType = 'overlap' | 'overload' | 'near-capacity' | 'sport-recovery' | 'sport-double' | 'sport-unavailable' | 'deadline-risk' | 'important-crowded'
export interface Conflict { id: string; type: ConflictType; date: string; severity: 'info' | 'warn' | 'conflict'; itemIds: string[]; message: string }

const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
export const dayLoad = (items: PlanItem[], date: string) => items.filter((i) => i.date === date).reduce((n, i) => n + i.minutes, 0)

export function detectConflicts(ctx: PlanContext, plan: Plan, from: string, to: string): Conflict[] {
  const out: Conflict[] = []
  const today = dayKey(ctx.now)
  for (const date of daysBetween(from, to)) {
    const day = plan.items.filter((i) => i.date === date)
    if (!day.length) continue
    const cap = capacityOn(ctx.prefs, date), usable = usableOn(ctx.prefs, date), load = dayLoad(plan.items, date)

    // Chevauchements d'horaires
    const timed = day.filter((i) => i.start).sort((a, b) => a.start!.localeCompare(b.start!))
    for (let k = 1; k < timed.length; k++) {
      const prev = timed[k - 1], cur = timed[k]
      if (hm(cur.start!) < hm(prev.start!) + prev.minutes)
        out.push({ id: `overlap:${prev.id}:${cur.id}`, type: 'overlap', date, severity: 'conflict', itemIds: [prev.id, cur.id], message: `« ${prev.title} » (${prev.start}) et « ${cur.title} » (${cur.start}) se chevauchent.` })
    }
    // Charge
    if (cap === 0) out.push({ id: `overload:${date}`, type: 'overload', date, severity: 'warn', itemIds: day.map((i) => i.id), message: `Jour marqué indisponible, mais ${load} min sont prévues.` })
    else if (load > cap) out.push({ id: `overload:${date}`, type: 'overload', date, severity: 'conflict', itemIds: day.map((i) => i.id), message: `Journée surchargée : ${load} min prévues pour ${cap} min de capacité.` })
    else if (load > usable) out.push({ id: `near:${date}`, type: 'near-capacity', date, severity: 'warn', itemIds: day.map((i) => i.id), message: `Journée chargée : ${load} min sur ${usable} min recommandées (marge de ${ctx.prefs.marginPct} % conservée).` })
    // Protection des engagements importants
    const important = day.filter((i) => i.important)
    if (important.length && load > usable) out.push({ id: `crowded:${date}`, type: 'important-crowded', date, severity: 'warn', itemIds: important.map((i) => i.id), message: `Engagement important le même jour qu'une journée chargée : « ${important[0].title} » est protégé, d'autres éléments peuvent être déplacés.` })
    // Règles SPORT
    const sport = day.filter((i) => i.kind === 'sport')
    if (sport.length > 1) out.push({ id: `sport-double:${date}`, type: 'sport-double', date, severity: 'info', itemIds: sport.map((i) => i.id), message: 'Deux séances sportives le même jour : exceptionnel, seulement si la récupération le permet.' })
    if (sport.length && ctx.sportDays.length && !ctx.sportDays.includes(weekdayIndex(dateOf(date))))
      out.push({ id: `sport-day:${date}`, type: 'sport-unavailable', date, severity: 'info', itemIds: sport.map((i) => i.id), message: 'Séance prévue un jour hors de vos disponibilités sportives.' })
    if (sport.length && date === today && ctx.recovery.level !== 'NORMAL')
      out.push({ id: `sport-rec:${date}`, type: 'sport-recovery', date, severity: ctx.recovery.level === 'ALERTE' ? 'conflict' : 'warn', itemIds: sport.map((i) => i.id), message: ctx.recovery.level === 'ALERTE' ? 'Alerte de récupération : cette séance ne doit pas avoir lieu avant réévaluation.' : 'Vigilance de récupération : séance allégée, sans progression de charge.' })
  }
  // Échéances qui ne tiennent plus dans la capacité restante
  for (const q of ctx.quests) {
    if (q.archived || !q.dueDate || q.dueDate < today) continue
    const it = plan.items.find((i) => i.refId === q.id && i.kind === 'quest')
    if (!it) continue
    const window = daysBetween(today, q.dueDate)
    const spare = window.reduce((n, d) => n + Math.max(0, usableOn(ctx.prefs, d) - dayLoad(plan.items, d) + (d === it.date ? it.minutes : 0) * 0), 0)
    if (spare < it.minutes) out.push({ id: `deadline:${q.id}`, type: 'deadline-risk', date: q.dueDate, severity: 'warn', itemIds: [it.id], message: `« ${q.title} » : ${it.minutes} min à réaliser avant le ${q.dueDate}, mais seulement ${spare} min de marge disponibles.` })
  }
  return out
}

// ── Priorités ────────────────────────────────────────────────────────
export interface Score { questId: string; score: number; urgency: number; importance: number; longTerm: boolean; reasons: string[] }

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

/** Quêtes « long terme » (proxy tant que le module Objectifs n'existe pas) : projets personnels conséquents ou à étapes. */
export const isLongTerm = (q: Quest) => (q.type === 'personal' || q.type === 'exceptional') && (q.effortMinutes >= 90 || q.steps.length >= 3)

export const postponements = (moves: PlanMove[], questId: string, now: Date, days = 30) =>
  moves.filter((m) => m.refId === questId && m.from && m.to && m.to > m.from && (now.getTime() - new Date(m.at).getTime()) / 86_400_000 <= days).length

/**
 * Score transversal : urgence, importance, échéance, équilibre entre catégories LIFE, ancienneté des reports.
 * L'effort et la capacité interviennent à la sélection (`planDay`), pas dans le score.
 */
export function scoreQuests(ctx: PlanContext, quests: Quest[]): Map<string, Score> {
  const today = dayKey(ctx.now)
  const share = new Map<string, number>()
  const since = ctx.now.getTime() - 14 * 86_400_000
  let total = 0
  for (const e of ctx.events) if (e.domain === 'LIFE' && e.categoryId && new Date(e.at).getTime() >= since && e.amount > 0) { share.set(e.categoryId, (share.get(e.categoryId) ?? 0) + e.amount); total += e.amount }
  const cats = new Set(ctx.quests.filter((q) => !q.archived).map((q) => q.categoryId))
  const mean = cats.size ? 1 / cats.size : 1
  const out = new Map<string, Score>()
  for (const q of quests) {
    const reasons: string[] = []
    let urgency = 0.1
    if (q.type === 'daily') { urgency = 0.65; reasons.push('quête quotidienne') }
    else if (q.type === 'weekly') { urgency = 0.2 + (weekdayIndex(ctx.now) / 6) * 0.5; reasons.push('quête hebdomadaire') }
    const due = q.dueDate
    if (due) {
      const d = daysBetweenKeys(today, due)
      urgency = Math.max(urgency, d <= 0 ? 1 : d === 1 ? 0.9 : d <= 3 ? 0.7 : d <= 7 ? 0.45 : d <= 14 ? 0.25 : 0.15)
      reasons.push(d < 0 ? 'échéance dépassée' : d === 0 ? 'échéance aujourd’hui' : d === 1 ? 'échéance demain' : `échéance dans ${d} j`)
    }
    const importance = q.priority === 'high' ? 1 : q.priority === 'normal' ? 0.55 : 0.25
    if (q.priority === 'high') reasons.push('importante')
    const catShare = total ? (share.get(q.categoryId) ?? 0) / total : mean
    const balance = total ? clamp((mean - catShare) / mean) * 0.15 : 0
    if (balance > 0.05) reasons.push('catégorie peu travaillée récemment')
    const n = postponements(ctx.moves, q.id, ctx.now)
    const stale = Math.min(0.2, n * 0.05)
    if (n >= 1) reasons.push(`reportée ${n} fois`)
    const lt = isLongTerm(q)
    if (lt) reasons.push('objectif de long terme')
    out.set(q.id, { questId: q.id, score: 0.45 * urgency + 0.3 * importance + balance + stale + (lt ? 0.05 : 0), urgency, importance, longTerm: lt, reasons })
  }
  return out
}

export interface Suggestion { questId: string; title: string; minutes: number; score: number; reasons: string[] }
export interface Deferred { questId: string; title: string; minutes: number; reason: string }
export interface DayPlan {
  date: string
  capacity: number
  /** Minutes recommandées (capacité moins marge) : Level ne dépasse jamais cette limite en suggérant */
  usable: number
  items: PlanItem[]
  load: number
  spare: number
  suggestions: Suggestion[]
  deferred: Deferred[]
  overloaded: boolean
}

export const MAX_SUGGESTIONS_PER_DAY = 4
const SECONDARY_BELOW = 0.35

/**
 * Plan d'une journée : ce qui est déjà placé, puis des suggestions choisies par priorité jusqu'à la limite recommandée.
 * Jamais de remplissage artificiel : on s'arrête à la marge, et au plus 4 suggestions. Le reste est reporté avec la raison.
 */
export function planDay(ctx: PlanContext, plan: Plan, date: string): DayPlan {
  const capacity = capacityOn(ctx.prefs, date), usable = usableOn(ctx.prefs, date)
  const items = plan.items.filter((i) => i.date === date)
  const load = dayLoad(plan.items, date)
  let spare = Math.max(0, usable - load)
  const placed = new Set(items.map((i) => i.refId))
  const candidates = plan.backlog.filter((q) => !placed.has(q.id))
  const scores = scoreQuests(ctx, candidates)
  const sorted = [...candidates].sort((a, b) => scores.get(b.id)!.score - scores.get(a.id)!.score || a.title.localeCompare(b.title))
  const suggestions: Suggestion[] = []
  const deferred: Deferred[] = []
  for (const q of sorted) {
    const s = scores.get(q.id)!
    const minutes = Math.max(5, q.effortMinutes)
    if (suggestions.length < MAX_SUGGESTIONS_PER_DAY && minutes <= spare && s.score >= SECONDARY_BELOW) { suggestions.push({ questId: q.id, title: q.title, minutes, score: s.score, reasons: s.reasons }); spare -= minutes }
    else deferred.push({ questId: q.id, title: q.title, minutes, reason: s.score < SECONDARY_BELOW ? 'tâche secondaire : reportée' : suggestions.length >= MAX_SUGGESTIONS_PER_DAY ? 'assez de suggestions pour aujourd’hui' : 'ne tient pas dans la capacité restante' })
  }
  return { date, capacity, usable, items, load, spare: Math.max(0, usable - load - suggestions.reduce((n, x) => n + x.minutes, 0)), suggestions, deferred, overloaded: load > usable }
}

// ── Propositions de réorganisation ───────────────────────────────────
export type ProposalKind = 'move-quest' | 'simplify-quest' | 'unschedule-quest' | 'reorganise-sport' | 'review-repeated'
export interface Proposal {
  id: string
  kind: ProposalKind
  title: string
  detail: string
  questId?: string
  from?: string
  to?: string | null
  /** Nouvelles valeurs proposées (simplification) */
  simplified?: { difficulty: Quest['difficulty']; effortMinutes: number }
  severity: 'info' | 'warn'
}

export const REPEATED_POSTPONEMENT_THRESHOLD = 3

/**
 * Propose des réorganisations (jamais appliquées d'office). Règles :
 *  - seuls les éléments COURANTS sont déplaçables (quêtes non importantes, ni récurrentes, ni en retard) ;
 *  - jamais d'engagement, d'échéance ou de quête importante ; jamais après l'échéance d'une quête ;
 *  - on cherche le jour le plus proche avec de la marge ; sinon simplification, sinon retrait du jour ;
 *  - les objectifs de long terme sont déplacés mais jamais retirés du planning ;
 *  - une séance en conflit de récupération déclenche une réorganisation SPORT par son propre moteur.
 */
export function proposeReorganisations(ctx: PlanContext, plan: Plan, from: string, to: string): Proposal[] {
  const out: Proposal[] = []
  const today = dayKey(ctx.now)
  const work = plan.items.map((i) => ({ ...i }))
  const qOf = new Map(ctx.quests.map((q) => [q.id, q]))
  const scores = scoreQuests(ctx, ctx.quests.filter((q) => !q.archived))
  const days = daysBetween(from, to)
  const load = (d: string) => dayLoad(work, d)

  for (const date of days) {
    if (date < today) continue
    const usable = usableOn(ctx.prefs, date)
    if (load(date) <= usable && capacityOn(ctx.prefs, date) > 0) continue
    const movable = work.filter((i) => i.date === date && i.kind === 'quest' && !i.fixed && !i.important && !i.recurring)
      .sort((a, b) => scores.get(a.refId)!.score - scores.get(b.refId)!.score)
    for (const it of movable) {
      if (load(date) <= usable && capacityOn(ctx.prefs, date) > 0) break
      const q = qOf.get(it.refId)!
      const limit = q.dueDate ?? to
      const target = days.find((d) => d > date && d <= limit && d >= today && capacityOn(ctx.prefs, d) > 0 && load(d) + it.minutes <= usableOn(ctx.prefs, d))
      if (target) {
        out.push({ id: `move:${q.id}:${date}:${target}`, kind: 'move-quest', questId: q.id, from: date, to: target, severity: 'info', title: `Déplacer « ${q.title} » au ${target}`, detail: `Le ${date} est chargé (${load(date)} min pour ${usable} recommandées). Le ${target} a de la marge${q.dueDate ? `, avant l'échéance du ${q.dueDate}` : ''}.` })
        it.date = target
      } else if (q.effortMinutes > 15 && simplifiedValues(q).effortMinutes < q.effortMinutes) {
        const s = simplifiedValues(q)
        out.push({ id: `simplify:${q.id}:${date}`, kind: 'simplify-quest', questId: q.id, from: date, simplified: s, severity: 'info', title: `Simplifier « ${q.title} »`, detail: `Aucun jour proche ne peut l'accueillir : effort ${q.effortMinutes} → ${s.effortMinutes} min. Les XP déjà acquises sont conservées.` })
        it.minutes = s.effortMinutes
      } else if (!q.dueDate && !isLongTerm(q)) {
        out.push({ id: `unschedule:${q.id}:${date}`, kind: 'unschedule-quest', questId: q.id, from: date, to: null, severity: 'info', title: `Retirer « ${q.title} » de la journée`, detail: 'Tâche secondaire sans échéance : elle repart dans la liste à planifier, sans pénalité.' })
        it.date = '9999-12-31'
      }
    }
  }
  const sportIssue = detectConflicts(ctx, plan, from, to).find((c) => ['sport-recovery', 'sport-unavailable', 'sport-double'].includes(c.type) && c.severity !== 'info')
  if (sportIssue) out.push({ id: `sport:${sportIssue.date}`, kind: 'reorganise-sport', from: sportIssue.date, severity: 'warn', title: 'Réorganiser la semaine sportive', detail: `${sportIssue.message} Le moteur SPORT replace les séances sans les empiler et en respectant la récupération.` })
  for (const q of ctx.quests) {
    if (q.archived) continue
    const n = postponements(ctx.moves, q.id, ctx.now)
    if (n >= REPEATED_POSTPONEMENT_THRESHOLD) out.push({ id: `repeated:${q.id}`, kind: 'review-repeated', questId: q.id, severity: 'warn', title: `« ${q.title} » a été reportée ${n} fois`, detail: 'Plutôt que de la reporter encore : la simplifier, la remplacer, la suspendre ou la découper en étapes. Cet objectif n\'est pas abandonné sans votre décision.' })
  }
  return out
}
