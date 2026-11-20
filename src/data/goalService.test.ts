import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { totalXp } from '@/core/ledger'
import { canonicalStringify } from '@/core/backupFormat'
import { LevelDB } from './db'
import { BackupDB } from './backup/backupDb'
import { createBackupService } from './backup/backupService'
import { readTables } from './backup/snapshot'
import { createGoalService, GoalError } from './goalService'
import { createQuestService } from './questService'
import { createPlanningService } from './planningService'

let main: LevelDB
let clock: Date
let n: number
const deps = () => ({ now: () => clock, id: () => `id-${++n}` })
let goals: ReturnType<typeof createGoalService>
let quests: ReturnType<typeof createQuestService>
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof GoalError ? e.code : `other:${(e as Error).message}`))
const day = (k: number) => { const d = new Date(2026, 10, 19 + k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const gInput = { title: 'Lancer Solitiquo', categoryId: 'cat-projets', priority: 'high' as const, importance: 3 as const }
const pInput = { title: 'Développer Solitiquo', categoryId: 'cat-projets', priority: 'normal' as const }
const qInput = { type: 'personal' as const, title: 'Écrire la landing', categoryId: 'cat-projets', priority: 'normal' as const, difficulty: 'normal' as const, effortMinutes: 60 }

beforeEach(async () => {
  main = new LevelDB(`goals-${Math.random()}`)
  clock = new Date(2026, 10, 19, 10)
  n = 0
  await main.open()
  goals = createGoalService(main, deps())
  quests = createQuestService(main, deps())
  await quests.seedCategories()
})

describe('objectifs', () => {
  it('création, modification libre, statuts, critères et étapes validés explicitement', async () => {
    const g = await goals.createGoal({ ...gInput, criteria: [{ title: '1000 inscrits' }], milestones: [{ title: 'Bêta', dueDate: day(30) }], dueDate: day(120) })
    expect(g).toMatchObject({ status: 'todo', importance: 3 })
    const up = await goals.updateGoal(g.id, { ...gInput, title: 'Lancer le produit', criteria: g.criteria, milestones: g.milestones, status: 'active' })
    expect(up).toMatchObject({ title: 'Lancer le produit', status: 'active' })
    const c = await goals.toggleCriterion(g.id, g.criteria[0].id)
    expect(c.criteria[0]).toMatchObject({ done: true })
    expect(c.criteria[0].doneAt).toBeTruthy()
    expect((await goals.toggleMilestone(g.id, g.milestones[0].id)).milestones[0].done).toBe(true)
    for (const s of ['paused', 'achieved', 'abandoned', 'todo'] as const) expect((await goals.setGoalStatus(g.id, s)).status).toBe(s)
  })
  it('validation : titre, catégorie, date, importance', async () => {
    expect(await code(goals.createGoal({ ...gInput, title: ' ' }))).toBe('invalid')
    expect(await code(goals.createGoal({ ...gInput, categoryId: 'nope' }))).toBe('invalid')
    expect(await code(goals.createGoal({ ...gInput, dueDate: 'x' }))).toBe('invalid')
    expect(await code(goals.createGoal({ ...gInput, importance: 9 as never }))).toBe('invalid')
  })
  it('plusieurs objectifs simultanés ; tensions : ne référencent que des objectifs existants, jamais soi-même', async () => {
    const a = await goals.createGoal(gInput); const b = await goals.createGoal({ ...gInput, title: 'Courir un marathon', conflictsWith: [a.id, 'ghost'] })
    expect(b.conflictsWith).toEqual([a.id])
    expect((await goals.updateGoal(a.id, { ...gInput, conflictsWith: [a.id] })).conflictsWith).toEqual([])
    expect(await main.goals.count()).toBe(2)
  })
})

describe('projets, étapes, sous-tâches', () => {
  it('création rattachée à un objectif, indépendante possible, dates cohérentes', async () => {
    const g = await goals.createGoal(gInput)
    expect((await goals.createProject({ ...pInput, goalId: g.id })).goalId).toBe(g.id)
    expect((await goals.createProject(pInput)).goalId).toBeNull()
    expect(await code(goals.createProject({ ...pInput, goalId: 'ghost' }))).toBe('not_found')
    expect(await code(goals.createProject({ ...pInput, startDate: day(5), dueDate: day(1) }))).toBe('invalid')
  })
  it('étapes : création, réorganisation, validation explicite, blocage, sous-tâches', async () => {
    const p = await goals.createProject(pInput)
    let cur = await goals.addStep(p.id, { title: 'Maquette', dueDate: day(10) })
    cur = await goals.addStep(p.id, { title: 'Prototype' })
    const [a, b] = cur.steps
    cur = await goals.moveStep(p.id, b.id, -1)
    expect(cur.steps.map((s) => s.title)).toEqual(['Prototype', 'Maquette'])
    expect((await goals.moveStep(p.id, b.id, -1)).steps[0].title).toBe('Prototype') // déjà en tête : inchangé
    cur = await goals.addSubtask(p.id, a.id, 'Wireframes'); cur = await goals.addSubtask(p.id, a.id, 'Validation client')
    const st = cur.steps.find((s) => s.id === a.id)!
    for (const t of st.subtasks) cur = await goals.toggleSubtask(p.id, a.id, t.id)
    expect(cur.steps.find((s) => s.id === a.id)!.done).toBe(false) // sous-tâches faites ≠ étape validée
    cur = await goals.updateStep(p.id, a.id, { blocked: 'Attente retour client' })
    expect(cur.steps.find((s) => s.id === a.id)!.blocked).toBe('Attente retour client')
    cur = await goals.toggleStep(p.id, a.id)
    expect(cur.steps.find((s) => s.id === a.id)).toMatchObject({ done: true, blocked: null })
    expect(cur.steps.find((s) => s.id === a.id)!.doneAt).toBeTruthy()
    expect(await code(goals.toggleStep(p.id, 'ghost'))).toBe('not_found')
  })
  it('modifications concurrentes d’un projet ne s’écrasent pas', async () => {
    const p = await goals.createProject(pInput)
    await Promise.all([goals.addStep(p.id, { title: 'A' }), goals.addStep(p.id, { title: 'B' }), goals.addStep(p.id, { title: 'C' })])
    expect((await main.projects.get(p.id))!.steps).toHaveLength(3)
  })
})

describe('quêtes rattachées et XP', () => {
  it('une quête rattachée reste une vraie quête, validée par le moteur XP ; valider étape/projet/objectif ne crée AUCUNE XP', async () => {
    const g = await goals.createGoal(gInput)
    const p = await goals.createProject({ ...pInput, goalId: g.id })
    const withStep = await goals.addStep(p.id, { title: 'Landing' })
    const q = await quests.createQuest(qInput)
    await goals.linkQuest(q.id, { projectId: p.id, stepId: withStep.steps[0].id })
    expect(await main.quests.get(q.id)).toMatchObject({ projectId: p.id, stepId: withStep.steps[0].id, rewardXp: q.rewardXp })
    const before = (await main.xpEvents.toArray()).length
    await quests.completeQuest(q.id)
    const xpAfterQuest = totalXp(await main.xpEvents.toArray())
    expect(xpAfterQuest).toBe(q.rewardXp)
    const eventsAfterQuest = (await main.xpEvents.toArray()).length
    expect(eventsAfterQuest).toBeGreaterThan(before)
    // étape, projet, objectif, critères : aucune écriture d'XP
    await goals.toggleStep(p.id, withStep.steps[0].id)
    await goals.setProjectStatus(p.id, 'done')
    await goals.setGoalStatus(g.id, 'achieved')
    await goals.updateGoal(g.id, { ...gInput, criteria: [{ title: 'Fait', done: true }], status: 'achieved' })
    expect((await main.xpEvents.toArray()).length).toBe(eventsAfterQuest)
    expect(totalXp(await main.xpEvents.toArray())).toBe(xpAfterQuest)
  })
  it('règles de rattachement : étape du bon projet, récurrente → objectif seulement, projet prioritaire sur objectif', async () => {
    const g = await goals.createGoal(gInput); const p = await goals.createProject(pInput); const p2 = await goals.createProject({ ...pInput, title: 'Autre' })
    const s = (await goals.addStep(p2.id, { title: 'E' })).steps[0]
    const q = await quests.createQuest(qInput); const daily = await quests.createQuest({ ...qInput, type: 'daily', title: 'Écrire 10 min' })
    expect(await code(goals.linkQuest(q.id, { projectId: p.id, stepId: s.id }))).toBe('invalid_link')
    expect(await code(goals.linkQuest(daily.id, { projectId: p.id }))).toBe('invalid_link')
    expect(await code(goals.linkQuest(daily.id, { goalId: g.id }))).toBe('ok')
    await goals.linkQuest(q.id, { goalId: g.id, projectId: p.id })
    expect(await main.quests.get(q.id)).toMatchObject({ projectId: p.id, goalId: null })
    await goals.linkQuest(q.id, {})
    expect(await main.quests.get(q.id)).toMatchObject({ projectId: null, stepId: null, goalId: null })
  })
  it('modifier une quête (service LIFE) conserve ses rattachements', async () => {
    const p = await goals.createProject(pInput); const q = await quests.createQuest(qInput)
    await goals.linkQuest(q.id, { projectId: p.id })
    await quests.updateQuest(q.id, { ...qInput, title: 'Écrire la page d’accueil' })
    expect((await main.quests.get(q.id))!.projectId).toBe(p.id)
  })
})

describe('suppression sans perte', () => {
  it('supprimer un objectif détache projets et quêtes, conserve quêtes réalisées et XP', async () => {
    const g = await goals.createGoal(gInput); const p = await goals.createProject({ ...pInput, goalId: g.id })
    const done = await quests.createQuest(qInput); const open = await quests.createQuest({ ...qInput, title: 'Autre quête' })
    await goals.linkQuest(done.id, { projectId: p.id }); await goals.linkQuest(open.id, { goalId: g.id })
    await quests.completeQuest(done.id)
    const xp = totalXp(await main.xpEvents.toArray())
    await goals.deleteGoal(g.id)
    expect(await main.goals.count()).toBe(0)
    expect((await main.projects.get(p.id))!.goalId).toBeNull()
    expect((await main.quests.get(open.id))!.goalId).toBeNull()
    expect(await main.quests.count()).toBe(2)
    expect(totalXp(await main.xpEvents.toArray())).toBe(xp)
  })
  it('supprimer un projet détache ses quêtes (réalisées incluses) et laisse l’XP intacte', async () => {
    const p = await goals.createProject(pInput); const q = await quests.createQuest(qInput)
    await goals.linkQuest(q.id, { projectId: p.id }); await quests.completeQuest(q.id)
    const xp = totalXp(await main.xpEvents.toArray())
    await goals.deleteProject(p.id)
    expect((await main.quests.get(q.id))).toMatchObject({ projectId: null, stepId: null })
    expect(totalXp(await main.xpEvents.toArray())).toBe(xp)
  })
  it('supprimer une étape détache ses quêtes', async () => {
    const p = await goals.createProject(pInput); const st = (await goals.addStep(p.id, { title: 'E' })).steps[0]
    const q = await quests.createQuest(qInput); await goals.linkQuest(q.id, { projectId: p.id, stepId: st.id })
    await goals.removeStep(p.id, st.id)
    expect((await main.quests.get(q.id))).toMatchObject({ projectId: p.id, stepId: null })
  })
})

describe('indicateurs', () => {
  it('historique de mesures, valeurs invalides refusées, aucune XP', async () => {
    const ind = await goals.createIndicator({ name: 'Épargne', categoryId: 'cat-finances', kind: 'money', target: 5000, frequency: 'monthly' })
    expect(ind.unit).toBe('€')
    await goals.addReading(ind.id, { value: 1200, at: day(-30) }); await goals.addReading(ind.id, { value: 1500 })
    expect(await main.indicatorReadings.count()).toBe(2)
    expect(await code(goals.addReading(ind.id, { value: NaN }))).toBe('invalid')
    expect(await code(goals.addReading(ind.id, { value: 1, at: day(3) }))).toBe('invalid')
    const r = (await main.indicatorReadings.toArray())[0]
    await goals.updateReading(r.id, { value: 1250, at: r.at })
    expect((await main.indicatorReadings.get(r.id))!.value).toBe(1250)
    expect(await main.xpEvents.count()).toBe(0)
  })
  it('supprimer un indicateur supprime son historique et le retire des objectifs', async () => {
    const ind = await goals.createIndicator({ name: 'Livres lus', categoryId: 'cat-culture', kind: 'number' })
    const g = await goals.createGoal({ ...gInput, indicatorIds: [ind.id] })
    expect(g.indicatorIds).toEqual([ind.id])
    await goals.addReading(ind.id, { value: 3 })
    await goals.deleteIndicator(ind.id)
    expect(await main.indicatorReadings.count()).toBe(0)
    expect((await main.goals.get(g.id))!.indicatorIds).toEqual([])
  })
})

describe('propositions de Level confirmées', () => {
  it('pause et décalage d’échéance : revérifiés, tracés, jamais sur un projet clos', async () => {
    const p = await goals.createProject({ ...pInput, status: 'active', dueDate: day(-2) })
    const r = await goals.applyLifeProposal({ id: 's', kind: 'shift-project-deadline', projectId: p.id, to: day(14), title: '', detail: '', severity: 'warn' })
    expect(r.applied).toMatch(/décalée/)
    expect((await main.projects.get(p.id))!.dueDate).toBe(day(14))
    expect((await main.planningMoves.toArray()).some((m) => m.kind === 'project' && m.byLevel)).toBe(true)
    await goals.applyLifeProposal({ id: 'p', kind: 'pause-project', projectId: p.id, title: '', detail: '', severity: 'info' })
    expect((await main.projects.get(p.id))!.status).toBe('paused')
    expect(await code(goals.applyLifeProposal({ id: 'p', kind: 'pause-project', projectId: p.id, title: '', detail: '', severity: 'info' }))).toBe('stale')
    expect(await code(goals.applyLifeProposal({ id: 'x', kind: 'shift-project-deadline', projectId: p.id, to: day(-1), title: '', detail: '', severity: 'warn' }))).toBe('invalid')
  })
  it('le planning ne propose jamais de déplacer une échéance de projet (seulement des quêtes)', async () => {
    const svc = createPlanningService(main, deps(), async () => undefined)
    expect(await svc.applyProposal({ id: 'z', kind: 'review-repeated', title: '', detail: '', severity: 'info' }).catch((e) => e.code)).toBe('not_applicable')
  })
})

describe('sauvegardes v6', () => {
  it('objectifs, projets, étapes, quêtes rattachées, indicateurs et mesures survivent à une sauvegarde chiffrée puis restauration', async () => {
    const g = await goals.createGoal({ ...gInput, criteria: [{ title: 'Critère' }] }); const p = await goals.createProject({ ...pInput, goalId: g.id })
    const st = (await goals.addStep(p.id, { title: 'E', dueDate: day(5) })).steps[0]
    const q = await quests.createQuest(qInput); await goals.linkQuest(q.id, { projectId: p.id, stepId: st.id }); await quests.completeQuest(q.id)
    const ind = await goals.createIndicator({ name: 'Poids', categoryId: 'cat-hygiene', kind: 'number', unit: 'kg' }); await goals.addReading(ind.id, { value: 80 })
    const bk = createBackupService(main, new BackupDB(`bk-${Math.random()}`), { ...deps(), iterations: 2000 })
    const meta = (await bk.createBackup('manual-snapshot'))!
    expect(meta.verification!.counts).toMatchObject({ goals: 1, projects: 1, indicators: 1, indicatorReadings: 1 })
    const original = canonicalStringify(await readTables(main))
    const xp = totalXp(await main.xpEvents.toArray())
    for (const t of [main.goals, main.projects, main.indicators, main.indicatorReadings, main.quests, main.xpEvents]) await t.clear()
    const report = await bk.applyRestore(await bk.prepareRestoreFromBackup(meta.id))
    expect(report.ok).toBe(true)
    expect(canonicalStringify(await readTables(main))).toBe(original)
    expect(totalXp(await main.xpEvents.toArray())).toBe(xp)
    expect(await main.quests.get(q.id)).toMatchObject({ projectId: p.id, stepId: st.id })
  })
})
