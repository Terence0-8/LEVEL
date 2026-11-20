import { describe, expect, it } from 'vitest'
import { candidates, selectNotifications, type NotifContext } from './notifications'
import { buildPlan, detectConflicts, planDay, proposeReorganisations, MAX_SUGGESTIONS_PER_DAY, type Commitment, type PlanContext, type PlanMove } from './planning'
import { DEFAULT_PREFS, inQuietHours, mergePrefs, type SeenLevels } from './prefs'
import type { Quest } from './quest'
import { computeProgression } from './progression'
import { auditRpg } from './rpgConsistency'
import { buildReport, periodOf, reportFileName, type ReportInput } from './reports'
import { renderReportPdf, toWinAnsi } from './reports/pdf'
import { evaluateRecovery } from './sport/recovery'
import type { RecoveryCheck, SportSession } from './sport/session'
import type { XpEvent } from './ledger'
import { dayKey } from './dates'

const NOW = new Date(2026, 10, 19, 10, 0) // jeudi 19 novembre 2026
const TODAY = dayKey(NOW)
const day = (n: number) => dayKey(new Date(2026, 10, 19 + n))
const recov = (checks: RecoveryCheck[] = []) => evaluateRecovery({ checks, sessions: [], now: NOW, today: TODAY })
let n = 0

const quest = (o: Partial<Quest> = {}): Quest => ({
  id: `q${++n}`, type: 'personal', title: `Quête ${n}`, description: '', categoryId: 'c1', priority: 'normal', dueDate: null, difficulty: 'normal',
  effortMinutes: 60, steps: [], rewardXp: 40, archived: false, plannedFor: null, createdAt: new Date(2026, 10, 1).getTime(), updatedAt: 0, ...o,
})
const sport = (o: Partial<SportSession> = {}): SportSession => ({
  id: `s${++n}`, kind: 'strength', origin: 'generated', date: day(1), status: 'planned', title: 'Haut du corps', plannedMinutes: 45, variant: 'equipment', slots: [],
  startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: '', updatedAt: '', ...o,
})
const ev = (o: Partial<XpEvent> = {}): XpEvent => ({
  id: `e${++n}`, kind: 'award', source: 'quest', sourceId: 'q', questId: 'q', stepId: null, awardKey: `quest:q:${n}`, cycleKey: 'once', domain: 'LIFE', categoryId: 'c1',
  attribute: 'discipline', amount: 40, baseAmount: 40, micro: false, at: new Date(2026, 10, 18, 12).toISOString(), recordedAt: '', retroactive: false, credit: null, percent: null,
  durationMinutes: null, note: '', reason: 't', label: 'Quête', status: 'valid', correctsEventId: null, reversedByEventId: null, ...o,
})
const ctx = (o: Partial<PlanContext> = {}): PlanContext => ({
  quests: [], events: [], commitments: [], sessions: [], moves: [], prefs: DEFAULT_PREFS.planning, sportDays: [], recovery: recov(), now: NOW, ...o,
})
const commit = (o: Partial<Commitment> = {}): Commitment => ({ id: `c${++n}`, title: 'Rendez-vous notaire', date: day(1), start: '10:00', minutes: 60, important: true, note: '', createdAt: '', ...o })

describe('préférences générales', () => {
  it('assainit des valeurs corrompues', () => {
    const p = mergePrefs({ planning: { dailyCapacityMin: -5, marginPct: 400, days: [9, 2, 2] }, notifications: { frequency: 'spam', quiet: { start: 'x' } } })
    expect(p.planning.dailyCapacityMin).toBeGreaterThan(0)
    expect(p.planning.marginPct).toBeLessThanOrEqual(50)
    expect(p.planning.days.every((d) => d >= 0 && d <= 6)).toBe(true)
    expect(['minimal', 'normal', 'frequent']).toContain(p.notifications.frequency)
    expect(p.notifications.quiet.start).toMatch(/^\d\d:\d\d$/)
  })
  it('plage de tranquillité de nuit (22:00 → 07:00)', () => {
    const q = { enabled: true, start: '22:00', end: '07:00' }
    expect(inQuietHours(q, new Date(2026, 10, 19, 23, 30))).toBe(true)
    expect(inQuietHours(q, new Date(2026, 10, 19, 3, 0))).toBe(true)
    expect(inQuietHours(q, new Date(2026, 10, 19, 12, 0))).toBe(false)
    expect(inQuietHours({ ...q, enabled: false }, new Date(2026, 10, 19, 23, 30))).toBe(false)
  })
})

describe('planning central', () => {
  it('détecte une journée surchargée et une journée chargée', () => {
    const quests = [quest({ dueDate: day(2), effortMinutes: 120 }), quest({ dueDate: day(2), effortMinutes: 120 }), quest({ dueDate: day(2), effortMinutes: 100 })]
    const c = ctx({ quests })
    const plan = buildPlan(c, TODAY, day(6))
    expect(detectConflicts(c, plan, TODAY, day(6)).some((x) => x.type === 'overload' && x.date === day(2))).toBe(true)
  })
  it('détecte le chevauchement d’engagements horaires', () => {
    const c = ctx({ commitments: [commit({ start: '10:00', minutes: 90 }), commit({ title: 'Appel', start: '11:00', minutes: 30, important: false })] })
    expect(detectConflicts(c, buildPlan(c, TODAY, day(3)), TODAY, day(3)).some((x) => x.type === 'overlap')).toBe(true)
  })
  it('respecte la récupération : alerte → conflit sur la séance du jour, proposition SPORT', () => {
    const check: RecoveryCheck = { id: 'k', day: TODAY, fatigue: 3, sleep: 0, soreness: 'strong' as never, sorenessAreas: {}, pain: 'strong' as never, painArea: null, safety: 'ALERTE', index: 10, restChosen: false, at: `${TODAY}T08:00:00.000Z` }
    const c = ctx({ sessions: [sport({ date: TODAY })], recovery: recov([check]) })
    const plan = buildPlan(c, TODAY, day(6))
    expect(detectConflicts(c, plan, TODAY, day(6)).some((x) => x.type === 'sport-recovery')).toBe(true)
    expect(proposeReorganisations(c, plan, TODAY, day(6)).some((p) => p.kind === 'reorganise-sport')).toBe(true)
  })
  it('ne déplace jamais une quête importante, une récurrente, une quête en retard ni au-delà d’une échéance', () => {
    const important = quest({ title: 'Dossier banque', priority: 'high', plannedFor: day(1), dueDate: day(1), effortMinutes: 150 })
    const daily = quest({ type: 'daily', title: 'Lecture', effortMinutes: 60 })
    const overdue = quest({ title: 'En retard', dueDate: day(-3), effortMinutes: 60 })
    const tight = quest({ title: 'Échéance demain', dueDate: day(1), plannedFor: day(1), effortMinutes: 120 })
    const free = quest({ title: 'Libre', plannedFor: day(1), effortMinutes: 120 })
    const c = ctx({ quests: [important, daily, overdue, tight, free] })
    const plan = buildPlan(c, TODAY, day(6))
    const props = proposeReorganisations(c, plan, TODAY, day(6))
    const moved = props.filter((p) => p.kind === 'move-quest').map((p) => p.questId)
    for (const id of [important.id, daily.id, overdue.id]) expect(moved).not.toContain(id)
    for (const p of props.filter((p) => p.kind === 'move-quest' && p.questId === tight.id)) expect(p.to! <= tight.dueDate!).toBe(true)
    expect(props.some((p) => p.questId === important.id && p.kind !== 'review-repeated')).toBe(false)
    expect(moved).toContain(free.id)
  })
  it('ne remplit pas artificiellement la journée', () => {
    const empty = ctx()
    const dp0 = planDay(empty, buildPlan(empty, TODAY, TODAY), TODAY)
    expect(dp0.suggestions).toEqual([])
    const many = ctx({ quests: Array.from({ length: 10 }, () => quest({ effortMinutes: 45 })) })
    const dp = planDay(many, buildPlan(many, TODAY, TODAY), TODAY)
    expect(dp.suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS_PER_DAY)
    expect(dp.load + dp.suggestions.reduce((s, x) => s + x.minutes, 0)).toBeLessThanOrEqual(dp.usable)
    expect(dp.deferred.length).toBeGreaterThan(0)
  })
  it('signale les reports répétés sans abandonner l’objectif', () => {
    const q = quest({ title: 'Projet long', effortMinutes: 120, steps: [{ id: 'a', title: 'a' }, { id: 'b', title: 'b' }, { id: 'c', title: 'c' }] as never })
    const moves: PlanMove[] = [1, 2, 3].map((i) => ({ id: `m${i}`, kind: 'quest', refId: q.id, title: q.title, from: day(-i), to: day(-i + 1), at: new Date(2026, 10, 19 - i).toISOString(), reason: '', byLevel: false }))
    const c = ctx({ quests: [q], moves })
    const props = proposeReorganisations(c, buildPlan(c, TODAY, day(6)), TODAY, day(6))
    expect(props.some((p) => p.kind === 'review-repeated' && p.questId === q.id)).toBe(true)
    expect(props.some((p) => p.kind === 'unschedule-quest' && p.questId === q.id)).toBe(false)
  })
})

describe('notifications locales', () => {
  const seen: SeenLevels = { global: 3, life: 2, sport: 1, rankGlobal: 'E', rankLife: 'E', rankSport: 'E' }
  const nctx = (o: Partial<NotifContext> = {}): NotifContext => ({
    now: NOW, prefs: { ...DEFAULT_PREFS.notifications }, quests: [], events: [], sessions: [], checks: [], recovery: recov(), commitments: [], levels: seen, seen, ...o,
  })
  const sel = (list: ReturnType<typeof candidates>, o: Partial<Parameters<typeof selectNotifications>[1]> = {}) =>
    selectNotifications(list, { now: NOW, prefs: DEFAULT_PREFS.notifications, sentKeys: new Set(), sentToday: 0, lastSentAt: null, ...o })

  it('rappel à heure fixe dans sa fenêtre uniquement', () => {
    const prefs = { ...DEFAULT_PREFS.notifications, reminders: [{ id: 'r1', time: '09:30', label: 'Bilan rapide', enabled: true }, { id: 'r2', time: '15:00', label: 'Plus tard', enabled: true }, { id: 'r3', time: '09:30', label: 'Coupé', enabled: false }] }
    const keys = candidates(nctx({ prefs })).map((c) => c.key)
    expect(keys.some((k) => k.startsWith('fixed:r1'))).toBe(true)
    expect(keys.some((k) => k.startsWith('fixed:r2') || k.startsWith('fixed:r3'))).toBe(false)
  })
  it('aucune notification pendant la tranquillité, catégories coupées, ni répétition', () => {
    const list = [{ key: 'a', category: 'quests' as const, title: 't', body: 'b', route: '/', priority: 5 }]
    expect(sel(list, { now: new Date(2026, 10, 19, 23, 0) })).toEqual([])
    expect(sel(list, { prefs: { ...DEFAULT_PREFS.notifications, categories: { ...DEFAULT_PREFS.notifications.categories, quests: false } } })).toEqual([])
    expect(sel(list, { sentKeys: new Set(['a']) })).toEqual([])
    expect(sel(list, { prefs: { ...DEFAULT_PREFS.notifications, enabled: false } })).toEqual([])
    expect(sel(list)).toHaveLength(1)
  })
  it('plafond quotidien, écart minimal, une seule notification à la fois', () => {
    const list = ['a', 'b', 'c'].map((k, i) => ({ key: k, category: 'quests' as const, title: k, body: '', route: '/', priority: i }))
    expect(sel(list)).toHaveLength(1)
    expect(sel(list)[0].key).toBe('c')
    expect(sel(list, { sentToday: 4 })).toEqual([])
    expect(sel(list, { lastSentAt: new Date(NOW.getTime() - 10 * 60_000) })).toEqual([])
    expect(sel(list, { lastSentAt: new Date(NOW.getTime() - 40 * 60_000) })).toHaveLength(1)
  })
  it('alerte d’échéance la veille d’une quête datée non terminée', () => {
    const q = quest({ title: 'Déclaration', dueDate: day(1) })
    expect(candidates(nctx({ quests: [q] })).some((c) => c.category === 'deadlines' && c.title.includes('Déclaration') || c.body.includes('Déclaration'))).toBe(true)
  })
  it('montée de niveau notifiée, mais rien à la première observation', () => {
    const up = { ...seen, global: 4 }
    expect(candidates(nctx({ levels: up })).some((c) => c.category === 'progress')).toBe(true)
    expect(candidates(nctx({ levels: up, seen: null })).some((c) => c.category === 'progress')).toBe(false)
  })
  it('alerte de récupération → conseil de repos plutôt qu’une relance sportive', () => {
    const check: RecoveryCheck = { id: 'k', day: TODAY, fatigue: 3, sleep: 0, soreness: 'strong' as never, sorenessAreas: {}, pain: 'strong' as never, painArea: null, safety: 'ALERTE', index: 10, restChosen: false, at: `${TODAY}T08:00:00.000Z` }
    const list = candidates(nctx({ now: new Date(2026, 10, 19, 17, 0), sessions: [sport({ date: TODAY })], checks: [check], recovery: recov([check]) }))
    expect(list.some((c) => c.category === 'recovery')).toBe(true)
    expect(list.some((c) => c.category === 'sport' && /séance/i.test(c.title) && /prête|prévue/i.test(c.title))).toBe(false)
  })
})

describe('RPG transversal', () => {
  it('journal sain : tous les contrôles passent, rangs par domaine indépendants', () => {
    const events = [ev({ amount: 500, baseAmount: 500 }), ev({ domain: 'SPORT', awardKey: 'sport:session:s1:base', sourceId: 's1', source: 'activity', questId: null, categoryId: null, attribute: 'force', amount: 60, baseAmount: 60 })]
    const a = auditRpg(events)
    expect(a.checks.filter((c) => !c.ok)).toEqual([])
    expect(a.ok).toBe(true)
    const p = computeProgression(events)
    expect(p.totalXp).toBe(560)
    expect(p.life.xp).toBe(500)
    expect(p.sportLevel.xp).toBe(60)
    expect(p.lifeRank!.rank).not.toBe(undefined)
    expect(p.sportLevel.level).toBeLessThan(p.life.level)
    expect(a.notImplemented.join(' ')).toMatch(/Prestige/)
  })
  it('détecte un événement SPORT mal rattaché et un double comptage', () => {
    const bad = auditRpg([ev({ domain: 'LIFE', awardKey: 'sport:session:s1:base' })])
    expect(bad.ok).toBe(false)
    const dup = auditRpg([ev({ awardKey: 'quest:x:once' }), ev({ awardKey: 'quest:x:once' })])
    expect(dup.ok).toBe(false)
  })
})

describe('bilans', () => {
  const inp = (kind: ReportInput['kind'], o: Partial<ReportInput> = {}): ReportInput => ({
    kind, anchor: NOW, now: NOW, events: [], quests: [], categories: [{ id: 'c1', name: 'Santé', attribute: 'vitalite', order: 0, archived: false, builtin: true }], sessions: [], checks: [], analyses: [], moves: [], commitments: [], recovery: recov(), sportTarget: 3, ...o,
  })
  it('périodes : jour, semaine (lundi→dimanche), mois', () => {
    expect(periodOf('week', NOW)).toMatchObject({ from: '2026-11-16', to: '2026-11-22' })
    expect(periodOf('month', NOW)).toMatchObject({ from: '2026-11-01', to: '2026-11-30' })
    expect(periodOf('day', NOW)).toMatchObject({ from: TODAY, to: TODAY })
  })
  it('bilan du jour : XP, sections attendues, vide sans reproche', () => {
    const r = buildReport(inp('day', { events: [ev({ at: NOW.toISOString(), amount: 40, label: 'Marche' })] }))
    expect(r.sections.map((s) => s.id)).toEqual(['xp', 'achievements', 'undone', 'sport', 'recovery', 'tomorrow'])
    expect(r.sections[0].stats![0].value).toBe('+40')
    const empty = buildReport(inp('day'))
    expect(empty.sections.find((s) => s.id === 'achievements')!.empty).toBeTruthy()
  })
  it('bilan hebdomadaire : sections et exécution du planning', () => {
    const daily = quest({ type: 'daily', title: 'Étirements', createdAt: new Date(2026, 10, 16).getTime() })
    const r = buildReport(inp('week', { quests: [daily], events: [ev({ questId: daily.id, awardKey: `quest:${daily.id}:2026-11-17`, cycleKey: '2026-11-17', at: new Date(2026, 10, 17, 9).toISOString() })] }))
    expect(r.sections.map((s) => s.id)).toEqual(expect.arrayContaining(['xp', 'regularity', 'progress', 'time', 'sport', 'attributes', 'difficulties', 'reco']))
    const reg = r.sections.find((s) => s.id === 'regularity')!
    expect(reg.stats![0].value).toMatch(/^1 \/ \d+$/)
  })
  it('bilan mensuel : sections et tendances', () => {
    const r = buildReport(inp('month'))
    expect(r.sections.map((s) => s.id)).toEqual(expect.arrayContaining(['general', 'levels', 'attributes', 'objectives', 'trends', 'records', 'wins', 'difficulties', 'reco']))
    expect(r.subtitle).toMatch(/novembre 2026/)
  })
  it('les pourcentages mesurent la planification : la note le dit et aucune formule de jugement n’apparaît', () => {
    const txt = JSON.stringify(buildReport(inp('week')))
    expect(txt).toMatch(/planning/i)
    expect(txt).not.toMatch(/échec|nul|paresse|mauvais|insuffisant/i)
  })
  it('PDF valide, accents conservés, xref cohérente, pagination, nom distinct d’une sauvegarde', () => {
    const lines = Array.from({ length: 80 }, (_, i) => `Élément ${i} — très « détaillé » → ok ≈ 5 €`)
    const r = buildReport(inp('week'))
    r.sections.push({ id: 'x', title: 'Long', lines })
    const bytes = renderReportPdf(r)
    const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    const pages = (s.match(/\/Type \/Page /g) ?? []).length
    expect(pages).toBeGreaterThanOrEqual(2)
    const sx = Number(/startxref\n(\d+)/.exec(s)![1])
    expect(s.slice(sx, sx + 4)).toBe('xref')
    const offs = [...s.slice(sx).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
    offs.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
    expect(toWinAnsi('é—’→')).toBe('é\x97\x92->')
    expect(reportFileName(r)).toMatch(/^level-bilan-semaine-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(reportFileName(r)).not.toMatch(/sauvegarde/)
  })
})
