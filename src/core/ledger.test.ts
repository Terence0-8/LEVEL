import { describe, expect, it } from 'vitest'
import { auditLedger, openAwards, planAward, planReversal, totalXp, xpByAttribute, xpByDomain, type AwardInput } from './ledger'
import { computeProgression } from './progression'
import { computeQuestReward, dampingMultiplier, nextBaseShare, REWARD_CONFIG } from './rewards'
import { cycleKeyFor } from './quest'
import { weekKey } from './dates'

const award = (over: Partial<AwardInput> = {}): AwardInput => ({
  id: 'e1', source: 'quest', sourceId: 'q1', questId: 'q1', stepId: null, awardKey: 'quest:q1:once', cycleKey: 'once',
  domain: 'LIFE', categoryId: 'c', attribute: 'discipline', amount: 40, baseAmount: 40, micro: false,
  at: '2026-01-01T10:00:00.000Z', reason: 'test', label: 'Q', ...over,
})

describe('journal XP', () => {
  it('refuse deux gains ouverts pour la même clé', () => {
    const a = planAward([], award())
    expect(a.ok).toBe(true)
    if (!a.ok) return
    expect(planAward([a.value], award({ id: 'e2' }))).toEqual({ ok: false, error: 'already_awarded' })
  })
  it('permet de récompenser à nouveau après une annulation, sans double comptage', () => {
    const a = planAward([], award())
    if (!a.ok) throw 0
    const r = planReversal([a.value], 'quest:q1:once', { id: 'r1', at: '2026-01-01T11:00:00.000Z', reason: 'x' })
    if (!r.ok) throw 0
    const events = [{ ...a.value, status: 'reversed' as const, reversedByEventId: 'r1' }, r.value.reversal]
    expect(totalXp(events)).toBe(0)
    expect(openAwards(events).size).toBe(0)
    const again = planAward(events, award({ id: 'e2' }))
    expect(again.ok).toBe(true)
    if (again.ok) expect(totalXp([...events, again.value])).toBe(40)
  })
  it('ne peut pas annuler une récompense inexistante ou déjà annulée', () => {
    expect(planReversal([], 'k', { id: 'r', at: '', reason: '' }).ok).toBe(false)
  })
  it("l'audit détecte un solde incohérent et valide un journal sain", () => {
    const a = planAward([], award())
    if (!a.ok) throw 0
    expect(auditLedger([a.value])).toEqual([])
    expect(auditLedger([{ ...a.value, status: 'reversed' }]).length).toBeGreaterThan(0)
  })
  it('recalcule domaines, attributs et niveaux depuis les événements', () => {
    const e1 = planAward([], award({ amount: 600, baseAmount: 600 }))
    if (!e1.ok) throw 0
    const events = [e1.value]
    expect(xpByDomain(events)).toEqual({ LIFE: 600, SPORT: 0 })
    expect(xpByAttribute(events).discipline).toBe(600)
    const p = computeProgression(events)
    expect(p.global.level).toBeGreaterThan(1)
    expect(computeProgression([]).global.level).toBe(1)
  })
})

describe('récompenses (barèmes provisoires)', () => {
  it('croît avec la difficulté et l\'effort', () => {
    const e = computeQuestReward({ difficulty: 'easy', effortMinutes: 30 })
    expect(computeQuestReward({ difficulty: 'hard', effortMinutes: 30 })).toBeGreaterThan(e)
    expect(computeQuestReward({ difficulty: 'easy', effortMinutes: 120 })).toBeGreaterThan(e)
  })
  it('reste bornée et positive', () => {
    expect(computeQuestReward({ difficulty: 'easy', effortMinutes: 1 })).toBeGreaterThanOrEqual(REWARD_CONFIG.minReward)
    expect(computeQuestReward({ difficulty: 'epic', effortMinutes: 1440 })).toBeLessThanOrEqual(REWARD_CONFIG.maxReward)
  })
  it('amortit les micro-tâches au-delà du plafond quotidien, sans jamais pénaliser', () => {
    expect(dampingMultiplier({ effortMinutes: 5, microQuestsRewardedToday: 2 })).toBe(1)
    const m = dampingMultiplier({ effortMinutes: 5, microQuestsRewardedToday: 3 })
    expect(m).toBeLessThan(1)
    expect(m).toBeGreaterThanOrEqual(0)
    expect(dampingMultiplier({ effortMinutes: 60, microQuestsRewardedToday: 99 })).toBe(1)
  })
  it('répartit la récompense sur les étapes sans jamais la dépasser', () => {
    let awarded = 0
    for (let left = 3; left >= 1; left--) awarded += nextBaseShare(100, awarded, left)
    expect(awarded).toBe(100)
  })
})

describe('cycles', () => {
  it('calcule les clés quotidienne, hebdomadaire et unique', () => {
    const d = new Date(2026, 10, 19)
    expect(cycleKeyFor('daily', d)).toBe('2026-11-19')
    expect(cycleKeyFor('weekly', d)).toBe(weekKey(d))
    expect(weekKey(new Date(2026, 0, 1))).toBe('2026-W01')
    expect(weekKey(new Date(2024, 11, 30))).toBe('2025-W01')
    expect(cycleKeyFor('personal', d)).toBe('once')
    expect(cycleKeyFor('exceptional', d)).toBe('once')
  })
})
