import { addDays, dayKey, daysBetweenKeys, fromDayKey } from './dates'
import { goalProgress, projectProgress, readingsOf, type Finding, type Goal, type Indicator, type LifeData, type Project } from './goals'
import type { XpEvent } from './ledger'
import type { Quest } from './quest'

/**
 * PILOTAGE : couche STRATÉGIQUE au-dessus de LIFE. Vision → Orientations → Priorités → Objectifs → Projets → Quêtes.
 * Ce module ne duplique RIEN : orientations, priorités, plans et cycles ne font que RÉFÉRENCER des objectifs, projets et indicateurs LIFE par
 * identifiant. L'avancement est toujours calculé depuis LIFE (`goalProgress`, `projectProgress`), jamais stocké. Pur : aucun import UI ni stockage.
 * Une trajectoire modifiée n'est pas un échec : chaque changement est historisé, rien n'est écrasé en silence.
 */

export type Horizon = 'short' | 'mid' | 'long'
export const HORIZON_LABEL: Record<Horizon, string> = { short: 'Court terme', mid: 'Moyen terme', long: 'Long terme' }
/** Repères indicatifs (modifiables par l'utilisateur dans le texte de sa vision) */
export const HORIZON_HINT: Record<Horizon, string> = { short: 'quelques mois', mid: '1 à 3 ans', long: '3 à 5 ans ou davantage' }

export interface Vision {
  id: string
  title: string
  description: string
  desiredSituation: string
  ambitions: string
  aspirations: string
  preserve: string
  changes: string
  /** Texte libre par horizon (aucun n'est obligatoire) */
  horizons: Partial<Record<Horizon, string>>
  status: 'active' | 'archived'
  createdAt: string
  revisedAt: string
}

export type OrientationStatus = 'todo' | 'active' | 'paused' | 'review' | 'achieved' | 'abandoned'
export const ORIENTATION_STATUS_LABEL: Record<OrientationStatus, string> = { todo: 'À définir', active: 'Active', paused: 'En pause', review: 'En réévaluation', achieved: 'Accomplie', abandoned: 'Abandonnée' }
export const ORIENTATION_STATUSES = Object.keys(ORIENTATION_STATUS_LABEL) as OrientationStatus[]
export const IMPORTANCE_LABEL: Record<1 | 2 | 3, string> = { 1: 'Secondaire', 2: 'Importante', 3: 'Fondamentale' }

export interface Orientation {
  id: string
  name: string
  description: string
  /** Vision associée (facultative : une orientation peut exister sans vision formalisée) */
  visionId: string | null
  importance: 1 | 2 | 3
  horizon: Horizon
  status: OrientationStatus
  currentState: string
  desiredState: string
  /** Références LIFE (plusieurs objectifs ou projets, un objectif peut servir plusieurs orientations) */
  indicatorIds: string[]
  goalIds: string[]
  projectIds: string[]
  order: number
  archived: boolean
  createdAt: string
  updatedAt: string
  statusAt: string
}

export type PriorityLevel = 'fundamental' | 'important' | 'secondary'
export const PRIORITY_LEVEL_LABEL: Record<PriorityLevel, string> = { fundamental: 'Fondamentale', important: 'Importante', secondary: 'Secondaire' }
export type PriorityStatus = 'active' | 'paused' | 'done' | 'dropped'
export const PRIORITY_STATUS_LABEL: Record<PriorityStatus, string> = { active: 'Active', paused: 'En pause', done: 'Accomplie', dropped: 'Abandonnée' }

export interface Priority {
  id: string
  title: string
  description: string
  orientationId: string | null
  level: PriorityLevel
  horizon: Horizon
  dueDate: string | null
  status: PriorityStatus
  /** Priorité temporaire (ex. un trimestre) */
  temporary: boolean
  goalIds: string[]
  /** Contraintes connues (texte libre) */
  constraints: string
  createdAt: string
  updatedAt: string
  statusAt: string
  levelAt: string
}

export interface AnnualPlan {
  /** `plan:<année>` */
  id: string
  year: number
  /** 1. Qu'est-ce que je souhaite accomplir cette année ? */
  aims: string
  /** 2. Pourquoi est-ce important ? */
  why: string
  /** 3. Quelles actions concrètes permettront d'y parvenir ? */
  actions: string
  orientationIds: string[]
  priorityIds: string[]
  expectedResults: string[]
  goalIds: string[]
  /** Projets structurants */
  projectIds: string[]
  constraints: string
  status: 'active' | 'closed'
  createdAt: string
  updatedAt: string
}

export type Quarter = 1 | 2 | 3 | 4
export type CycleStatus = 'planned' | 'active' | 'closed' | 'abandoned'
export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = { planned: 'Prévu', active: 'En cours', closed: 'Clos', abandoned: 'Abandonné' }

export interface Cycle {
  /** `cycle:<année>-Q<n>` */
  id: string
  year: number
  quarter: Quarter
  orientationIds: string[]
  priorityIds: string[]
  goalIds: string[]
  projectIds: string[]
  expectedResults: string[]
  indicatorIds: string[]
  status: CycleStatus
  createdAt: string
  updatedAt: string
}

export type ReviewKind = 'monthly' | 'quarterly' | 'annual' | 'free'
export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = { monthly: 'Revue mensuelle', quarterly: 'Revue trimestrielle', annual: 'Revue annuelle', free: 'Révision libre' }

/** Faits mesurés au moment de la revue : conservés avec elle (les données évolueront, la mémoire reste). */
export interface PeriodFacts {
  from: string
  to: string
  goals: { planned: number; achieved: number; items: Array<{ title: string; status: string; progressPct: number }> }
  projects: Array<{ title: string; stepsDone: number; stepsTotal: number; progressPct: number; status: string }>
  indicators: Array<{ name: string; from: string; to: string }>
  priorities: Array<{ title: string; level: PriorityLevel; status: PriorityStatus; active: boolean }>
  blocked: string[]
  changes: string[]
  /** Pistes d'après les faits : décisions finales à l'utilisateur */
  keep: string[]
  reconsider: string[]
}

export interface StrategyReview {
  /** `review:<type>:<période>` ; une nouvelle revue de la même période remplace la précédente (l'ancienne reste dans l'historique) */
  id: string
  kind: ReviewKind
  /** `2026-11`, `2026-Q4`, `2026` ou date ISO pour une révision libre */
  period: string
  at: string
  answers: Record<string, string>
  decisions: string
  facts: PeriodFacts
}

export type LogKind = 'vision' | 'orientation' | 'priority' | 'plan' | 'cycle' | 'review' | 'decision'
export const LOG_KIND_LABEL: Record<LogKind, string> = { vision: 'Vision', orientation: 'Orientations', priority: 'Priorités', plan: 'Plan annuel', cycle: 'Cycles', review: 'Revues', decision: 'Décisions' }
export interface StrategyLogEntry {
  id: string
  at: string
  kind: LogKind
  /** Type précis : `vision-revised`, `priority-level`… */
  action: string
  refType: 'vision' | 'orientation' | 'priority' | 'plan' | 'cycle' | 'review'
  refId: string
  title: string
  summary: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  note?: string
}

export interface StrategyState {
  visions: Vision[]
  orientations: Orientation[]
  priorities: Priority[]
  plans: AnnualPlan[]
  cycles: Cycle[]
  reviews: StrategyReview[]
  log: StrategyLogEntry[]
}
export const EMPTY_STRATEGY: StrategyState = { visions: [], orientations: [], priorities: [], plans: [], cycles: [], reviews: [], log: [] }

/** Paramètres (provisoires) : limite SOUPLE de priorités fondamentales actives, modifiable dans Profil et réglages. */
export const PILOTAGE_CONFIG = { maxFundamentalDefault: 3, maxFundamentalRange: [1, 8] as const, monthlyReviewDefault: false }

export interface PilotagePrefs { maxFundamental: number; reminders: { monthly: boolean; quarterly: boolean; annual: boolean } }
export const DEFAULT_PILOTAGE_PREFS: PilotagePrefs = { maxFundamental: PILOTAGE_CONFIG.maxFundamentalDefault, reminders: { monthly: false, quarterly: true, annual: true } }

// ── Calendrier ─────────────────────────────────────────────────────────
export const quarterOf = (d: Date): Quarter => (Math.floor(d.getMonth() / 3) + 1) as Quarter
export const cycleId = (year: number, q: Quarter) => `cycle:${year}-Q${q}`
export const planId = (year: number) => `plan:${year}`
export function quarterRange(year: number, q: Quarter): { from: string; to: string } {
  const first = new Date(year, (q - 1) * 3, 1, 12), last = new Date(year, q * 3, 0, 12)
  return { from: dayKey(first), to: dayKey(last) }
}
export const nextQuarter = (year: number, q: Quarter): { year: number; quarter: Quarter } => (q === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: (q + 1) as Quarter })
export const quarterLabel = (year: number, q: Quarter) => `T${q} ${year}`
export const monthPeriod = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export const monthRange = (period: string) => { const [y, m] = period.split('-').map(Number); return { from: dayKey(new Date(y, m - 1, 1, 12)), to: dayKey(new Date(y, m, 0, 12)) } }
export const yearRange = (year: number) => ({ from: `${year}-01-01`, to: `${year}-12-31` })

export interface LifeCtx { life: LifeData; quests: Quest[]; events: XpEvent[]; now: Date }

// ── Accès aux éléments LIFE référencés (références périmées ignorées) ───
const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]))
export function resolveGoals(ids: string[], life: LifeData): Goal[] { const m = byId(life.goals); return ids.map((i) => m.get(i)).filter((g): g is Goal => !!g) }
export function resolveProjects(ids: string[], life: LifeData): Project[] { const m = byId(life.projects); return ids.map((i) => m.get(i)).filter((p): p is Project => !!p) }
export function resolveIndicators(ids: string[], life: LifeData): Indicator[] { const m = byId(life.indicators); return ids.map((i) => m.get(i)).filter((x): x is Indicator => !!x) }

/** Jours distincts avec une activité réelle (quête récompensée, étape ou sous-tâche validée, critère ou étape intermédiaire validé) pour un objectif et ses projets. */
export function goalActivityDays(goal: Goal | null, projects: Project[], c: LifeCtx, from: string, to: string): Set<string> {
  const days = new Set<string>()
  const inR = (iso: string | null | undefined) => { if (!iso) return; const d = dayKey(new Date(iso)); if (d >= from && d <= to) days.add(d) }
  const projIds = new Set(projects.map((p) => p.id))
  const questIds = new Set(c.quests.filter((q) => (goal && q.goalId === goal.id) || (q.projectId && projIds.has(q.projectId))).map((q) => q.id))
  for (const e of c.events) if (e.kind === 'award' && e.status === 'valid' && e.questId && questIds.has(e.questId)) inR(e.at)
  for (const p of projects) for (const s of p.steps) { inR(s.doneAt); for (const t of s.subtasks) inR(t.doneAt) }
  if (goal) { for (const x of goal.criteria) inR(x.doneAt); for (const x of goal.milestones) inR(x.doneAt) }
  return days
}

/** Projets d'un objectif (relation LIFE) + projets rattachés directement à l'orientation. */
export const projectsOfGoal = (g: Goal, life: LifeData) => life.projects.filter((p) => p.goalId === g.id && p.status !== 'abandoned')

// ── Avancement (toujours calculé depuis LIFE) ──────────────────────────
export interface Progress { value: number | null; goals: number; projects: number }

/** Avancement d'un ensemble d'objectifs et de projets LIFE : moyenne des avancements ; null si rien n'est rattaché. */
export function contributionProgress(goalIds: string[], projectIds: string[], c: LifeCtx): Progress {
  const goals = resolveGoals(goalIds, c.life).filter((g) => g.status !== 'abandoned')
  const projects = resolveProjects(projectIds, c.life).filter((p) => p.status !== 'abandoned')
  const vals = [
    ...goals.map((g) => (g.status === 'achieved' ? 1 : goalProgress(g, c.life, c.quests, c.events, c.now).value)),
    ...projects.map((p) => (p.status === 'done' ? 1 : projectProgress(p, c.quests, c.events, c.now).value)),
  ]
  return { value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, goals: goals.length, projects: projects.length }
}
export const orientationProgress = (o: Orientation, c: LifeCtx) => contributionProgress(o.goalIds, o.projectIds, c)
export const priorityProgress = (p: Priority, c: LifeCtx) => contributionProgress(p.goalIds, [], c)

// ── Relations vues depuis LIFE ─────────────────────────────────────────
export interface GoalStrategyLinks {
  orientations: Orientation[]
  priorities: Priority[]
  cycles: Cycle[]
  plans: AnnualPlan[]
  /** Phrase de contribution à la vision (null si aucun rattachement) */
  contribution: string | null
}
export function strategyLinksOfGoal(goalId: string, s: StrategyState): GoalStrategyLinks {
  const orientations = s.orientations.filter((o) => !o.archived && o.goalIds.includes(goalId))
  const priorities = s.priorities.filter((p) => p.status !== 'dropped' && p.goalIds.includes(goalId))
  const cycles = s.cycles.filter((c) => c.status !== 'abandoned' && (c.goalIds.includes(goalId) || c.priorityIds.some((pid) => priorities.some((p) => p.id === pid))))
  const plans = s.plans.filter((p) => p.goalIds.includes(goalId))
  const vision = s.visions.find((v) => v.status === 'active')
  const withVision = orientations.find((o) => o.visionId && vision && o.visionId === vision.id) ?? (vision && orientations[0])
  const contribution = orientations.length ? `Contribue à « ${orientations[0].name} »${withVision && vision ? `, orientation de la vision « ${vision.title} »` : ''}.` : priorities.length ? `Rattaché à la priorité « ${priorities[0].title} ».` : null
  return { orientations, priorities, cycles, plans, contribution }
}
export const strategyLinksOfProject = (projectId: string, s: StrategyState) => ({
  orientations: s.orientations.filter((o) => !o.archived && o.projectIds.includes(projectId)),
  cycles: s.cycles.filter((c) => c.status !== 'abandoned' && c.projectIds.includes(projectId)),
  plans: s.plans.filter((p) => p.projectIds.includes(projectId)),
})

// ── Priorités : limite souple ──────────────────────────────────────────
export const activeFundamental = (list: Priority[]) => list.filter((p) => p.level === 'fundamental' && p.status === 'active')
export const isOverLimit = (list: Priority[], prefs: PilotagePrefs) => activeFundamental(list).length > prefs.maxFundamental

// ── Revues : faits et rappels ──────────────────────────────────────────
export function periodFacts(range: { from: string; to: string }, scope: { goalIds?: string[]; projectIds?: string[]; indicatorIds?: string[]; priorityIds?: string[] } | null, s: StrategyState, c: LifeCtx, findings: Finding[]): PeriodFacts {
  const { from, to } = range
  const inR = (iso: string | null | undefined) => !!iso && dayKey(new Date(iso)) >= from && dayKey(new Date(iso)) <= to
  const goals = scope?.goalIds ? resolveGoals(scope.goalIds, c.life) : c.life.goals.filter((g) => g.status !== 'abandoned')
  const projects = scope?.projectIds ? resolveProjects(scope.projectIds, c.life) : c.life.projects.filter((p) => p.status !== 'abandoned')
  const inds = scope?.indicatorIds ? resolveIndicators(scope.indicatorIds, c.life) : c.life.indicators.filter((i) => !i.archived && i.important)
  const prios = scope?.priorityIds ? scope.priorityIds.map((i) => s.priorities.find((p) => p.id === i)).filter((p): p is Priority => !!p) : s.priorities.filter((p) => p.status === 'active')
  const achieved = goals.filter((g) => g.status === 'achieved' && inR(g.statusAt))
  const planned = goals.filter((g) => (g.dueDate && g.dueDate >= from && g.dueDate <= to) || !!scope?.goalIds).length
  const advanced = projects.map((p) => ({ p, stepsDone: p.steps.filter((x) => x.done && inR(x.doneAt)).length })).filter((x) => x.stepsDone > 0 || (x.p.status === 'done' && inR(x.p.statusAt)))
  const indicators = inds.map((i) => { const r = readingsOf(c.life.readings, i.id).filter((x) => x.at >= from && x.at <= to); return r.length >= 2 ? { name: i.name, from: `${r[0].value}`, to: `${r[r.length - 1].value}` } : null }).filter((x): x is { name: string; from: string; to: string } => !!x)
  const changes = s.log.filter((e) => inR(e.at) && e.kind !== 'review').map((e) => e.summary)
  const withActivity = (p: Priority) => p.goalIds.some((gid) => { const g = c.life.goals.find((x) => x.id === gid); return !!g && goalActivityDays(g, projectsOfGoal(g, c.life), c, from, to).size > 0 })
  return {
    from, to,
    goals: { planned, achieved: achieved.length, items: goals.slice(0, 12).map((g) => ({ title: g.title, status: g.status, progressPct: Math.round(goalProgressSafe(g, c) * 100) })) },
    projects: advanced.map(({ p, stepsDone }) => ({ title: p.title, stepsDone, stepsTotal: p.steps.length, progressPct: Math.round(projectProgress(p, c.quests, c.events, c.now).value * 100), status: p.status })),
    indicators,
    priorities: prios.map((p) => ({ title: p.title, level: p.level, status: p.status, active: withActivity(p) })),
    blocked: findings.filter((f) => f.kind === 'step-blocked' || f.kind === 'project-late' || f.kind === 'goal-late').slice(0, 5).map((f) => f.title),
    changes: changes.slice(0, 12),
    keep: prios.filter(withActivity).map((p) => p.title),
    reconsider: prios.filter((p) => !withActivity(p)).map((p) => p.title),
  }
}
const goalProgressSafe = (g: Goal, c: LifeCtx) => (g.status === 'achieved' ? 1 : goalProgress(g, c.life, c.quests, c.events, c.now).value)

export interface ReviewDue { key: string; kind: ReviewKind; title: string; body: string; route: string }

/**
 * Revues à proposer (jamais obligatoires) : mensuelle (début de mois, si activée), trimestrielle (fin de trimestre), annuelle (décembre/janvier).
 * Une revue déjà faite pour la période, ou un rappel désactivé, ne produit rien.
 */
export function dueReviews(now: Date, s: StrategyState, prefs: PilotagePrefs): ReviewDue[] {
  const out: ReviewDue[] = []
  if (!s.orientations.length && !s.priorities.length && !s.visions.length) return out
  const has = (kind: ReviewKind, period: string) => s.reviews.some((r) => r.kind === kind && r.period === period)
  const day = now.getDate(), month = now.getMonth()
  if (prefs.reminders.monthly && day <= 7) { const prev = monthPeriod(new Date(now.getFullYear(), month - 1, 1)); if (!has('monthly', prev)) out.push({ key: `review-due:monthly:${prev}`, kind: 'monthly', title: 'Votre revue mensuelle est disponible', body: 'Facultative : quelques minutes pour prendre du recul sur le mois écoulé.', route: '/pilotage/revues' }) }
  const q = quarterOf(now), r = quarterRange(now.getFullYear(), q)
  const daysLeft = daysBetweenKeys(dayKey(now), r.to)
  if (prefs.reminders.quarterly) {
    if (daysLeft <= 10) { const p = `${now.getFullYear()}-Q${q}`; if (!has('quarterly', p)) out.push({ key: `review-due:quarterly:${p}`, kind: 'quarterly', title: 'Le bilan du trimestre est possible', body: `Le ${quarterLabel(now.getFullYear(), q)} se termine bientôt : un moment pour faire le point, sans obligation.`, route: '/pilotage/revues' }) }
    else if (daysBetweenKeys(r.from, dayKey(now)) <= 14) { const pq = q === 1 ? { y: now.getFullYear() - 1, q: 4 as Quarter } : { y: now.getFullYear(), q: (q - 1) as Quarter }; const p = `${pq.y}-Q${pq.q}`; if (!has('quarterly', p) && s.cycles.some((c) => c.id === cycleId(pq.y, pq.q) && c.status !== 'abandoned')) out.push({ key: `review-due:quarterly:${p}`, kind: 'quarterly', title: 'Le bilan du trimestre écoulé vous attend', body: 'Facultatif : revoir ce qui a avancé avant de définir le cycle en cours.', route: '/pilotage/revues' }) }
  }
  if (prefs.reminders.annual && ((month === 11 && day >= 15) || (month === 0 && day <= 15))) { const y = month === 0 ? now.getFullYear() - 1 : now.getFullYear(); if (!has('annual', String(y))) out.push({ key: `review-due:annual:${y}`, kind: 'annual', title: `La revue de l’année ${y} est possible`, body: 'Un regard d’ensemble sur l’année, quand vous le souhaitez.', route: '/pilotage/revues' }) }
  return out
}

/** Prochaine revue attendue (pour le tableau de bord) : texte neutre, jamais une échéance culpabilisante. */
export function nextReviewHint(now: Date, s: StrategyState, prefs: PilotagePrefs): string {
  const q = quarterOf(now), r = quarterRange(now.getFullYear(), q)
  const last = [...s.reviews].sort((a, b) => b.at.localeCompare(a.at))[0]
  const base = `Bilan du ${quarterLabel(now.getFullYear(), q)} possible à partir du ${dayKey(addDays(fromDayKey(r.to), -10))}`
  return last ? `${base} · dernière revue : ${REVIEW_KIND_LABEL[last.kind].toLowerCase()} (${last.period})` : `${base} · aucune revue encore, c’est facultatif${prefs.reminders.quarterly ? '' : ' · rappel désactivé'}`
}
