import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { auditLedger, normalizeEvent, totalXp, type XpEvent } from '@/core/ledger'
import { causeStats, findMissed } from '@/core/missed'
import { computeProgression } from '@/core/progression'
import { cycleProgress, missedCycles, streak } from '@/core/questState'
import { dayKey } from '@/core/dates'
import { RANK_THRESHOLDS } from '@/core/rank'
import { REWARD_CONFIG } from '@/core/rewards'
import { MAX_LEVEL, xpCostOfLevel } from '@/core/xp'
import type { Quest } from '@/core/quest'
import { LevelDB } from './db'
import { DEFAULT_SETTINGS } from './repositories'
import { createQuestService, QuestError, type QuestInput } from './questService'

let database: LevelDB
let clock: Date
let n: number
let svc: ReturnType<typeof createQuestService>

const at = (d: number, h = 10) => new Date(2026, 10, d, h, 0, 0)
const input = (over: Partial<QuestInput> = {}): QuestInput => ({
  type: 'personal', title: 'Écrire le rapport', categoryId: 'cat-pro', priority: 'normal',
  difficulty: 'normal', effortMinutes: 30, ...over,
})
const events = () => database.xpEvents.toArray()
const xp = async () => totalXp(await events())
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof QuestError ? e.code : 'other'))

beforeEach(async () => {
  database = new LevelDB('wf-' + Math.random())
  clock = at(19)
  n = 0
  svc = createQuestService(database, { now: () => clock, id: () => `id-${++n}` })
  await svc.seedCategories()
})

describe('décisions de configuration', () => {
  it('les données de démo sont désactivées par défaut', () => {
    expect(DEFAULT_SETTINGS.showDemoData).toBe(false)
  })
  it('les seuils de niveaux et de rangs ne changent pas', () => {
    expect(xpCostOfLevel(1)).toBe(100)
    expect(xpCostOfLevel(10)).toBe(2239)
    expect(MAX_LEVEL).toBe(100)
    expect(RANK_THRESHOLDS.map((r) => `${r.rank}${r.minLevel}`)).toEqual(['E1', 'D10', 'C20', 'B35', 'A55', 'S80'])
  })
  it('les barèmes provisoires restent centralisés dans REWARD_CONFIG', () => {
    expect(REWARD_CONFIG.baseByDifficulty).toEqual({ easy: 20, normal: 40, hard: 70, epic: 120 })
    for (const k of ['effortCreditRatio', 'partialMaxPercent', 'creditDeclarationsPerDay', 'retroactiveConfirmAfterDays', 'microFullRewardsPerDay'] as const) {
      expect(typeof REWARD_CONFIG[k]).toBe('number')
    }
  })
  it('complète les anciens événements sans les nouveaux champs', () => {
    const e = normalizeEvent({ id: 'x', at: '2026-01-01T00:00:00.000Z' } as Partial<XpEvent> & Pick<XpEvent, 'id' | 'at'>)
    expect(e.recordedAt).toBe(e.at)
    expect(e.retroactive).toBe(false)
    expect(e.credit).toBeNull()
  })
})

describe('trois situations : réussite, progression partielle, effort sans résultat', () => {
  it('réussite complète = récompense normale', async () => {
    const q = await svc.createQuest(input())
    await svc.completeQuest(q.id)
    expect(await xp()).toBe(q.rewardXp)
  })
  it('progression partielle : récompense proportionnelle, cumulative, complétée par la validation finale', async () => {
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 })) // 100 XP
    const a = await svc.declareWork(q.id, { kind: 'partial', percent: 50, durationMinutes: 45, note: 'Plan et première moitié' })
    expect(a.amount).toBe(50)
    expect(a.credit).toBe('partial')
    expect(a.percent).toBe(50)
    expect(a.durationMinutes).toBe(45)
    expect(a.note).toBe('Plan et première moitié')
    expect(a.source).toBe('bonus')
    const b = await svc.declareWork(q.id, { kind: 'partial', percent: 80 })
    expect(b.amount).toBe(30) // incrément, pas un second 80 %
    expect(await xp()).toBe(80)
    expect(cycleProgress(q, await events(), clock).progress).toBeCloseTo(0.8)
    await svc.completeQuest(q.id)
    expect(await xp()).toBe(q.rewardXp) // jamais plus que la récompense totale
    expect(auditLedger(await events())).toEqual([])
  })
  it('effort sans objectif atteint : réduit mais non nul, jamais maximal', async () => {
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 }))
    const noDuration = await svc.declareWork(q.id, { kind: 'effort' })
    expect(noDuration.amount).toBeGreaterThan(0)
    expect(noDuration.amount).toBeLessThan(q.rewardXp * REWARD_CONFIG.effortCreditRatio + 1)
    const q2 = await svc.createQuest(input({ title: 'Autre', difficulty: 'hard', effortMinutes: 60 }))
    const full = await svc.declareWork(q2.id, { kind: 'effort', durationMinutes: 60 })
    const brief = await svc.createQuest(input({ title: 'Brève', difficulty: 'hard', effortMinutes: 60 }))
    const short = await svc.declareWork(brief.id, { kind: 'effort', durationMinutes: 5 })
    expect(full.amount).toBeGreaterThan(noDuration.amount)
    expect(short.amount).toBeGreaterThan(0)
    expect(short.amount).toBeLessThan(noDuration.amount)
    expect(full.amount).toBeLessThan(q.rewardXp)
  })
  it('un crédit est déduit de la validation finale (total = récompense)', async () => {
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 }))
    await svc.declareWork(q.id, { kind: 'effort', durationMinutes: 60 })
    await svc.completeQuest(q.id)
    expect(await xp()).toBe(q.rewardXp)
  })
})

describe('garde-fous contre les déclarations répétitives', () => {
  it('refuse un pourcentage hors bornes ou sans progression', async () => {
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 }))
    expect(await code(svc.declareWork(q.id, { kind: 'partial', percent: 5 }))).toBe('invalid_percent')
    expect(await code(svc.declareWork(q.id, { kind: 'partial', percent: 95 }))).toBe('invalid_percent')
    expect(await code(svc.declareWork(q.id, { kind: 'partial' }))).toBe('invalid_percent')
    await svc.declareWork(q.id, { kind: 'partial', percent: 50 })
    expect(await code(svc.declareWork(q.id, { kind: 'partial', percent: 50 }))).toBe('no_progress')
    expect(await code(svc.declareWork(q.id, { kind: 'partial', percent: 55 }))).toBe('no_progress')
    expect(await code(svc.declareWork(q.id, { kind: 'partial', percent: 30 }))).toBe('no_progress')
  })
  it('un seul effort sans résultat par cycle', async () => {
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 }))
    await svc.declareWork(q.id, { kind: 'effort' })
    expect(await code(svc.declareWork(q.id, { kind: 'effort' }))).toBe('effort_already_declared')
    expect(await events()).toHaveLength(1)
  })
  it('refuse les crédits sur une micro-tâche et sur une quête déjà accomplie', async () => {
    const micro = await svc.createQuest(input({ title: 'Micro', effortMinutes: 5 }))
    expect(await code(svc.declareWork(micro.id, { kind: 'effort' }))).toBe('micro_not_allowed')
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 }))
    await svc.completeQuest(q.id)
    expect(await code(svc.declareWork(q.id, { kind: 'effort' }))).toBe('cycle_completed')
  })
  it('un crédit ne peut jamais atteindre une réussite complète', async () => {
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 }))
    await svc.declareWork(q.id, { kind: 'partial', percent: 90 })
    expect(await code(svc.declareWork(q.id, { kind: 'effort' }))).toBe('no_progress')
    expect(await xp()).toBeLessThan(q.rewardXp)
  })
  it('réduit (sans annuler) les déclarations au-delà du plafond quotidien', async () => {
    const amounts: number[] = []
    for (let i = 0; i < 5; i++) {
      const q = await svc.createQuest(input({ title: `Q${i}`, difficulty: 'hard', effortMinutes: 60 }))
      amounts.push((await svc.declareWork(q.id, { kind: 'effort' })).amount)
    }
    expect(amounts[0]).toBe(amounts[2])
    expect(amounts[3]).toBeLessThan(amounts[2])
    expect(amounts[4]).toBeGreaterThan(0)
    const reduced = (await events()).filter((e) => /réduit à/.test(e.reason))
    expect(reduced).toHaveLength(2)
  })
  it('corrige tous les crédits et validations du cycle', async () => {
    const q = await svc.createQuest(input({ difficulty: 'hard', effortMinutes: 60 }))
    await svc.declareWork(q.id, { kind: 'partial', percent: 40 })
    await svc.declareWork(q.id, { kind: 'partial', percent: 70 })
    expect((await svc.undoQuestValidation(q.id))).toHaveLength(2)
    expect(await xp()).toBe(0)
    await svc.declareWork(q.id, { kind: 'partial', percent: 50 }) // clé de séquence jamais réutilisée
    expect(await xp()).toBe(50)
    expect(auditLedger(await events())).toEqual([])
  })
})

describe('validation rétroactive', () => {
  it('conserve date déclarée, date d’enregistrement et statut rétroactif', async () => {
    const q = await svc.createQuest(input({ type: 'daily' }))
    const [ev] = await svc.completeQuest(q.id, { doneOn: '2026-11-17' })
    expect(dayKey(new Date(ev.at))).toBe('2026-11-17')
    expect(ev.recordedAt).toBe(clock.toISOString())
    expect(ev.retroactive).toBe(true)
    expect(ev.cycleKey).toBe('2026-11-17')
    expect(ev.reason).toMatch(/2026-11-17/)
    const [today] = await svc.completeQuest(q.id)
    expect(today.retroactive).toBe(false)
    expect(today.cycleKey).toBe('2026-11-19')
  })
  it('ne crée jamais de doublon pour un même cycle', async () => {
    const q = await svc.createQuest(input({ type: 'daily' }))
    await svc.completeQuest(q.id, { doneOn: '2026-11-18' })
    expect(await svc.completeQuest(q.id, { doneOn: '2026-11-18' })).toEqual([])
    await Promise.all([svc.completeQuest(q.id, { doneOn: '2026-11-18' }), svc.completeQuest(q.id, { doneOn: '2026-11-18' })])
    expect(await events()).toHaveLength(1)
    expect(auditLedger(await events())).toEqual([])
  })
  it('recalcule séries et cycles manqués', async () => {
    clock = at(16)
    const q = await svc.createQuest(input({ type: 'daily' }))
    clock = at(19)
    expect(missedCycles(q, await events(), clock)).toEqual(['2026-11-18', '2026-11-17', '2026-11-16'])
    await svc.completeQuest(q.id, { doneOn: '2026-11-18' })
    expect(missedCycles(q, await events(), clock)).toEqual(['2026-11-17', '2026-11-16'])
    expect(streak(q, await events(), clock)).toBe(1)
    await svc.completeQuest(q.id, { doneOn: '2026-11-17' })
    await svc.completeQuest(q.id)
    expect(streak(q, await events(), clock)).toBe(3)
    expect(await xp()).toBe(q.rewardXp * 3)
  })
  it('rattrape une semaine passée pour une quête hebdomadaire', async () => {
    clock = at(12)
    const q = await svc.createQuest(input({ type: 'weekly' }))
    clock = at(19)
    const [ev] = await svc.completeQuest(q.id, { doneOn: '2026-11-12' })
    expect(ev.cycleKey).not.toBe(cycleProgress(q, [], clock).cycleKey)
    expect(ev.retroactive).toBe(true)
  })
  it('valide une étape rétroactivement et corrige un cycle passé', async () => {
    const q = await svc.createQuest(input({ type: 'daily', steps: [{ title: 'A' }, { title: 'B' }] }))
    await svc.completeStep(q.id, q.steps[0].id, { doneOn: '2026-11-18' })
    await svc.completeQuest(q.id, { doneOn: '2026-11-18' })
    expect(await xp()).toBe(q.rewardXp)
    const rev = await svc.undoQuestValidation(q.id, 'Erreur de date', '2026-11-18')
    expect(rev).toHaveLength(2)
    expect(await xp()).toBe(0)
  })
  it('rejette dates futures ou invalides ; une date ancienne exige une confirmation explicite, sans limite haute', async () => {
    const q = await svc.createQuest(input({ type: 'daily' }))
    expect(await code(svc.completeQuest(q.id, { doneOn: '2026-11-20' }))).toBe('future_date')
    expect(await code(svc.completeQuest(q.id, { doneOn: 'hier' }))).toBe('invalid_date')
    expect(await code(svc.completeQuest(q.id, { doneOn: '1999-12-31', confirmOld: true }))).toBe('retro_out_of_range')
    // 14 jours : pas de confirmation requise ; 15 jours et plus : confirmation exigée
    expect(await code(svc.completeQuest(q.id, { doneOn: '2026-11-05' }))).toBe('ok')
    expect(await code(svc.completeQuest(q.id, { doneOn: '2026-11-04' }))).toBe('retro_confirmation_required')
    expect(await code(svc.completeQuest(q.id, { doneOn: '2025-03-12' }))).toBe('retro_confirmation_required')
    expect((await events())).toHaveLength(1)
  })
  it('accepte toute date passée confirmée (même très ancienne) et la trace comme rétroactive', async () => {
    const q = await svc.createQuest(input({ type: 'daily' }))
    const [ev] = await svc.completeQuest(q.id, { doneOn: '2025-03-12', confirmOld: true })
    expect(ev.retroactive).toBe(true)
    expect(ev.cycleKey).toBe('2025-03-12')
    expect(dayKey(new Date(ev.at))).toBe('2025-03-12')
    expect(ev.recordedAt).toBe(clock.toISOString())
    expect(await svc.completeQuest(q.id, { doneOn: '2025-03-12', confirmOld: true })).toEqual([]) // pas de doublon
    expect(await code(svc.declareWork(q.id, { kind: 'effort', doneOn: '2024-01-02' }))).toBe('retro_confirmation_required')
    const credit = await svc.declareWork(q.id, { kind: 'effort', doneOn: '2024-01-02', confirmOld: true })
    expect(credit.retroactive).toBe(true)
    expect(credit.cycleKey).toBe('2024-01-02')
  })
  it("la fenêtre d'analyse automatique des manques reste de 14 cycles", () => {
    expect(REWARD_CONFIG.missedWindowCycles).toBe(14)
  })
  it('les crédits aussi peuvent être déclarés à une date antérieure', async () => {
    const q = await svc.createQuest(input({ type: 'daily', difficulty: 'hard', effortMinutes: 60 }))
    const ev = await svc.declareWork(q.id, { kind: 'effort', doneOn: '2026-11-17' })
    expect(ev.retroactive).toBe(true)
    expect(ev.cycleKey).toBe('2026-11-17')
    const today = await svc.declareWork(q.id, { kind: 'effort' })
    expect(today.cycleKey).toBe('2026-11-19')
  })
  it('annule un gain précis du journal, une seule fois', async () => {
    const q = await svc.createQuest(input())
    const [ev] = await svc.completeQuest(q.id)
    expect(await svc.reverseEvent(ev.id, 'Erreur')).not.toBeNull()
    expect(await svc.reverseEvent(ev.id)).toBeNull()
    expect(await xp()).toBe(0)
    expect(await code(svc.reverseEvent('inconnu'))).toBe('not_found')
    expect(auditLedger(await events())).toEqual([])
  })
})

describe('analyse des quêtes manquées', () => {
  const setup = async () => {
    clock = at(15)
    const q = await svc.createQuest(input({ type: 'daily', title: 'Marcher 20 min', difficulty: 'hard', effortMinutes: 60 }))
    clock = at(19)
    return q
  }
  const list = async () => findMissed(await database.quests.toArray(), await events(), await database.analyses.toArray(), clock)

  it('identifie les cycles non réalisés puis les retire une fois analysés, sans toucher à l’XP', async () => {
    const q = await setup()
    await svc.completeQuest(q.id, { doneOn: '2026-11-17' })
    const before = await xp()
    const items = await list()
    expect(items.map((i) => i.cycleKey)).toEqual(['2026-11-18', '2026-11-16', '2026-11-15'])
    const a = await svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-18', cause: 'forgot', action: 'none', note: 'Journée chargée' })
    expect(a.cause).toBe('forgot')
    expect(a.questTitle).toBe('Marcher 20 min')
    expect((await list()).map((i) => i.cycleKey)).toEqual(['2026-11-16', '2026-11-15'])
    expect(await xp()).toBe(before)
    expect((await events()).every((e) => e.amount >= 0)).toBe(true)
    expect(await code(svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-18', cause: 'rest', action: 'none' }))).toBe('already_analyzed')
  })
  it('exige une cause sauf pour un élément ignoré, et conserve l’historique par cause', async () => {
    const q = await setup()
    expect(await code(svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-18', cause: null, action: 'none' }))).toBe('invalid_cause')
    await svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-18', cause: null, action: 'none', dismissed: true })
    await svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-17', cause: 'no_time', action: 'none' })
    await svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-16', cause: 'no_time', action: 'none' })
    const all = await database.analyses.toArray()
    expect(all).toHaveLength(3)
    expect(causeStats(all)).toEqual({ no_time: 2 })
  })
  it('détecte une échéance dépassée et propose un report', async () => {
    const q = await svc.createQuest(input({ dueDate: '2026-11-15' }))
    const [item] = await list()
    expect(item.kind).toBe('overdue')
    expect(item.cycleKey).toBe('due:2026-11-15')
    expect(await code(svc.recordMissedAnalysis({ questId: q.id, cycleKey: item.cycleKey, cause: 'unforeseen', action: 'postpone', dueDate: '2026-11-10' }))).toBe('invalid_due')
    await svc.recordMissedAnalysis({ questId: q.id, cycleKey: item.cycleKey, cause: 'unforeseen', action: 'postpone', dueDate: '2026-11-30' })
    expect((await database.quests.get(q.id))!.dueDate).toBe('2026-11-30')
    expect(await list()).toEqual([])
    expect(await database.revisions.where('questId').equals(q.id).count()).toBe(1)
  })
  it('simplifie sans réécrire l’XP acquise', async () => {
    const q = await setup()
    await svc.completeQuest(q.id, { doneOn: '2026-11-17' })
    const before = await xp()
    const a = await svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-18', cause: 'difficulty', action: 'simplify' })
    const next = (await database.quests.get(q.id)) as Quest
    expect(next.difficulty).toBe('normal')
    expect(next.effortMinutes).toBe(30)
    expect(next.rewardXp).toBeLessThan(q.rewardXp)
    expect(a.actionDetail).toMatch(/Simplifiée/)
    expect(await xp()).toBe(before)
  })
  it('remplace une quête (copie + archivage) ou la suspend', async () => {
    const q = await setup()
    expect(await code(svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-18', cause: 'motivation', action: 'replace', newTitle: ' ' }))).toBe('invalid_replacement')
    await svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-18', cause: 'motivation', action: 'replace', newTitle: 'Marcher 10 min' })
    const quests = await database.quests.toArray()
    expect(quests).toHaveLength(2)
    expect(quests.find((x) => x.id === q.id)!.archived).toBe(true)
    expect(quests.find((x) => x.title === 'Marcher 10 min')!.archived).toBe(false)
    const other = await svc.createQuest(input({ title: 'Autre' }))
    await svc.recordMissedAnalysis({ questId: other.id, cycleKey: 'due:x', cause: 'rest', action: 'suspend' })
    expect((await database.quests.get(other.id))!.archived).toBe(true)
  })
  it('une quête suspendue ne génère plus de manque', async () => {
    const q = await setup()
    await svc.setArchived(q.id, true)
    expect(await list()).toEqual([])
  })
})

describe('modifications historiques', () => {
  it('ne réécrit pas les récompenses acquises et trace la modification', async () => {
    const q = await svc.createQuest(input({ difficulty: 'normal', effortMinutes: 30 }))
    await svc.completeQuest(q.id)
    const before = await xp()
    const updated = await svc.updateQuest(q.id, input({ difficulty: 'epic', effortMinutes: 120 }))
    expect(updated.rewardXp).toBeGreaterThan(q.rewardXp)
    expect(await xp()).toBe(before)
    const [rev] = await database.revisions.where('questId').equals(q.id).toArray()
    expect(rev.changes.map((c) => c.field).sort()).toEqual(['difficulty', 'effortMinutes', 'rewardXp'])
    expect(rev.changes.find((c) => c.field === 'difficulty')).toMatchObject({ from: 'normal', to: 'epic' })
    expect(rev.awardedXp).toBe(before)
    expect(rev.note).toMatch(/déjà acquises/)
  })
  it('conserve l’attribut d’origine des gains quand la catégorie change', async () => {
    const q = await svc.createQuest(input({ categoryId: 'cat-pro' }))
    await svc.completeQuest(q.id)
    await svc.updateQuest(q.id, input({ categoryId: 'cat-culture' }))
    const p = computeProgression(await events())
    expect(p.attributes.find((a) => a.id === 'discipline')!.value).toBeGreaterThan(0)
    expect(p.attributes.find((a) => a.id === 'intellect')!.value).toBe(0)
    expect((await database.revisions.toArray())[0].changes[0].field).toBe('categoryId')
  })
  it('ne crée pas de révision si rien ne change, et supprime les révisions avec la quête', async () => {
    const q = await svc.createQuest(input())
    await svc.updateQuest(q.id, input())
    expect(await database.revisions.count()).toBe(0)
    await svc.updateQuest(q.id, input({ title: 'Nouveau titre' }))
    expect(await database.revisions.count()).toBe(1)
    await svc.deleteQuest(q.id)
    expect(await database.revisions.count()).toBe(0)
  })
})

describe('persistance après redémarrage (nouvelles données)', () => {
  it('conserve crédits, validations rétroactives, analyses et révisions', async () => {
    clock = at(16)
    const q = await svc.createQuest(input({ type: 'daily', difficulty: 'hard', effortMinutes: 60 }))
    clock = at(19)
    await svc.declareWork(q.id, { kind: 'partial', percent: 50, note: 'Moitié faite' })
    await svc.completeQuest(q.id, { doneOn: '2026-11-18' })
    await svc.recordMissedAnalysis({ questId: q.id, cycleKey: '2026-11-17', cause: 'rest', action: 'none' })
    await svc.updateQuest(q.id, input({ type: 'daily', difficulty: 'normal', effortMinutes: 60 }))
    const before = computeProgression(await events())
    database.close()
    await database.open()
    const ev = await events()
    expect(computeProgression(ev).totalXp).toBe(before.totalXp)
    expect(ev.find((e) => e.credit === 'partial')!.note).toBe('Moitié faite')
    expect(ev.find((e) => e.retroactive)!.cycleKey).toBe('2026-11-18')
    expect(await database.analyses.count()).toBe(1)
    expect(await database.revisions.count()).toBe(1)
    expect(auditLedger(ev)).toEqual([])
  })
})
