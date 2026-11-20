import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { canonicalStringify, migrateTables, TABLE_NAMES } from '@/core/backupFormat'
import type { XpEvent } from '@/core/ledger'
import { totalXp } from '@/core/ledger'
import { computeProgression } from '@/core/progression'
import { domainXpToMax } from '@/core/progressionConfig'
import { desiredSportAwards } from '@/core/sport/xp'
import { defaultProfile } from '@/core/sport/profile'
import type { SportSession } from '@/core/sport/session'
import { LevelDB } from './db'
import { BackupDB } from './backup/backupDb'
import { createBackupService } from './backup/backupService'
import { readTables } from './backup/snapshot'
import { createQuestService } from './questService'
import { createRpgService, RpgError } from './rpgService'
import { normalizeEvent } from '@/core/ledger'
import { cycleStates } from '@/core/prestige'

let main: LevelDB
let clock: Date
let n: number
const deps = () => ({ now: () => clock, id: () => `id-${++n}` })
let rpg: ReturnType<typeof createRpgService>
let quests: ReturnType<typeof createQuestService>
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof RpgError ? e.code : `other:${(e as Error).message}`))

const ev = (o: Partial<XpEvent>): XpEvent => ({
  id: `e${++n}`, kind: 'award', source: 'quest', sourceId: 'q', questId: 'qx', stepId: null, awardKey: `k${n}`, cycleKey: 'once', domain: 'LIFE', categoryId: 'cat-pro', attribute: 'discipline',
  amount: 100, baseAmount: 100, micro: false, at: new Date(2026, 0, 5, 10).toISOString(), recordedAt: new Date(2026, 0, 5, 10).toISOString(), retroactive: false, credit: null, percent: null, durationMinutes: null,
  note: '', reason: '', label: 'x', status: 'valid', correctsEventId: null, reversedByEventId: null, ...o,
})
const seedMax = (domain: 'LIFE' | 'SPORT') => main.xpEvents.add(ev({ domain, amount: domainXpToMax(1), awardKey: `seed:${domain}`, ...(domain === 'SPORT' ? { source: 'activity' as const, questId: null, attribute: 'force' as const } : {}) }))
const events = async () => (await main.xpEvents.toArray()).map(normalizeEvent)

beforeEach(async () => {
  main = new LevelDB(`rpg-${Math.random()}`)
  clock = new Date(2026, 5, 10, 10)
  n = 0
  await main.open()
  rpg = createRpgService(main, deps())
  quests = createQuestService(main, deps())
  await quests.seedCategories()
})

describe('prestige : règles et atomicité', () => {
  it('refusé sans éligibilité : rien n’est écrit', async () => {
    await main.xpEvents.add(ev({ amount: 5000, awardKey: 'a' }))
    expect(await code(rpg.prestige('LIFE', null))).toBe('not_eligible')
    expect(await main.prestiges.count()).toBe(0); expect(await main.rpgRewards.count()).toBe(0)
  })
  it('confirmation : prestige + récompense enregistrés ensemble, journal strictement inchangé', async () => {
    await seedMax('LIFE'); await seedMax('SPORT')
    const before = canonicalStringify(await main.xpEvents.toArray())
    const { proposals } = await import('@/core/prestigeRewards').then((m) => ({ proposals: m.proposeRewards('LIFE', 1, new Set()) }))
    const choice = proposals[0]
    const rec = await rpg.prestige('LIFE', choice.id)
    expect(rec).toMatchObject({ id: 'prestige:LIFE:1', domain: 'LIFE', number: 1, levelBefore: 36, rankBefore: 'SSS', rewardId: choice.id, nextXpScale: 1.2 })
    expect((await main.rpgRewards.get(choice.id))?.prestigeId).toBe('prestige:LIFE:1')
    expect(canonicalStringify(await main.xpEvents.toArray())).toBe(before)
    const states = cycleStates(await events(), await main.prestiges.toArray())
    expect(states.LIFE).toMatchObject({ cycle: 2, cycleXp: 0, eligible: false })
    expect(states.SPORT).toMatchObject({ cycle: 1, eligible: true })
    expect(await code(rpg.prestige('LIFE', null))).toBe('not_eligible')
  })
  it('récompense obligatoire, valide et proposée : sinon refus total', async () => {
    await seedMax('LIFE')
    expect(await code(rpg.prestige('LIFE', null))).toBe('reward_required')
    expect(await code(rpg.prestige('LIFE', 'xp-sport-1'))).toBe('invalid_reward')
    expect(await code(rpg.prestige('LIFE', 'inventée'))).toBe('invalid_reward')
    expect(await main.prestiges.count()).toBe(0); expect(await main.rpgRewards.count()).toBe(0)
  })
  it('deux confirmations simultanées : un seul prestige', async () => {
    await seedMax('LIFE')
    const { proposeRewards } = await import('@/core/prestigeRewards')
    const id = proposeRewards('LIFE', 1, new Set())[0].id
    const res = await Promise.all([code(rpg.prestige('LIFE', id)), code(rpg.prestige('LIFE', id))])
    expect(res.filter((r) => r === 'ok')).toHaveLength(1)
    expect(await main.prestiges.count()).toBe(1); expect(await main.rpgRewards.count()).toBe(1)
  })
  it('prestiges successifs : numéros, récompenses jamais répétées, barème croissant', async () => {
    const { proposeRewards } = await import('@/core/prestigeRewards')
    await seedMax('LIFE')
    const r1 = await rpg.prestige('LIFE', proposeRewards('LIFE', 1, new Set())[0].id)
    clock = new Date(2026, 5, 11, 10)
    await main.xpEvents.add(ev({ amount: domainXpToMax(2), awardKey: 'seed2', recordedAt: new Date(2026, 5, 10, 12).toISOString(), at: new Date(2026, 5, 10, 12).toISOString() }))
    const owned = new Set((await main.rpgRewards.toArray()).map((r) => r.id))
    const choice2 = proposeRewards('LIFE', 2, owned)[0]
    const r2 = await rpg.prestige('LIFE', choice2.id)
    expect([r1.number, r2.number]).toEqual([1, 2]); expect(r2.nextXpScale).toBeGreaterThan(r1.nextXpScale)
    expect(r2.rewardId).not.toBe(r1.rewardId)
    expect((await main.prestiges.toArray()).map((p) => p.id).sort()).toEqual(['prestige:LIFE:1', 'prestige:LIFE:2'])
  })
})

describe('bonus d’XP : jamais rétroactifs', () => {
  it('LIFE : même jour sans bonus, lendemain +5 %, gains déjà inscrits intacts', async () => {
    const q = await quests.createQuest({ type: 'personal', title: 'A', categoryId: 'cat-pro', priority: 'normal', difficulty: 'normal', effortMinutes: 60 })
    const q2 = await quests.createQuest({ type: 'personal', title: 'B', categoryId: 'cat-pro', priority: 'normal', difficulty: 'normal', effortMinutes: 60 })
    const q3 = await quests.createQuest({ type: 'personal', title: 'C', categoryId: 'cat-pro', priority: 'normal', difficulty: 'normal', effortMinutes: 60 })
    await quests.completeQuest(q.id)
    const first = (await events()).find((e) => e.questId === q.id)!
    await main.rpgRewards.add({ id: 'xp-life-1', acquiredAt: clock.toISOString(), prestigeId: null, domain: 'LIFE', category: 'progression' })
    const sameDay = await quests.completeQuest(q2.id)
    expect(sameDay[0].amount).toBe(first.amount)
    clock = new Date(2026, 5, 11, 10)
    const nextDay = await quests.completeQuest(q3.id)
    expect(nextDay[0].amount).toBe(Math.round(first.amount * 1.05))
    expect(nextDay[0].baseAmount).toBe(first.baseAmount)
    expect((await events()).find((e) => e.id === first.id)!.amount).toBe(first.amount)
    expect(totalXp(await events())).toBe(first.amount + sameDay[0].amount + nextDay[0].amount)
  })
  it('SPORT : le bonus ne vaut que pour les séances des jours suivants (recalcul déterministe stable)', () => {
    const run = (id: string, date: string): SportSession => ({ id, kind: 'run', origin: 'planned', date, status: 'completed', title: 'Course', plannedMinutes: 30, variant: 'equipment', slots: [], startedAt: `${date}T08:00:00.000Z`, endedAt: `${date}T08:35:00.000Z`, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', run: { family: 'easy', distanceKm: 5, durationSec: 1800, paceSecPerKm: 360, rpe: 5, intervals: [] }, createdAt: `${date}T08:00:00.000Z`, updatedAt: '' })
    const sessions = [run('a', '2026-06-09'), run('b', '2026-06-10'), run('c', '2026-06-12')]
    const o = { sessions, checks: [], decisions: [], profile: defaultProfile('') }
    const plain = desiredSportAwards(o)
    const boosted = desiredSportAwards({ ...o, xpBonus: (day) => (day > '2026-06-10' ? 5 : 0) })
    const amt = (l: typeof plain, s: string) => l.find((d) => d.key === `sport:session:${s}:base`)!.amount
    expect(amt(boosted, 'a')).toBe(amt(plain, 'a')); expect(amt(boosted, 'b')).toBe(amt(plain, 'b'))
    expect(amt(boosted, 'c')).toBe(Math.round(amt(plain, 'c') * 1.05))
  })
})

describe('succès', () => {
  it('débloqués une seule fois, avec une date d’obtention qui ne change jamais', async () => {
    await main.xpEvents.add(ev({ amount: 100, awardKey: 'a' }))
    const first = await rpg.syncAchievements()
    expect(first.map((a) => a.id)).toContain('first-step')
    const date = (await main.achievements.get('first-step'))!.unlockedAt
    clock = new Date(2027, 0, 1)
    expect(await rpg.syncAchievements()).toEqual([])
    expect((await main.achievements.get('first-step'))!.unlockedAt).toBe(date)
    const ids = (await main.achievements.toArray()).map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('conservés même si l’événement d’origine est corrigé (distinction acquise)', async () => {
    const a = ev({ amount: 100, awardKey: 'a' }); await main.xpEvents.add(a)
    await rpg.syncAchievements()
    await main.xpEvents.add(ev({ kind: 'reversal', amount: -100, correctsEventId: a.id, awardKey: 'a' }))
    await rpg.syncAchievements()
    expect(await main.achievements.get('first-step')).toBeTruthy()
  })
})

describe('sauvegardes v7 et migration', () => {
  it('prestiges, récompenses et succès traversent une sauvegarde chiffrée ; la progression est identique après restauration', async () => {
    const { proposeRewards } = await import('@/core/prestigeRewards')
    await seedMax('LIFE'); await main.xpEvents.add(ev({ amount: 40, awardKey: 'x' }))
    await rpg.prestige('LIFE', proposeRewards('LIFE', 1, new Set())[0].id); await rpg.syncAchievements()
    const progressBefore = computeProgression(await events(), await main.prestiges.toArray())
    const bk = createBackupService(main, new BackupDB(`bk-${Math.random()}`), { ...deps(), iterations: 2000 })
    const meta = (await bk.createBackup('manual-snapshot'))!
    expect(meta.verification!.counts).toMatchObject({ prestiges: 1, rpgRewards: 1 })
    expect((meta.verification!.counts as Record<string, number>).achievements).toBeGreaterThan(0)
    const original = canonicalStringify(await readTables(main))
    for (const t of [main.prestiges, main.rpgRewards, main.achievements, main.xpEvents]) await t.clear()
    expect((await bk.applyRestore(await bk.prepareRestoreFromBackup(meta.id))).ok).toBe(true)
    expect(canonicalStringify(await readTables(main))).toBe(original)
    expect(computeProgression(await events(), await main.prestiges.toArray())).toEqual(progressBefore)
  })
  it('une sauvegarde d’une version antérieure (sans les nouvelles tables) est migrée sans perte', () => {
    const t = migrateTables({ xpEvents: [{ id: 'e', at: '2026-01-01T00:00:00Z' }], quests: [{ id: 'q' }] } as never, 6)
    for (const name of ['prestiges', 'rpgRewards', 'achievements']) { expect(TABLE_NAMES).toContain(name); expect(t[name as 'prestiges']).toEqual([]) }
    expect(t.xpEvents).toHaveLength(1); expect(t.quests).toHaveLength(1)
  })
  it('mise à niveau Dexie v6 → v7 : « Social & relations » nourrit Relations, les autres catégories et les événements ne changent pas', async () => {
    const name = `mig-${Math.random()}`
    const old = new Dexie(name)
    old.version(6).stores({ categories: 'id, order', settings: 'key' })
    await old.open()
    await old.table('categories').bulkAdd([{ id: 'cat-social', name: 'Social', attribute: 'vitalite', order: 0 }, { id: 'cat-pro', name: 'Pro', attribute: 'discipline', order: 1 }, { id: 'cat-custom', name: 'Perso', attribute: 'vitalite', order: 2 }])
    old.close()
    const up = new LevelDB(name)
    await up.open()
    expect((await up.categories.get('cat-social'))!.attribute).toBe('relations')
    expect((await up.categories.get('cat-pro'))!.attribute).toBe('discipline')
    expect((await up.categories.get('cat-custom'))!.attribute).toBe('vitalite')
    up.close()
  })
})
