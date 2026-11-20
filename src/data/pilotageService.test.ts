import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { canonicalStringify } from '@/core/backupFormat'
import { totalXp } from '@/core/ledger'
import { LevelDB } from './db'
import { BackupDB } from './backup/backupDb'
import { createBackupService } from './backup/backupService'
import { readTables } from './backup/snapshot'
import { createGoalService } from './goalService'
import { createPilotageService, PilotageError } from './pilotageService'
import { createQuestService } from './questService'
import { createPrefsService } from './prefsService'

let main: LevelDB
let clock: Date
let n: number
const deps = () => ({ now: () => clock, id: () => `id-${++n}` })
let svc: ReturnType<typeof createPilotageService>
let goals: ReturnType<typeof createGoalService>
let quests: ReturnType<typeof createQuestService>
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof PilotageError ? e.code : `other:${(e as Error).message}`))
const gInput = { title: 'Lancer Solitiquo', categoryId: 'cat-projets', priority: 'high' as const, importance: 3 as const }
const pr = (title: string, level: 'fundamental' | 'important' | 'secondary' = 'important') => ({ title, level, horizon: 'short' as const })
const logs = async () => (await main.strategyLog.toArray()).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id, undefined, { numeric: true }))

beforeEach(async () => {
  main = new LevelDB(`pilotage-${Math.random()}`)
  clock = new Date(2026, 10, 19, 10); n = 0
  await main.open()
  svc = createPilotageService(main, deps()); goals = createGoalService(main, deps()); quests = createQuestService(main, deps())
  await quests.seedCategories()
})

describe('vision : versions conservées, jamais d’écrasement silencieux', () => {
  it('création, révision (champs modifiés tracés avec l’avant), idempotence, remplacement avec archivage', async () => {
    expect(await code(svc.saveVision({ title: ' ' }))).toBe('invalid')
    const v = await svc.saveVision({ title: 'Une vie libre', description: 'Travailler à mon rythme', horizons: { long: '10 ans' } })
    expect(await svc.saveVision({ title: 'Une vie libre', description: 'Travailler à mon rythme', horizons: { long: '10 ans' } })).toEqual(v)
    clock = new Date(2026, 10, 20, 10)
    const r = await svc.saveVision({ title: 'Une vie libre', description: 'Travailler à mon rythme, près de la mer' })
    expect(r.id).toBe(v.id); expect(r.revisedAt).not.toBe(v.revisedAt); expect(r.createdAt).toBe(v.createdAt)
    const rev = (await logs()).find((l) => l.action === 'vision-revised')!
    expect(rev.before).toMatchObject({ description: 'Travailler à mon rythme' }); expect(rev.after).toMatchObject({ description: 'Travailler à mon rythme, près de la mer' })
    const v2 = await svc.replaceVision({ title: 'Nouvelle étape' })
    const all = await main.visions.toArray()
    expect(all).toHaveLength(2); expect(all.filter((x) => x.status === 'active').map((x) => x.id)).toEqual([v2.id]); expect(all.find((x) => x.id === v.id)!.status).toBe('archived')
  })
})

describe('orientations', () => {
  it('création, statut, tri, archivage ; tout est tracé et rien n’est supprimé', async () => {
    const vis = await svc.saveVision({ title: 'V' })
    expect(await code(svc.createOrientation({ name: '', importance: 2, horizon: 'mid' }))).toBe('invalid')
    expect(await code(svc.createOrientation({ name: 'X', importance: 2, horizon: 'mid', visionId: 'ghost' }))).toBe('invalid')
    expect(await code(svc.createOrientation({ name: 'X', importance: 7 as never, horizon: 'mid' }))).toBe('invalid')
    const a = await svc.createOrientation({ name: 'Pro', importance: 3, horizon: 'long', visionId: vis.id }), b = await svc.createOrientation({ name: 'Santé', importance: 2, horizon: 'mid' })
    expect(a.status).toBe('todo')
    await svc.setOrientationStatus(a.id, 'active'); await svc.setOrientationStatus(a.id, 'paused', 'Pause estivale')
    expect((await main.orientations.get(a.id))!.status).toBe('paused')
    await svc.moveOrientation(b.id, -1)
    const order = (await main.orientations.toArray()).sort((x, y) => x.order - y.order).map((o) => o.name)
    expect(order).toEqual(['Santé', 'Pro'])
    await svc.archiveOrientation(a.id, true); expect((await main.orientations.get(a.id))!.archived).toBe(true)
    await svc.archiveOrientation(a.id, false)
    const up = await svc.updateOrientation(a.id, { name: 'Pro', importance: 1, horizon: 'long', visionId: vis.id })
    expect(up.importance).toBe(1); expect((await logs()).some((l) => l.action === 'orientation-importance')).toBe(true)
    expect(await code(svc.setOrientationStatus('ghost', 'active'))).toBe('not_found')
    expect(await main.orientations.count()).toBe(2)
  })
})

describe('liens avec LIFE : aucune duplication, détacher ne supprime rien, aucun XP', () => {
  it('rattache des objectifs/projets existants (références inconnues ignorées) ; plusieurs orientations pour un objectif', async () => {
    const g = await goals.createGoal(gInput); const p = await goals.createProject({ title: 'Site', categoryId: 'cat-projets', priority: 'normal', goalId: g.id })
    const o1 = await svc.createOrientation({ name: 'Pro', importance: 3, horizon: 'mid' }), o2 = await svc.createOrientation({ name: 'Revenus', importance: 2, horizon: 'mid' })
    const l1 = await svc.setOrientationLinks(o1.id, { goalIds: [g.id, 'ghost', g.id], projectIds: [p.id] })
    await svc.setOrientationLinks(o2.id, { goalIds: [g.id] })
    expect(l1.goalIds).toEqual([g.id]); expect(l1.projectIds).toEqual([p.id])
    expect(await main.goals.count()).toBe(1); expect(await main.projects.count()).toBe(1)
    expect((await main.orientations.get(o2.id))!.goalIds).toEqual([g.id])
  })
  it('détacher conserve objectif, projet, quêtes et XP intacts', async () => {
    const g = await goals.createGoal(gInput); const q = await quests.createQuest({ type: 'personal', title: 'Écrire', categoryId: 'cat-projets', priority: 'normal', difficulty: 'normal', effortMinutes: 30 })
    await goals.linkQuest(q.id, { goalId: g.id }); await quests.completeQuest(q.id)
    const xpBefore = canonicalStringify(await main.xpEvents.toArray()), totalBefore = totalXp(await main.xpEvents.toArray())
    const goalBefore = canonicalStringify(await main.goals.toArray()), questBefore = canonicalStringify(await main.quests.toArray())
    const o = await svc.createOrientation({ name: 'Pro', importance: 3, horizon: 'mid' })
    await svc.setOrientationLinks(o.id, { goalIds: [g.id] }); const pri = await svc.createPriority({ ...pr('Lancer', 'fundamental'), goalIds: [g.id], orientationId: o.id })
    await svc.setOrientationLinks(o.id, { goalIds: [] }); await svc.updatePriority(pri.id, { ...pr('Lancer', 'fundamental'), goalIds: [], orientationId: null })
    await svc.setPriorityStatus(pri.id, 'dropped'); await svc.archiveOrientation(o.id, true)
    expect(canonicalStringify(await main.xpEvents.toArray())).toBe(xpBefore); expect(totalXp(await main.xpEvents.toArray())).toBe(totalBefore)
    expect(canonicalStringify(await main.goals.toArray())).toBe(goalBefore); expect(canonicalStringify(await main.quests.toArray())).toBe(questBefore)
  })
  it('un objectif supprimé dans LIFE ne casse rien : la référence devient simplement ignorée par les résolveurs', async () => {
    const g = await goals.createGoal(gInput); const o = await svc.createOrientation({ name: 'Pro', importance: 2, horizon: 'mid' })
    await svc.setOrientationLinks(o.id, { goalIds: [g.id] }); await main.goals.delete(g.id)
    expect((await main.orientations.get(o.id))!.goalIds).toEqual([g.id])
    await expect(svc.previewFacts('monthly', '2026-11')).resolves.toBeTruthy()
  })
})

describe('priorités et limite souple', () => {
  it('dépassement refusé (over_limit) sauf confirmation explicite ; limite configurable ; seules les actives comptent', async () => {
    for (const t of ['A', 'B', 'C']) await svc.createPriority(pr(t, 'fundamental'))
    expect(await code(svc.createPriority(pr('D', 'fundamental')))).toBe('over_limit')
    expect(await main.priorities.count()).toBe(3)
    expect((await svc.createPriority(pr('D', 'fundamental'), { allowOverLimit: true })).level).toBe('fundamental')
    expect(await code(svc.createPriority(pr('E', 'important')))).toBe('ok')
    const all = await main.priorities.toArray(); await svc.setPriorityStatus(all[0].id, 'paused')
    expect(await code(svc.createPriority(pr('F', 'fundamental')))).toBe('over_limit')
    await svc.setPriorityStatus(all[1].id, 'paused')
    expect(await code(svc.createPriority(pr('G', 'fundamental')))).toBe('ok')
    expect(await code(svc.setPriorityStatus(all[0].id, 'active'))).toBe('over_limit')
    await createPrefsService(main).update((c) => ({ ...c, pilotage: { ...c.pilotage, maxFundamental: 6 } }))
    expect(await code(svc.setPriorityStatus(all[0].id, 'active'))).toBe('ok')
  })
  it('promotion en fondamentale soumise à la limite ; changements de niveau et de statut historisés avec l’avant', async () => {
    for (const t of ['A', 'B', 'C']) await svc.createPriority(pr(t, 'fundamental'))
    const x = await svc.createPriority(pr('X', 'important'))
    expect(await code(svc.updatePriority(x.id, pr('X', 'fundamental')))).toBe('over_limit')
    const down = (await main.priorities.toArray()).find((p) => p.title === 'A')!
    clock = new Date(2026, 10, 25, 10)
    const d = await svc.updatePriority(down.id, pr('A', 'secondary'))
    expect(d.levelAt).not.toBe(down.levelAt)
    const lv = (await logs()).find((l) => l.action === 'priority-level')!
    expect(lv.before).toMatchObject({ level: 'fundamental' }); expect(lv.after).toMatchObject({ level: 'secondary' })
    expect(await code(svc.createPriority({ ...pr('Z'), dueDate: 'demain' }))).toBe('invalid')
    expect(await code(svc.createPriority({ ...pr('Z'), orientationId: 'ghost' }))).toBe('invalid')
    expect(await code(svc.updatePriority('ghost', pr('Z')))).toBe('not_found')
  })
  it('les goalIds inconnus sont ignorés', async () => {
    const g = await goals.createGoal(gInput)
    expect((await svc.createPriority({ ...pr('P'), goalIds: [g.id, 'ghost'] })).goalIds).toEqual([g.id])
  })
})

describe('plan annuel et cycles trimestriels', () => {
  it('le plan est modifiable, ses changements importants sont historisés ; un enregistrement identique n’ajoute rien', async () => {
    expect(await code(svc.savePlan(1, {}))).toBe('invalid')
    const p = await svc.savePlan(2026, { aims: 'Lancer', why: 'Autonomie', actions: 'Écrire chaque semaine', expectedResults: ['500 inscrits', ' '] })
    expect(p.expectedResults).toEqual(['500 inscrits'])
    const before = (await logs()).length
    await svc.savePlan(2026, { aims: 'Lancer' }); expect((await logs()).length).toBe(before)
    await svc.savePlan(2026, { aims: 'Lancer et vendre' })
    const ch = (await logs()).find((l) => l.action === 'plan-changed')!
    expect(ch.before).toMatchObject({ aims: 'Lancer' }); expect(ch.after).toMatchObject({ aims: 'Lancer et vendre' })
    expect((await main.annualPlans.get('plan:2026'))!.actions).toBe('Écrire chaque semaine')
  })
  it('un cycle sélectionne des éléments existants (jamais une liste de tâches) ; le trimestre en cours est actif', async () => {
    const g = await goals.createGoal(gInput); const pri = await svc.createPriority(pr('P'))
    const c = await svc.saveCycle(2026, 4, { priorityIds: [pri.id], goalIds: [g.id, 'ghost'], expectedResults: ['Bêta en ligne'] })
    expect(c).toMatchObject({ id: 'cycle:2026-Q4', status: 'active', goalIds: [g.id] })
    expect((await svc.saveCycle(2027, 1, {})).status).toBe('planned')
    await svc.saveCycle(2026, 4, { priorityIds: [] })
    const cur = (await main.cycles.get('cycle:2026-Q4'))!; expect(cur.priorityIds).toEqual([]); expect(cur.goalIds).toEqual([g.id])
    expect((await logs()).some((l) => l.action === 'cycle-changed')).toBe(true)
    expect(await main.goals.count()).toBe(1); expect(await main.quests.count()).toBe(0)
  })
})

describe('revues : faits conservés, transitions atomiques, pas de culpabilisation', () => {
  it('revue trimestrielle : faits enregistrés ; clôture du cycle et préparation facultative du suivant dans la même transaction', async () => {
    const g = await goals.createGoal(gInput); const pri = await svc.createPriority({ ...pr('P', 'fundamental'), goalIds: [g.id] })
    await svc.saveCycle(2026, 4, { priorityIds: [pri.id], goalIds: [g.id] })
    const prev = await svc.previewFacts('quarterly', '2026-Q4'); expect(prev.goals).toBeTruthy()
    const r = await svc.saveReview({ kind: 'quarterly', answers: { difficulties: 'Manque de temps' }, decisions: 'On garde P', closeCycle: true, createNext: { priorityIds: [pri.id], orientationIds: [] } })
    expect(r).toMatchObject({ id: 'review:quarterly:2026-Q4', period: '2026-Q4' }); expect(r.facts).toBeTruthy()
    expect((await main.cycles.get('cycle:2026-Q4'))!.status).toBe('closed')
    expect(await main.cycles.get('cycle:2027-Q1')).toMatchObject({ status: 'planned', priorityIds: [pri.id] })
    const actions = (await logs()).map((l) => l.action); expect(actions).toEqual(expect.arrayContaining(['review-done', 'cycle-closed', 'cycle-created']))
  })
  it('refaire une revue la remplace mais l’ancienne reste dans la mémoire stratégique ; sans createNext, aucun cycle créé', async () => {
    await svc.saveReview({ kind: 'monthly', period: '2026-10', decisions: 'v1' }); clock = new Date(2026, 10, 21, 10)
    await svc.saveReview({ kind: 'monthly', period: '2026-10', decisions: 'v2' })
    expect(await main.strategyReviews.count()).toBe(1)
    const l = (await logs()).find((x) => x.action === 'review-replaced')!
    expect(l.before).toMatchObject({ decisions: 'v1' })
    await svc.saveReview({ kind: 'quarterly', closeCycle: true })
    expect(await main.cycles.count()).toBe(0)
  })
  it('revue annuelle : plan de l’année suivante préparé, ancien plan clos', async () => {
    const o = await svc.createOrientation({ name: 'Pro', importance: 2, horizon: 'mid' }); await svc.savePlan(2026, { aims: 'x' })
    await svc.saveReview({ kind: 'annual', nextYear: { priorityIds: [], orientationIds: [o.id] } })
    expect((await main.annualPlans.get('plan:2027'))!.orientationIds).toEqual([o.id]); expect((await main.annualPlans.get('plan:2026'))!.status).toBe('closed')
  })
  it('périodes invalides refusées sans rien écrire', async () => {
    expect(await code(svc.saveReview({ kind: 'monthly', period: 'novembre' }))).toBe('invalid')
    expect(await code(svc.saveReview({ kind: 'quarterly', period: '2026-Q9' }))).toBe('invalid')
    expect(await code(svc.saveReview({ kind: 'annual', period: '26' }))).toBe('invalid')
    expect(await main.strategyReviews.count()).toBe(0); expect(await main.strategyLog.count()).toBe(0)
  })
  it('les revues n’écrivent jamais de XP', async () => {
    await svc.saveReview({ kind: 'monthly' }); await svc.saveReview({ kind: 'annual' })
    expect(await main.xpEvents.count()).toBe(0)
  })
})

describe('propositions de Level : appliquées après confirmation, revérifiées à l’écriture', () => {
  const demote = (priorityId: string) => ({ id: 'strat-prop:limit', kind: 'demote-priority' as const, priorityId, title: '', detail: '' })
  it('rétrograde une priorité fondamentale en importante, tracé « sur proposition » ; périmée si l’état a changé', async () => {
    const p = await svc.createPriority(pr('P', 'fundamental'))
    const out = await svc.applyProposal(demote(p.id) as never)
    expect(out.applied).toMatch(/importante/); expect((await main.priorities.get(p.id))!.level).toBe('important')
    expect((await logs()).find((l) => l.action === 'priority-level')!.note).toMatch(/confirmée/)
    expect(await code(svc.applyProposal(demote(p.id) as never))).toBe('stale')
    await svc.setPriorityStatus(p.id, 'paused')
    expect(await code(svc.applyProposal(demote(p.id) as never))).toBe('stale')
  })
  it('pause : met la priorité en pause sans rien supprimer', async () => {
    const p = await svc.createPriority(pr('P', 'secondary'))
    await svc.applyProposal({ id: 'x', kind: 'pause-priority', priorityId: p.id, title: '', detail: '' } as never)
    expect((await main.priorities.get(p.id))!.status).toBe('paused'); expect(await main.priorities.count()).toBe(1)
    expect(await code(svc.applyProposal(demote('ghost') as never))).toBe('stale')
  })
})

describe('mémoire stratégique : append-only, chronologique', () => {
  it('chaque changement ajoute une entrée ; les entrées existantes ne sont jamais modifiées ; décision libre', async () => {
    const o = await svc.createOrientation({ name: 'Pro', importance: 2, horizon: 'mid' })
    const first = (await main.strategyLog.toArray()).map((l) => canonicalStringify(l))
    clock = new Date(2026, 10, 20, 10); await svc.setOrientationStatus(o.id, 'active'); await svc.logDecision('Concentrer l’année sur Pro', 'Après discussion')
    const now = await logs()
    expect(now.length).toBe(first.length + 2)
    for (const f of first) expect(now.map((l) => canonicalStringify(l))).toContain(f)
    expect(now.map((l) => l.at)).toEqual([...now.map((l) => l.at)].sort())
    expect(await code(svc.logDecision(' ', ''))).toBe('invalid')
  })
  it('une commande refusée n’écrit rien (atomicité)', async () => {
    for (const t of ['A', 'B', 'C']) await svc.createPriority(pr(t, 'fundamental'))
    const before = await main.strategyLog.count()
    await svc.createPriority(pr('D', 'fundamental')).catch(() => {})
    expect(await main.strategyLog.count()).toBe(before); expect(await main.priorities.count()).toBe(3)
  })
})

describe('sauvegardes v9 : toute la stratégie survit au chiffrement et à la restauration', () => {
  it('visions, orientations, priorités, plan, cycles, revues et mémoire restaurés à l’identique', async () => {
    const g = await goals.createGoal(gInput)
    const v = await svc.saveVision({ title: 'V', horizons: { long: '10 ans' } }); const o = await svc.createOrientation({ name: 'Pro', importance: 3, horizon: 'long', visionId: v.id })
    await svc.setOrientationLinks(o.id, { goalIds: [g.id] }); const p = await svc.createPriority({ ...pr('P', 'fundamental'), goalIds: [g.id], orientationId: o.id })
    await svc.savePlan(2026, { aims: 'x', priorityIds: [p.id] }); await svc.saveCycle(2026, 4, { priorityIds: [p.id] }); await svc.saveReview({ kind: 'monthly' })
    const bk = createBackupService(main, new BackupDB(`bk-${Math.random()}`), { ...deps(), iterations: 2000 })
    const meta = (await bk.createBackup('manual-snapshot'))!
    expect(meta.verification!.counts).toMatchObject({ visions: 1, orientations: 1, priorities: 1, annualPlans: 1, cycles: 1, strategyReviews: 1 })
    expect((meta.verification!.counts as Record<string, number>).strategyLog ?? 0).toBeGreaterThan(5)
    const original = canonicalStringify(await readTables(main))
    for (const t of [main.visions, main.orientations, main.priorities, main.annualPlans, main.cycles, main.strategyReviews, main.strategyLog]) await t.clear()
    const report = await bk.applyRestore(await bk.prepareRestoreFromBackup(meta.id))
    expect(report.ok).toBe(true); expect(canonicalStringify(await readTables(main))).toBe(original)
  })
})
