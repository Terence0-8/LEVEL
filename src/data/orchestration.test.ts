import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildPlan, proposeReorganisations, type PlanContext } from '@/core/planning'
import { DEFAULT_PREFS } from '@/core/prefs'
import { evaluateRecovery } from '@/core/sport/recovery'
import { dayKey } from '@/core/dates'
import { LevelDB } from './db'
import { createPrefsService, readPrefs } from './prefsService'
import { createQuestService } from './questService'
import { createPlanningService, PlanningError } from './planningService'
import { createNotificationService, describeCapability, type Platform } from './notificationService'
import { levelsOf } from '@/core/notifications'
import { computeProgression } from '@/core/progression'

let main: LevelDB
let clock: Date
let n: number
const deps = () => ({ now: () => clock, id: () => `id-${++n}` })
const day = (k: number) => dayKey(new Date(2026, 10, 19 + k))
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof PlanningError ? e.code : `other:${(e as Error).message}`))

beforeEach(async () => {
  main = new LevelDB(`orch-${Math.random()}`)
  clock = new Date(2026, 10, 19, 10, 0)
  n = 0
  await main.open()
  await createQuestService(main, deps()).seedCategories()
})

const mk = (over: Partial<Parameters<ReturnType<typeof createQuestService>['createQuest']>[0]> = {}) =>
  createQuestService(main, deps()).createQuest({ type: 'personal', title: 'Tâche', categoryId: 'cat-pro', priority: 'normal', difficulty: 'normal', effortMinutes: 60, ...over })

async function ctx(): Promise<PlanContext> {
  const [quests, events, commitments, sessions, moves, checks] = await Promise.all([main.quests.toArray(), main.xpEvents.toArray(), main.commitments.toArray(), main.sportSessions.toArray(), main.planningMoves.toArray(), main.recoveryChecks.toArray()])
  return { quests, events, commitments, sessions, moves, prefs: DEFAULT_PREFS.planning, sportDays: [], recovery: evaluateRecovery({ checks, sessions, now: clock, today: dayKey(clock) }), now: clock }
}

describe('base v5', () => {
  it('expose les trois nouvelles tables et la version 5', () => {
    expect(main.verno).toBe(5)
    for (const t of ['commitments', 'planningMoves', 'notificationLog']) expect(main.tables.map((x) => x.name)).toContain(t)
  })
})

describe('préférences générales', () => {
  it('les mises à jour concurrentes ne s’écrasent pas', async () => {
    const s = createPrefsService(main)
    await Promise.all([
      s.update((p) => ({ ...p, planning: { ...p.planning, dailyCapacityMin: 180 } })),
      s.update((p) => ({ ...p, notifications: { ...p.notifications, frequency: 'minimal' } })),
    ])
    const p = await readPrefs(main)
    expect(p.planning.dailyCapacityMin).toBe(180)
    expect(p.notifications.frequency).toBe('minimal')
  })
  it('sont couvertes par la table settings (donc par les sauvegardes)', async () => {
    await createPrefsService(main).update((p) => ({ ...p, rpg: { celebrations: false } }))
    expect((await main.settings.get('appPrefs'))?.value).toMatchObject({ rpg: { celebrations: false } })
  })
})

describe('planning : engagements et placement', () => {
  it('valide et enregistre un engagement', async () => {
    const s = createPlanningService(main, deps())
    expect(await code(s.addCommitment({ title: ' ', date: day(1), minutes: 30, important: true }))).toBe('invalid')
    expect(await code(s.addCommitment({ title: 'RDV', date: 'nope', minutes: 30, important: true }))).toBe('invalid')
    const c = await s.addCommitment({ title: 'RDV notaire', date: day(1), start: '10:00', minutes: 60, important: true })
    expect((await main.commitments.get(c.id))?.important).toBe(true)
    await s.removeCommitment(c.id)
    expect(await main.commitments.count()).toBe(0)
  })
  it('placer une quête change plannedFor, jamais l’échéance, et laisse une trace', async () => {
    const q = await mk({ dueDate: day(5) })
    const s = createPlanningService(main, deps())
    await s.setQuestDay(q.id, day(2))
    const after = await main.quests.get(q.id)
    expect(after?.plannedFor).toBe(day(2))
    expect(after?.dueDate).toBe(day(5))
    expect((await main.planningMoves.toArray())[0]).toMatchObject({ refId: q.id, to: day(2), byLevel: false })
    expect(await code(s.setQuestDay(q.id, day(8)))).toBe('after_due')
    expect(await code(s.setQuestDay(q.id, day(-1)))).toBe('past')
  })
})

describe('planning : propositions appliquées avec garde-fous', () => {
  it('applique un déplacement proposé, tracé « par Level », sans toucher l’échéance', async () => {
    const q = await mk({ title: 'Libre', effortMinutes: 200, dueDate: day(6) })
    await main.quests.update(q.id, { plannedFor: day(1) })
    await mk({ title: 'Autre', effortMinutes: 100, dueDate: day(6) }).then((o) => main.quests.update(o.id, { plannedFor: day(1) }))
    const c = await ctx()
    const props = proposeReorganisations(c, buildPlan(c, day(0), day(6)), day(0), day(6)).filter((p) => p.kind === 'move-quest')
    expect(props.length).toBeGreaterThan(0)
    const s = createPlanningService(main, deps())
    await s.applyProposal(props[0])
    const moved = await main.quests.get(props[0].questId!)
    expect(moved?.plannedFor).toBe(props[0].to)
    expect(moved?.dueDate).toBe(day(6))
    expect((await main.planningMoves.toArray()).some((m) => m.byLevel)).toBe(true)
  })
  it('refuse de déplacer une quête importante, même si une proposition périmée le demande', async () => {
    const q = await mk({ priority: 'high', dueDate: day(3) })
    const s = createPlanningService(main, deps())
    expect(await code(s.applyProposal({ id: 'x', kind: 'move-quest', title: '', detail: '', questId: q.id, from: day(1), to: day(2), severity: 'info' }))).toBe('protected')
    expect((await main.quests.get(q.id))?.plannedFor ?? null).toBeNull()
  })
  it('refuse une quête quotidienne, et un déplacement au-delà de l’échéance', async () => {
    const d = await mk({ type: 'daily', title: 'Routine' })
    const q = await mk({ dueDate: day(2) })
    const s = createPlanningService(main, deps())
    expect(await code(s.applyProposal({ id: 'x', kind: 'move-quest', title: '', detail: '', questId: d.id, from: day(0), to: day(1), severity: 'info' }))).toBe('protected')
    expect(await code(s.applyProposal({ id: 'y', kind: 'move-quest', title: '', detail: '', questId: q.id, from: day(1), to: day(4), severity: 'info' }))).toBe('after_due')
  })
  it('la simplification passe par le service LIFE (révision tracée, XP acquise conservée)', async () => {
    const q = await mk({ effortMinutes: 120, difficulty: 'hard' })
    const s = createPlanningService(main, deps())
    await s.applyProposal({ id: 's', kind: 'simplify-quest', title: '', detail: '', questId: q.id, severity: 'info' })
    const after = await main.quests.get(q.id)
    expect(after!.effortMinutes).toBeLessThan(120)
    expect(await main.revisions.where('questId').equals(q.id).count()).toBeGreaterThan(0)
  })
  it('la réorganisation SPORT est déléguée au moteur SPORT', async () => {
    let called = 0
    const s = createPlanningService(main, deps(), async () => { called++ })
    await s.applyProposal({ id: 'z', kind: 'reorganise-sport', title: '', detail: '', severity: 'warn' })
    expect(called).toBe(1)
  })
})

describe('notifications : remise et repli', () => {
  const fake = (perm: ReturnType<Platform['permission']>, shown: unknown[] = []): Platform => ({
    permission: () => perm, request: async () => perm, show: async (x) => { if (perm !== 'granted') return false; shown.push(x); return true },
  })
  const nctx = async (prefs = DEFAULT_PREFS.notifications) => {
    const [quests, events, sessions, checks, commitments] = await Promise.all([main.quests.toArray(), main.xpEvents.toArray(), main.sportSessions.toArray(), main.recoveryChecks.toArray(), main.commitments.toArray()])
    const p = computeProgression(events)
    const lv = levelsOf(p)
    return { now: clock, prefs, quests, events, sessions, checks, commitments, recovery: evaluateRecovery({ checks, sessions, now: clock, today: dayKey(clock) }), levels: lv, seen: lv }
  }

  it('capacité honnête : jamais de remise en arrière-plan promise', () => {
    for (const p of ['granted', 'denied', 'default', 'unsupported'] as const) {
      const c = describeCapability(fake(p))
      expect(c.backgroundDelivery).toBe(false)
      expect(c.mode).toBe(p === 'granted' ? 'system' : 'inapp')
    }
    expect(describeCapability(fake('granted')).summary).toMatch(/fermé/)
  })
  it('émet une alerte d’échéance en notification système si autorisée, une seule fois', async () => {
    await mk({ title: 'Déclaration', dueDate: day(1) })
    const shown: unknown[] = []
    const svc = createNotificationService(main, deps(), fake('granted', shown))
    const first = await svc.tick(await nctx())
    expect(first).toMatchObject({ channel: 'system', category: 'deadlines' })
    clock = new Date(2026, 10, 19, 12, 0)
    expect(await svc.tick(await nctx())).toBeNull()
    expect(shown).toHaveLength(1)
  })
  it('repli : sans permission, la notification reste dans la boîte de réception de l’appli', async () => {
    await mk({ title: 'Déclaration', dueDate: day(1) })
    const svc = createNotificationService(main, deps(), fake('denied'))
    const e = await svc.tick(await nctx())
    expect(e?.channel).toBe('inapp')
    expect(await main.notificationLog.count()).toBe(1)
    await svc.markAllRead()
    expect((await main.notificationLog.toArray()).every((l) => l.read)).toBe(true)
  })
  it('respecte la tranquillité et les catégories coupées', async () => {
    await mk({ title: 'Déclaration', dueDate: day(1) })
    const svc = createNotificationService(main, deps(), fake('granted'))
    clock = new Date(2026, 10, 19, 23, 0)
    expect(await svc.tick(await nctx())).toBeNull()
    clock = new Date(2026, 10, 19, 10, 0)
    expect(await svc.tick(await nctx({ ...DEFAULT_PREFS.notifications, categories: { ...DEFAULT_PREFS.notifications.categories, deadlines: false } }))).toBeNull()
  })
  it('la notification d’essai ne consomme ni le plafond ni la déduplication', async () => {
    const svc = createNotificationService(main, deps(), fake('granted'))
    await svc.sendTest()
    await mk({ title: 'Déclaration', dueDate: day(1) })
    expect(await svc.tick(await nctx())).not.toBeNull()
  })
})
