import { addDays, dayKey, daysBetweenKeys, fromDayKey, mondayOf } from './dates'
import type { GlobalHomeContext } from './homeLayout'
import type { Finding } from './goals'
import { cycleProgress } from './questState'
import { buildPlan, dayLoad, detectConflicts, proposeReorganisations, scoreQuests, usableOn, postponements, REPEATED_POSTPONEMENT_THRESHOLD, type PlanContext, type Proposal, type Score } from './planning'
import type { Quest } from './quest'
import { lifeExecution, sportExecution } from './reports'
import type { RecoveryCheck, SportSession } from './sport/session'
import { isFinished } from './sport/xp'
import { regularity } from './sport/stats'

/**
 * Tableau de bord global : agrège LIFE, SPORT et planning en indicateurs d'accueil. Pur — aucune règle métier n'est réécrite ici :
 * priorités, conflits et propositions viennent de `core/planning`, l'exécution de `core/reports`, la récupération du moteur SPORT.
 */
export interface DashboardInput {
  plan: PlanContext
  checks: RecoveryCheck[]
  /** Éléments non réalisés et pas encore analysés (nombre) */
  missedCount: number
  sportTarget: number
  /** Constats LIFE (projets en retard, étapes bloquées…) déjà calculés */
  findings?: Finding[]
}

export interface DashboardAlert { id: string; tone: 'warn' | 'info' | 'good'; title: string; detail: string; route: string }
export interface DashboardDeadline { id: string; kind: 'quest' | 'commitment' | 'project' | 'goal'; title: string; date: string; daysLeft: number; important: boolean; route: string }
export interface DashboardPriority { quest: Quest; score: Score; remainingMin: number }

export interface Dashboard {
  priorities: DashboardPriority[]
  morePending: number
  nextSession: { session: SportSession; when: 'today' | 'tomorrow' | 'later'; label: string } | null
  deadlines: DashboardDeadline[]
  week: {
    from: string
    to: string
    life: { done: number; planned: number }
    sport: { done: number; planned: number }
    /** Lundi → dimanche : jour avec au moins une validation (XP positive) / séance terminée */
    activeDays: boolean[]
    sportDays: boolean[]
    streakWeeks: number
  }
  today: { load: number; usable: number; overloaded: boolean }
  alerts: DashboardAlert[]
  proposals: Proposal[]
  home: GlobalHomeContext
}

const SEVERITY: Record<DashboardAlert['tone'], number> = { warn: 0, info: 1, good: 2 }
export const MAX_ALERTS = 4

export function buildDashboard(i: DashboardInput): Dashboard {
  const ctx = i.plan
  const now = ctx.now
  const today = dayKey(now)
  const horizon = dayKey(addDays(now, 7))
  const pending = ctx.quests.filter((q) => !q.archived && !cycleProgress(q, ctx.events, now).completed)

  // Priorités transversales (urgence, importance, échéance, équilibre des catégories, reports)
  const scores = scoreQuests(ctx, pending)
  const ranked = pending.map((q) => ({ quest: q, score: scores.get(q.id)!, remainingMin: Math.max(5, Math.round(q.effortMinutes * (1 - cycleProgress(q, ctx.events, now).progress))) }))
    .sort((a, b) => b.score.score - a.score.score || a.quest.title.localeCompare(b.quest.title))
  const priorities = ranked.slice(0, 4)

  // Prochaine séance (planifiée ou en cours)
  const upcoming = ctx.sessions.filter((s) => ['planned', 'active', 'paused'].includes(s.status) && s.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const nextS = upcoming[0] ?? null
  const nextSession = nextS ? { session: nextS, when: nextS.date === today ? 'today' as const : nextS.date === dayKey(addDays(now, 1)) ? 'tomorrow' as const : 'later' as const, label: nextS.date === today ? 'Aujourd’hui' : nextS.date === dayKey(addDays(now, 1)) ? 'Demain' : fromDayKey(nextS.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) } : null

  // Échéances (quêtes datées non terminées + engagements) sur 14 jours
  const deadlines: DashboardDeadline[] = []
  for (const q of pending) if (q.dueDate && q.type !== 'daily' && q.type !== 'weekly') {
    const d = daysBetweenKeys(today, q.dueDate)
    if (d <= 14) deadlines.push({ id: `q:${q.id}`, kind: 'quest', title: q.title, date: q.dueDate, daysLeft: d, important: q.priority === 'high', route: '/life' })
  }
  for (const c of ctx.commitments) {
    const d = daysBetweenKeys(today, c.date)
    if (d >= 0 && d <= 14) deadlines.push({ id: `c:${c.id}`, kind: 'commitment', title: c.title, date: c.date, daysLeft: d, important: c.important, route: '/planning' })
  }
  deadlines.sort((a, b) => a.daysLeft - b.daysLeft || Number(b.important) - Number(a.important))

  // Objectifs et projets : échéances et constats les plus importants
  if (ctx.life) {
    for (const p of ctx.life.projects) if ((p.status === 'prepare' || p.status === 'active') && p.dueDate) {
      const d = daysBetweenKeys(today, p.dueDate)
      if (d <= 14) deadlines.push({ id: `p:${p.id}`, kind: 'project', title: p.title, date: p.dueDate, daysLeft: d, important: p.priority === 'high', route: '/life/projets' })
    }
    for (const g of ctx.life.goals) if ((g.status === 'active' || g.status === 'todo') && g.dueDate) {
      const d = daysBetweenKeys(today, g.dueDate)
      if (d <= 14) deadlines.push({ id: `g:${g.id}`, kind: 'goal', title: g.title, date: g.dueDate, daysLeft: d, important: g.importance === 3 || g.priority === 'high', route: '/life/objectifs' })
    }
    deadlines.sort((a, b) => a.daysLeft - b.daysLeft || Number(b.important) - Number(a.important))
  }

  // Semaine
  const mon = mondayOf(now)
  const from = dayKey(mon), to = dayKey(addDays(mon, 6))
  const life = lifeExecution(ctx.quests, ctx.events, from, to, now)
  const sp = sportExecution(ctx.sessions, from, to, now)
  const posDays = new Set(ctx.events.filter((e) => e.amount > 0 && e.status === 'valid').map((e) => dayKey(new Date(e.at))))
  const doneDays = new Set(ctx.sessions.filter(isFinished).map((s) => s.date))
  const week = {
    from, to, life: { done: life.done, planned: life.planned }, sport: { done: sp.done, planned: sp.planned },
    activeDays: Array.from({ length: 7 }, (_, k) => posDays.has(dayKey(addDays(mon, k)))),
    sportDays: Array.from({ length: 7 }, (_, k) => doneDays.has(dayKey(addDays(mon, k)))),
    streakWeeks: regularity(ctx.sessions, i.sportTarget, now).streakWeeks,
  }

  // Planning à 7 jours : charge du jour, conflits, propositions
  const plan = buildPlan(ctx, today, horizon)
  const usable = usableOn(ctx.prefs, today)
  const load = dayLoad(plan.items, today)
  const conflicts = detectConflicts(ctx, plan, today, horizon)
  const proposals = proposeReorganisations(ctx, plan, today, horizon)

  // Alertes et recommandations (règles simples, expliquées, jamais culpabilisantes)
  const alerts: DashboardAlert[] = []
  const rec = ctx.recovery
  if (rec.level === 'ALERTE') alerts.push({ id: 'rec-alert', tone: 'warn', title: 'Récupération en alerte', detail: rec.messages[0] ?? 'Repos conseillé avant toute séance.', route: '/sport/recuperation' })
  else if (rec.level === 'VIGILANCE') alerts.push({ id: 'rec-vig', tone: 'info', title: 'Récupération : vigilance', detail: rec.messages[0] ?? 'Séance allégée, sans progression de charge.', route: '/sport/recuperation' })
  const hard = conflicts.filter((c) => c.severity === 'conflict' && c.type !== 'sport-recovery' && daysBetweenKeys(today, c.date) <= 3)
  if (hard[0]) alerts.push({ id: `conf-${hard[0].id}`, tone: 'warn', title: 'Conflit de planning', detail: hard[0].message, route: '/planning' })
  const soon = deadlines.filter((d) => d.important && d.daysLeft <= 1)
  if (soon[0]) alerts.push({ id: `dl-${soon[0].id}`, tone: 'warn', title: soon[0].daysLeft === 0 ? 'Échéance importante aujourd’hui' : 'Échéance importante demain', detail: soon[0].title, route: soon[0].route })
  if (load > usable && usable > 0 && !hard.some((c) => c.date === today)) alerts.push({ id: 'load-today', tone: 'info', title: 'Journée chargée', detail: `${load} min prévues pour ${usable} recommandées : gardez l’essentiel, le reste peut attendre.`, route: '/planning' })
  if (proposals.some((p) => p.kind === 'move-quest' || p.kind === 'simplify-quest' || p.kind === 'unschedule-quest')) alerts.push({ id: 'proposals', tone: 'info', title: 'Réorganisation possible', detail: `${proposals.length} proposition${proposals.length > 1 ? 's' : ''} pour alléger la semaine, à confirmer vous-même.`, route: '/planning' })
  const repeated = ctx.quests.filter((q) => !q.archived && postponements(ctx.moves, q.id, now) >= REPEATED_POSTPONEMENT_THRESHOLD)
  if (repeated[0]) alerts.push({ id: `rep-${repeated[0].id}`, tone: 'info', title: 'Un report revient souvent', detail: `« ${repeated[0].title} » : la simplifier ou la découper aiderait.`, route: '/life' })
  const lf = (i.findings ?? []).filter((f) => f.severity === 'warn')[0]
  if (lf) alerts.push({ id: `life-${lf.id}`, tone: 'warn', title: lf.title, detail: lf.detail, route: lf.refType === 'goal' ? '/life/objectifs' : lf.refType === 'indicator' ? '/life/indicateurs' : '/life/projets' })
  if (i.missedCount > 0) alerts.push({ id: 'missed', tone: 'info', title: `${i.missedCount} élément${i.missedCount > 1 ? 's' : ''} à analyser`, detail: 'Comprendre pourquoi aide à ajuster, sans aucune pénalité d’XP.', route: '/life' })
  const hasCheckToday = i.checks.some((c) => c.day === today)
  if (nextSession?.when === 'today' && !hasCheckToday && rec.level === 'NORMAL') alerts.push({ id: 'check', tone: 'info', title: 'Questionnaire de récupération', detail: 'Environ 30 secondes pour adapter la séance du jour.', route: '/sport/recuperation' })
  if (!pending.length && ctx.quests.some((q) => !q.archived)) alerts.push({ id: 'all-done', tone: 'good', title: 'Quêtes terminées', detail: 'Profitez-en : inutile de remplir le temps libre.', route: '/life' })
  alerts.sort((a, b) => SEVERITY[a.tone] - SEVERITY[b.tone])
  const shown = alerts.slice(0, MAX_ALERTS)

  const dueHours = pending.filter((q) => q.dueDate && q.type !== 'daily' && q.type !== 'weekly').map((q) => (new Date(q.dueDate + 'T23:59:59').getTime() - now.getTime()) / 3_600_000)
  const dailyOpen = pending.some((q) => q.type === 'daily' || q.type === 'weekly')
  const home: GlobalHomeContext = {
    now, pendingQuests: pending.length,
    nearestDeadlineHours: dueHours.length ? Math.min(...dueHours) : dailyOpen ? 24 : null,
    sportPlannedToday: nextSession?.when === 'today', recovery: rec.index, recoveryLevel: rec.level, hasCheckToday,
    alerts: shown.filter((a) => a.tone !== 'good' || shown.length === 1).length, criticalAlert: shown.some((a) => a.tone === 'warn'),
    overloadedToday: load > usable && usable > 0, deadlinesSoon: deadlines.filter((d) => d.daysLeft <= 2).length, deadlines: Math.min(5, deadlines.length),
  }
  return { priorities, morePending: Math.max(0, pending.length - priorities.length), nextSession, deadlines: deadlines.slice(0, 5), week, today: { load, usable, overloaded: home.overloadedToday }, alerts: shown, proposals, home }
}
