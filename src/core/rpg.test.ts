import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, availableTitles, evaluateAchievements, type AchievementCtx } from './achievements'
import { ATTRIBUTE_IDS, ATTRIBUTE_LABELS, DEFAULT_CATEGORY_ATTRIBUTE } from './attributes'
import type { XpEvent } from './ledger'
import { cycleStates, prestigeId, type PrestigeRecord } from './prestige'
import { applyBonus, availableRewards, proposeRewards, REWARD_BY_ID, REWARD_CATALOG, xpBonusPct, type RewardRow } from './prestigeRewards'
import { DOMAIN_LADDER, GLOBAL_LADDER, RANK_ORDER, domainLevel, domainRank, domainXpForLevel, domainXpToMax, rankOn, xpScaleForCycle, XP_BONUS_CONFIG } from './progressionConfig'
import { computeProgression } from './progression'
import { auditRpg } from './rpgConsistency'
import { planCompletion } from './awards'
import { xpCostOfLevel } from './xp'
import type { Quest } from './quest'

let n = 0
const ev = (o: Partial<XpEvent> = {}): XpEvent => ({
  id: `e${++n}`, kind: 'award', source: 'quest', sourceId: 'q', questId: 'q', stepId: null, awardKey: `k${n}`, cycleKey: 'once', domain: 'LIFE', categoryId: 'c1', attribute: 'discipline',
  amount: 100, baseAmount: 100, micro: false, at: '2026-01-10T10:00:00.000Z', recordedAt: '2026-01-10T10:00:00.000Z', retroactive: false, credit: null, percent: null, durationMinutes: null,
  note: '', reason: '', label: 'x', status: 'valid', correctsEventId: null, reversedByEventId: null, ...o,
})
const prestige = (domain: 'LIFE' | 'SPORT', number: number, at: string): PrestigeRecord => ({ id: prestigeId(domain, number), domain, number, at, cycle: number, levelBefore: 36, rankBefore: 'SSS', cycleXp: 0, totalXpBefore: 0, rewardId: null, rewardName: null, bonusGainedPct: 0, nextXpScale: 1.2, nextXpToMax: 0, })
const maxXp = domainXpToMax(1)
const row = (id: string, acquiredAt: string): RewardRow => ({ id, acquiredAt, prestigeId: null, domain: null, category: REWARD_BY_ID[id].category })

describe('rangs et niveaux (configuration centrale)', () => {
  it('huit rangs E → SSS, ordre croissant, sur les deux échelles', () => {
    expect(RANK_ORDER).toEqual(['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'])
    for (const l of [GLOBAL_LADDER, DOMAIN_LADDER]) { const mins = RANK_ORDER.map((r) => l.minLevels[r]); expect([...mins].sort((a, b) => a - b)).toEqual(mins); expect(mins[7]).toBeLessThan(l.maxLevel) }
  })
  it('chaque rang de domaine comprend plusieurs niveaux (SSS compris)', () => {
    RANK_ORDER.forEach((r, i) => { const next = RANK_ORDER[i + 1]; const size = (next ? DOMAIN_LADDER.minLevels[next] : DOMAIN_LADDER.maxLevel + 1) - DOMAIN_LADDER.minLevels[r]; expect(size, r).toBeGreaterThanOrEqual(3) })
  })
  it('niveau global : échelle d’origine conservée (aucun niveau acquis ne change)', () => {
    expect([1, 9, 10, 19, 20, 34, 35, 54, 55, 79, 80].map((l) => rankOn(l, GLOBAL_LADDER).rank)).toEqual(['E', 'E', 'D', 'D', 'C', 'C', 'B', 'B', 'A', 'A', 'S'])
  })
  it('seuils d’XP croissants (coût par niveau strictement croissant) et dernier niveau atteignable en années', () => {
    for (let l = 1; l < DOMAIN_LADDER.maxLevel - 1; l++) expect(xpCostOfLevel(l + 1)).toBeGreaterThan(xpCostOfLevel(l))
    expect(maxXp).toBeGreaterThan(100_000); expect(maxXp).toBeLessThan(300_000)
  })
  it('passage de rang identifiable : le niveau minimal du rang et le rang suivant', () => {
    const lv = domainLevel(domainXpForLevel(6, 1), 1)
    expect(lv.level).toBe(6)
    expect(domainRank(5).rank).toBe('E'); expect(domainRank(6).rank).toBe('D'); expect(domainRank(6).next?.rank).toBe('C')
    expect(domainRank(36).rank).toBe('SSS'); expect(domainRank(36).next).toBeNull()
  })
  it('gains multiples : un gros gain franchit plusieurs niveaux et rangs d’un coup', () => {
    const before = domainLevel(0, 1), after = domainLevel(domainXpForLevel(12, 1) + 5, 1)
    expect(before.level).toBe(1); expect(after.level).toBe(12); expect(domainRank(after.level).rank).toBe('C')
  })
  it('dernier niveau : l’XP continue de s’accumuler sans bloquer', () => {
    const m = domainLevel(maxXp + 5000, 1)
    expect(m).toMatchObject({ level: 36, maxed: true, xpIntoLevel: 5000 })
  })
  it('échelle de cycle : +20 % par prestige, progressive et prévisible', () => {
    expect([1, 2, 3, 4].map(xpScaleForCycle)).toEqual([1, 1.2, 1.4, 1.6])
    expect(domainXpToMax(2)).toBeGreaterThan(domainXpToMax(1)); expect(domainXpToMax(3) - domainXpToMax(2)).toBeCloseTo(domainXpToMax(2) - domainXpToMax(1), -2)
  })
})

describe('cycles et prestige (le journal n’est jamais modifié)', () => {
  it('sans prestige : niveau de domaine = XP du domaine, global inchangé', () => {
    const events = [ev({ amount: 900 }), ev({ domain: 'SPORT', amount: 300 })]
    const p = computeProgression(events)
    expect(p.life.level).toBe(domainLevel(900, 1).level)
    expect(p.totalXp).toBe(1200)
    expect(p.cycles!.LIFE).toMatchObject({ cycle: 1, cycleXp: 900, eligible: false })
  })
  it('éligibilité : seulement au dernier niveau du rang SSS ; facultatif (l’XP continue)', () => {
    expect(cycleStates([ev({ amount: maxXp - 1 })], []).LIFE.eligible).toBe(false)
    expect(cycleStates([ev({ amount: maxXp })], []).LIFE.eligible).toBe(true)
    expect(cycleStates([ev({ amount: maxXp + 9999 })], []).LIFE.eligible).toBe(true)
  })
  it('prestige LIFE : seul LIFE repart ; SPORT, XP totale, global et attributs inchangés', () => {
    const events = [ev({ amount: maxXp, recordedAt: '2026-01-10T10:00:00.000Z' }), ev({ domain: 'SPORT', amount: 4000, attribute: 'force' })]
    const before = computeProgression(events)
    const after = computeProgression(events, [prestige('LIFE', 1, '2026-02-01T00:00:00.000Z')])
    expect(after.life.level).toBe(1); expect(after.cycles!.LIFE.cycle).toBe(2); expect(after.cycles!.LIFE.cycleXp).toBe(0)
    expect(after.sportLevel.level).toBe(before.sportLevel.level); expect(after.cycles!.SPORT.cycle).toBe(1)
    expect(after.totalXp).toBe(before.totalXp); expect(after.global.level).toBe(before.global.level); expect(after.rank.rank).toBe(before.rank.rank)
    expect(after.attributes).toEqual(before.attributes)
    expect(after.life.xp).toBe(maxXp)
  })
  it('après prestige : seul l’XP enregistrée ensuite compte, avec le nouveau barème (+20 %)', () => {
    const events = [ev({ amount: maxXp }), ev({ amount: 1000, recordedAt: '2026-03-01T00:00:00.000Z', at: '2026-03-01T00:00:00.000Z' })]
    const s = cycleStates(events, [prestige('LIFE', 1, '2026-02-01T00:00:00.000Z')]).LIFE
    expect(s.cycleXp).toBe(1000)
    expect(s.level.level).toBe(domainLevel(1000, 2).level)
    expect(s.level.xpForNext).toBe(Math.round(xpCostOfLevel(s.level.level) * 1.2))
    expect(domainLevel(1000, 2).level).toBeLessThanOrEqual(domainLevel(1000, 1).level)
  })
  it('prestiges successifs : cycle suivant, seuils croissants, dernier prestige seul fait foi', () => {
    const events = [ev({ amount: 500, recordedAt: '2026-05-01T00:00:00.000Z' })]
    const s = cycleStates(events, [prestige('LIFE', 1, '2026-02-01T00:00:00.000Z'), prestige('LIFE', 2, '2026-04-01T00:00:00.000Z')]).LIFE
    expect(s).toMatchObject({ cycle: 3, prestigeCount: 2, scale: 1.4, cycleXp: 500, nextNumber: 3 })
  })
  it('correction : une annulation compte dans le cycle de l’événement annulé', () => {
    const old = ev({ amount: 300, recordedAt: '2026-01-05T00:00:00.000Z' })
    const rev = ev({ kind: 'reversal', amount: -300, correctsEventId: old.id, recordedAt: '2026-03-01T00:00:00.000Z', awardKey: old.awardKey })
    const fresh = ev({ amount: 200, recordedAt: '2026-03-02T00:00:00.000Z' })
    const s = cycleStates([old, rev, fresh], [prestige('LIFE', 1, '2026-02-01T00:00:00.000Z')]).LIFE
    expect(s.cycleXp).toBe(200)  // l'annulation d'un vieux gain ne ronge pas le nouveau cycle
    expect(s.totalXp).toBe(200)
  })
  it('correction avant prestige : niveaux et rangs recalculés', () => {
    const a = ev({ amount: domainXpForLevel(12, 1) + 5 })
    expect(computeProgression([a]).life.level).toBe(12)
    const rev = ev({ kind: 'reversal', amount: -a.amount, correctsEventId: a.id, awardKey: a.awardKey })
    expect(computeProgression([a, rev]).life.level).toBe(1)
  })
  it('LIFE et SPORT : prestiges indépendants', () => {
    const events = [ev({ amount: maxXp }), ev({ domain: 'SPORT', amount: maxXp })]
    const s = cycleStates(events, [prestige('SPORT', 1, '2026-02-01T00:00:00.000Z')])
    expect(s.LIFE.cycle).toBe(1); expect(s.LIFE.eligible).toBe(true); expect(s.SPORT.cycle).toBe(2); expect(s.SPORT.eligible).toBe(false)
  })
})

describe('récompenses de prestige', () => {
  it('propositions : de catégories différentes, mélangées, sans doublon, stables pour les mêmes entrées', () => {
    const a = proposeRewards('LIFE', 1, new Set())
    expect(a.length).toBeGreaterThanOrEqual(3); expect(a.length).toBeLessThanOrEqual(4)
    expect(new Set(a.map((r) => r.category)).size).toBe(a.length)
    expect(new Set(a.map((r) => r.id)).size).toBe(a.length)
    expect(proposeRewards('LIFE', 1, new Set()).map((r) => r.id)).toEqual(a.map((r) => r.id))
    expect(a.every((r) => r.domain === 'LIFE' || r.domain === 'ANY')).toBe(true)
  })
  it('un bonus d’un domaine n’est jamais proposé à l’autre', () => {
    for (let k = 1; k <= 8; k++) for (const r of proposeRewards('SPORT', k, new Set())) expect(r.effect.type === 'xp-bonus' ? r.effect.domain : 'SPORT').toBe('SPORT')
  })
  it('jamais une récompense déjà obtenue ; jamais d’invention quand le catalogue est épuisé', () => {
    const owned = new Set<string>()
    for (let k = 1; k <= 60; k++) {
      const p = proposeRewards('LIFE', k, owned)
      for (const r of p) expect(owned.has(r.id)).toBe(false)
      if (!p.length) break
      owned.add(p[0].id)
    }
    expect(availableRewards('LIFE', owned).length).toBe(0)
    expect(proposeRewards('LIFE', 99, owned)).toEqual([])
  })
  it('bonus d’XP dégressifs : chaque palier inférieur au précédent, un seul palier proposé à la fois, cumul modéré', () => {
    const tiers = REWARD_CATALOG.filter((r) => r.effect.type === 'xp-bonus' && r.effect.domain === 'LIFE').map((r) => (r.effect as { pct: number }).pct)
    expect(tiers).toHaveLength(XP_BONUS_CONFIG.maxTiers)
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeLessThan(tiers[i - 1])
    expect(tiers.reduce((a, b) => a + b, 0)).toBeLessThan(25)
    const first = availableRewards('LIFE', new Set()).filter((r) => r.effect.type === 'xp-bonus')
    expect(first.map((r) => r.id)).toEqual(['xp-life-1'])
    expect(availableRewards('LIFE', new Set(['xp-life-1'])).some((r) => r.id === 'xp-life-2')).toBe(true)
  })
  it('bonus appliqué à partir du lendemain (aucun gain déjà inscrit n’est réévalué), par domaine, cumulatif', () => {
    const owned = [row('xp-life-1', '2026-03-01T15:00:00.000Z'), row('xp-life-2', '2026-06-01T09:00:00.000Z')]
    expect(xpBonusPct('LIFE', owned, '2026-03-01')).toBe(0)
    expect(xpBonusPct('LIFE', owned, '2026-03-02')).toBe(5)
    expect(xpBonusPct('LIFE', owned, '2026-06-02')).toBe(9)
    expect(xpBonusPct('SPORT', owned, '2026-12-01')).toBe(0)
    expect(applyBonus(40, 5)).toBe(42); expect(applyBonus(40, 0)).toBe(40)
  })
})

describe('bonus et moteur de récompense LIFE', () => {
  const quest: Quest = { id: 'q1', type: 'personal', title: 'Q', description: '', categoryId: 'c', priority: 'normal', dueDate: null, difficulty: 'normal', effortMinutes: 60, steps: [], rewardXp: 100, archived: false, createdAt: 0, updatedAt: 0 }
  const ctx = (bonus?: number) => ({ quest, category: undefined, questEvents: [], todayEvents: [], now: new Date(2026, 3, 1, 10), doneAt: new Date(2026, 3, 1, 10), eventId: 'e', xpBonusPct: bonus })
  it('le bonus augmente le gain futur sans toucher à la base ni aux plafonds de la quête', () => {
    const plain = planCompletion(ctx(), null), boosted = planCompletion(ctx(5), null)
    if (!plain.ok || !boosted.ok) throw new Error('plan')
    expect(boosted.value.baseAmount).toBe(plain.value.baseAmount)
    expect(boosted.value.amount).toBe(Math.round(plain.value.amount * 1.05))
    expect(boosted.value.reason).toMatch(/bonus d’XP permanent \+5 %/)
  })
})

describe('succès', () => {
  const base = (o: Partial<AchievementCtx> = {}): AchievementCtx => ({ events: [], sessions: [], checks: [], goals: [], projects: [], indicators: [], readings: [], prestiges: [], cycles: cycleStates([], []), now: new Date('2026-06-01T10:00:00Z'), ...o })
  const run = (o: Partial<AchievementCtx> = {}) => { const e = o.events ?? []; const p = o.prestiges ?? []; return evaluateAchievements({ ...base(o), cycles: cycleStates(e, p) }) }
  it('catalogue cohérent : identifiants uniques, description et rareté', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
    expect(ACHIEVEMENTS.every((a) => a.title && a.description && a.rarity)).toBe(true)
  })
  it('rien sans activité ; premiers pas selon les données vérifiables', () => {
    expect(run()).toEqual([])
    expect(run({ events: [ev()] })).toContain('first-step')
    expect(run({ events: [ev({ domain: 'SPORT', awardKey: 'sport:x' })] })).toContain('first-session')
  })
  it('niveau, rang et prestige (le prestige ne fait pas perdre un succès de niveau)', () => {
    const lvl5 = run({ events: [ev({ amount: domainXpForLevel(5, 1) })] })
    expect(lvl5).toContain('life-level-5')
    const afterPrestige = run({ events: [ev({ amount: maxXp })], prestiges: [prestige('LIFE', 1, '2026-02-01T00:00:00.000Z')] })
    expect(afterPrestige).toEqual(expect.arrayContaining(['life-level-5', 'first-rank-up', 'rank-a', 'prestige-first']))
    expect(afterPrestige).not.toContain('prestige-both')
    expect(run({ prestiges: [prestige('LIFE', 1, 'a'), prestige('SPORT', 1, 'b')] })).toContain('prestige-both')
  })
  it('régularité modérée : quatre semaines de suite à trois jours actifs ; pas de série quotidienne', () => {
    const wk = (w: number) => [0, 1, 2].map((d) => ev({ at: new Date(Date.UTC(2026, 0, 5 + 7 * w + d, 10)).toISOString() }))
    expect(run({ events: [...wk(0), ...wk(1), ...wk(2), ...wk(3)] })).toContain('regular-4w')
    expect(run({ events: [...wk(0), ...wk(1), ...wk(3)] })).not.toContain('regular-4w')
    const daily = Array.from({ length: 10 }, (_, i) => ev({ at: new Date(Date.UTC(2026, 0, 5 + i, 10)).toISOString() }))
    expect(run({ events: daily })).not.toContain('regular-12w')
  })
  it('ancienneté mesurée depuis la première activité, titres issus des succès et récompenses', () => {
    expect(run({ events: [ev({ at: '2026-04-01T10:00:00Z' })], })).toContain('veteran-30')
    expect(run({ events: [ev({ at: '2026-05-20T10:00:00Z' })] })).not.toContain('veteran-30')
    const titles = availableTitles([{ id: 'prestige-first', unlockedAt: 'x' }], [row('title-life-sage', 'x')])
    expect(titles.map((t) => t.title)).toEqual(['Renaissant', 'Sage des projets'])
  })
})

describe('attributs LIFE (audit)', () => {
  it('sept catégories par défaut ↔ sept attributs LIFE distincts, un par catégorie', () => {
    const attrs = Object.values(DEFAULT_CATEGORY_ATTRIBUTE)
    expect(new Set(attrs).size).toBe(7)
    expect(attrs.every((a) => ATTRIBUTE_IDS.includes(a))).toBe(true)
    expect(ATTRIBUTE_IDS).toHaveLength(7)
    expect(ATTRIBUTE_LABELS.relations).toBe('Relations')
  })
  it('les attributs se recalculent depuis le journal : une annulation les retire, sans double comptage', () => {
    const a = ev({ amount: 600, attribute: 'relations' })
    expect(computeProgression([a]).attributes.find((x) => x.id === 'relations')!.value).toBeGreaterThan(0)
    const rev = ev({ kind: 'reversal', amount: -600, correctsEventId: a.id, awardKey: a.awardKey, attribute: 'relations' })
    expect(computeProgression([a, rev]).attributes.find((x) => x.id === 'relations')!.value).toBe(0)
  })
})

describe('audit RPG avec prestiges', () => {
  it('sain avec prestiges, récompenses et succès ; détecte les doublons', () => {
    const events = [ev({ amount: maxXp }), ev({ domain: 'SPORT', awardKey: 'sport:session:s1:base', source: 'activity', sourceId: 's1', questId: null, attribute: 'force', amount: 50 })]
    const p = [prestige('LIFE', 1, '2026-02-01T00:00:00.000Z')]
    expect(auditRpg(events, p, [row('xp-life-1', 'x')], [{ id: 'first-step', unlockedAt: 'x' }]).ok).toBe(true)
    expect(auditRpg(events, p, [row('xp-life-1', 'x'), row('xp-life-1', 'y')]).ok).toBe(false)
    expect(auditRpg(events, [prestige('LIFE', 2, 'x')]).ok).toBe(false)
  })
})
