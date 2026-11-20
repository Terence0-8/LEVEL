import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { canonicalStringify, TABLE_KEYS, TABLE_NAMES } from '@/core/backupFormat'
import { auditLedger, totalXp } from '@/core/ledger'
import { computeProgression } from '@/core/progression'
import { levelFromXp } from '@/core/xp'
import { orphanRefs, type StrategyState } from '@/core/pilotage'
import { strategicObservations } from '@/core/strategy'
import { DEFAULT_PILOTAGE_PREFS } from '@/core/pilotage'
import { LevelDB } from './db'
import { BackupDB } from './backup/backupDb'
import { BackupError, createBackupService } from './backup/backupService'
import { readTables } from './backup/snapshot'
import { createEventService } from './eventService'
import { createGoalService } from './goalService'
import { createPilotageService } from './pilotageService'
import { createQuestService } from './questService'
import { createRpgService } from './rpgService'
import { createSportService } from './sportService'

/** Stabilisation : parcours multi-modules, intégrité après suppression, concurrence, sauvegarde globale, pannes. */
let main: LevelDB
let clock: Date
let n: number
const deps = () => ({ now: () => clock, id: () => `id-${++n}` })
let quests: ReturnType<typeof createQuestService>
let goals: ReturnType<typeof createGoalService>
let pilot: ReturnType<typeof createPilotageService>
let sport: ReturnType<typeof createSportService>
let events: ReturnType<typeof createEventService>
let rpg: ReturnType<typeof createRpgService>
const qInput = { type: 'personal' as const, title: 'Écrire la landing', categoryId: 'cat-pro', priority: 'normal' as const, difficulty: 'normal' as const, effortMinutes: 60 }
const gInput = { title: 'Lancer la bêta', categoryId: 'cat-pro', priority: 'high' as const, importance: 3 as const }
const pInput = { title: 'Site', categoryId: 'cat-pro', priority: 'normal' as const }
const xpAll = async () => (await main.xpEvents.toArray())
const PASS = 'ma phrase secrète 2026'
const strategyState = async (): Promise<StrategyState> => ({ visions: await main.visions.toArray(), orientations: await main.orientations.toArray(), priorities: await main.priorities.toArray(), plans: await main.annualPlans.toArray(), cycles: await main.cycles.toArray(), reviews: await main.strategyReviews.toArray(), log: await main.strategyLog.toArray() })

beforeEach(async () => {
  main = new LevelDB(`stab-${Math.random()}`)
  clock = new Date(2026, 10, 19, 10); n = 0
  await main.open()
  quests = createQuestService(main, deps()); goals = createGoalService(main, deps()); pilot = createPilotageService(main, deps())
  sport = createSportService(main, deps()); events = createEventService(main, deps()); rpg = createRpgService(main, deps())
  await quests.seedCategories()
})

describe('Pilotage : références vers des éléments LIFE supprimés (anomalie P1 de la livraison PILOTAGE V1)', () => {
  async function wire() {
    const g = await goals.createGoal(gInput); const g2 = await goals.createGoal({ ...gInput, title: 'Épargner' })
    const p1 = await goals.createProject({ ...pInput, goalId: g.id }); const p2 = await goals.createProject({ ...pInput, title: 'App', goalId: g.id })
    const ind = await goals.createIndicator({ name: 'Inscrits', categoryId: 'cat-pro', kind: 'number', unit: '' })
    const q = await quests.createQuest(qInput); await goals.linkQuest(q.id, { goalId: g.id, projectId: p1.id }); await quests.completeQuest(q.id)
    const o = await pilot.createOrientation({ name: 'Autonomie', importance: 3, horizon: 'mid' })
    await pilot.setOrientationLinks(o.id, { goalIds: [g.id, g2.id], projectIds: [p1.id, p2.id], indicatorIds: [ind.id] })
    const pr = await pilot.createPriority({ title: 'Bêta', level: 'fundamental', horizon: 'short', goalIds: [g.id, g2.id] })
    await pilot.savePlan(2026, { aims: 'x', goalIds: [g.id], projectIds: [p1.id] }); await pilot.saveCycle(2026, 4, { priorityIds: [pr.id], goalIds: [g.id, g2.id], projectIds: [p1.id], indicatorIds: [ind.id] })
    return { g, g2, p1, p2, ind, q, o, pr }
  }
  it('supprimer un objectif relié à plusieurs projets : liens retirés dans la même transaction, tracés ; projets, quêtes, XP et éléments stratégiques conservés', async () => {
    const { g, g2, p1, p2, q, o, pr } = await wire()
    const xpBefore = canonicalStringify(await xpAll())
    await goals.deleteGoal(g.id)
    expect(await main.goals.get(g.id)).toBeUndefined()
    expect(await main.projects.count()).toBe(2); expect((await main.projects.get(p1.id))!.goalId).toBeNull(); expect((await main.projects.get(p2.id))!.goalId).toBeNull()
    expect((await main.quests.get(q.id))!.goalId).toBeNull()
    expect(canonicalStringify(await xpAll())).toBe(xpBefore)
    const orient = (await main.orientations.get(o.id))!
    expect(orient.goalIds).toEqual([g2.id]); expect(orient.projectIds).toEqual([p1.id, p2.id])
    expect((await main.priorities.get(pr.id))!.goalIds).toEqual([g2.id]); expect((await main.cycles.get('cycle:2026-Q4'))!.goalIds).toEqual([g2.id]); expect((await main.annualPlans.get('plan:2026'))!.goalIds).toEqual([])
    const trace = (await main.strategyLog.toArray()).filter((l) => l.action === 'refs-detached')
    expect(trace.length).toBe(4); expect(trace.every((t) => (t.before as { removed: string[] }).removed.includes(g.id))).toBe(true)
    expect(orphanRefs(await strategyState(), { goals: await main.goals.toArray(), projects: await main.projects.toArray(), indicators: await main.indicators.toArray(), readings: [] }).count).toBe(0)
  })
  it('supprimer un projet ou un indicateur détache aussi la stratégie', async () => {
    const { p1, ind, o } = await wire()
    await goals.deleteProject(p1.id); await goals.deleteIndicator(ind.id)
    const orient = (await main.orientations.get(o.id))!
    expect(orient.projectIds).not.toContain(p1.id); expect(orient.indicatorIds).toEqual([])
    expect((await main.cycles.get('cycle:2026-Q4'))!.projectIds).toEqual([]); expect((await main.cycles.get('cycle:2026-Q4'))!.indicatorIds).toEqual([])
    expect(await main.orientations.count()).toBe(1)
  })
  it('suppression sans lien stratégique : aucune entrée de mémoire ajoutée', async () => {
    const g = await goals.createGoal(gInput); const before = await main.strategyLog.count()
    await goals.deleteGoal(g.id)
    expect(await main.strategyLog.count()).toBe(before)
  })
  it('orphelins déjà présents (ancienne donnée, sauvegarde restaurée) : détectés, ignorés à l’affichage, nettoyés sur demande, tracés', async () => {
    const o = await pilot.createOrientation({ name: 'Autonomie', importance: 2, horizon: 'mid' })
    await main.orientations.put({ ...(await main.orientations.get(o.id))!, goalIds: ['ghost-g'], projectIds: ['ghost-p'], indicatorIds: ['ghost-i'] })
    const s = await strategyState(); const life = { goals: [], projects: [], indicators: [], readings: [] }
    expect(orphanRefs(s, life).count).toBe(3)
    // l'orientation n'est pas comptée comme « reliée » : l'observation l'indique honnêtement
    const obs = strategicObservations({ strategy: { ...s, orientations: s.orientations.map((x) => ({ ...x, status: 'active' as const, createdAt: new Date(2026, 9, 1).toISOString() })) }, prefs: DEFAULT_PILOTAGE_PREFS, life: { life, quests: [], events: [], now: clock }, findings: [], planning: { dueQuestGoalIds: new Set() } })
    expect(obs.some((x) => x.id.startsWith('strat-orientation-empty'))).toBe(true)
    expect(await pilot.pruneOrphans()).toEqual({ removed: 3 })
    expect((await main.orientations.get(o.id))!).toMatchObject({ goalIds: [], projectIds: [], indicatorIds: [] })
    expect(await pilot.pruneOrphans()).toEqual({ removed: 0 })
    expect((await main.strategyLog.toArray()).filter((l) => l.action === 'refs-detached')).toHaveLength(1)
  })
})

describe('Parcours 1 — LIFE vers RPG : validation, événements, correction, recalcul', () => {
  it('XP, niveaux, attributs et événements restent synchrones ; la correction crée un compensatoire ; aucune double attribution', async () => {
    const q = await quests.createQuest({ ...qInput, difficulty: 'hard' })
    await Promise.all([quests.completeQuest(q.id), quests.completeQuest(q.id)]).catch(() => undefined)
    let all = await xpAll()
    expect(all.filter((e) => e.kind === 'award' && e.questId === q.id)).toHaveLength(1)
    const gained = totalXp(all)
    expect(gained).toBeGreaterThan(0)
    expect(computeProgression(all).global.level).toBe(levelFromXp(gained).level)
    await Promise.all([events.sync(), events.sync()])
    const before = await main.rpgEvents.toArray()
    await events.sync()
    expect((await main.rpgEvents.toArray()).length).toBe(before.length)
    expect(new Set(before.map((e) => e.id)).size).toBe(before.length)
    await quests.undoQuestValidation(q.id, 'Erreur')
    all = await xpAll()
    expect(totalXp(all)).toBe(0); expect(all.some((e) => e.kind === 'reversal')).toBe(true); expect(all.length).toBeGreaterThan(1) // historique conservé
    expect(auditLedger(all)).toEqual([])
    await events.sync()
    expect(computeProgression(await xpAll()).global.level).toBe(1)
    await quests.completeQuest(q.id)
    expect(totalXp(await xpAll())).toBe(gained) // retour au même gain, sans double comptage
    expect(auditLedger(await xpAll())).toEqual([])
  })
  it('modifier une quête déjà validée ne réécrit ni ne double les gains', async () => {
    const q = await quests.createQuest(qInput); await quests.completeQuest(q.id)
    const xp0 = totalXp(await xpAll())
    await quests.updateQuest(q.id, { ...qInput, difficulty: 'epic', effortMinutes: 240 })
    expect(totalXp(await xpAll())).toBe(xp0)
    expect(auditLedger(await xpAll())).toEqual([])
  })
})

describe('Parcours 2 — SPORT vers RPG et correction rétroactive', () => {
  it('une séance alimente SPORT et le global ; la corriger recalcule tout sans désynchronisation', async () => {
    await sport.saveProfile({ experience: 'intermediate', equipmentProfile: 'gym', sessionMinutes: 45, musclePriorities: {}, availability: { days: [], strengthPerWeek: 3 } } as never)
    const { session } = await sport.generateStrength({})
    await sport.startSession(session.id)
    for (const slot of session.slots) { const ex = (slot.equipment ?? slot.bodyweight)!; for (let i = 0; i < slot.sets; i++) await sport.logSet(session.id, slot.id, { exerciseId: ex.exerciseId, reps: ex.repsMax, loadKg: ex.loadKg ?? undefined, durationSec: ex.durationSec } as never) }
    await Promise.all([sport.finishSession(session.id), sport.finishSession(session.id)]).catch(() => undefined)
    const all = await xpAll()
    const sportXp = totalXp(all, (e) => e.domain === 'SPORT')
    expect(sportXp).toBeGreaterThan(0)
    expect(all.filter((e) => e.kind === 'award' && e.awardKey === `sport:session:${session.id}:base`)).toHaveLength(1) // double validation : une seule récompense
    const prog = computeProgression(all)
    expect(prog.global.level).toBe(levelFromXp(totalXp(all)).level); expect(prog.sportLevel.level).toBeGreaterThanOrEqual(1)
    await sport.correctSession(session.id, { date: '2026-10-02' })
    const after = await xpAll()
    expect(totalXp(after, (e) => e.domain === 'SPORT')).toBe(sportXp)
    expect(auditLedger(after)).toEqual([])
    await sport.deleteSession(session.id)
    const gone = await xpAll()
    expect(totalXp(gone, (e) => e.domain === 'SPORT')).toBe(0); expect(gone.length).toBeGreaterThan(0); expect(auditLedger(gone)).toEqual([])
  })
})

describe('Parcours 3 — LIFE vers PILOTAGE : relier, modifier, détacher sans perte', () => {
  it('avancement, cycle, revue, historique ; détacher ne perd aucune donnée LIFE', async () => {
    const g = await goals.createGoal({ ...gInput, status: 'active' }); const pj = await goals.createProject({ ...pInput, goalId: g.id })
    const q = await quests.createQuest(qInput); await goals.linkQuest(q.id, { goalId: g.id, projectId: pj.id }); await quests.completeQuest(q.id)
    await pilot.saveVision({ title: 'Vision' }); const o = await pilot.createOrientation({ name: 'Pro', importance: 3, horizon: 'long' })
    await pilot.setOrientationStatus(o.id, 'active'); await pilot.setOrientationLinks(o.id, { goalIds: [g.id], projectIds: [pj.id] })
    const pr = await pilot.createPriority({ title: 'Bêta', level: 'fundamental', horizon: 'short', orientationId: o.id, goalIds: [g.id] })
    await pilot.saveCycle(2026, 4, { priorityIds: [pr.id], goalIds: [g.id] })
    const rev = await pilot.saveReview({ kind: 'quarterly', closeCycle: true })
    expect(rev.facts.goals.items.some((x) => x.title === 'Lancer la bêta')).toBe(true)
    const lifeSnap = canonicalStringify({ g: await main.goals.toArray(), p: await main.projects.toArray(), q: await main.quests.toArray(), x: await xpAll() })
    await pilot.setOrientationLinks(o.id, { goalIds: [], projectIds: [] }); await pilot.updatePriority(pr.id, { title: 'Bêta', level: 'secondary', horizon: 'short', goalIds: [] })
    await pilot.archiveOrientation(o.id, true); await pilot.setPriorityStatus(pr.id, 'dropped')
    expect(canonicalStringify({ g: await main.goals.toArray(), p: await main.projects.toArray(), q: await main.quests.toArray(), x: await xpAll() })).toBe(lifeSnap)
    expect((await main.strategyLog.count())).toBeGreaterThan(8)
  })
})

describe('Concurrence et interruption', () => {
  it('deux modifications concurrentes de priorités : aucune perte, aucune corruption', async () => {
    const a = await pilot.createPriority({ title: 'A', level: 'important', horizon: 'short' }); const b = await pilot.createPriority({ title: 'B', level: 'important', horizon: 'short' })
    await Promise.all([pilot.setPriorityStatus(a.id, 'paused'), pilot.setPriorityStatus(b.id, 'done'), pilot.updatePriority(a.id, { title: 'A2', level: 'important', horizon: 'short' })])
    expect((await main.priorities.get(a.id))!.title).toBe('A2'); expect((await main.priorities.get(b.id))!.status).toBe('done')
  })
  it('limite souple : deux créations simultanées de la dernière place disponible ne la dépassent pas silencieusement', async () => {
    for (const t of ['A', 'B']) await pilot.createPriority({ title: t, level: 'fundamental', horizon: 'short' })
    const res = await Promise.allSettled([pilot.createPriority({ title: 'C', level: 'fundamental', horizon: 'short' }), pilot.createPriority({ title: 'D', level: 'fundamental', horizon: 'short' })])
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await main.priorities.toArray()).filter((p) => p.level === 'fundamental')).toHaveLength(3)
  })
  it('transaction interrompue : une suppression d’objectif qui échoue en cours de route n’écrit rien', async () => {
    const g = await goals.createGoal(gInput); const o = await pilot.createOrientation({ name: 'Pro', importance: 2, horizon: 'mid' }); await pilot.setOrientationLinks(o.id, { goalIds: [g.id] })
    const snap = canonicalStringify(await readTables(main))
    const real = main.strategyLog.add.bind(main.strategyLog)
    main.strategyLog.add = (() => Promise.reject(new Error('panne simulée'))) as never
    await expect(goals.deleteGoal(g.id)).rejects.toThrow()
    main.strategyLog.add = real
    expect(canonicalStringify(await readTables(main))).toBe(snap) // aucun état partiel
  })
})

describe('Parcours 5 — sauvegarde globale de TOUTES les tables', () => {
  async function populateEverything() {
    const g = await goals.createGoal(gInput); const p = await goals.createProject({ ...pInput, goalId: g.id }); const ind = await goals.createIndicator({ name: 'Poids', categoryId: 'cat-hygiene', kind: 'number', unit: 'kg' }); await goals.addReading(ind.id, { value: 80 })
    const q = await quests.createQuest(qInput); await goals.linkQuest(q.id, { goalId: g.id, projectId: p.id }); await quests.completeQuest(q.id)
    await quests.updateQuest(q.id, { ...qInput, difficulty: 'hard' })
    await sport.saveProfile({ experience: 'intermediate', equipmentProfile: 'gym', sessionMinutes: 45, musclePriorities: {}, availability: { days: [], strengthPerWeek: 3 } } as never)
    const { session } = await sport.generateStrength({}); await sport.startSession(session.id)
    for (const slot of session.slots) { const ex = (slot.equipment ?? slot.bodyweight)!; for (let i = 0; i < slot.sets; i++) await sport.logSet(session.id, slot.id, { exerciseId: ex.exerciseId, reps: ex.repsMax, loadKg: ex.loadKg ?? undefined, durationSec: ex.durationSec } as never) }
    await sport.finishSession(session.id); await sport.addMeasure({ date: '2026-11-19', weightKg: 80 } as never)
    await rpg.syncAchievements(); await events.sync()
    await pilot.saveVision({ title: 'V' }); const o = await pilot.createOrientation({ name: 'Pro', importance: 3, horizon: 'long' }); await pilot.setOrientationLinks(o.id, { goalIds: [g.id] })
    const pr = await pilot.createPriority({ title: 'P', level: 'important', horizon: 'short', goalIds: [g.id] }); await pilot.savePlan(2026, { aims: 'x' }); await pilot.saveCycle(2026, 4, { priorityIds: [pr.id] }); await pilot.saveReview({ kind: 'monthly' })
    // Tables qui n'ont pas de service dédié dans ce scénario : une ligne minimale pour vérifier qu'elles voyagent aussi
    for (const name of TABLE_NAMES) {
      const t = main.table(name)
      if ((await t.count()) === 0) await t.add({ [TABLE_KEYS[name]]: `fx-${name}`, fixture: true })
    }
  }
  it('toutes les tables sont non vides, exportées chiffrées, restaurées sur un appareil neuf strictement à l’identique', async () => {
    await populateEverything()
    for (const name of TABLE_NAMES) expect(await main.table(name).count(), name).toBeGreaterThan(0)
    const bk = createBackupService(main, new BackupDB(`bk-${Math.random()}`), { ...deps(), iterations: 2000 })
    await bk.setupProtection(PASS)
    const { content } = await bk.exportFile(PASS)
    expect(content).not.toMatch(/Écrire la landing|Lancer la bêta|Autonomie/)
    const original = canonicalStringify(await readTables(main))
    const freshMain = new LevelDB(`fresh-${Math.random()}`)
    const fresh = createBackupService(freshMain, new BackupDB(`fresh-bk-${Math.random()}`), { ...deps(), iterations: 2000 })
    const plan = await fresh.prepareRestoreFromFile(content, { passphrase: PASS })
    for (const name of TABLE_NAMES) expect(plan.summary.counts[name], name).toBeGreaterThan(0)
    const report = await fresh.applyRestore(plan)
    expect(report.ok).toBe(true)
    expect(canonicalStringify(await readTables(freshMain))).toBe(original)
    expect(auditLedger(await freshMain.xpEvents.toArray())).toEqual([])
  })
  it('restauration sur une base existante : sauvegarde de sécurité créée, puis contenu identique', async () => {
    await populateEverything()
    const bk = createBackupService(main, new BackupDB(`bk-${Math.random()}`), { ...deps(), iterations: 2000 })
    const meta = (await bk.createBackup('manual-snapshot'))!
    const original = canonicalStringify(await readTables(main))
    await quests.createQuest({ ...qInput, title: 'Ajoutée après la sauvegarde' })
    const report = await bk.applyRestore(await bk.prepareRestoreFromBackup(meta.id))
    expect(report.ok).toBe(true); expect(report.safetyBackupId).toBeTruthy()
    expect(canonicalStringify(await readTables(main))).toBe(original)
  })
  it('écriture interrompue pendant la restauration : transaction annulée, données actuelles intactes, aucune base partielle', async () => {
    await populateEverything()
    const bk = createBackupService(main, new BackupDB(`bk-${Math.random()}`), { ...deps(), iterations: 2000 })
    const meta = (await bk.createBackup('manual-snapshot'))!
    await quests.createQuest({ ...qInput, title: 'Plus récente que la sauvegarde' })
    const current = canonicalStringify(await readTables(main))
    const plan = await bk.prepareRestoreFromBackup(meta.id)
    // clé en double au milieu des tables : l'écriture échoue APRÈS que les premières tables ont été vidées et réécrites dans la transaction
    const broken = { ...plan, tables: { ...plan.tables, cycles: [...plan.tables.cycles, plan.tables.cycles[0]] } }
    await expect(bk.applyRestore(broken)).rejects.toMatchObject({ code: 'restore_failed' })
    expect(canonicalStringify(await readTables(main))).toBe(current)
  })
  it('stockage navigateur plein : message explicite, aucune sauvegarde existante supprimée', async () => {
    await populateEverything()
    const store = new BackupDB(`bk-${Math.random()}`)
    const bk = createBackupService(main, store, { ...deps(), iterations: 2000 })
    const first = (await bk.createBackup('manual-snapshot'))!
    const real = store.blobs.add.bind(store.blobs)
    store.blobs.add = (() => Promise.reject(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }))) as never
    await quests.createQuest({ ...qInput, title: 'Nouvelle' })
    const err = await bk.createBackup('manual-snapshot').catch((e) => e)
    store.blobs.add = real
    expect(err).toBeInstanceOf(BackupError); expect(err.code).toBe('storage_full'); expect(err.message).toMatch(/intactes/)
    expect(await store.backups.count()).toBe(1); expect((await store.backups.get(first.id))!.verification).toBeTruthy()
  })
})

describe('Migrations Dexie : ouverture d’une base de CHAQUE ancienne version par l’application actuelle', () => {
  // Les schémas anciens sont relus depuis les déclarations réelles de LevelDB (version(1) … version(8)) : aucune copie à maintenir.
  const probe = new LevelDB(`probe-${Math.random()}`) as unknown as { _versions: Array<{ _cfg: { version: number; storesSource: Record<string, string | null> } }> }
  const old = (v: number) => Object.fromEntries(Object.entries(probe._versions.find((x) => x._cfg.version === v)!._cfg.storesSource).filter(([, spec]) => spec !== null)) as Record<string, string>
  for (const v of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`v${v} → v9 : données existantes conservées, toutes les tables actuelles présentes (les nouvelles sont vides)`, async () => {
      const name = `mig-${v}-${Math.random()}`
      const schema = old(v)
      const db = new Dexie(name); db.version(v).stores(schema); await db.open()
      await db.table('settings').add({ key: 'k', value: 1 }); await db.table('profile').add({ id: 'me', displayName: 'Aria', createdAt: 1 })
      if (schema.quests) await db.table('quests').add({ id: 'q-old', title: 'Ancienne quête', createdAt: 1, updatedAt: 1, archived: false })
      if (schema.xpEvents) await db.table('xpEvents').add({ id: 'e-old', amount: 40, at: '2026-01-01T10:00:00.000Z', awardKey: 'a' })
      db.close()
      const up = new LevelDB(name); await up.open()
      expect((await up.settings.get('k'))!.value).toBe(1); expect(await up.profile.get('me')).toMatchObject({ displayName: 'Aria' })
      if (schema.quests) expect(await up.quests.get('q-old')).toMatchObject({ title: 'Ancienne quête' })
      if (schema.xpEvents) expect(await up.xpEvents.get('e-old')).toMatchObject({ amount: 40 })
      for (const t of TABLE_NAMES) expect(up.table(t), t).toBeTruthy()
      for (const t of ['visions', 'orientations', 'priorities', 'annualPlans', 'cycles', 'strategyReviews', 'strategyLog'] as const) expect(await up.table(t).count()).toBe(0)
      up.close()
    })
  }
})
