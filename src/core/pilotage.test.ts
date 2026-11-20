import { describe, expect, it } from 'vitest'
import { addDays, dayKey } from './dates'
import type { Goal, Project } from './goals'
import { analyse, type InsightCtx } from './insights'
import type { XpEvent } from './ledger'
import {
  activeFundamental, contributionProgress, cycleId, DEFAULT_PILOTAGE_PREFS, dueReviews, EMPTY_STRATEGY, goalActivityDays, isOverLimit, monthRange, nextQuarter, orientationProgress, periodFacts, planId, quarterOf, quarterRange,
  strategyLinksOfGoal, strategyLinksOfProject, type AnnualPlan, type Cycle, type LifeCtx, type Orientation, type Priority, type StrategyLogEntry, type StrategyReview, type StrategyState, type Vision,
} from './pilotage'
import type { PlanContext } from './planning'
import { DEFAULT_PREFS, mergePrefs } from './prefs'
import type { Quest } from './quest'
import { buildRecommendations, type RecCtx } from './recommendations'
import { strategicObservations, strategicProposals, type StrategyCtx } from './strategy'
import { evaluateRecovery } from './sport/recovery'

const NOW = new Date(2026, 10, 18, 10) // mercredi 18 novembre 2026 (T4)
const day = (k: number) => dayKey(addDays(NOW, k))
const at = (k: number, h = 10) => new Date(2026, 10, 18 + k, h).toISOString()
let n = 0
const goal = (o: Partial<Goal> = {}): Goal => ({ id: `g${++n}`, title: `Objectif ${n}`, description: '', categoryId: 'c', createdAt: at(-90), dueDate: null, priority: 'normal', importance: 2, status: 'active', criteria: [], milestones: [], indicatorIds: [], conflictsWith: [], statusAt: at(-90), updatedAt: at(-90), ...o })
const project = (o: Partial<Project> = {}): Project => ({ id: `p${++n}`, title: `Projet ${n}`, description: '', categoryId: 'c', goalId: null, priority: 'normal', startDate: null, dueDate: null, status: 'active', steps: [], createdAt: at(-90), updatedAt: at(-90), statusAt: at(-90), ...o })
const quest = (o: Partial<Quest> = {}): Quest => ({ id: `q${++n}`, type: 'personal', title: `Q${n}`, description: '', categoryId: 'c', priority: 'normal', dueDate: null, difficulty: 'normal', effortMinutes: 30, steps: [], rewardXp: 20, archived: false, createdAt: 0, updatedAt: 0, ...o })
const ev = (q: Quest, k: number): XpEvent => ({ id: `e${++n}`, kind: 'award', source: 'quest', sourceId: q.id, questId: q.id, stepId: null, awardKey: `quest:${q.id}:${n}`, cycleKey: 'once', domain: 'LIFE', categoryId: 'c', attribute: 'discipline', amount: 20, baseAmount: 20, micro: false, at: at(k), recordedAt: at(k), retroactive: false, credit: null, percent: null, durationMinutes: null, note: '', reason: '', label: q.title, status: 'valid', correctsEventId: null, reversedByEventId: null })
const orient = (o: Partial<Orientation> = {}): Orientation => ({ id: `o${++n}`, name: `Orientation ${n}`, description: '', visionId: null, importance: 2, horizon: 'mid', status: 'active', currentState: '', desiredState: '', indicatorIds: [], goalIds: [], projectIds: [], order: n, archived: false, createdAt: at(-60), updatedAt: at(-60), statusAt: at(-60), ...o })
const prio = (o: Partial<Priority> = {}): Priority => ({ id: `pr${++n}`, title: `Priorité ${n}`, description: '', orientationId: null, level: 'important', horizon: 'short', dueDate: null, status: 'active', temporary: false, goalIds: [], constraints: '', createdAt: at(-60), updatedAt: at(-60), statusAt: at(-60), levelAt: at(-60), ...o })
const vision = (o: Partial<Vision> = {}): Vision => ({ id: `v${++n}`, title: 'Vivre de mes projets', description: '', desiredSituation: '', ambitions: '', aspirations: '', preserve: '', changes: '', horizons: {}, status: 'active', createdAt: at(-120), revisedAt: at(-120), ...o })
const cycle = (o: Partial<Cycle> = {}): Cycle => ({ id: cycleId(2026, 4), year: 2026, quarter: 4, orientationIds: [], priorityIds: [], goalIds: [], projectIds: [], expectedResults: [], indicatorIds: [], status: 'active', createdAt: at(-30), updatedAt: at(-30), ...o })
const state = (o: Partial<StrategyState> = {}): StrategyState => ({ ...EMPTY_STRATEGY, ...o })
const lifeCtx = (o: { goals?: Goal[]; projects?: Project[]; quests?: Quest[]; events?: XpEvent[] } = {}): LifeCtx => ({ life: { goals: o.goals ?? [], projects: o.projects ?? [], indicators: [], readings: [] }, quests: o.quests ?? [], events: o.events ?? [], now: NOW })
const sctx = (s: StrategyState, l: LifeCtx, o: Partial<StrategyCtx> = {}): StrategyCtx => ({ strategy: s, prefs: DEFAULT_PILOTAGE_PREFS, life: l, findings: [], planning: { dueQuestGoalIds: new Set() }, ...o })
/** Historique d'activité réelle : un gain par semaine sur `weeks` semaines pour des quêtes rattachées à l'objectif */
const activity = (g: Goal, weeks: number, startOffset = 0) => { const q = quest({ goalId: g.id }); return { q, events: Array.from({ length: weeks }, (_, w) => ev(q, -(7 * w + startOffset + 1))) } }

describe('Pilotage : calendrier et préférences', () => {
  it('trimestres, identifiants, plages et passage d’une année à l’autre', () => {
    expect(quarterOf(NOW)).toBe(4); expect(cycleId(2026, 4)).toBe('cycle:2026-Q4'); expect(planId(2027)).toBe('plan:2027')
    expect(quarterRange(2026, 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' }); expect(quarterRange(2026, 1).to).toBe('2026-03-31')
    expect(nextQuarter(2026, 4)).toEqual({ year: 2027, quarter: 1 }); expect(nextQuarter(2026, 2)).toEqual({ year: 2026, quarter: 3 })
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('préférences : limite de priorités fondamentales configurable et assainie', () => {
    expect(DEFAULT_PREFS.pilotage.maxFundamental).toBe(3)
    expect(mergePrefs({ pilotage: { maxFundamental: 99 } }).pilotage.maxFundamental).toBeLessThanOrEqual(8)
    expect(mergePrefs({ pilotage: { maxFundamental: 0 } }).pilotage.maxFundamental).toBeGreaterThanOrEqual(1)
    expect(mergePrefs({ pilotage: { reminders: { monthly: true } } }).pilotage.reminders).toEqual({ monthly: true, quarterly: true, annual: true })
    expect(mergePrefs(undefined).pilotage).toEqual(DEFAULT_PILOTAGE_PREFS)
  })
})

describe('Pilotage : relations avec LIFE sans duplication', () => {
  it('avancement calculé depuis LIFE (jamais stocké), références périmées ignorées, abandon exclu', () => {
    const g1 = goal({ criteria: [{ id: 'a', title: 'a', done: true, doneAt: at(-1) }] }), g2 = goal({ status: 'achieved' }), g3 = goal({ status: 'abandoned' })
    const o = orient({ goalIds: [g1.id, g2.id, g3.id, 'inconnu'] })
    const p = orientationProgress(o, lifeCtx({ goals: [g1, g2, g3] }))
    expect(p.goals).toBe(2); expect(p.value).toBeCloseTo(1)
    expect(orientationProgress(orient(), lifeCtx()).value).toBeNull()
    expect(contributionProgress([], [], lifeCtx()).value).toBeNull()
  })
  it('un objectif peut servir plusieurs orientations ; relations visibles depuis l’objectif et le projet', () => {
    const g = goal({ title: 'Lancer' }), pj = project()
    const o1 = orient({ name: 'Pro', goalIds: [g.id], projectIds: [pj.id] }), o2 = orient({ name: 'Finances', goalIds: [g.id] })
    const pr = prio({ goalIds: [g.id] })
    const s = state({ visions: [vision()], orientations: [o1, o2, orient({ goalIds: [g.id], archived: true })], priorities: [pr], cycles: [cycle({ priorityIds: [pr.id] })], plans: [{ id: 'plan:2026', year: 2026, aims: '', why: '', actions: '', orientationIds: [], priorityIds: [], expectedResults: [], goalIds: [g.id], projectIds: [], constraints: '', status: 'active', createdAt: at(-1), updatedAt: at(-1) } satisfies AnnualPlan] })
    const links = strategyLinksOfGoal(g.id, s)
    expect(links.orientations.map((o) => o.name).sort()).toEqual(['Finances', 'Pro'])
    expect(links.priorities).toHaveLength(1); expect(links.cycles).toHaveLength(1); expect(links.plans).toHaveLength(1)
    expect(links.contribution).toMatch(/Contribue à « (Pro|Finances) »/)
    expect(strategyLinksOfGoal('autre', s).contribution).toBeNull()
    expect(strategyLinksOfProject(pj.id, s).orientations).toHaveLength(1)
  })
  it('l’activité réelle compte quêtes récompensées, étapes et critères, par jour distinct', () => {
    const g = goal({ criteria: [{ id: 'c', title: 'c', done: true, doneAt: at(-3) }] })
    const pj = project({ goalId: g.id, steps: [{ id: 's', title: 's', dueDate: null, done: true, doneAt: at(-5), blocked: null, subtasks: [] }] })
    const q = quest({ goalId: g.id }), e = [ev(q, -2), ev(q, -2)]
    const days = goalActivityDays(g, [pj], lifeCtx({ goals: [g], projects: [pj], quests: [q], events: e }), day(-10), day(0))
    expect([...days].sort()).toEqual([day(-5), day(-3), day(-2)].sort())
  })
})

describe('Pilotage : priorités et limite souple', () => {
  it('compte les priorités fondamentales ACTIVES seulement ; la limite est configurable', () => {
    const list = [prio({ level: 'fundamental' }), prio({ level: 'fundamental' }), prio({ level: 'fundamental', status: 'paused' }), prio({ level: 'important' })]
    expect(activeFundamental(list)).toHaveLength(2)
    expect(isOverLimit(list, { ...DEFAULT_PILOTAGE_PREFS, maxFundamental: 1 })).toBe(true)
    expect(isOverLimit(list, DEFAULT_PILOTAGE_PREFS)).toBe(false)
  })
})

describe('Pilotage : rappels de revue (facultatifs, jamais culpabilisants)', () => {
  const full = (o: Partial<StrategyState> = {}) => state({ orientations: [orient()], ...o })
  it('rien sans aucun contenu stratégique', () => expect(dueReviews(new Date(2026, 11, 28), EMPTY_STRATEGY, DEFAULT_PILOTAGE_PREFS)).toEqual([]))
  it('trimestrielle : proposée en fin de trimestre, une seule fois, silencieuse si faite ou désactivée', () => {
    const late = new Date(2026, 11, 25, 10)
    expect(dueReviews(late, full(), DEFAULT_PILOTAGE_PREFS).map((r) => r.kind)).toContain('quarterly')
    const done: StrategyReview = { id: 'review:quarterly:2026-Q4', kind: 'quarterly', period: '2026-Q4', at: at(0), answers: {}, decisions: '', facts: {} as never }
    expect(dueReviews(late, full({ reviews: [done] }), DEFAULT_PILOTAGE_PREFS).some((r) => r.kind === 'quarterly')).toBe(false)
    expect(dueReviews(late, full(), { ...DEFAULT_PILOTAGE_PREFS, reminders: { ...DEFAULT_PILOTAGE_PREFS.reminders, quarterly: false } }).some((r) => r.kind === 'quarterly')).toBe(false)
    expect(dueReviews(new Date(2026, 10, 3), full(), DEFAULT_PILOTAGE_PREFS)).toEqual([])
  })
  it('mensuelle : désactivée par défaut, active au début du mois suivant si choisie', () => {
    const early = new Date(2026, 11, 3, 10)
    expect(dueReviews(early, full(), DEFAULT_PILOTAGE_PREFS).some((r) => r.kind === 'monthly')).toBe(false)
    const m = dueReviews(early, full(), { ...DEFAULT_PILOTAGE_PREFS, reminders: { ...DEFAULT_PILOTAGE_PREFS.reminders, monthly: true } }).find((r) => r.kind === 'monthly')!
    expect(m.key).toBe('review-due:monthly:2026-11'); expect(m.body).toMatch(/Facultative/)
  })
  it('annuelle : mi-décembre à mi-janvier ; ton neutre', () => {
    const r = dueReviews(new Date(2026, 11, 20), full(), DEFAULT_PILOTAGE_PREFS).find((x) => x.kind === 'annual')!
    expect(r.key).toBe('review-due:annual:2026')
    expect(dueReviews(new Date(2027, 0, 5), full(), DEFAULT_PILOTAGE_PREFS).some((x) => x.key === 'review-due:annual:2026')).toBe(true)
    for (const d of dueReviews(new Date(2026, 11, 28), full(), { ...DEFAULT_PILOTAGE_PREFS, reminders: { monthly: true, quarterly: true, annual: true } })) expect(`${d.title} ${d.body}`).not.toMatch(/retard|manqué|oubli|échec|obligatoire/i)
  })
})

describe('Pilotage : faits de revue tirés des données réelles', () => {
  it('objectifs atteints, projets avancés, indicateurs, changements, pistes à conserver ou revoir', () => {
    const g1 = goal({ title: 'Atteint', status: 'achieved', statusAt: at(-10) }), g2 = goal({ title: 'Actif' })
    const pj = project({ title: 'Site', steps: [{ id: 's1', title: 'A', dueDate: null, done: true, doneAt: at(-4), blocked: null, subtasks: [] }, { id: 's2', title: 'B', dueDate: null, done: false, doneAt: null, blocked: 'Attente', subtasks: [] }] })
    const a = activity(g2, 2)
    const pActive = prio({ title: 'Avance', level: 'fundamental', goalIds: [g2.id] }), pIdle = prio({ title: 'Dort', goalIds: [g1.id] })
    const log: StrategyLogEntry = { id: 'l1', at: at(-3), kind: 'priority', action: 'priority-level', refType: 'priority', refId: pIdle.id, title: 'x', summary: '« Dort » : Fondamentale → Importante' }
    const f = periodFacts({ from: day(-30), to: day(0) }, null, state({ priorities: [pActive, pIdle], log: [log] }), lifeCtx({ goals: [g1, g2], projects: [pj], quests: [a.q], events: a.events }), [])
    expect(f.goals.achieved).toBe(1)
    expect(f.projects[0]).toMatchObject({ title: 'Site', stepsDone: 1, stepsTotal: 2 })
    expect(f.changes).toContain('« Dort » : Fondamentale → Importante')
    expect(f.keep).toEqual(['Avance']); expect(f.reconsider).toEqual(['Dort'])
  })
})

describe('Intelligence stratégique : cohérence', () => {
  const run = (s: StrategyState, l: LifeCtx, o: Partial<StrategyCtx> = {}) => strategicObservations(sctx(s, l, o))
  const ids = (o: ReturnType<typeof run>) => o.map((x) => x.id.split(':')[0])
  it('sans contenu stratégique : aucune observation', () => expect(run(EMPTY_STRATEGY, lifeCtx())).toEqual([]))
  it('orientation active sans objectif concret (certain), pas pour une orientation récente ou archivée', () => {
    const o = orient()
    expect(run(state({ orientations: [o] }), lifeCtx()).find((x) => x.id.startsWith('strat-orientation-empty'))).toMatchObject({ certainty: 'certain', tone: 'neutral' })
    expect(ids(run(state({ orientations: [orient({ createdAt: at(-2) })] }), lifeCtx()))).not.toContain('strat-orientation-empty')
    expect(ids(run(state({ orientations: [orient({ archived: true })] }), lifeCtx()))).not.toContain('strat-orientation-empty')
  })
  it('priorité sans objectif associé, puis sans activité depuis 28 jours (probable), sans reproche', () => {
    const p = prio({ level: 'fundamental' })
    expect(ids(run(state({ priorities: [p] }), lifeCtx()))).toContain('strat-priority-unlinked')
    const g = goal(); const a = activity(g, 1, 60)
    const withGoal = prio({ level: 'fundamental', goalIds: [g.id] })
    const obs = run(state({ priorities: [withGoal] }), lifeCtx({ goals: [g], quests: [a.q], events: a.events })).find((x) => x.id.startsWith('strat-priority-idle'))!
    expect(obs).toMatchObject({ certainty: 'probable', tone: 'attention' })
    expect(obs.detail).toMatch(/pas un reproche/); expect(JSON.stringify(obs)).not.toMatch(/paresse|manque de discipline|motivation/i)
    const b = activity(g, 2); expect(ids(run(state({ priorities: [withGoal] }), lifeCtx({ goals: [g], quests: [b.q], events: b.events })))).not.toContain('strat-priority-idle')
  })
  it('priorité fondamentale sans temps consacré : exige un historique, ignore une quête planifiée', () => {
    const g = goal(); const old = activity(g, 1, 50)
    const p = prio({ level: 'fundamental', goalIds: [g.id], createdAt: at(-20) })
    const base = lifeCtx({ goals: [g], quests: [old.q], events: old.events })
    expect(run(state({ priorities: [p] }), base).find((x) => x.id.startsWith('strat-priority-notime'))).toMatchObject({ certainty: 'probable', nature: 'estimate' })
    const planned = quest({ goalId: g.id, plannedFor: day(3) })
    expect(ids(run(state({ priorities: [p] }), lifeCtx({ goals: [g], quests: [old.q, planned], events: old.events })))).not.toContain('strat-priority-notime')
    expect(ids(run(state({ priorities: [p] }), lifeCtx({ goals: [g] })))).not.toContain('strat-priority-notime')
  })
  it('limite de priorités fondamentales : certain, liste les priorités, suit la limite configurée', () => {
    const list = [1, 2, 3, 4].map(() => prio({ level: 'fundamental' }))
    const o = run(state({ priorities: list }), lifeCtx()).find((x) => x.id === 'strat-fundamental-limit')!
    expect(o).toMatchObject({ certainty: 'certain', tone: 'attention' }); expect(o.evidence).toHaveLength(4)
    expect(ids(run(state({ priorities: list }), lifeCtx(), { prefs: { ...DEFAULT_PILOTAGE_PREFS, maxFundamental: 5 } }))).not.toContain('strat-fundamental-limit')
  })
  it('objectif sans orientation active ; projet attaché à un objectif clos', () => {
    const g = goal(), done = goal({ status: 'achieved' })
    const o = orient({ goalIds: [g.id], status: 'paused' })
    expect(ids(run(state({ orientations: [o] }), lifeCtx({ goals: [g] })))).toContain('strat-goal-orphan')
    expect(ids(run(state({ orientations: [orient({ goalIds: [g.id] })] }), lifeCtx({ goals: [g] })))).not.toContain('strat-goal-orphan')
    const pj = project({ goalId: done.id })
    expect(run(state({ orientations: [orient({ projectIds: [pj.id] })] }), lifeCtx({ goals: [done], projects: [pj] })).find((x) => x.id.startsWith('strat-project-drift'))).toMatchObject({ certainty: 'probable' })
  })
  it('projets actifs sans lien avec les priorités : estimation, exige un historique', () => {
    const pj = project(); const q = quest({ projectId: pj.id }); const old = ev(quest(), -40)
    const ctxs = lifeCtx({ projects: [pj], quests: [q], events: [old, ev(q, -2)] })
    expect(run(state({ priorities: [prio({ level: 'fundamental' })] }), ctxs).find((x) => x.id === 'strat-projects-unlinked')).toMatchObject({ certainty: 'estimate' })
    expect(ids(run(state({ priorities: [prio({ level: 'fundamental' })], orientations: [orient({ projectIds: [pj.id] })] }), ctxs))).not.toContain('strat-projects-unlinked')
    expect(ids(run(state({ priorities: [prio({ level: 'important' })] }), ctxs))).not.toContain('strat-projects-unlinked')
  })
})

describe('Intelligence stratégique : évolution dans le temps', () => {
  const run = (s: StrategyState, l: LifeCtx, o: Partial<StrategyCtx> = {}) => strategicObservations(sctx(s, l, o))
  it('orientation qui avance régulièrement (4 semaines actives) ; progrès réguliers mais peu visibles', () => {
    const g = goal({ createdAt: at(-90) }); const a = activity(g, 4)
    const o = orient({ goalIds: [g.id] })
    const obs = run(state({ orientations: [o] }), lifeCtx({ goals: [g], quests: [a.q], events: a.events }))
    expect(obs.find((x) => x.id.startsWith('strat-orientation-regular'))).toMatchObject({ tone: 'positive', nature: 'fact' })
    const three = activity(g, 3, 7)
    const slow = run(state({ orientations: [o] }), lifeCtx({ goals: [g], quests: [three.q], events: three.events }))
    expect(slow.find((x) => x.id.startsWith('strat-progress-invisible'))).toMatchObject({ tone: 'positive', reliability: 'low' })
    expect(run(state({ orientations: [orient({ goalIds: [g.id], createdAt: at(-10) })] }), lifeCtx({ goals: [g], quests: [a.q], events: a.events })).some((x) => x.id.startsWith('strat-orientation-regular'))).toBe(false)
  })
  it('changements de cap fréquents : formulation neutre, fiabilité selon le nombre, jamais un manque de discipline', () => {
    const logs = (k: number): StrategyLogEntry[] => Array.from({ length: k }, (_, i) => ({ id: `l${i}`, at: at(-5 - i), kind: 'priority', action: 'priority-level', refType: 'priority', refId: 'p', title: 't', summary: `Changement ${i}` }))
    expect(run(state({ orientations: [orient()], log: logs(3) }), lifeCtx()).some((x) => x.id === 'strat-direction-changes')).toBe(false)
    const o = run(state({ orientations: [orient()], log: logs(5) }), lifeCtx()).find((x) => x.id === 'strat-direction-changes')!
    expect(o).toMatchObject({ nature: 'interpretation', tone: 'neutral', reliability: 'medium' })
    expect(o.detail).toMatch(/aucun manque de constance/); expect(JSON.stringify(o)).not.toMatch(/paresse|manque de discipline|inconstan/i)
    expect(run(state({ orientations: [orient()], log: logs(5).map((l) => ({ ...l, at: at(-200) })) }), lifeCtx()).some((x) => x.id === 'strat-direction-changes')).toBe(false)
  })
  it('calendrier irréaliste : réutilise les constats LIFE pour les objectifs inscrits dans la stratégie', () => {
    const g = goal(); const findings = [{ id: 'ginc:x', kind: 'goal-incompatible' as const, severity: 'warn' as const, title: 'Difficile à tenir', detail: 'Trop de travail restant.', refType: 'goal' as const, refId: g.id }]
    const o = orient({ goalIds: [g.id] })
    expect(run(state({ orientations: [o] }), lifeCtx({ goals: [g] }), { findings }).find((x) => x.id.startsWith('strat-goal-timeline'))).toMatchObject({ certainty: 'probable' })
    expect(run(state({ orientations: [orient()] }), lifeCtx({ goals: [g] }), { findings }).some((x) => x.id.startsWith('strat-goal-timeline'))).toBe(false)
  })
  it('cycle du trimestre : vide ; à revoir à mi-parcours si moins de la moitié des priorités avance', () => {
    expect(run(state({ cycles: [cycle()] }), lifeCtx()).find((x) => x.id.startsWith('strat-cycle-empty'))).toMatchObject({ certainty: 'certain' })
    const g1 = goal(), g2 = goal(), g3 = goal(), a = activity(g1, 1)
    const ps = [prio({ goalIds: [g1.id] }), prio({ goalIds: [g2.id] }), prio({ goalIds: [g3.id] })]
    const cy = cycle({ priorityIds: ps.map((p) => p.id) })
    const obs = run(state({ priorities: ps, cycles: [cy] }), lifeCtx({ goals: [g1, g2, g3], quests: [a.q], events: a.events })).find((x) => x.id.startsWith('strat-cycle-incoherent'))!
    expect(obs).toMatchObject({ certainty: 'probable', tone: 'attention' }); expect(obs.detail).toMatch(/pas un échec/)
  })
  it('vision relue depuis plus d’un an : douce et neutre', () => {
    const o = run(state({ visions: [vision({ revisedAt: at(-400) })] }), lifeCtx()).find((x) => x.id === 'strat-vision-stale')!
    expect(o.tone).toBe('neutral'); expect(o.detail).toMatch(/rien d’urgent/)
    expect(run(state({ visions: [vision()] }), lifeCtx()).some((x) => x.id === 'strat-vision-stale')).toBe(false)
  })
})

describe('Intégration au moteur d’analyse et de recommandations existant (pas de second moteur)', () => {
  const recov = evaluateRecovery({ checks: [], sessions: [], now: NOW, today: day(0) })
  const plan = (life = lifeCtx()): PlanContext => ({ quests: life.quests, events: life.events, commitments: [], sessions: [], moves: [], prefs: DEFAULT_PREFS.planning, sportDays: [], recovery: recov, now: NOW, life: life.life })
  const ictx = (s: StrategyState | undefined, life = lifeCtx()): InsightCtx => ({ plan: plan(life), checks: [], categories: [], sportTarget: 3, findings: [], strategy: s ? sctx(s, life) : undefined })
  it('le moteur existant restitue les observations stratégiques ; sans Pilotage, rien ne change', () => {
    const list = [1, 2, 3, 4].map(() => prio({ level: 'fundamental' }))
    expect(analyse(ictx(state({ priorities: list })), recov).some((o) => o.id === 'strat-fundamental-limit')).toBe(true)
    expect(analyse(ictx(undefined), recov).some((o) => o.id.startsWith('strat-'))).toBe(false)
  })
  it('chaque recommandation stratégique expose constat, justification, proposition, bénéfice et confiance', () => {
    const list = [1, 2, 3, 4].map(() => prio({ level: 'fundamental' }))
    const s = state({ priorities: list }); const c = sctx(s, lifeCtx())
    const observations = strategicObservations(c); const proposals = strategicProposals(c)
    const rctx: RecCtx = { observations, lifeProposals: [], recovery: recov, now: NOW, hasSport: false, pilotageProposals: proposals }
    const rec = buildRecommendations(rctx).find((r) => r.id === 'rec:strat-limit')!
    expect(rec.finding && rec.evidence.length && rec.recommendation && rec.benefit && rec.confidence).toBeTruthy()
    expect(rec.action?.type).toBe('pilotage-proposal')
    expect(proposals[0]).toMatchObject({ kind: 'demote-priority' })
    expect(JSON.stringify(rec)).not.toMatch(/paresse|manque de discipline|motivation|inconstan/i)
  })
  it('la rétrogradation proposée vise la priorité la MOINS active ; la limite respectée → aucune proposition', () => {
    const g1 = goal(), g2 = goal(), g3 = goal(), g4 = goal(); const a1 = activity(g1, 4), a2 = activity(g2, 2)
    const ps = [g1, g2, g3, g4].map((g) => prio({ level: 'fundamental', goalIds: [g.id] }))
    const life = lifeCtx({ goals: [g1, g2, g3, g4], quests: [a1.q, a2.q], events: [...a1.events, ...a2.events] })
    const p = strategicProposals(sctx(state({ priorities: ps }), life))
    expect(p.find((x) => x.id.endsWith(':limit'))!.priorityId).toBe(ps[2].id)
    expect(strategicProposals(sctx(state({ priorities: ps.slice(0, 2) }), life)).filter((x) => x.id.endsWith(':limit'))).toEqual([])
  })
  it('recommandations non appliquables : simple ouverture ; valorisation sans action', () => {
    const g = goal(); const a = activity(g, 4)
    const life = lifeCtx({ goals: [g], quests: [a.q], events: a.events })
    const s = state({ orientations: [orient({ goalIds: [g.id] }), orient({})] })
    const obs = strategicObservations(sctx(s, life))
    const recs = buildRecommendations({ observations: obs, lifeProposals: [], recovery: recov, now: NOW, hasSport: false })
    expect(recs.find((r) => r.id.startsWith('rec:strat-orientation-empty'))!.action).toMatchObject({ type: 'open', route: '/pilotage/orientations' })
    expect(recs.find((r) => r.id.startsWith('rec:strat-orientation-regular'))!.action).toBeNull()
  })
})
