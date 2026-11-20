import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { canonicalStringify } from '@/core/backupFormat'
import type { XpEvent } from '@/core/ledger'
import { domainXpForLevel } from '@/core/progressionConfig'
import { LevelDB } from './db'
import { BackupDB } from './backup/backupDb'
import { createBackupService } from './backup/backupService'
import { readTables } from './backup/snapshot'
import { createEventService } from './eventService'
import { createRpgService } from './rpgService'

let main: LevelDB
let clock: Date
let n: number
const deps = () => ({ now: () => clock, id: () => `id-${++n}` })
let svc: ReturnType<typeof createEventService>
const ev = (o: Partial<XpEvent>): XpEvent => ({
  id: `e${++n}`, kind: 'award', source: 'quest', sourceId: 'q', questId: 'qx', stepId: null, awardKey: `k${n}`, cycleKey: 'once', domain: 'LIFE', categoryId: 'cat-pro', attribute: 'discipline',
  amount: 40, baseAmount: 40, micro: false, at: new Date(2026, 4, 1, 10).toISOString(), recordedAt: new Date(2026, 4, 1, 10).toISOString(), retroactive: false, credit: null, percent: null,
  durationMinutes: null, note: '', reason: '', label: 'x', status: 'valid', correctsEventId: null, reversedByEventId: null, ...o,
})

beforeEach(async () => {
  main = new LevelDB(`ev-${Math.random()}`)
  clock = new Date(2026, 5, 15, 10)
  n = 0
  await main.open()
  svc = createEventService(main, deps())
})

describe('journal RPG : synchronisation', () => {
  it('aucune action ordinaire ne crée d’événement', async () => {
    await main.xpEvents.add(ev({ amount: 40 }))
    expect(await svc.sync()).toEqual([])
    expect(await main.rpgEvents.count()).toBe(0)
  })
  it('première synchronisation : historique reconstitué (déjà consulté, jamais « nouveau »), dates réelles conservées', async () => {
    const a = ev({ amount: domainXpForLevel(6, 1) })
    await main.xpEvents.add(a)
    const created = await svc.sync()
    expect(created.length).toBeGreaterThan(5)
    expect(created.every((e) => e.backfill && e.seenAt && !e.revokedAt)).toBe(true)
    expect(created.find((e) => e.id === 'level-up:LIFE:1:6')!.at).toBe(a.recordedAt)
  })
  it('installation neuve : le drapeau est posé sans donnée, les premiers faits sont de vrais nouveaux événements', async () => {
    expect(await svc.sync()).toEqual([])
    expect((await main.settings.get('rpgEventsInit'))?.value).toBeTruthy()
    await main.xpEvents.add(ev({ amount: domainXpForLevel(3, 1), recordedAt: clock.toISOString(), at: clock.toISOString() }))
    const created = await svc.sync()
    expect(created.length).toBeGreaterThan(0)
    expect(created.every((e) => !e.backfill && !e.seenAt)).toBe(true)
  })
  it('idempotente : une seconde synchronisation, même simultanée, ne crée aucun doublon', async () => {
    await main.xpEvents.add(ev({ amount: domainXpForLevel(6, 1) }))
    await Promise.all([svc.sync(), svc.sync(), svc.sync()])
    const rows = await main.rpgEvents.toArray()
    expect(new Set(rows.map((e) => e.id)).size).toBe(rows.length)
    expect(await svc.sync()).toEqual([])
  })
  it('nouveaux faits : événement nouveau (non consulté), les anciens inchangés (date, consultation)', async () => {
    await main.xpEvents.add(ev({ amount: domainXpForLevel(3, 1) }))
    await svc.sync()
    const before = (await main.rpgEvents.toArray()).map((e) => e.id)
    clock = new Date(2026, 5, 16, 10)
    await main.xpEvents.add(ev({ amount: domainXpForLevel(5, 1) - domainXpForLevel(3, 1), recordedAt: clock.toISOString(), at: clock.toISOString() }))
    const created = await svc.sync()
    expect(created.map((e) => e.id)).toEqual(expect.arrayContaining(['level-up:LIFE:1:4', 'level-up:LIFE:1:5']))
    expect(created.every((e) => !e.seenAt && !e.backfill)).toBe(true)
    for (const id of before) expect((await main.rpgEvents.get(id))!.backfill).toBe(true)
  })
  it('consultation : l’événement reste dans l’historique ; « tout consulter » ne supprime rien', async () => {
    await main.xpEvents.add(ev({ amount: domainXpForLevel(3, 1) }))
    await svc.sync()
    clock = new Date(2026, 5, 16, 10)
    await main.xpEvents.add(ev({ amount: domainXpForLevel(5, 1), recordedAt: clock.toISOString(), at: clock.toISOString() }))
    await svc.sync()
    const unseen = (await main.rpgEvents.toArray()).filter((e) => !e.seenAt)
    expect(unseen.length).toBeGreaterThan(0)
    const total = await main.rpgEvents.count()
    await svc.markSeen(unseen[0].id)
    expect((await main.rpgEvents.get(unseen[0].id))!.seenAt).toBeTruthy()
    await svc.markAllSeen()
    expect((await main.rpgEvents.toArray()).every((e) => e.seenAt)).toBe(true)
    expect(await main.rpgEvents.count()).toBe(total)
  })
  it('correction : l’événement est révoqué (jamais supprimé) puis redevient valide si le fait revient', async () => {
    const a = ev({ amount: domainXpForLevel(5, 1), recordedAt: new Date(2026, 4, 1, 10).toISOString() })
    await main.xpEvents.add(a)
    await svc.sync()
    expect((await main.rpgEvents.get('level-up:LIFE:1:5'))!.revokedAt).toBeNull()
    const rev = ev({ kind: 'reversal', amount: -a.amount, correctsEventId: a.id, awardKey: a.awardKey, recordedAt: clock.toISOString(), at: clock.toISOString() })
    await main.xpEvents.add(rev)
    await svc.sync()
    const revoked = (await main.rpgEvents.get('level-up:LIFE:1:5'))!
    expect(revoked.revokedAt).toBeTruthy(); expect(revoked.at).toBe(a.recordedAt)
    await main.xpEvents.delete(rev.id)
    await svc.sync()
    expect((await main.rpgEvents.get('level-up:LIFE:1:5'))!.revokedAt).toBeNull()
  })
  it('ne modifie jamais le journal d’XP (aucun effet rétroactif)', async () => {
    await main.xpEvents.add(ev({ amount: domainXpForLevel(8, 1) }))
    const before = canonicalStringify(await main.xpEvents.toArray())
    await svc.sync(); await svc.markAllSeen()
    expect(canonicalStringify(await main.xpEvents.toArray())).toBe(before)
  })
  it('prestige, récompense et succès réutilisent leurs tables (événements issus de rpgService)', async () => {
    const rpg = createRpgService(main, deps())
    await main.xpEvents.add(ev({ amount: 190_000, recordedAt: new Date(2026, 3, 1).toISOString(), at: new Date(2026, 3, 1).toISOString() }))
    const { proposeRewards } = await import('@/core/prestigeRewards')
    await rpg.prestige('LIFE', proposeRewards('LIFE', 1, new Set())[0].id)
    await rpg.syncAchievements()
    await svc.sync()
    const ids = (await main.rpgEvents.toArray()).map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining(['prestige-done:LIFE:1', 'achievement:prestige-first']))
    expect(ids.some((i) => i.startsWith('reward:'))).toBe(true)
  })
})

describe('recommandations : décisions', () => {
  it('décision enregistrée (remplace la précédente), report à 7 jours, rien d’autre n’est modifié', async () => {
    const rec = { id: 'rec:planning-reorganise', signature: 'S1' }
    expect((await svc.decide(rec, 'declined')).status).toBe('declined')
    const snoozed = await svc.decide(rec, 'snoozed')
    expect(snoozed.snoozeUntil).toBe('2026-06-22')
    expect(await main.recommendationStates.count()).toBe(1)
    await svc.resetDecision(rec.id)
    expect(await main.recommendationStates.count()).toBe(0)
    expect(await main.xpEvents.count()).toBe(0); expect(await main.goals.count()).toBe(0); expect(await main.quests.count()).toBe(0)
  })
})

describe('sauvegardes v8', () => {
  it('journal d’événements (y compris consultation) et décisions traversent une sauvegarde chiffrée', async () => {
    await main.xpEvents.add(ev({ amount: domainXpForLevel(6, 1) }))
    await svc.sync(); await svc.decide({ id: 'rec:x', signature: 's' }, 'accepted')
    const bk = createBackupService(main, new BackupDB(`bk-${Math.random()}`), { ...deps(), iterations: 2000 })
    const meta = (await bk.createBackup('manual-snapshot'))!
    const counts = meta.verification!.counts as Record<string, number>
    expect(counts.rpgEvents).toBeGreaterThan(5); expect(counts.recommendationStates).toBe(1)
    const original = canonicalStringify(await readTables(main))
    await main.rpgEvents.clear(); await main.recommendationStates.clear()
    expect((await bk.applyRestore(await bk.prepareRestoreFromBackup(meta.id))).ok).toBe(true)
    expect(canonicalStringify(await readTables(main))).toBe(original)
    expect(await svc.sync()).toEqual([])
  })
})
