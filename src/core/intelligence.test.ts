import { describe, expect, it } from 'vitest'
import { addDays, dayKey } from './dates'
import type { Goal, Indicator, Project, Reading } from './goals'
import { analyse, INSIGHT_CONFIG, weeklyActivity, type InsightCtx, type Observation } from './insights'
import type { XpEvent } from './ledger'
import { narrateEvent, reportNarrative, type NarrativeInput } from './narration'
import { DEFAULT_PREFS } from './prefs'
import type { PlanContext } from './planning'
import { domainXpForLevel, domainXpToMax } from './progressionConfig'
import type { PrestigeRecord } from './prestige'
import type { Quest } from './quest'
import { buildRecommendations, filterRecommendations, snoozeUntil, type RecCtx, type RecState } from './recommendations'
import { detectEvents, JOURNAL_FILTERS, matchesFilter, levelTimeline, type EventCtx } from './rpgEvents'
import { evaluateRecovery } from './sport/recovery'
import type { RecoveryCheck, SportSession } from './sport/session'

const NOW = new Date(2026, 5, 15, 10) // lundi 15 juin 2026
const day = (k: number) => dayKey(addDays(NOW, k))
const at = (k: number, h = 10) => new Date(2026, 5, 15 + k, h).toISOString()
let n = 0
const ev = (o: Partial<XpEvent> = {}): XpEvent => ({
  id: `e${++n}`, kind: 'award', source: 'quest', sourceId: 'q', questId: 'qx', stepId: null, awardKey: `k${n}`, cycleKey: 'once', domain: 'LIFE', categoryId: 'cat-pro', attribute: 'discipline',
  amount: 40, baseAmount: 40, micro: false, at: at(-1), recordedAt: at(-1), retroactive: false, credit: null, percent: null, durationMinutes: null, note: '', reason: '', label: 'x',
  status: 'valid', correctsEventId: null, reversedByEventId: null, ...o,
})
const recov = (checks: RecoveryCheck[] = []) => evaluateRecovery({ checks, sessions: [], now: NOW, today: day(0) })
const check = (o: Partial<RecoveryCheck> = {}): RecoveryCheck => ({ id: `c${++n}`, day: day(0), fatigue: 0, sleep: 3, soreness: 'none', sorenessAreas: {}, pain: 'none', painArea: null, safety: 'NORMAL', index: 100, restChosen: false, at: at(0, 8), ...o })
const ctx = (o: Partial<EventCtx> = {}): EventCtx => ({ events: [], prestiges: [], rewards: [], achievements: [], quests: [], goals: [], projects: [], indicators: [], readings: [], sessions: [], checks: [], sportTarget: 3, now: NOW, ...o })
const run = (idx: number, date: string, o: Partial<SportSession> = {}): SportSession => ({ id: `r${idx}`, kind: 'run', origin: 'planned', date, status: 'completed', title: 'Course', plannedMinutes: 30, variant: 'equipment', slots: [], startedAt: `${date}T08:00:00.000Z`, endedAt: `${date}T08:40:00.000Z`, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', run: { family: 'easy', distanceKm: 5, durationSec: 1800, paceSecPerKm: 360, rpe: 5, intervals: [] }, createdAt: `${date}T08:00:00.000Z`, updatedAt: '', ...o })
const types = (c: EventCtx) => detectEvents(c).map((e) => e.type)

describe('événements : détection fondée sur des faits vérifiables', () => {
  it('une action ordinaire n’est pas un événement', () => {
    expect(detectEvents(ctx({ events: [ev({ amount: 40 })] }))).toEqual([])
    expect(detectEvents(ctx())).toEqual([])
  })
  it('passage de niveau et de rang : dates réelles, identifiants uniques, importance', () => {
    const events = [ev({ amount: domainXpForLevel(6, 1), recordedAt: at(-30), at: at(-30) }), ev({ amount: 10, recordedAt: at(-2), at: at(-2) })]
    const list = detectEvents(ctx({ events }))
    const lvl = list.filter((e) => e.type === 'level-up')
    expect(lvl.map((e) => e.data.level)).toEqual([2, 3, 4, 5, 6])
    expect(lvl.every((e) => e.at === at(-30))).toBe(true)
    expect(lvl.find((e) => e.data.level === 5)!.importance).toBe('important')
    expect(lvl.find((e) => e.data.level === 3)!.importance).toBe('info')
    const rank = list.find((e) => e.type === 'rank-up')!
    expect(rank).toMatchObject({ id: 'rank-up:LIFE:1:D', importance: 'major', domain: 'LIFE' })
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length)
  })
  it('SS et SSS sont exceptionnels ; prestige disponible puis accompli', () => {
    const events = [ev({ amount: domainXpToMax(1), recordedAt: at(-90), at: at(-90) })]
    const list = detectEvents(ctx({ events }))
    expect(list.find((e) => e.id === 'rank-up:LIFE:1:SSS')!.importance).toBe('exceptional')
    expect(list.find((e) => e.id === 'prestige-ready:LIFE:1')).toMatchObject({ importance: 'major', type: 'prestige-ready' })
    const p: PrestigeRecord = { id: 'prestige:LIFE:1', domain: 'LIFE', number: 1, at: at(-1), cycle: 1, levelBefore: 36, rankBefore: 'SSS', cycleXp: 0, totalXpBefore: 0, rewardId: 'xp-life-1', rewardName: 'Élan LIFE I', bonusGainedPct: 5, nextXpScale: 1.2, nextXpToMax: 0 }
    const after = detectEvents(ctx({ events, prestiges: [p] }))
    expect(after.find((e) => e.id === 'prestige-done:LIFE:1')).toMatchObject({ importance: 'exceptional', origin: 'prestiges' })
  })
  it('cycle suivant : les niveaux du nouveau cycle ont leur propre identifiant (jamais de collision)', () => {
    const p: PrestigeRecord = { id: 'prestige:LIFE:1', domain: 'LIFE', number: 1, at: at(-20), cycle: 1, levelBefore: 36, rankBefore: 'SSS', cycleXp: 0, totalXpBefore: 0, rewardId: null, rewardName: null, bonusGainedPct: 0, nextXpScale: 1.2, nextXpToMax: 0 }
    const events = [ev({ amount: domainXpToMax(1), recordedAt: at(-90), at: at(-90) }), ev({ amount: 500, recordedAt: at(-5), at: at(-5) })]
    const ids = levelTimeline(events, [p], 'LIFE').filter((t) => t.cycle === 2).map((t) => t.level)
    expect(ids.length).toBeGreaterThan(0)
    const list = detectEvents(ctx({ events, prestiges: [p] }))
    expect(list.some((e) => e.id.startsWith('level-up:LIFE:2:'))).toBe(true)
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length)
  })
  it('correction : une annulation retire le fait (l’événement sera révoqué par le service, jamais effacé)', () => {
    const a = ev({ amount: domainXpForLevel(5, 1), recordedAt: at(-10), at: at(-10) })
    expect(detectEvents(ctx({ events: [a] })).some((e) => e.id === 'level-up:LIFE:1:5')).toBe(true)
    const rev = ev({ kind: 'reversal', amount: -a.amount, correctsEventId: a.id, awardKey: a.awardKey, recordedAt: at(-1), at: at(-1) })
    expect(detectEvents(ctx({ events: [a, rev] })).some((e) => e.type === 'level-up' && e.data.level === 5)).toBe(false)
  })
  it('détection idempotente et chronologique', () => {
    const c = ctx({ events: [ev({ amount: 2000, recordedAt: at(-40) }), ev({ domain: 'SPORT', amount: 900, recordedAt: at(-20), attribute: 'force', awardKey: 'sport:s:base' })] })
    const a = detectEvents(c), b = detectEvents(c)
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x.at.localeCompare(y.at))).toEqual(a)
  })
  it('LIFE : objectif atteint, projet terminé, mi-parcours, échéance proche, projet relancé, indicateur', () => {
    const goal = (o: Partial<Goal>): Goal => ({ id: `g${++n}`, title: 'Lancer', description: '', categoryId: 'c', createdAt: at(-80), dueDate: null, priority: 'normal', importance: 2, status: 'active', criteria: [], milestones: [], indicatorIds: [], conflictsWith: [], statusAt: at(-3), updatedAt: at(-3), ...o })
    const step = (done: boolean, doneAt: string | null) => ({ id: `s${++n}`, title: 'E', dueDate: null, done, doneAt, blocked: null, subtasks: [] })
    const proj: Project = { id: 'p1', title: 'Solitiquo', description: '', categoryId: 'c', goalId: null, priority: 'normal', startDate: null, dueDate: null, status: 'done', steps: [step(true, at(-50)), step(true, at(-20)), step(true, at(-2))], createdAt: at(-80), updatedAt: at(-2), statusAt: at(-1) }
    const ind: Indicator = { id: 'i1', name: 'Épargne', categoryId: 'c', kind: 'money', unit: '€', target: 1000, frequency: null, important: false, archived: false, createdAt: at(-90) }
    const reads: Reading[] = [200, 400, 650, 1000].map((v, i) => ({ id: `r${i}`, indicatorId: 'i1', value: v, at: day(-60 + i * 10), note: '', recordedAt: at(-60 + i * 10) }))
    const list = detectEvents(ctx({ goals: [goal({ id: 'ga', status: 'achieved', importance: 3 }), goal({ id: 'gd', dueDate: day(3) })], projects: [proj], indicators: [ind], readings: reads }))
    const byId = (id: string) => list.find((e) => e.id === id)
    expect(byId('goal-achieved:ga')).toMatchObject({ importance: 'exceptional', category: 'life' })
    expect(byId('project-done:p1')!.importance).toBe('major')
    expect(byId('project-half:p1')!.at).toBe(at(-20))
    expect(byId('project-steps-all:p1')).toBeTruthy()
    expect(list.some((e) => e.id.startsWith('goal-due-soon:gd'))).toBe(true)
    expect(byId('indicator:i1:50')).toBeTruthy(); expect(byId('indicator:i1:100')!.importance).toBe('important')
    const gap: Project = { ...proj, id: 'p2', status: 'active', steps: [step(true, at(-70)), step(true, at(-10))] }
    expect(detectEvents(ctx({ projects: [gap] })).some((e) => e.type === 'project-resumed')).toBe(true)
  })
  it('SPORT : record (≥ 2,5 %), retour après interruption, séances jalons, régularité, endurance, récupération', () => {
    const lift = (id: string, date: string, reps: number): SportSession => ({ ...run(0, date), id, kind: 'strength', run: undefined, slots: [{ id: 's', group: 'pectoraux', movement: 'push', sets: 1, status: 'done', equipment: null, bodyweight: null, logs: [{ n: 1, slotId: 's', exerciseId: 'goblet_squat', reps, loadKg: 20, at: date }] }] })
    const sessions = [lift('a', day(-60), 8), lift('b', day(-56), 8), lift('c', day(-52), 9), lift('d', day(-48), 12), ...Array.from({ length: 6 }, (_, i) => run(i + 10, day(-20 + i * 2)))]
    const list = detectEvents(ctx({ sessions }))
    expect(types(ctx({ sessions }))).toEqual(expect.arrayContaining(['sport-sessions']))
    expect(list.find((e) => e.id === 'sport-sessions:10')).toBeTruthy()
    expect(list.some((e) => e.type === 'sport-return')).toBe(true)
    // endurance : allure nettement meilleure après quatre sorties comparables
    const paced = [360, 362, 358, 361, 330].map((p, i) => run(i + 30, day(-60 + i * 5), { run: { family: 'easy', distanceKm: 5, durationSec: 1800, paceSecPerKm: p, rpe: 5, intervals: [] } }))
    expect(detectEvents(ctx({ sessions: paced })).some((e) => e.type === 'sport-endurance')).toBe(true)
    // régularité : 4 semaines complètes à 3 séances
    const reg = [0, 1, 2, 3].flatMap((w) => [0, 2, 4].map((d, j) => run(100 + w * 3 + j, dayKey(addDays(new Date(2026, 4, 4 + 7 * w + d), 0)))))
    expect(detectEvents(ctx({ sessions: reg })).some((e) => e.id === 'sport-regularity:4')).toBe(true)
    const checks = [check({ day: day(-6), safety: 'ALERTE', at: at(-6) }), check({ day: day(-3), safety: 'NORMAL', at: at(-3) })]
    expect(detectEvents(ctx({ checks })).some((e) => e.type === 'recovery-improved')).toBe(true)
  })
  it('régularité et évolution : semaines régulières, reprise après pause, équilibre LIFE/SPORT, cap d’XP', () => {
    const week = (w: number) => [0, 1, 2].flatMap((d) => [ev({ at: at(-7 * (12 - w) - 14 + d * 1), recordedAt: at(-7 * (12 - w) - 14 + d), domain: 'LIFE' }), ev({ domain: 'SPORT', attribute: 'force', awardKey: `sport:${n}:b`, at: at(-7 * (12 - w) - 14 + d), recordedAt: at(-7 * (12 - w) - 14 + d) })])
    const events = [0, 1, 2, 3, 4].flatMap(week)
    const list = detectEvents(ctx({ events: [...events, ev({ at: at(-1), recordedAt: at(-1) })] }))
    expect(list.some((e) => e.id === 'regular-weeks:4')).toBe(true)
    expect(list.some((e) => e.id === 'balance:4')).toBe(true)
    const paused = [...Array.from({ length: 6 }, (_, i) => ev({ at: at(-60 + i), recordedAt: at(-60 + i) })), ev({ at: at(-10), recordedAt: at(-10) })]
    expect(detectEvents(ctx({ events: paused })).find((e) => e.type === 'resume')!.description).toMatch(/pause fait partie du rythme/)
    expect(detectEvents(ctx({ events: [ev({ amount: 5200 })] })).some((e) => e.id === 'cap-xp:5000')).toBe(true)
  })
  it('succès, récompenses réutilisent leurs tables ; filtres du journal', () => {
    const list = detectEvents(ctx({ achievements: [{ id: 'first-step', unlockedAt: at(-3) }, { id: 'prestige-both', unlockedAt: at(-1) }], rewards: [{ id: 'xp-life-1', acquiredAt: at(-2), prestigeId: 'p', domain: 'LIFE', category: 'progression' }] }))
    expect(list.find((e) => e.id === 'achievement:first-step')!.importance).toBe('info')
    expect(list.find((e) => e.id === 'achievement:prestige-both')!.importance).toBe('exceptional')
    expect(list.find((e) => e.id === 'reward:xp-life-1')).toMatchObject({ origin: 'rewards', refType: 'reward' })
    const f = (k: (typeof JOURNAL_FILTERS)[number][0]) => list.filter((e) => matchesFilter(e, k)).map((e) => e.type)
    expect(f('rewards').sort()).toEqual(['achievement', 'achievement', 'reward'])
    expect(f('important').length).toBeGreaterThanOrEqual(2)
    expect(f('all')).toHaveLength(list.length)
  })
})

// ── Analyse ───────────────────────────────────────────────────────────
const plan = (o: Partial<PlanContext> = {}): PlanContext => ({ quests: [], events: [], commitments: [], sessions: [], moves: [], prefs: DEFAULT_PREFS.planning, sportDays: [], recovery: recov(), now: NOW, ...o })
const ictx = (o: Partial<PlanContext> = {}, extra: Partial<InsightCtx> = {}): InsightCtx => ({ plan: plan(o), checks: [], categories: [{ id: 'cat-pro', name: 'Professionnel', attribute: 'discipline', order: 0, archived: false, builtin: true }], sportTarget: 3, findings: [], ...extra })
const ids = (o: Observation[]) => o.map((x) => x.id)
const weeksOfActivity = (weeks: number, daysPerWeek: number, lastOffset = 0) => Array.from({ length: weeks }, (_, w) => Array.from({ length: daysPerWeek }, (_, d) => { const k = -(weeks - 1 - w) * 7 - 7 + d - lastOffset; return ev({ at: at(k), recordedAt: at(k) }) })).flat()

describe('analyse locale : proportionnée aux données', () => {
  it('aucune donnée ou une seule action : aucune tendance', () => {
    expect(analyse(ictx(), recov())).toEqual([])
    expect(analyse(ictx({ events: [ev()] }), recov())).toEqual([])
  })
  it('régularité (jamais le volume) : quatre semaines à ≥ 3 jours actifs, fiabilité selon l’échantillon', () => {
    const o = analyse(ictx({ events: weeksOfActivity(4, 3) }), recov())
    const r = o.find((x) => x.id === 'regularity-stable')!
    expect(r).toMatchObject({ nature: 'fact', tone: 'positive', window: 'long' })
    expect(r.evidence).toHaveLength(4)
    const bigVolume = Array.from({ length: 60 }, () => ev({ at: at(-2), recordedAt: at(-2), amount: 400 }))
    expect(ids(analyse(ictx({ events: bigVolume }), recov()))).not.toContain('regularity-stable')
    const eight = analyse(ictx({ events: weeksOfActivity(10, 3) }), recov()).find((x) => x.id === 'regularity-stable')!
    expect(eight.reliability).toBe('high')
    expect(r.reliability).toBe('low')
  })
  it('pause : formulée sans jugement, seulement après une période régulière', () => {
    const o = analyse(ictx({ events: weeksOfActivity(4, 3, 14) }), recov())
    const p = o.find((x) => x.id === 'regularity-pause')!
    expect(p.tone).toBe('neutral'); expect(p.detail).toMatch(/ne la juge pas/); expect(p.title).not.toMatch(/échec|retard|manqué/i)
    expect(ids(analyse(ictx({ events: [ev({ at: at(-12), recordedAt: at(-12) })] }), recov()))).not.toContain('regularity-pause')
  })
  it('tendance de fréquence : exige 8 semaines d’historique', () => {
    expect(ids(analyse(ictx({ events: weeksOfActivity(5, 3) }), recov()))).not.toContain('frequency-trend')
    const events = [...weeksOfActivity(4, 5, 28), ...weeksOfActivity(4, 2)]
    const f = analyse(ictx({ events }), recov()).find((x) => x.id === 'frequency-trend')
    expect(f).toBeTruthy(); expect(f!.nature).toBe('estimate'); expect(f!.detail).toMatch(/rien n’indique un problème/)
    expect(weeklyActivity(events, NOW, 8)).toHaveLength(8)
  })
  it('LIFE : catégories en progression / laissées de côté, sans cause déduite', () => {
    const q = (cat: string): Quest => ({ id: `q-${cat}`, type: 'personal', title: cat, description: '', categoryId: cat, priority: 'normal', dueDate: null, difficulty: 'normal', effortMinutes: 30, steps: [], rewardXp: 20, archived: false, createdAt: 0, updatedAt: 0 })
    const events = [ev({ categoryId: 'cat-a', at: at(-70), recordedAt: at(-70) }), ev({ categoryId: 'cat-a', at: at(-45), recordedAt: at(-45) }), ev({ categoryId: 'cat-a', at: at(-50), recordedAt: at(-50) }), ev({ categoryId: 'cat-b', at: at(-10), recordedAt: at(-10), amount: 200 }), ev({ categoryId: 'cat-b', at: at(-40), recordedAt: at(-40), amount: 50 }), ev({ categoryId: 'cat-b', at: at(-3), recordedAt: at(-3), amount: 300 })]
    const cats = [{ id: 'cat-a', name: 'Culture', attribute: 'intellect' as const, order: 0, archived: false, builtin: true }, { id: 'cat-b', name: 'Santé', attribute: 'vitalite' as const, order: 1, archived: false, builtin: true }]
    const o = analyse(ictx({ events, quests: [q('cat-a'), q('cat-b')] }, { categories: cats }), recov())
    expect(o.find((x) => x.id === 'life-categories-up')!.evidence.join(' ')).toMatch(/Santé/)
    const quiet = o.find((x) => x.id === 'life-categories-quiet')!
    expect(quiet.detail).toMatch(/Level ne suppose aucune cause/)
    expect(JSON.stringify(o)).not.toMatch(/paresse|motivation|démotiv|stress|flemme/i)
  })
  it('indicateurs : au moins trois mesures, amélioration ou éloignement de la cible', () => {
    const ind: Indicator = { id: 'i1', name: 'Poids', categoryId: 'c', kind: 'number', unit: 'kg', target: 70, frequency: null, important: false, archived: false, createdAt: at(-60) }
    const rd = (vals: number[]): Reading[] => vals.map((v, i) => ({ id: `r${i}`, indicatorId: 'i1', value: v, at: day(-40 + i * 10), note: '', recordedAt: at(-40 + i * 10) }))
    const life = (vals: number[]) => ({ goals: [], projects: [], indicators: [ind], readings: rd(vals) })
    expect(ids(analyse(ictx({ life: life([80, 78]) }), recov()))).not.toContain('indicator-trend:i1')
    expect(analyse(ictx({ life: life([80, 78, 75]) }), recov()).find((x) => x.id === 'indicator-trend:i1')!.tone).toBe('positive')
    const worse = analyse(ictx({ life: life([80, 82, 84]) }), recov()).find((x) => x.id === 'indicator-trend:i1')!
    expect(worse.tone).toBe('neutral'); expect(worse.detail).toMatch(/Une mesure isolée peut varier/)
  })
  it('SPORT : charge en hausse (avec la récupération), muscles et volume seulement avec assez de séances', () => {
    const lift = (i: number, date: string, sets = 3): SportSession => ({ ...run(0, date), id: `l${i}`, kind: 'strength', run: undefined, slots: [{ id: 's', group: 'pectoraux', movement: 'push', sets, status: 'done', equipment: null, bodyweight: null, logs: Array.from({ length: sets }, (_, j) => ({ n: j + 1, slotId: 's', exerciseId: 'goblet_squat', reps: 10, loadKg: 20, at: date })) }] })
    const monday = new Date(2026, 5, 15)
    const sess = (wk: number, count: number, sets: number) => Array.from({ length: count }, (_, i) => lift(wk * 10 + i + 100, dayKey(addDays(monday, -7 * wk + (wk === 0 ? 0 : i))), sets))
    const base = [...sess(1, 2, 3), ...sess(2, 2, 3), ...sess(3, 2, 3)]
    expect(ids(analyse(ictx({ sessions: [...base, ...sess(0, 1, 8)] }), recov()))).not.toContain('sport-load-spike')
    const spike = analyse(ictx({ sessions: [...base, ...sess(0, 2, 8)] }), recov()).find((x) => x.id === 'sport-load-spike')!
    expect(spike.tone).toBe('attention'); expect(spike.detail).toMatch(/Une semaine plus légère/)
    const alert = recov([check({ pain: 'strong', safety: 'ALERTE', index: 10 })])
    expect(analyse(ictx({ sessions: [...base, ...sess(0, 2, 8)] }), alert).find((x) => x.id === 'sport-load-spike')!.detail).toMatch(/le repos prime/)
    expect(ids(analyse(ictx({ sessions: base.slice(0, 2) }), recov()))).not.toContain('sport-muscles')
  })
  it('transversal : surcharge, échéances rapprochées, projets accumulés — jamais interprété comme un manque de discipline', () => {
    const q = (title: string, dueDate: string, effort = 200): Quest => ({ id: `q${++n}`, type: 'personal', title, description: '', categoryId: 'c', priority: 'normal', dueDate, difficulty: 'normal', effortMinutes: effort, steps: [], rewardXp: 20, archived: false, createdAt: 0, updatedAt: 0 })
    const quests = [q('A', day(1), 300), q('B', day(1), 300), q('C', day(2), 300), q('D', day(2), 300), q('E', day(3), 100)]
    const o = analyse(ictx({ quests }), recov())
    expect(ids(o)).toEqual(expect.arrayContaining(['cross-overload', 'cross-deadline-cluster']))
    expect(JSON.stringify(o.filter((x) => x.domain === 'MIXED'))).not.toMatch(/manque de discipline|paresse|manque de volonté|négligent/i)
    const many = Array.from({ length: 5 }, (_, i): Project => ({ id: `p${i}`, title: `P${i}`, description: '', categoryId: 'c', goalId: null, priority: 'normal', startDate: null, dueDate: null, status: 'active', steps: [], createdAt: at(-5), updatedAt: at(-1), statusAt: at(-5) }))
    expect(ids(analyse(ictx({ life: { goals: [], projects: many, indicators: [], readings: [] } }), recov()))).toContain('cross-projects')
  })
  it('observations triées (attention d’abord) et fiabilité exposée', () => {
    const o = analyse(ictx({ events: weeksOfActivity(10, 3) }), recov())
    expect(o.every((x) => ['low', 'medium', 'high'].includes(x.reliability) && x.samples > 0 && x.evidence.length > 0 && x.signature)).toBe(true)
    expect(INSIGHT_CONFIG.weeksForTrend).toBeGreaterThanOrEqual(8)
  })
})

// ── Recommandations ───────────────────────────────────────────────────
const obs = (o: Partial<Observation> & { id: string }): Observation => ({ domain: 'MIXED', window: 'week', nature: 'fact', tone: 'attention', title: 'T', detail: 'D', evidence: ['e'], reliability: 'high', samples: 3, signature: 'sig', ...o })
const rctx = (o: Partial<RecCtx> = {}): RecCtx => ({ observations: [], lifeProposals: [], recovery: recov(), now: NOW, hasSport: true, ...o })

describe('recommandations : explicables, jamais appliquées seules', () => {
  it('chaque recommandation expose constat, justification, recommandation, bénéfice et confiance', () => {
    const recs = buildRecommendations(rctx({ observations: [obs({ id: 'cross-overload', evidence: ['2025-06-16 : au-delà de la capacité'] })] }))
    expect(recs).toHaveLength(1)
    const r = recs[0]
    expect(r.finding && r.evidence.length && r.recommendation && r.benefit && ['low', 'medium', 'high'].includes(r.confidence)).toBeTruthy()
    expect(r.action).toEqual({ type: 'open', route: '/planning', label: 'Ouvrir le planning' })
  })
  it('seule action appliquable : une proposition LIFE existante (confirmation requise) ; aucune action directe sur objectif, quête, séance, planning', () => {
    const lp = [{ id: 'pause:p1', kind: 'pause-project' as const, projectId: 'p1', severity: 'info' as const, title: 'Mettre « X » en pause', detail: 'Inactif' }, { id: 'rev:g', kind: 'review-goal' as const, goalId: 'g', severity: 'warn' as const, title: 'Revoir', detail: 'd' }]
    const recs = buildRecommendations(rctx({ lifeProposals: lp }))
    expect(recs.map((r) => r.action?.type).sort()).toEqual(['life-proposal', 'open'])
    expect(recs.every((r) => !r.action || r.action.type === 'open' || r.action.type === 'life-proposal')).toBe(true)
  })
  it('SÉCURITÉ : récupération insuffisante → repos adapté ; aucune reprise ni encouragement à s’entraîner', () => {
    const o = [obs({ id: 'regularity-pause', domain: 'RPG', tone: 'neutral', title: 'Pause de 12 jours', signature: 'p' }), obs({ id: 'sport-load-spike', domain: 'SPORT' })]
    const alert = recov([check({ pain: 'strong', safety: 'ALERTE', index: 10 })])
    const unsafe = buildRecommendations(rctx({ observations: o, recovery: alert }))
    expect(unsafe.map((r) => r.id)).toContain('rec:sport-recover')
    expect(unsafe.map((r) => r.id)).not.toContain('rec:resume-gradually')
    expect(JSON.stringify(unsafe)).not.toMatch(/s’entraîner malgré|forcer|dépasser la douleur|push/i)
    expect(unsafe.find((r) => r.id === 'rec:sport-recover')!.recommendation).toMatch(/repos/i)
    const normal = buildRecommendations(rctx({ observations: [o[0]] }))
    expect(normal.map((r) => r.id)).toContain('rec:resume-gradually')
    expect(normal.find((r) => r.id === 'rec:resume-gradually')!.recommendation).toMatch(/douleur ou une fatigue persiste, le repos reste le bon choix/)
    expect(buildRecommendations(rctx({ observations: [o[0]], hasSport: false })).map((r) => r.id)).not.toContain('rec:resume-gradually')
  })
  it('décisions : refusée / ignorée / acceptée masquées tant que la situation est identique, reportée jusqu’à la date, réapparition si la situation change', () => {
    const recs = buildRecommendations(rctx({ observations: [obs({ id: 'cross-deadline-cluster', signature: 'A' })] }))
    const st = (status: RecState['status'], signature = 'A', snooze: string | null = null): RecState[] => [{ id: recs[0].id, status, signature, at: at(-1), snoozeUntil: snooze }]
    for (const s of ['declined', 'ignored', 'accepted'] as const) expect(filterRecommendations(recs, st(s), NOW)).toEqual([])
    expect(filterRecommendations(recs, st('snoozed', 'A', snoozeUntil(NOW, 7)), NOW)).toEqual([])
    expect(filterRecommendations(recs, st('snoozed', 'A', day(-1)), NOW)).toHaveLength(1)
    const changed = buildRecommendations(rctx({ observations: [obs({ id: 'cross-deadline-cluster', signature: 'B' })] }))
    expect(filterRecommendations(changed, st('declined', 'A'), NOW)).toHaveLength(1)
    expect(filterRecommendations(recs, [], NOW)).toHaveLength(1)
  })
  it('valoriser une régularité : aucune action, aucune modification', () => {
    const r = buildRecommendations(rctx({ observations: [obs({ id: 'regularity-stable', tone: 'positive', domain: 'RPG' })] }))[0]
    expect(r).toMatchObject({ id: 'rec:value-regularity', action: null })
  })
})

// ── Narration ─────────────────────────────────────────────────────────
describe('narration : fidèle aux faits, variée, déterministe', () => {
  const nums = (t: string) => (t.match(/\d+/g) ?? []).map(Number)
  const allowed = (e: { data: Record<string, string | number>; title: string; description: string }) => new Set([...Object.values(e.data).flatMap((v) => nums(String(v))), ...nums(e.title), ...nums(e.description)])
  it('aucun chiffre ni fait inventé : tous les nombres proviennent de l’événement, pour tous les types détectables', () => {
    const events = [ev({ amount: domainXpForLevel(11, 1), recordedAt: at(-30) }), ev({ domain: 'SPORT', amount: 1200, attribute: 'force', awardKey: 'sport:z:base', recordedAt: at(-25) })]
    const sessions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => run(i, day(-40 + i * 2)))
    const list = detectEvents(ctx({ events, sessions, achievements: [{ id: 'first-step', unlockedAt: at(-3) }], rewards: [{ id: 'fx-halo', acquiredAt: at(-2), prestigeId: null, domain: null, category: 'cosmetic' }] }))
    expect(list.length).toBeGreaterThan(8)
    for (const e of list) { const t = narrateEvent(e); const ok = allowed(e); expect(nums(`${t.headline} ${t.body}`).every((x) => ok.has(x)), `${e.id}: ${t.body}`).toBe(true) }
  })
  it('déterministe, et variée d’un événement à l’autre (pas de message générique répété)', () => {
    const list = detectEvents(ctx({ events: [ev({ amount: domainXpForLevel(12, 1), recordedAt: at(-30) })] })).filter((e) => e.type === 'level-up')
    expect(list.length).toBeGreaterThan(5)
    expect(narrateEvent(list[0])).toEqual(narrateEvent(list[0]))
    expect(new Set(list.map((e) => narrateEvent(e).headline)).size).toBeGreaterThanOrEqual(2)
    expect(new Set(list.map((e) => narrateEvent(e).body)).size).toBeGreaterThan(list.length - 3)
  })
  it('type inconnu : repli sur la description factuelle', () => {
    expect(narrateEvent({ id: 'x', type: 'inconnu', data: {}, title: 'T', description: 'D factuelle' })).toEqual({ headline: 'T', body: 'D factuelle' })
  })
  it('récit de bilan : sections issues des données, étiquetées, sans donnée → pas de section', () => {
    const n: NarrativeInput = { kind: 'week', xp: { life: 120, sport: 60, total: 180 }, prevTotal: 90, activeDays: 4, periodDays: 7, life: { done: 5, planned: 6 }, sport: { done: 2, planned: 3, sessions: 2, sets: 18 }, levels: [{ domain: 'LIFE', from: 4, to: 5, rankFrom: 'E', rankTo: 'E' }], attributes: [{ label: 'Discipline', xp: 90 }], events: [{ title: 'LIFE niveau 5', importance: 'important', domain: 'LIFE', type: 'level-up' }], observations: [obs({ id: 'regularity-stable', domain: 'RPG', tone: 'positive', title: 'Rythme régulier', detail: 'Bien.' })], recommendations: [], blocked: ['Étape bloquée : Devis'] }
    const r = reportNarrative(n)
    expect(r.map((s) => s.id)).toEqual(['state', 'life', 'sport', 'attributes', 'highlights', 'difficulties'])
    expect(r[0].paragraphs[0]).toMatchObject({ tag: 'fact' })
    expect(r[0].paragraphs[0].text).toMatch(/\+180 XP.*4 jours d’activité sur 7/)
    expect(r.flatMap((s) => s.paragraphs).some((p) => p.tag === 'estimate')).toBe(true)
    expect(reportNarrative({ ...n, xp: { life: 0, sport: 0, total: 0 }, activeDays: 0, prevTotal: null, life: null, sport: null, levels: [], attributes: [], events: [], observations: [], blocked: [] })[0].paragraphs[0].text).toMatch(/pause fait partie du rythme/)
    expect(reportNarrative({ ...n, kind: 'day', xp: { life: 0, sport: 0, total: 0 }, activeDays: 0, prevTotal: null, life: null, sport: null, levels: [], attributes: [], events: [], observations: [], blocked: [] })).toEqual([])
  })
})

// ── Bilans enrichis ───────────────────────────────────────────────────
import { buildReport, type ReportInput } from './reports'
import { renderReportPdf } from './reports/pdf'

describe('bilans enrichis : faits, estimations, lectures du moteur, recommandations', () => {
  const base = (o: Partial<ReportInput> = {}): ReportInput => ({ kind: 'week', anchor: NOW, now: NOW, events: [], quests: [], categories: [], sessions: [], checks: [], analyses: [], moves: [], commitments: [], recovery: recov(), sportTarget: 3, ...o })
  const ev1 = detectEvents(ctx({ events: [ev({ amount: domainXpForLevel(6, 1), recordedAt: at(-2), at: at(-2) })] }))
  it('sans données du moteur : aucune section ajoutée (bilans inchangés)', () => {
    const r = buildReport(base())
    expect(r.sections.some((s) => s.id.startsWith('narr-'))).toBe(false)
  })
  it('chaque section existante est étiquetée ; la synthèse distingue mesuré / estimation / lecture / recommandation', () => {
    const observations: Observation[] = [obs({ id: 'regularity-stable', domain: 'RPG', tone: 'positive', nature: 'fact', title: 'Rythme régulier', detail: 'Bien.', window: 'week' }), obs({ id: 'frequency-trend', domain: 'RPG', tone: 'neutral', nature: 'interpretation', title: 'Fréquence en baisse', detail: 'Peut être un repos.', window: 'week' })]
    const recommendations = buildRecommendations(rctx({ observations: [obs({ id: 'cross-overload' })] }))
    const events = [ev({ amount: 40000, recordedAt: at(-2), at: at(-2) })]
    const r = buildReport(base({ events, intel: { events: ev1.map((e) => ({ ...e, seenAt: null, revokedAt: null, backfill: false, createdAt: e.at })), observations, recommendations } }))
    const narr = r.sections.filter((s) => s.id.startsWith('narr-'))
    expect(narr.length).toBeGreaterThanOrEqual(3)
    const tags = new Set(narr.flatMap((s) => s.tagged!.map((p) => p.tag)))
    expect(tags.has('fact')).toBe(true); expect(tags.has('interpretation')).toBe(true); expect(tags.has('recommendation')).toBe(true)
    expect(r.sections.filter((s) => !s.tagged).every((s) => s.tag)).toBe(true)
    expect(r.sections.find((s) => s.id === 'xp')!.tag).toBe('fact')
  })
  it('bilan du jour : événements importants du jour listés ; mensuel : tendances de la fenêtre longue', () => {
    const events = ev1.map((e) => ({ ...e, at: NOW.toISOString(), seenAt: null, revokedAt: null, backfill: false, createdAt: NOW.toISOString() }))
    const d = buildReport(base({ kind: 'day', intel: { events, observations: [], recommendations: [] } }))
    expect(d.sections.find((s) => s.id === 'events')!.lines!.length).toBeGreaterThan(0)
    const revoked = events.map((e) => ({ ...e, revokedAt: NOW.toISOString() }))
    expect(buildReport(base({ kind: 'day', intel: { events: revoked, observations: [], recommendations: [] } })).sections.some((s) => s.id === 'events')).toBe(false)
    const m = buildReport(base({ kind: 'month', intel: { events: [], observations: [obs({ id: 'long', window: 'long', domain: 'RPG', tone: 'positive', title: 'Tendance longue X', detail: 'ok' })], recommendations: [] }, events: [ev({ at: at(-3), recordedAt: at(-3) })] }))
    expect(JSON.stringify(m.sections)).toMatch(/Tendance longue X/)
  })
  it('export PDF : les étiquettes de nature sont imprimées', () => {
    const recommendations = buildRecommendations(rctx({ observations: [obs({ id: 'cross-overload' })] }))
    const r = buildReport(base({ events: [ev({ amount: 500, at: at(-2), recordedAt: at(-2) })], intel: { events: [], observations: [], recommendations } }))
    const bytes = renderReportPdf(r)
    const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    expect(s).toMatch(/\(Mesur\\?\xe9\)|Mesur/)
  })
})
