import { describe, expect, it } from 'vitest'
import { candidates, selectNotifications, type NotifContext } from './notifications'
import { DEFAULT_PREFS } from './prefs'
import { evaluateRecovery } from './sport/recovery'
import { narrateEvent } from './narration'
import type { Recommendation } from './recommendations'
import type { Importance, RpgEvent } from './rpgEvents'
import { dayKey } from './dates'

const NOW = new Date(2026, 5, 15, 10)
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
let n = 0
const rpgEv = (importance: Importance, o: Partial<RpgEvent> = {}): RpgEvent => ({ id: `evt:${++n}`, category: 'progression', type: 'achievement', importance, at: hoursAgo(2), domain: 'RPG', title: `Titre ${n}`, description: 'Description', origin: 'achievements', data: { achievement: `S${n}`, rarity: 'rare' }, seenAt: null, revokedAt: null, backfill: false, createdAt: hoursAgo(2), ...o })
const seen = { global: 3, life: 2, sport: 1, rankGlobal: 'E', rankLife: 'E', rankSport: 'E' }
const ctx = (o: Partial<NotifContext> = {}): NotifContext => ({ now: NOW, prefs: { ...DEFAULT_PREFS.notifications }, quests: [], events: [], sessions: [], checks: [], recovery: evaluateRecovery({ checks: [], sessions: [], now: NOW, today: dayKey(NOW) }), commitments: [], levels: seen, seen, ...o })
const ins = (o: Partial<NotifContext>) => candidates(ctx(o)).filter((c) => c.category === 'insights')
const rec: Recommendation = { id: 'rec:x', domain: 'MIXED', title: 'Alléger ou réorganiser la semaine', finding: 'f', evidence: ['e'], recommendation: 'r', benefit: 'b', confidence: 'medium', action: null, signature: 's', priority: 50 }

describe('notifications intelligentes (système existant, priorisé)', () => {
  it('les informations et les actions banales ne notifient jamais ; les événements importants oui', () => {
    expect(ins({ rpgEvents: [rpgEv('info'), rpgEv('info')] })).toEqual([])
    expect(ins({ rpgEvents: [rpgEv('important')] })).toHaveLength(1)
  })
  it('priorisation par importance : exceptionnel > majeur > important ; un seul envoi à la fois', () => {
    const list = ins({ rpgEvents: [rpgEv('important'), rpgEv('major'), rpgEv('exceptional')] })
    const picked = selectNotifications(list, { now: NOW, prefs: DEFAULT_PREFS.notifications, sentKeys: new Set(), sentToday: 0, lastSentAt: null })
    expect(picked).toHaveLength(1)
    expect(picked[0].priority).toBe(96)
  })
  it('regroupement : plusieurs événements importants → une seule notification', () => {
    const list = ins({ rpgEvents: [rpgEv('important'), rpgEv('important'), rpgEv('important')] })
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('3 nouveaux moments dans votre journal')
    expect(list[0].route).toBe('/rpg/journal')
  })
  it('pas de doublon entre notification et événement consulté, ni pour l’historique reconstitué, révoqué ou ancien', () => {
    expect(ins({ rpgEvents: [rpgEv('major', { seenAt: hoursAgo(1) })] })).toEqual([])
    expect(ins({ rpgEvents: [rpgEv('major', { backfill: true })] })).toEqual([])
    expect(ins({ rpgEvents: [rpgEv('major', { revokedAt: hoursAgo(1) })] })).toEqual([])
    expect(ins({ rpgEvents: [rpgEv('major', { at: hoursAgo(60) })] })).toEqual([])
    const e = rpgEv('major')
    const first = ins({ rpgEvents: [e] })[0]
    expect(selectNotifications([first], { now: NOW, prefs: DEFAULT_PREFS.notifications, sentKeys: new Set([first.key]), sentToday: 1, lastSentAt: null })).toEqual([])
  })
  it('le journal remplace les annonces de niveau : plus de doublon avec les événements', () => {
    const up = { ...seen, global: 4, life: 3 }
    expect(candidates(ctx({ levels: up })).some((c) => c.category === 'progress')).toBe(true)
    expect(candidates(ctx({ levels: up, rpgEvents: [] })).some((c) => c.category === 'progress')).toBe(false)
  })
  it('recommandation : une seule, confiance suffisante, formulation neutre, catégorie réglable', () => {
    expect(ins({ recommendation: rec })).toHaveLength(1)
    expect(ins({ recommendation: { ...rec, confidence: 'low' } })).toEqual([])
    const c = ins({ recommendation: rec })
    const off = { ...DEFAULT_PREFS.notifications, categories: { ...DEFAULT_PREFS.notifications.categories, insights: false } }
    expect(selectNotifications(c, { now: NOW, prefs: off, sentKeys: new Set(), sentToday: 0, lastSentAt: null })).toEqual([])
  })
  it('tranquillité et plafond quotidien respectés', () => {
    const c = ins({ rpgEvents: [rpgEv('major')] })
    const night = new Date(2026, 5, 15, 23)
    expect(selectNotifications(c, { now: night, prefs: DEFAULT_PREFS.notifications, sentKeys: new Set(), sentToday: 0, lastSentAt: null })).toEqual([])
    expect(selectNotifications(c, { now: NOW, prefs: DEFAULT_PREFS.notifications, sentKeys: new Set(), sentToday: 4, lastSentAt: null })).toEqual([])
  })
  it('jamais culpabilisant : aucun terme d’échec dans les notifications ni les textes narratifs', () => {
    const texts = [...ins({ rpgEvents: [rpgEv('major'), rpgEv('exceptional')], recommendation: rec }), ...ins({ rpgEvents: [rpgEv('important'), rpgEv('important')] })].map((c) => `${c.title} ${c.body}`)
    texts.push(`${narrateEvent({ id: 'x', type: 'resume', data: { days: 12 }, title: 'Reprise', description: 'Reprise' }).body}`)
    expect(texts.join(' ')).not.toMatch(/échec|raté|manqué|paresse|retard|rattraper|honte|décevant/i)
  })
})
