import { describe, expect, it } from 'vitest'
import { levelFromXp, totalXpForLevel, xpCostOfLevel, MAX_LEVEL } from './xp'
import { rankForLevel } from './rank'
import { arrangeHome } from './homeLayout'

describe('xp', () => {
  it('démarre au niveau 1 avec 0 XP', () => {
    const p = levelFromXp(0)
    expect(p.level).toBe(1)
    expect(p.progress).toBe(0)
    expect(p.xpForNext).toBe(xpCostOfLevel(1))
  })
  it('passe au niveau 2 exactement au seuil', () => {
    const cost = xpCostOfLevel(1)
    expect(levelFromXp(cost - 1).level).toBe(1)
    expect(levelFromXp(cost).level).toBe(2)
  })
  it('est cohérent avec totalXpForLevel', () => {
    for (const l of [2, 5, 17, 42, 99]) {
      expect(levelFromXp(totalXpForLevel(l)).level).toBe(l)
      expect(levelFromXp(totalXpForLevel(l) - 1).level).toBe(l - 1)
    }
  })
  it('plafonne au niveau max', () => {
    const p = levelFromXp(totalXpForLevel(MAX_LEVEL) + 10_000)
    expect(p.level).toBe(MAX_LEVEL)
    expect(p.maxed).toBe(true)
  })
  it('ignore les XP négatives', () => {
    expect(levelFromXp(-50).level).toBe(1)
  })
})

describe('rank', () => {
  it('attribue les rangs selon le niveau', () => {
    expect(rankForLevel(1).rank).toBe('E')
    expect(rankForLevel(9).rank).toBe('E')
    expect(rankForLevel(10).rank).toBe('D')
    expect(rankForLevel(80).rank).toBe('S')
    expect(rankForLevel(80).next?.rank).toBe('SS')
    expect(rankForLevel(90).rank).toBe('SS')
    expect(rankForLevel(96).rank).toBe('SSS')
    expect(rankForLevel(100).next).toBeNull()
  })
})

describe('arrangeHome', () => {
  const base = { now: new Date('2026-01-01T10:00:00'), pendingQuests: 3, nearestDeadlineHours: null, sportPlannedToday: false, recovery: 80 }
  const order = (c: Parameters<typeof arrangeHome>[0]) => arrangeHome(c).map((w) => w.id)

  it('place toujours le hero en premier', () => {
    expect(order(base)[0]).toBe('hero')
  })
  it('remonte les quêtes si échéance proche', () => {
    expect(order({ ...base, nearestDeadlineHours: 5 })[1]).toBe('quests')
  })
  it('remonte le sport le matin si séance prévue', () => {
    expect(order({ ...base, sportPlannedToday: true })[1]).toBe('sport')
  })
  it('remonte le sport si la récupération est basse', () => {
    expect(order({ ...base, recovery: 20 }).indexOf('sport')).toBeLessThan(order(base).indexOf('sport') + 1)
    expect(order({ ...base, recovery: 20 })[1]).toBe('sport')
  })
  it('relègue les quêtes quand tout est fait', () => {
    expect(order({ ...base, pendingQuests: 0 }).indexOf('quests')).toBeGreaterThan(2)
  })
})
