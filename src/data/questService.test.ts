import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { auditLedger, totalXp, type XpEvent } from '@/core/ledger'
import { computeProgression } from '@/core/progression'
import { cycleProgress, missedCycles, streak } from '@/core/questState'
import { addDays } from '@/core/dates'
import { LevelDB } from './db'
import { createQuestService, QuestError, type QuestInput } from './questService'

let database: LevelDB
let clock: Date
let n: number
let svc: ReturnType<typeof createQuestService>

const input = (over: Partial<QuestInput> = {}): QuestInput => ({
  type: 'personal', title: 'Écrire le rapport', categoryId: 'cat-pro', priority: 'normal',
  difficulty: 'normal', effortMinutes: 30, ...over,
})
const events = () => database.xpEvents.toArray()
const xp = async () => totalXp(await events())

beforeEach(async () => {
  database = new LevelDB('svc-' + Math.random())
  clock = new Date(2026, 10, 19, 10, 0, 0)
  n = 0
  svc = createQuestService(database, { now: () => clock, id: () => `id-${++n}` })
  await svc.seedCategories()
})

describe('catégories', () => {
  it('crée les 7 catégories initiales une seule fois', async () => {
    await svc.seedCategories()
    const cats = await database.categories.toArray()
    expect(cats).toHaveLength(7)
    expect(cats.map((c) => c.name)).toContain('Hygiène de vie')
  })
  it('ne recrée pas les catégories si l\'utilisateur les a archivées', async () => {
    for (const c of await database.categories.toArray()) await svc.updateCategory(c.id, { archived: true })
    await svc.seedCategories()
    expect(await database.categories.count()).toBe(7)
  })
  it('permet de créer et renommer une catégorie personnalisée', async () => {
    const c = await svc.addCategory('Bricolage', 'force')
    await svc.updateCategory(c.id, { name: 'Maison & bricolage', attribute: 'endurance' })
    expect((await database.categories.get(c.id))!.name).toBe('Maison & bricolage')
  })
})

describe('création et validation', () => {
  it('crée une quête avec récompense calculée', async () => {
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 }))
    expect(q.rewardXp).toBeGreaterThan(0)
    expect(await database.quests.count()).toBe(1)
    await expect(svc.createQuest(input({ title: '  ' }))).rejects.toMatchObject({ code: 'invalid_title' })
    await expect(svc.createQuest(input({ categoryId: 'nope' }))).rejects.toBeInstanceOf(QuestError)
  })
  it('valide une quête simple en une action', async () => {
    const q = await svc.createQuest(input())
    const ev = await svc.completeQuest(q.id)
    expect(ev).toHaveLength(1)
    expect(await xp()).toBe(q.rewardXp)
    expect(cycleProgress(q, await events(), clock).completed).toBe(true)
  })
  it('ne récompense jamais deux fois (appels répétés et concurrents)', async () => {
    const q = await svc.createQuest(input())
    await svc.completeQuest(q.id)
    await svc.completeQuest(q.id)
    await Promise.all([svc.completeQuest(q.id), svc.completeQuest(q.id)])
    expect(await events()).toHaveLength(1)
    expect(await xp()).toBe(q.rewardXp)
    expect(auditLedger(await events())).toEqual([])
  })
})

describe('étapes', () => {
  it('attribue progressivement l\'XP des étapes accomplies, total = récompense', async () => {
    const q = await svc.createQuest(input({ steps: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }))
    await svc.completeStep(q.id, q.steps[0].id)
    const afterOne = await xp()
    expect(afterOne).toBeGreaterThan(0)
    expect(afterOne).toBeLessThan(q.rewardXp)
    expect(cycleProgress(q, await events(), clock).completed).toBe(false)
    await svc.completeStep(q.id, q.steps[1].id)
    await svc.completeStep(q.id, q.steps[2].id)
    expect(await xp()).toBe(q.rewardXp)
    expect(cycleProgress(q, await events(), clock).completed).toBe(true)
  })
  it('ne récompense pas deux fois la même étape', async () => {
    const q = await svc.createQuest(input({ steps: [{ title: 'A' }, { title: 'B' }] }))
    expect(await svc.completeStep(q.id, q.steps[0].id)).not.toBeNull()
    expect(await svc.completeStep(q.id, q.steps[0].id)).toBeNull()
    expect(await events()).toHaveLength(1)
  })
  it('valider une quête composée valide les étapes restantes sans doublon', async () => {
    const q = await svc.createQuest(input({ steps: [{ title: 'A' }, { title: 'B' }] }))
    await svc.completeStep(q.id, q.steps[0].id)
    await svc.completeQuest(q.id)
    expect(await events()).toHaveLength(2)
    expect(await xp()).toBe(q.rewardXp)
  })
  it('rejette une étape inconnue', async () => {
    const q = await svc.createQuest(input({ steps: [{ title: 'A' }] }))
    await expect(svc.completeStep(q.id, 'zzz')).rejects.toMatchObject({ code: 'invalid_step' })
  })
})

describe('corrections', () => {
  it('annule une validation par une correction explicite, tout est recalculé', async () => {
    const q = await svc.createQuest(input({ difficulty: 'epic', effortMinutes: 120 }))
    await svc.completeQuest(q.id)
    expect(computeProgression(await events()).global.level).toBeGreaterThan(1)
    const rev = await svc.undoQuestValidation(q.id, 'Erreur de clic')
    expect(rev).toHaveLength(1)
    const all = await events()
    expect(all).toHaveLength(2)
    expect(all.find((e) => e.kind === 'award')!.status).toBe('reversed')
    expect(all.find((e) => e.kind === 'reversal')!.reason).toBe('Erreur de clic')
    const p = computeProgression(all)
    expect(p.totalXp).toBe(0)
    expect(p.global.level).toBe(1)
    expect(p.attributes.every((a) => a.value === 0)).toBe(true)
    expect(cycleProgress(q, all, clock).completed).toBe(false)
    expect(auditLedger(all)).toEqual([])
  })
  it('permet de revalider après correction sans cumul', async () => {
    const q = await svc.createQuest(input())
    await svc.completeQuest(q.id)
    await svc.undoQuestValidation(q.id)
    await svc.completeQuest(q.id)
    expect(await xp()).toBe(q.rewardXp)
    expect(auditLedger(await events())).toEqual([])
  })
  it('corrige une seule étape', async () => {
    const q = await svc.createQuest(input({ steps: [{ title: 'A' }, { title: 'B' }] }))
    await svc.completeStep(q.id, q.steps[0].id)
    await svc.completeStep(q.id, q.steps[1].id)
    await svc.undoValidation(q.id, q.steps[0].id)
    const cp = cycleProgress(q, await events(), clock)
    expect(cp.doneSteps).toBe(1)
    // l'étape corrigée peut être re-validée et le total reste borné
    await svc.completeStep(q.id, q.steps[0].id)
    expect(await xp()).toBe(q.rewardXp)
  })
  it('une correction sans validation ne fait rien', async () => {
    const q = await svc.createQuest(input())
    expect(await svc.undoQuestValidation(q.id)).toEqual([])
    expect(await events()).toHaveLength(0)
  })
})

describe('modification', () => {
  it('annule les gains des étapes supprimées et recalcule', async () => {
    const q = await svc.createQuest(input({ steps: [{ title: 'A' }, { title: 'B' }] }))
    await svc.completeStep(q.id, q.steps[0].id)
    const before = await xp()
    expect(before).toBeGreaterThan(0)
    const updated = await svc.updateQuest(q.id, input({ steps: [{ id: q.steps[1].id, title: 'B' }] }))
    expect(await xp()).toBe(0)
    expect(updated.steps).toHaveLength(1)
    expect(auditLedger(await events())).toEqual([])
  })
  it('redistribue la récompense quand une quête simple devient composée', async () => {
    const q = await svc.createQuest(input())
    await svc.completeQuest(q.id)
    const u = await svc.updateQuest(q.id, input({ steps: [{ title: 'A' }, { title: 'B' }] }))
    expect(await xp()).toBe(0)
    for (const s of u.steps) await svc.completeStep(q.id, s.id)
    expect(await xp()).toBe(u.rewardXp)
  })
})

describe('suppression', () => {
  it('retire l\'XP gagnée, conserve la trace dans le journal', async () => {
    const q = await svc.createQuest(input())
    await svc.completeQuest(q.id)
    await svc.deleteQuest(q.id)
    expect(await database.quests.count()).toBe(0)
    expect(await xp()).toBe(0)
    const all = await events()
    expect(all).toHaveLength(2)
    expect(all[1].reason).toMatch(/supprimée/)
    expect(all[1].label).toBe('Écrire le rapport')
    expect(auditLedger(all)).toEqual([])
  })
  it('supprimer une quête sans XP ne crée aucun événement', async () => {
    const q = await svc.createQuest(input())
    await svc.deleteQuest(q.id)
    expect(await events()).toHaveLength(0)
  })
})

describe('quêtes manquées et séries', () => {
  it('une quête non réalisée ne retire aucune XP et casse la série', async () => {
    const q = await svc.createQuest(input({ type: 'daily', title: 'Marcher' }))
    await svc.completeQuest(q.id)
    const xpDay0 = await xp()
    clock = addDays(clock, 1)
    await svc.completeQuest(q.id)
    clock = addDays(clock, 1)
    expect(streak(q, await events(), clock)).toBe(2) // jour courant non fait : ne casse pas encore
    clock = addDays(clock, 1) // le jour 2 est manqué
    const ev = await events()
    expect(streak(q, ev, clock)).toBe(0)
    expect(missedCycles(q, ev, clock).length).toBeGreaterThan(0)
    expect(await xp()).toBe(xpDay0 * 2) // aucune perte, aucune pénalité
    expect(ev.every((e) => e.amount >= 0)).toBe(true)
  })
  it('une quête quotidienne se réarme chaque jour (un gain par cycle)', async () => {
    const q = await svc.createQuest(input({ type: 'daily' }))
    await svc.completeQuest(q.id)
    clock = addDays(clock, 1)
    expect(cycleProgress(q, await events(), clock).completed).toBe(false)
    await svc.completeQuest(q.id)
    expect(await events()).toHaveLength(2)
    expect(streak(q, await events(), clock)).toBe(2)
  })
})

describe('anti-farming', () => {
  it('amortit les micro-tâches au-delà de 3 par jour, sans pénalité', async () => {
    const amounts: number[] = []
    for (let i = 0; i < 5; i++) {
      const q = await svc.createQuest(input({ title: `Micro ${i}`, effortMinutes: 5, difficulty: 'normal' }))
      const [e] = await svc.completeQuest(q.id)
      amounts.push(e.amount)
    }
    expect(amounts[0]).toBe(amounts[2])
    expect(amounts[3]).toBeLessThan(amounts[2])
    expect(amounts[4]).toBeGreaterThanOrEqual(0)
    const ev = await events()
    const damped = ev.filter((e) => /micro-tâches/.test(e.reason))
    expect(damped).toHaveLength(2)
    expect(damped.every((e) => e.baseAmount === ev[0].baseAmount && e.amount < e.baseAmount)).toBe(true)
  })
  it('le crédit d\'effort est déduit de la validation finale (total ≤ récompense)', async () => {
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 }))
    expect(await svc.recordEffort(q.id)).not.toBeNull()
    expect(await svc.recordEffort(q.id)).toBeNull()
    expect(await xp()).toBeGreaterThan(0)
    await svc.completeQuest(q.id)
    expect(await xp()).toBe(q.rewardXp)
  })
})

describe('persistance', () => {
  it('conserve quêtes, journal, niveaux après redémarrage', async () => {
    const q = await svc.createQuest(input({ difficulty: 'epic', effortMinutes: 240, steps: [{ title: 'A' }, { title: 'B' }] }))
    await svc.completeStep(q.id, q.steps[0].id)
    const before = computeProgression(await events())
    database.close()
    await database.open()
    const after = computeProgression(await events())
    expect(after.totalXp).toBe(before.totalXp)
    expect(after.global.level).toBe(before.global.level)
    expect(await database.quests.count()).toBe(1)
    const ev: XpEvent[] = await events()
    expect(cycleProgress((await database.quests.get(q.id))!, ev, clock).doneSteps).toBe(1)
  })
})
