import { describe, expect, it } from 'vitest'
import { addDays, dayKey } from './dates'
import { analyseLife, type Goal, type Indicator, type Project, type Reading } from './goals'
import { analyse } from './insights'
import type { XpEvent } from './ledger'
import { EMPTY_STRATEGY, type Cycle, type Orientation, type Priority, type StrategyLogEntry, type StrategyState } from './pilotage'
import { DEFAULT_PREFS } from './prefs'
import { computeProgression } from './progression'
import type { Quest } from './quest'
import { buildRecommendations } from './recommendations'
import { buildReport } from './reports'
import { renderReportPdf } from './reports/pdf'
import { evaluateRecovery } from './sport/recovery'
import { strategicObservations, strategicProposals } from './strategy'
import type { PlanContext } from './planning'

/**
 * Robustesse avec un historique conséquent : trois ans d'usage intensif. Les seuils sont volontairement larges (machines lentes, intégration continue) :
 * ils détectent une régression de complexité (calcul quadratique), pas une variation de quelques millisecondes.
 */
const NOW = new Date(2026, 10, 18, 10)
const iso = (k: number, h = 10) => new Date(2026, 10, 18 + k, h).toISOString()
let n = 0
const time = <T,>(label: string, fn: () => T): { out: T; ms: number } => { const t = performance.now(); const out = fn(); const ms = performance.now() - t; console.log(`perf  ${label.padEnd(44)} ${ms.toFixed(1)} ms`); return { out, ms } }

function dataset() {
  const quests: Quest[] = [], events: XpEvent[] = []
  for (let i = 0; i < 600; i++) quests.push({ id: `q${i}`, type: i % 3 === 0 ? 'daily' : 'personal', title: `Quête ${i}`, description: '', categoryId: `cat-${i % 7}`, priority: 'normal', dueDate: null, difficulty: 'normal', effortMinutes: 30, steps: [], rewardXp: 20, archived: i > 300, createdAt: 0, updatedAt: 0, goalId: i % 4 === 0 ? `g${i % 60}` : undefined, projectId: i % 5 === 0 ? `p${i % 40}` : undefined } as Quest)
  for (let d = 0; d < 1095; d++) for (let k = 0; k < 5; k++) { const q = quests[(d * 7 + k) % 600]; events.push({ id: `e${++n}`, kind: 'award', source: 'quest', sourceId: q.id, questId: q.id, stepId: null, awardKey: `quest:${q.id}:${d}:${k}`, cycleKey: `d${d}`, domain: 'LIFE', categoryId: q.categoryId, attribute: 'discipline', amount: 20, baseAmount: 20, micro: false, at: iso(-d, 8 + k), recordedAt: iso(-d, 8 + k), retroactive: false, credit: null, percent: null, durationMinutes: null, note: '', reason: '', label: q.title, status: 'valid', correctsEventId: null, reversedByEventId: null } as XpEvent) }
  const goals: Goal[] = Array.from({ length: 60 }, (_, i) => ({ id: `g${i}`, title: `Objectif ${i}`, description: '', categoryId: 'cat-1', createdAt: iso(-700), dueDate: i % 3 ? null : dayKey(addDays(NOW, 20 + i)), priority: 'normal', importance: 2, status: 'active', criteria: [], milestones: [], indicatorIds: [`i${i % 30}`], conflictsWith: [], statusAt: iso(-700), updatedAt: iso(-700) } as Goal))
  const projects: Project[] = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, title: `Projet ${i}`, description: '', categoryId: 'cat-1', goalId: `g${i % 60}`, priority: 'normal', startDate: null, dueDate: null, status: 'active', steps: Array.from({ length: 8 }, (_, s) => ({ id: `s${i}-${s}`, title: `Étape ${s}`, dueDate: null, done: s < 4, doneAt: s < 4 ? iso(-100 - s) : null, blocked: null, subtasks: [] })), createdAt: iso(-600), updatedAt: iso(-5), statusAt: iso(-600) } as Project))
  const indicators: Indicator[] = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, name: `Indicateur ${i}`, categoryId: 'cat-1', kind: 'number', unit: 'u', archived: false, important: i < 5, direction: 'up', target: 100, cadenceDays: 7, createdAt: iso(-900) } as unknown as Indicator))
  const readings: Reading[] = indicators.flatMap((ind, i) => Array.from({ length: 150 }, (_, r) => ({ id: `r${i}-${r}`, indicatorId: ind.id, value: 50 + r / 3, at: dayKey(addDays(NOW, -r * 7)), note: '' } as unknown as Reading)))
  const orientations: Orientation[] = Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, name: `Orientation ${i}`, description: '', visionId: null, importance: 2, horizon: 'mid', status: 'active', currentState: '', desiredState: '', indicatorIds: [], goalIds: [`g${i}`, `g${i + 10}`, `g${i + 20}`], projectIds: [`p${i}`], order: i, archived: false, createdAt: iso(-500), updatedAt: iso(-500), statusAt: iso(-500) }))
  const priorities: Priority[] = Array.from({ length: 40 }, (_, i) => ({ id: `pr${i}`, title: `Priorité ${i}`, description: '', orientationId: `o${i % 10}`, level: i < 6 ? 'fundamental' : 'important', horizon: 'short', dueDate: null, status: i < 20 ? 'active' : 'done', temporary: false, goalIds: [`g${i}`], constraints: '', createdAt: iso(-300), updatedAt: iso(-300), statusAt: iso(-300), levelAt: iso(-300) }))
  const cycles: Cycle[] = Array.from({ length: 12 }, (_, i) => ({ id: `cycle:${2023 + Math.floor(i / 4)}-Q${(i % 4) + 1}`, year: 2023 + Math.floor(i / 4), quarter: ((i % 4) + 1) as 1, orientationIds: [], priorityIds: [`pr${i}`], goalIds: [`g${i}`], projectIds: [], expectedResults: [], indicatorIds: [], status: i === 11 ? 'active' : 'closed', createdAt: iso(-900), updatedAt: iso(-900) }))
  const log: StrategyLogEntry[] = Array.from({ length: 600 }, (_, i) => ({ id: `l${i}`, at: iso(-(i % 700)), kind: 'priority', action: 'priority-level', refType: 'priority', refId: 'pr1', title: 't', summary: `Changement ${i}` }))
  const strategy: StrategyState = { ...EMPTY_STRATEGY, orientations, priorities, cycles, log }
  return { quests, events, goals, projects, indicators, readings, strategy }
}

describe('Performance : trois ans de données (≈ 5 500 gains, 600 quêtes, 60 objectifs, 4 500 mesures)', () => {
  const d = dataset()
  const life = { goals: d.goals, projects: d.projects, indicators: d.indicators, readings: d.readings }
  const recov = evaluateRecovery({ checks: [], sessions: [], now: NOW, today: dayKey(NOW) })
  const plan: PlanContext = { quests: d.quests, events: d.events, commitments: [], sessions: [], moves: [], prefs: DEFAULT_PREFS.planning, sportDays: [], recovery: recov, now: NOW, life }

  it('progression, analyse LIFE, stratégie, analyse globale, recommandations : sous la seconde chacune', () => {
    const p = time('computeProgression (5 475 gains)', () => computeProgression(d.events, []))
    const f = time('analyseLife (60 objectifs, 40 projets)', () => analyseLife({ ...life, quests: d.quests, events: d.events, now: NOW, prefs: DEFAULT_PREFS.planning }))
    const lifeCtx = { life, quests: d.quests, events: d.events, now: NOW }
    const sctx = { strategy: d.strategy, prefs: DEFAULT_PREFS.pilotage, life: lifeCtx, findings: f.out, planning: { dueQuestGoalIds: new Set<string>() } }
    const s = time('strategicObservations', () => strategicObservations(sctx))
    time('strategicProposals', () => strategicProposals(sctx))
    const a = time('insights.analyse (avec stratégie)', () => analyse({ plan, checks: [], categories: [], sportTarget: 3, findings: f.out, strategy: sctx }, recov))
    const r = time('buildRecommendations', () => buildRecommendations({ observations: a.out, lifeProposals: [], recovery: recov, now: NOW, hasSport: false }))
    expect(p.out.global.level).toBeGreaterThan(1); expect(s.out).toBeTruthy(); expect(r.out).toBeTruthy()
    for (const t of [p, f, s, a, r]) expect(t.ms).toBeLessThan(1500)
  })
  it('bilans hebdomadaire et mensuel + export PDF : sous deux secondes', () => {
    const base = { anchor: NOW, now: NOW, events: d.events, quests: d.quests, categories: [], sessions: [], checks: [], analyses: [], moves: [], commitments: [], recovery: recov, sportTarget: 3, life: { ...life, prefs: DEFAULT_PREFS.planning } } as never
    const w = time('buildReport (semaine)', () => buildReport({ ...(base as object), kind: 'week' } as never))
    const m = time('buildReport (mois)', () => buildReport({ ...(base as object), kind: 'month' } as never))
    const pdf = time('renderReportPdf (mois)', () => renderReportPdf(m.out))
    expect(pdf.out.length).toBeGreaterThan(1000)
    for (const t of [w, m, pdf]) expect(t.ms).toBeLessThan(2000)
  })
  it('la complexité reste proche du linéaire : tripler l’historique ne multiplie pas le coût par plus de ~6', () => {
    const third = d.events.slice(0, Math.floor(d.events.length / 3))
    const reps = 3
    const t1 = time('progression × 1/3', () => { for (let i = 0; i < reps; i++) computeProgression(third, []) }).ms
    const t3 = time('progression × 1', () => { for (let i = 0; i < reps; i++) computeProgression(d.events, []) }).ms
    expect(t3).toBeLessThan(Math.max(t1 * 6, 150))
  })
})
