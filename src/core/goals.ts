import { addDays, dayKey, daysBetweenKeys } from './dates'
import type { XpEvent } from './ledger'
import type { PlanningPrefs } from './prefs'
import { usableOn } from './planning'
import { isRecurring, type Priority, type Quest } from './quest'
import { cycleProgress } from './questState'

/**
 * Objectifs, projets, étapes et indicateurs (LIFE V1.1). Pur : aucun import UI ni stockage.
 * Hiérarchie souple : Objectif → Projets → Étapes → Quêtes. Une quête reste une quête LIFE ; elle est validée et récompensée UNIQUEMENT
 * par le moteur XP existant. Valider une étape, un projet ou un objectif n'écrit jamais dans le journal d'XP (pas de double récompense).
 */

// ── Types ─────────────────────────────────────────────────────────────
export type GoalStatus = 'todo' | 'active' | 'paused' | 'achieved' | 'abandoned'
export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = { todo: 'À définir', active: 'En cours', paused: 'En pause', achieved: 'Atteint', abandoned: 'Abandonné' }
export const GOAL_STATUSES = Object.keys(GOAL_STATUS_LABEL) as GoalStatus[]

export type ProjectStatus = 'prepare' | 'active' | 'paused' | 'done' | 'abandoned'
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { prepare: 'À préparer', active: 'En cours', paused: 'En pause', done: 'Terminé', abandoned: 'Abandonné' }
export const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]

export const IMPORTANCE_LABEL: Record<1 | 2 | 3, string> = { 1: 'Secondaire', 2: 'Importante', 3: 'Essentielle' }

export interface Criterion { id: string; title: string; done: boolean; doneAt: string | null }
export interface Milestone { id: string; title: string; dueDate: string | null; done: boolean; doneAt: string | null }

export interface Goal {
  id: string
  title: string
  description: string
  categoryId: string
  /** ISO */
  createdAt: string
  /** « YYYY-MM-DD » */
  dueDate: string | null
  priority: Priority
  importance: 1 | 2 | 3
  status: GoalStatus
  /** Critères de réussite : validés explicitement par l'utilisateur */
  criteria: Criterion[]
  /** Étapes intermédiaires de l'objectif */
  milestones: Milestone[]
  indicatorIds: string[]
  /** Objectifs que l'utilisateur juge en tension avec celui-ci (Level le signale, ne modifie rien) */
  conflictsWith: string[]
  statusAt: string
  updatedAt: string
}

export interface Subtask { id: string; title: string; done: boolean; doneAt: string | null }
export interface Step {
  id: string
  title: string
  dueDate: string | null
  /** Validation EXPLICITE : jamais déduite des sous-tâches ou des quêtes */
  done: boolean
  doneAt: string | null
  /** Motif de blocage saisi par l'utilisateur (null = non bloquée) */
  blocked: string | null
  subtasks: Subtask[]
}

export interface Project {
  id: string
  title: string
  description: string
  categoryId: string
  goalId: string | null
  priority: Priority
  startDate: string | null
  dueDate: string | null
  status: ProjectStatus
  steps: Step[]
  createdAt: string
  updatedAt: string
  statusAt: string
}

export type IndicatorKind = 'number' | 'money' | 'duration' | 'percent' | 'custom'
export const INDICATOR_KIND_LABEL: Record<IndicatorKind, string> = { number: 'Nombre', money: 'Montant', duration: 'Durée', percent: 'Pourcentage', custom: 'Unité libre' }
export type Frequency = 'daily' | 'weekly' | 'monthly'
export const FREQUENCY_DAYS: Record<Frequency, number> = { daily: 1, weekly: 7, monthly: 31 }
export const FREQ_LABEL: Record<Frequency, string> = { daily: 'Chaque jour', weekly: 'Chaque semaine', monthly: 'Chaque mois' }

export interface Indicator {
  id: string
  name: string
  categoryId: string
  kind: IndicatorKind
  unit: string
  /** Valeur cible facultative */
  target: number | null
  frequency: Frequency | null
  important: boolean
  archived: boolean
  createdAt: string
}

export interface Reading { id: string; indicatorId: string; value: number; /** « YYYY-MM-DD » */ at: string; note: string; recordedAt: string }

export interface LifeData { goals: Goal[]; projects: Project[]; indicators: Indicator[]; readings: Reading[] }

export const DEFAULT_UNIT: Record<IndicatorKind, string> = { number: '', money: '€', duration: 'min', percent: '%', custom: '' }

// ── Quêtes rattachées ─────────────────────────────────────────────────
export const questsOfProject = (quests: Quest[], projectId: string) => quests.filter((q) => !q.archived && q.projectId === projectId)
export const questsOfStep = (quests: Quest[], stepId: string) => quests.filter((q) => !q.archived && q.stepId === stepId)
export const questsOfGoal = (quests: Quest[], goalId: string) => quests.filter((q) => !q.archived && q.goalId === goalId)

/** Avancement réel d'une quête non récurrente (0–1) : validée = 1, étapes partielles = part réellement validée. */
function questRatio(q: Quest, events: XpEvent[], now: Date): number {
  const cp = cycleProgress(q, events, now)
  return cp.completed ? 1 : q.steps.length ? cp.doneSteps / q.steps.length : 0
}
const oneShot = (quests: Quest[]) => quests.filter((q) => !isRecurring(q.type))
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

// ── Avancement ────────────────────────────────────────────────────────
/** Part maximale créditée à une étape NON validée : seule la validation explicite la fait passer à 100 %. */
export const OPEN_STEP_CAP = 0.9

export function stepProgress(step: Step, quests: Quest[], events: XpEvent[], now: Date): number {
  if (step.done) return 1
  const items = [...step.subtasks.map((s) => (s.done ? 1 : 0)), ...oneShot(questsOfStep(quests, step.id)).map((q) => questRatio(q, events, now))]
  return items.length ? Math.min(OPEN_STEP_CAP, mean(items)) : 0
}

export interface ProjectProgress { value: number; doneSteps: number; totalSteps: number; openQuests: number; doneQuests: number }

export function projectProgress(p: Project, quests: Quest[], events: XpEvent[], now: Date): ProjectProgress {
  const mine = oneShot(questsOfProject(quests, p.id))
  const loose = mine.filter((q) => !q.stepId || !p.steps.some((s) => s.id === q.stepId))
  const units = p.steps.map((s) => stepProgress(s, quests, events, now))
  if (loose.length) units.push(Math.min(OPEN_STEP_CAP, mean(loose.map((q) => questRatio(q, events, now)))))
  const doneQuests = mine.filter((q) => questRatio(q, events, now) === 1).length
  return { value: mean(units), doneSteps: p.steps.filter((s) => s.done).length, totalSteps: p.steps.length, doneQuests, openQuests: mine.length - doneQuests }
}

export interface GoalProgress { value: number; parts: Array<{ label: string; value: number }> }

/** Progression d'un objectif = moyenne des composantes qui existent (projets, critères, étapes intermédiaires, quêtes directes). */
export function goalProgress(g: Goal, data: Pick<LifeData, 'projects'>, quests: Quest[], events: XpEvent[], now: Date): GoalProgress {
  const parts: GoalProgress['parts'] = []
  const projs = data.projects.filter((p) => p.goalId === g.id && p.status !== 'abandoned')
  if (projs.length) parts.push({ label: 'Projets', value: mean(projs.map((p) => (p.status === 'done' ? 1 : projectProgress(p, quests, events, now).value))) })
  if (g.criteria.length) parts.push({ label: 'Critères de réussite', value: g.criteria.filter((c) => c.done).length / g.criteria.length })
  if (g.milestones.length) parts.push({ label: 'Étapes intermédiaires', value: g.milestones.filter((m) => m.done).length / g.milestones.length })
  const direct = oneShot(questsOfGoal(quests, g.id)).filter((q) => !q.projectId)
  if (direct.length) parts.push({ label: 'Quêtes', value: mean(direct.map((q) => questRatio(q, events, now))) })
  return { value: parts.length ? mean(parts.map((x) => x.value)) : 0, parts }
}

// ── Indicateurs ───────────────────────────────────────────────────────
export const readingsOf = (readings: Reading[], indicatorId: string) => readings.filter((r) => r.indicatorId === indicatorId).sort((a, b) => a.at.localeCompare(b.at) || a.recordedAt.localeCompare(b.recordedAt))

export function indicatorState(ind: Indicator, readings: Reading[]) {
  const list = readingsOf(readings, ind.id)
  const first = list[0] ?? null
  const last = list[list.length - 1] ?? null
  const delta = first && last && list.length > 1 ? Math.round((last.value - first.value) * 100) / 100 : null
  let progress: number | null = null
  if (ind.target !== null && first && last) {
    const span = ind.target - first.value
    progress = span === 0 ? (last.value === ind.target ? 1 : 0) : Math.min(1, Math.max(0, (last.value - first.value) / span))
  }
  return { list, first, last, delta, progress, current: last?.value ?? null }
}

export function formatValue(kind: IndicatorKind, unit: string, v: number): string {
  const n = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v)
  if (kind === 'duration') { const h = Math.floor(Math.abs(v) / 60), m = Math.round(Math.abs(v) % 60); const sg = v < 0 ? '-' : ''; return h ? `${sg}${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${sg}${m} min` }
  if (kind === 'percent') return `${n} %`
  if (kind === 'money') return `${n} ${unit || '€'}`
  return unit ? `${n} ${unit}` : n
}

/** Un indicateur à saisie périodique est « en retard de mesure » après la fréquence choisie (+ 1 jour de tolérance). */
export function indicatorOverdue(ind: Indicator, readings: Reading[], now: Date): boolean {
  if (!ind.frequency || ind.archived) return false
  const last = readingsOf(readings, ind.id).pop()
  const since = daysBetweenKeys(last?.at ?? ind.createdAt.slice(0, 10), dayKey(now))
  return since > FREQUENCY_DAYS[ind.frequency] + 1
}

// ── Activité, analyse et propositions ─────────────────────────────────
export const INACTIVE_DAYS = 21
export const DUE_SOON_DAYS = 7
export const MAX_ACTIVE_GOALS = 5
/** Part du temps disponible que les objectifs peuvent raisonnablement occuper (le reste : routines, SPORT, imprévus) */
export const GOAL_TIME_SHARE = 0.5
const DEFAULT_STEP_MINUTES = 60
const LAG_MARGIN = 0.25

export const isOpenProject = (p: Project) => p.status === 'prepare' || p.status === 'active'
export const isOpenGoal = (g: Goal) => g.status === 'todo' || g.status === 'active'

/** Dernière activité réelle d'un projet : modification, validations, quêtes rattachées récompensées. */
export function projectLastActivity(p: Project, quests: Quest[], events: XpEvent[]): string {
  const ids = new Set(questsOfProject(quests, p.id).map((q) => q.id))
  const stamps = [p.createdAt, p.updatedAt, p.statusAt]
  for (const s of p.steps) { if (s.doneAt) stamps.push(s.doneAt); for (const t of s.subtasks) if (t.doneAt) stamps.push(t.doneAt) }
  for (const e of events) if (e.questId && ids.has(e.questId) && e.kind === 'award') stamps.push(e.at)
  return stamps.sort().pop()!
}

export type FindingKind = 'project-late' | 'project-due-soon' | 'step-late' | 'step-blocked' | 'project-inactive' | 'goal-late' | 'goal-lagging' | 'goal-incompatible' | 'goals-conflict' | 'too-many-goals' | 'indicator-stale'
export interface Finding {
  id: string
  kind: FindingKind
  severity: 'info' | 'warn'
  title: string
  detail: string
  refType: 'goal' | 'project' | 'indicator'
  refId: string
}

export interface AnalysisInput extends LifeData { quests: Quest[]; events: XpEvent[]; now: Date; prefs: PlanningPrefs }

/** Remaining effort (minutes) d'un objectif actif : quêtes ouvertes + étapes ouvertes sans élément de travail. */
export function remainingMinutes(g: Goal, i: AnalysisInput): number {
  let m = 0
  for (const q of oneShot(questsOfGoal(i.quests, g.id))) m += q.effortMinutes * (1 - questRatio(q, i.events, i.now))
  for (const p of i.projects.filter((x) => x.goalId === g.id && isOpenProject(x))) {
    for (const q of oneShot(questsOfProject(i.quests, p.id))) m += q.effortMinutes * (1 - questRatio(q, i.events, i.now))
    for (const s of p.steps) if (!s.done && !s.subtasks.length && !questsOfStep(i.quests, s.id).length) m += DEFAULT_STEP_MINUTES
  }
  return Math.round(m)
}

const minutesLabel = (m: number) => (m >= 60 ? `${Math.round(m / 6) / 10} h` : `${m} min`)

/**
 * Repère ce qui mérite attention. Ne modifie JAMAIS rien : retards, étapes bloquées, échéances proches, projets inactifs,
 * objectifs qui avancent peu, objectifs en tension ou incompatibles avec les disponibilités.
 */
export function analyseLife(i: AnalysisInput): Finding[] {
  const today = dayKey(i.now)
  const out: Finding[] = []
  const add = (f: Finding) => out.push(f)

  for (const p of i.projects.filter(isOpenProject)) {
    if (p.dueDate && p.dueDate < today) add({ id: `plate:${p.id}`, kind: 'project-late', severity: 'warn', refType: 'project', refId: p.id, title: `Projet en retard : ${p.title}`, detail: `L'échéance du ${p.dueDate} est dépassée. Aucun changement n'est fait sans votre accord.` })
    else if (p.dueDate && daysBetweenKeys(today, p.dueDate) <= DUE_SOON_DAYS) {
      const d = daysBetweenKeys(today, p.dueDate)
      const pr = projectProgress(p, i.quests, i.events, i.now).value
      add({ id: `psoon:${p.id}`, kind: 'project-due-soon', severity: pr < 0.6 ? 'warn' : 'info', refType: 'project', refId: p.id, title: `Échéance proche : ${p.title}`, detail: `Dans ${d} jour${d > 1 ? 's' : ''}, avancement ${Math.round(pr * 100)} %.` })
    }
    for (const s of p.steps.filter((x) => !x.done)) {
      if (s.blocked) add({ id: `sblock:${s.id}`, kind: 'step-blocked', severity: 'warn', refType: 'project', refId: p.id, title: `Étape bloquée : ${s.title}`, detail: `${p.title} — ${s.blocked}` })
      else if (s.dueDate && s.dueDate < today) add({ id: `slate:${s.id}`, kind: 'step-late', severity: 'info', refType: 'project', refId: p.id, title: `Étape en retard : ${s.title}`, detail: `${p.title} — prévue le ${s.dueDate}.` })
    }
    if (p.status === 'active') {
      const idle = daysBetweenKeys(projectLastActivity(p, i.quests, i.events).slice(0, 10), today)
      if (idle >= INACTIVE_DAYS) add({ id: `pidle:${p.id}`, kind: 'project-inactive', severity: 'info', refType: 'project', refId: p.id, title: `Projet inactif : ${p.title}`, detail: `Aucune activité depuis ${idle} jours. Le mettre en pause ou le simplifier peut aider.` })
    }
  }

  const active = i.goals.filter((g) => g.status === 'active')
  for (const g of i.goals.filter(isOpenGoal)) {
    if (g.dueDate && g.dueDate < today) add({ id: `glate:${g.id}`, kind: 'goal-late', severity: 'warn', refType: 'goal', refId: g.id, title: `Échéance dépassée : ${g.title}`, detail: `Prévue le ${g.dueDate}. À revoir ensemble : nouvelle échéance, objectif allégé ou mise en pause.` })
    else if (g.status === 'active' && g.dueDate) {
      const total = daysBetweenKeys(g.createdAt.slice(0, 10), g.dueDate)
      const elapsed = total > 0 ? daysBetweenKeys(g.createdAt.slice(0, 10), today) / total : 0
      const pr = goalProgress(g, i, i.quests, i.events, i.now).value
      if (total >= 14 && elapsed >= 0.3 && pr < elapsed - LAG_MARGIN) add({ id: `glag:${g.id}`, kind: 'goal-lagging', severity: 'info', refType: 'goal', refId: g.id, title: `Progression insuffisante : ${g.title}`, detail: `${Math.round(elapsed * 100)} % du temps écoulé pour ${Math.round(pr * 100)} % d'avancement.` })
    }
  }

  // Tension déclarée par l'utilisateur entre deux objectifs actifs
  const seen = new Set<string>()
  for (const g of active) for (const oid of g.conflictsWith) {
    const o = active.find((x) => x.id === oid)
    const key = [g.id, oid].sort().join('|')
    if (o && !seen.has(key)) { seen.add(key); add({ id: `gconf:${key}`, kind: 'goals-conflict', severity: 'info', refType: 'goal', refId: g.id, title: `Objectifs en tension : ${g.title} / ${o.title}`, detail: 'Vous avez signalé que ces deux objectifs se contrarient. Vous pouvez en mettre un en pause ou ajuster une échéance.' }) }
  }
  if (active.length > MAX_ACTIVE_GOALS) add({ id: 'gmany', kind: 'too-many-goals', severity: 'info', refType: 'goal', refId: active[0].id, title: `${active.length} objectifs en cours en même temps`, detail: `Au-delà de ${MAX_ACTIVE_GOALS}, l'attention se disperse. Mettre certains objectifs en pause n'en abandonne aucun.` })

  // Compatibilité avec les disponibilités : effort restant cumulé (par échéance) vs temps réellement libre
  const dated = active.filter((g) => g.dueDate && g.dueDate >= today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
  let cumulative = 0
  for (const g of dated) {
    cumulative += remainingMinutes(g, i)
    let available = 0
    for (let d = new Date(i.now); dayKey(d) <= g.dueDate!; d = addDays(d, 1)) available += usableOn(i.prefs, dayKey(d))
    const room = Math.round(available * GOAL_TIME_SHARE)
    if (cumulative > room && cumulative >= 120) add({ id: `ginc:${g.id}`, kind: 'goal-incompatible', severity: 'warn', refType: 'goal', refId: g.id, title: `Difficile à tenir : ${g.title}`, detail: `Environ ${minutesLabel(cumulative)} de travail restant avant le ${g.dueDate} (objectifs cumulés), pour ${minutesLabel(room)} réalistement disponibles. Rien n'est modifié : à vous d'ajuster.` })
  }

  for (const ind of i.indicators.filter((x) => !x.archived && x.frequency)) if (indicatorOverdue(ind, i.readings, i.now)) add({ id: `istale:${ind.id}`, kind: 'indicator-stale', severity: 'info', refType: 'indicator', refId: ind.id, title: `Mesure à saisir : ${ind.name}`, detail: `Fréquence choisie : ${FREQ_LABEL[ind.frequency!].toLowerCase()}.` })
  return out.sort((a, b) => Number(b.severity === 'warn') - Number(a.severity === 'warn'))
}

export type LifeProposalKind = 'pause-project' | 'shift-project-deadline' | 'review-project' | 'review-goal'
export interface LifeProposal { id: string; kind: LifeProposalKind; title: string; detail: string; projectId?: string; goalId?: string; /** Nouvelle échéance proposée */ to?: string; severity: 'info' | 'warn' }
export const SHIFT_DAYS = 14

/** Adaptations proposées (jamais appliquées sans confirmation ; l'application revérifie l'état). */
export function lifeProposals(findings: Finding[], i: AnalysisInput): LifeProposal[] {
  const out: LifeProposal[] = []
  const today = dayKey(i.now)
  for (const f of findings) {
    const p = f.refType === 'project' ? i.projects.find((x) => x.id === f.refId) : undefined
    if (f.kind === 'project-late' && p) {
      const to = dayKey(addDays(new Date(today + 'T12:00:00'), SHIFT_DAYS))
      out.push({ id: `shift:${p.id}:${to}`, kind: 'shift-project-deadline', projectId: p.id, to, severity: 'warn', title: `Décaler l'échéance de « ${p.title} » au ${to}`, detail: `L'échéance du ${p.dueDate} est dépassée. Décaler est un choix à confirmer ; vous pouvez aussi simplifier le projet ou le mettre en pause.` })
    } else if (f.kind === 'project-inactive' && p) {
      out.push({ id: `pause:${p.id}`, kind: 'pause-project', projectId: p.id, severity: 'info', title: `Mettre « ${p.title} » en pause`, detail: 'Une pause évite de culpabiliser sur un projet qui n\'avance plus. Il reste visible et se reprend à tout moment.' })
    } else if ((f.kind === 'step-blocked' || f.kind === 'step-late' || f.kind === 'project-due-soon') && p) {
      out.push({ id: `rev:${f.id}`, kind: 'review-project', projectId: p.id, severity: f.severity, title: f.kind === 'step-blocked' ? `Débloquer ou réorganiser les étapes de « ${p.title} »` : `Revoir les étapes de « ${p.title} »`, detail: f.detail })
    } else if (f.refType === 'goal' && ['goal-late', 'goal-lagging', 'goal-incompatible', 'goals-conflict', 'too-many-goals'].includes(f.kind)) {
      out.push({ id: `revg:${f.id}`, kind: 'review-goal', goalId: f.refId, severity: f.severity, title: f.kind === 'too-many-goals' ? 'Choisir les objectifs à mettre en pause' : `Revoir l'objectif : ${i.goals.find((g) => g.id === f.refId)?.title ?? ''}`, detail: f.detail })
    }
  }
  const seen = new Set<string>()
  return out.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
}

// ── Suppression : conséquences ─────────────────────────────────────────
export interface DeletionImpact { projects: number; steps: number; openQuests: number; doneQuests: number; indicators: number; readings: number }

/** Ce que supprimer un objectif ou un projet entraîne. Les quêtes (et leurs XP) ne sont JAMAIS supprimées : elles redeviennent indépendantes. */
export function deletionImpact(kind: 'goal' | 'project' | 'indicator', id: string, data: LifeData, quests: Quest[], events: XpEvent[], now: Date): DeletionImpact {
  const empty: DeletionImpact = { projects: 0, steps: 0, openQuests: 0, doneQuests: 0, indicators: 0, readings: 0 }
  if (kind === 'indicator') return { ...empty, readings: data.readings.filter((r) => r.indicatorId === id).length }
  const projs = kind === 'goal' ? data.projects.filter((p) => p.goalId === id) : data.projects.filter((p) => p.id === id)
  const linked = quests.filter((q) => (kind === 'goal' ? q.goalId === id || projs.some((p) => p.id === q.projectId) : q.projectId === id))
  const done = linked.filter((q) => cycleProgress(q, events, now).completed).length
  return { ...empty, projects: kind === 'goal' ? projs.length : 0, steps: projs.reduce((n, p) => n + p.steps.length, 0), openQuests: linked.length - done, doneQuests: done }
}
