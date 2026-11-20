import { describe, expect, it } from 'vitest'
import { analyseLife, deletionImpact, formatValue, goalProgress, indicatorOverdue, indicatorState, lifeProposals, projectProgress, stepProgress, OPEN_STEP_CAP, type Goal, type Indicator, type LifeData, type Project, type Reading, type Step } from './goals'
import { buildPlan, type PlanContext } from './planning'
import { buildReport } from './reports'
import { DEFAULT_PREFS } from './prefs'
import { dayKey } from './dates'
import { evaluateRecovery } from './sport/recovery'
import type { Quest } from './quest'
import type { XpEvent } from './ledger'

const NOW = new Date(2026, 10, 19, 10, 0)
const TODAY = dayKey(NOW)
const day = (k: number) => dayKey(new Date(2026, 10, 19 + k))
const iso = (k: number) => new Date(2026, 10, 19 + k, 9).toISOString()
let n = 0
const quest = (o: Partial<Quest> = {}): Quest => ({ id: `q${++n}`, type: 'personal', title: `Q${n}`, description: '', categoryId: 'c1', priority: 'normal', dueDate: null, difficulty: 'normal', effortMinutes: 60, steps: [], rewardXp: 40, archived: false, createdAt: NOW.getTime() - 9e8, updatedAt: 0, ...o })
const step = (o: Partial<Step> = {}): Step => ({ id: `s${++n}`, title: `Étape ${n}`, dueDate: null, done: false, doneAt: null, blocked: null, subtasks: [], ...o })
const project = (o: Partial<Project> = {}): Project => ({ id: `p${++n}`, title: `Projet ${n}`, description: '', categoryId: 'c1', goalId: null, priority: 'normal', startDate: null, dueDate: null, status: 'active', steps: [], createdAt: iso(-60), updatedAt: iso(-1), statusAt: iso(-60), ...o })
const goal = (o: Partial<Goal> = {}): Goal => ({ id: `g${++n}`, title: `Objectif ${n}`, description: '', categoryId: 'c1', createdAt: iso(-60), dueDate: null, priority: 'normal', importance: 2, status: 'active', criteria: [], milestones: [], indicatorIds: [], conflictsWith: [], statusAt: iso(-60), updatedAt: iso(-1), ...o })
const ev = (q: Quest, o: Partial<XpEvent> = {}): XpEvent => ({ id: `e${++n}`, kind: 'award', source: 'quest', sourceId: q.id, questId: q.id, stepId: null, awardKey: `quest:${q.id}:once`, cycleKey: 'once', domain: 'LIFE', categoryId: 'c1', attribute: 'discipline', amount: 40, baseAmount: 40, micro: false, at: iso(0), recordedAt: '', retroactive: false, credit: null, percent: null, durationMinutes: null, note: '', reason: '', label: q.title, status: 'valid', correctsEventId: null, reversedByEventId: null, ...o })
const input = (o: Partial<Parameters<typeof analyseLife>[0]> = {}) => ({ goals: [], projects: [], indicators: [], readings: [], quests: [], events: [], now: NOW, prefs: DEFAULT_PREFS.planning, ...o })

describe('avancement calculé sur le réellement accompli', () => {
  it('une étape n’est jamais « terminée » sans validation explicite, même avec toutes ses sous-tâches faites', () => {
    const s = step({ subtasks: [{ id: 'a', title: 'a', done: true, doneAt: iso(0) }, { id: 'b', title: 'b', done: true, doneAt: iso(0) }] })
    expect(stepProgress(s, [], [], NOW)).toBe(OPEN_STEP_CAP)
    expect(stepProgress({ ...s, done: true }, [], [], NOW)).toBe(1)
  })
  it('une étape sans élément ni validation vaut 0', () => expect(stepProgress(step(), [], [], NOW)).toBe(0))
  it('une quête rattachée validée fait avancer l’étape, une quête non validée non', () => {
    const s = step(); const qa = quest({ stepId: s.id }); const qb = quest({ stepId: s.id })
    expect(stepProgress(s, [qa, qb], [ev(qa)], NOW)).toBeCloseTo(0.5)
  })
  it('projet : moyenne des étapes, plus les quêtes rattachées sans étape', () => {
    const s1 = step({ done: true, doneAt: iso(0) }); const s2 = step()
    const p = project({ steps: [s1, s2] })
    expect(projectProgress(p, [], [], NOW)).toMatchObject({ value: 0.5, doneSteps: 1, totalSteps: 2 })
    const loose = quest({ projectId: p.id })
    expect(projectProgress(p, [loose], [ev(loose)], NOW).value).toBeCloseTo((1 + 0 + OPEN_STEP_CAP) / 3)
  })
  it('objectif : moyenne des composantes existantes (projets, critères, étapes, quêtes directes)', () => {
    const g = goal({ criteria: [{ id: 'c', title: 'x', done: true, doneAt: iso(0) }, { id: 'd', title: 'y', done: false, doneAt: null }] })
    const p = project({ goalId: g.id, steps: [step({ done: true, doneAt: iso(0) })] })
    const r = goalProgress(g, { projects: [p] }, [], [], NOW)
    expect(r.parts.map((x) => x.label)).toEqual(['Projets', 'Critères de réussite'])
    expect(r.value).toBeCloseTo(0.75)
    expect(goalProgress(goal(), { projects: [] }, [], [], NOW).value).toBe(0)
  })
  it('un projet abandonné ne compte pas dans l’objectif', () => {
    const g = goal(); const p = project({ goalId: g.id, status: 'abandoned', steps: [step()] })
    expect(goalProgress(g, { projects: [p] }, [], [], NOW).parts).toEqual([])
  })
})

describe('indicateurs', () => {
  const ind = (o: Partial<Indicator> = {}): Indicator => ({ id: 'i1', name: 'Épargne', categoryId: 'c1', kind: 'money', unit: '€', target: 1000, frequency: null, important: false, archived: false, createdAt: iso(-30), ...o })
  const r = (value: number, at: string): Reading => ({ id: `r${++n}`, indicatorId: 'i1', value, at, note: '', recordedAt: at })
  it('valeur actuelle = dernière mesure (par date), historique ordonné, progression vers la cible', () => {
    const st = indicatorState(ind(), [r(400, day(-1)), r(200, day(-10)), r(600, day(0))])
    expect(st.current).toBe(600)
    expect(st.list.map((x) => x.value)).toEqual([200, 400, 600])
    expect(st.progress).toBeCloseTo(0.5)
    expect(st.delta).toBe(400)
  })
  it('cible à la baisse (dépenses) : progression mesurée depuis la première mesure', () => {
    expect(indicatorState(ind({ target: 100 }), [r(300, day(-5)), r(200, day(0))]).progress).toBeCloseTo(0.5)
  })
  it('formats : durée, pourcentage, montant', () => {
    expect(formatValue('duration', 'min', 135)).toBe('2 h 15')
    expect(formatValue('percent', '%', 40)).toBe('40 %')
    expect(formatValue('money', '€', 1500)).toMatch(/1\s500 €/)
  })
  it('mesure en retard selon la fréquence choisie', () => {
    expect(indicatorOverdue(ind({ frequency: 'weekly' }), [r(1, day(-3))], NOW)).toBe(false)
    expect(indicatorOverdue(ind({ frequency: 'weekly' }), [r(1, day(-12))], NOW)).toBe(true)
    expect(indicatorOverdue(ind({ frequency: null }), [], NOW)).toBe(false)
  })
})

describe('constats et propositions (rien n’est modifié)', () => {
  it('projet en retard, étape bloquée, étape en retard, échéance proche, projet inactif', () => {
    const late = project({ title: 'Retard', dueDate: day(-3) })
    const blocked = project({ title: 'Bloqué', steps: [step({ title: 'Devis', blocked: 'Attente du fournisseur' })] })
    const lateStep = project({ title: 'EtapeRetard', steps: [step({ dueDate: day(-2) })] })
    const soon = project({ title: 'Bientôt', dueDate: day(3) })
    const idle = project({ title: 'Dormant', updatedAt: iso(-40), createdAt: iso(-60), statusAt: iso(-60) })
    const kinds = analyseLife(input({ projects: [late, blocked, lateStep, soon, idle] })).map((f) => f.kind)
    for (const k of ['project-late', 'step-blocked', 'step-late', 'project-due-soon', 'project-inactive']) expect(kinds).toContain(k)
  })
  it('un projet en pause ou terminé n’est pas signalé', () => {
    expect(analyseLife(input({ projects: [project({ status: 'paused', dueDate: day(-3) }), project({ status: 'done', dueDate: day(-3) })] }))).toEqual([])
  })
  it('un projet récemment validé ou avec quête récompensée n’est pas inactif', () => {
    const p = project({ updatedAt: iso(-40), statusAt: iso(-60), createdAt: iso(-60) }); const q = quest({ projectId: p.id })
    expect(analyseLife(input({ projects: [p] })).some((f) => f.kind === 'project-inactive')).toBe(true)
    expect(analyseLife(input({ projects: [p], quests: [q], events: [ev(q, { at: iso(-2) })] })).some((f) => f.kind === 'project-inactive')).toBe(false)
  })
  it('objectif qui progresse insuffisamment', () => {
    const g = goal({ createdAt: iso(-50), dueDate: day(10) })
    expect(analyseLife(input({ goals: [g] })).some((f) => f.kind === 'goal-lagging')).toBe(true)
    const ok = goal({ createdAt: iso(-50), dueDate: day(10), criteria: [{ id: 'a', title: 'a', done: true, doneAt: iso(-1) }] })
    expect(analyseLife(input({ goals: [ok] })).some((f) => f.kind === 'goal-lagging')).toBe(false)
  })
  it('objectifs incompatibles avec les disponibilités (effort restant vs temps libre), sans rien modifier', () => {
    const g = goal({ dueDate: day(3) })
    const big = [quest({ goalId: g.id, effortMinutes: 600 })]
    const f = analyseLife(input({ goals: [g], quests: big })).find((x) => x.kind === 'goal-incompatible')
    expect(f?.detail).toMatch(/Rien n'est modifié/)
    expect(analyseLife(input({ goals: [g], quests: [quest({ goalId: g.id, effortMinutes: 60 })] })).some((x) => x.kind === 'goal-incompatible')).toBe(false)
  })
  it('jours indisponibles : moins de temps, donc incompatibilité', () => {
    const g = goal({ dueDate: day(7) }); const q = [quest({ goalId: g.id, effortMinutes: 400 })]
    expect(analyseLife(input({ goals: [g], quests: q })).some((x) => x.kind === 'goal-incompatible')).toBe(false)
    const none = { ...DEFAULT_PREFS.planning, days: [] }
    expect(analyseLife(input({ goals: [g], quests: q, prefs: none })).some((x) => x.kind === 'goal-incompatible')).toBe(true)
  })
  it('objectifs en tension déclarés (une seule fois) et trop d’objectifs actifs', () => {
    const a = goal({ id: 'ga' }), b = goal({ id: 'gb', conflictsWith: ['ga'] })
    expect(analyseLife(input({ goals: [a, b] })).filter((f) => f.kind === 'goals-conflict')).toHaveLength(1)
    expect(analyseLife(input({ goals: [a, { ...b, status: 'paused' as const }] })).some((f) => f.kind === 'goals-conflict')).toBe(false)
    expect(analyseLife(input({ goals: Array.from({ length: 6 }, () => goal()) })).some((f) => f.kind === 'too-many-goals')).toBe(true)
  })
  it('propositions : décaler (confirmation requise), pause, revue ; jamais d’action sur un projet terminé', () => {
    const late = project({ dueDate: day(-3) }); const idle = project({ updatedAt: iso(-40), createdAt: iso(-60), statusAt: iso(-60) })
    const i = input({ projects: [late, idle] })
    const props = lifeProposals(analyseLife(i), i)
    expect(props.find((p) => p.kind === 'shift-project-deadline')?.to! > TODAY).toBe(true)
    expect(props.some((p) => p.kind === 'pause-project' && p.projectId === idle.id)).toBe(true)
  })
})

describe('suppression : conséquences expliquées', () => {
  it('compte projets, étapes, quêtes en cours et déjà réalisées (jamais supprimées)', () => {
    const g = goal(); const p = project({ goalId: g.id, steps: [step(), step()] })
    const done = quest({ projectId: p.id }); const open = quest({ goalId: g.id })
    const data: LifeData = { goals: [g], projects: [p], indicators: [], readings: [] }
    expect(deletionImpact('goal', g.id, data, [done, open], [ev(done)], NOW)).toMatchObject({ projects: 1, steps: 2, doneQuests: 1, openQuests: 1 })
    expect(deletionImpact('project', p.id, data, [done, open], [ev(done)], NOW)).toMatchObject({ projects: 0, doneQuests: 1, openQuests: 0 })
  })
})

describe('planning et bilans', () => {
  const ctx = (life: LifeData): PlanContext => ({ quests: [], events: [], commitments: [], sessions: [], moves: [], prefs: DEFAULT_PREFS.planning, sportDays: [], recovery: evaluateRecovery({ checks: [], sessions: [], now: NOW, today: TODAY }), now: NOW, life })
  it('échéances de projets, d’étapes et d’objectifs apparaissent comme repères sans durée, non déplaçables', () => {
    const p = project({ dueDate: day(2), steps: [step({ title: 'Maquette', dueDate: day(1) }), step({ dueDate: day(1), done: true, doneAt: iso(0) })] })
    const g = goal({ dueDate: day(4), importance: 3 })
    const items = buildPlan(ctx({ goals: [g], projects: [p], indicators: [], readings: [] }), TODAY, day(6)).items.filter((i) => i.kind === 'milestone')
    expect(items.map((i) => i.title)).toEqual(expect.arrayContaining(['Étape : Maquette', `Échéance du projet : ${p.title}`, `Échéance de l'objectif : ${g.title}`]))
    expect(items).toHaveLength(3)
    expect(items.every((i) => i.minutes === 0 && i.fixed)).toBe(true)
    expect(items.find((i) => i.id.startsWith('mg:'))?.important).toBe(true)
  })
  it('un projet en pause ou terminé n’alimente pas le planning ; un retard est ramené à aujourd’hui', () => {
    const paused = project({ status: 'paused', dueDate: day(1) }); const late = project({ dueDate: day(-2) })
    const items = buildPlan(ctx({ goals: [], projects: [paused, late], indicators: [], readings: [] }), TODAY, day(3)).items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ date: TODAY, overdue: true })
  })
  it('bilan hebdomadaire : sections objectifs, projets, indicateurs, prévu/réalisé ; étapes accomplies comptées', () => {
    const p = project({ title: 'Solitiquo', steps: [step({ title: 'Prototype', done: true, doneAt: new Date(2026, 10, 17, 9).toISOString(), dueDate: day(-2) }), step({ title: 'Test', dueDate: day(-1) })] })
    const g = goal({ title: 'Lancer' })
    const ind: Indicator = { id: 'i1', name: 'Articles', categoryId: 'c1', kind: 'number', unit: '', target: 10, frequency: null, important: false, archived: false, createdAt: iso(-30) }
    const reads: Reading[] = [{ id: 'a', indicatorId: 'i1', value: 2, at: day(-3), note: '', recordedAt: '' }, { id: 'b', indicatorId: 'i1', value: 4, at: day(-1), note: '', recordedAt: '' }]
    const r = buildReport({ kind: 'week', anchor: NOW, now: NOW, events: [], quests: [], categories: [], sessions: [], checks: [], analyses: [], moves: [], commitments: [], recovery: null, sportTarget: 3, life: { goals: [g], projects: [p], indicators: [ind], readings: reads, prefs: DEFAULT_PREFS.planning } })
    expect(r.sections.map((s) => s.id)).toEqual(expect.arrayContaining(['goals', 'projects', 'indicators', 'gap']))
    expect(JSON.stringify(r.sections.find((s) => s.id === 'projects'))).toMatch(/Prototype/)
    expect(JSON.stringify(r.sections.find((s) => s.id === 'indicators'))).toMatch(/\+2/)
    expect(JSON.stringify(r.sections.find((s) => s.id === 'gap'))).toMatch(/Prévue, non faite : Test/)
  })
  it('bilans sans données LIFE V1.1 : inchangés', () => {
    const r = buildReport({ kind: 'month', anchor: NOW, now: NOW, events: [], quests: [], categories: [], sessions: [], checks: [], analyses: [], moves: [], commitments: [], recovery: null, sportTarget: 3, life: { goals: [], projects: [], indicators: [], readings: [], prefs: DEFAULT_PREFS.planning } })
    expect(r.sections.some((s) => s.id === 'goals')).toBe(false)
  })
})
