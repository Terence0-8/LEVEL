import { dayKey, daysBetweenKeys, weekKey } from './dates'
import type { XpEvent } from './ledger'
import { FREQUENCY_CAP, inQuietHours, type NotificationPrefs, type NotifCategory, type SeenLevels } from './prefs'
import type { Quest } from './quest'
import { cycleProgress } from './questState'
import type { Commitment } from './planning'
import type { RecoveryState } from './sport/recovery'
import type { RecoveryCheck, SportSession } from './sport/session'

/**
 * Notifications LOCALES. Ce module décide QUOI notifier et QUAND (pur, testable) ; la remise (système ou dans l'application)
 * dépend de la plateforme et vit dans `data/notificationService`. Principes : peu de notifications, aucune pendant les plages de
 * tranquillité, aucune répétition (clé de déduplication), plafond quotidien selon la fréquence choisie, écart minimal entre deux envois.
 */
export interface Candidate {
  /** Clé de déduplication : une même clé n'est jamais notifiée deux fois */
  key: string
  category: NotifCategory
  title: string
  body: string
  /** Route de l'application à ouvrir */
  route: string
  /** Plus haut = plus important */
  priority: number
}

/** Une notification émise (ou tentée) : sert à la déduplication, au plafond quotidien et à la boîte de réception dans l'appli. */
export interface NotificationLogEntry {
  id: string
  key: string
  category: NotifCategory
  title: string
  body: string
  route: string
  /** ISO */
  at: string
  /** `system` : notification du système ; `inapp` : affichée seulement dans l'application (repli) */
  channel: 'system' | 'inapp'
  read: boolean
}

export interface NotifContext {
  now: Date
  prefs: NotificationPrefs
  quests: Quest[]
  events: XpEvent[]
  sessions: SportSession[]
  checks: RecoveryCheck[]
  recovery: RecoveryState
  commitments: Commitment[]
  levels: SeenLevels
  seen: SeenLevels | null
  /** Domaines dont le prestige est disponible (rappel unique, jamais de déclenchement automatique) */
  prestigeReady?: Array<{ domain: 'LIFE' | 'SPORT'; number: number }>
  /** Succès débloqués récemment (annonce unique, 48 h) */
  recentUnlocks?: Array<{ id: string; title: string; at: string }>
}

const hhmm = (now: Date) => now.getHours() * 60 + now.getMinutes()
const at = (h: number, m = 0) => h * 60 + m

export function lastDayOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** Tout ce qui POURRAIT être notifié maintenant, avant filtrage par préférences, tranquillité, déduplication et plafond. */
export function candidates(c: NotifContext): Candidate[] {
  const { now } = c
  const day = dayKey(now)
  const t = hhmm(now)
  const out: Candidate[] = []

  // Rappels à heures fixes (fenêtre de 90 min : un rappel manqué n'est pas rejoué plus tard)
  for (const r of c.prefs.reminders) {
    if (!r.enabled) continue
    const rt = Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3))
    if (t >= rt && t < rt + 90) out.push({ key: `fixed:${r.id}:${day}`, category: 'fixed', title: r.label, body: 'Votre rappel de la journée.', route: '/', priority: 50 })
  }

  // Quêtes du jour restantes (une fois par jour, en fin de journée, sans pression)
  const daily = c.quests.filter((q) => !q.archived && q.type === 'daily' && !cycleProgress(q, c.events, now).completed)
  if (daily.length && t >= at(18)) out.push({ key: `quests:${day}`, category: 'quests', title: daily.length === 1 ? 'Il reste une quête du jour' : `Il reste ${daily.length} quêtes du jour`, body: 'Quand vous voulez : une quête non réalisée ne retire jamais d’XP.', route: '/life', priority: 40 })

  // Échéances : la veille (dès 9 h) et le jour même (dès 8 h) ; engagements importants idem
  for (const q of c.quests) {
    if (q.archived || !q.dueDate || cycleProgress(q, c.events, now).completed) continue
    const d = daysBetweenKeys(day, q.dueDate)
    if (d === 1 && t >= at(9)) out.push({ key: `deadline:${q.id}:${q.dueDate}:D1`, category: 'deadlines', title: `Échéance demain : ${q.title}`, body: q.priority === 'high' ? 'Quête importante.' : 'Échéance prévue demain.', route: '/life', priority: q.priority === 'high' ? 80 : 70 })
    if (d === 0 && t >= at(8)) out.push({ key: `deadline:${q.id}:${q.dueDate}:D0`, category: 'deadlines', title: `Échéance aujourd’hui : ${q.title}`, body: q.priority === 'high' ? 'Quête importante.' : 'Échéance prévue aujourd’hui.', route: '/life', priority: q.priority === 'high' ? 95 : 85 })
  }
  for (const m of c.commitments) {
    if (!m.important) continue
    const d = daysBetweenKeys(day, m.date)
    if (d === 1 && t >= at(9)) out.push({ key: `commit:${m.id}:${m.date}:D1`, category: 'deadlines', title: `Demain : ${m.title}`, body: m.start ? `Engagement important à ${m.start}.` : 'Engagement important.', route: '/planning', priority: 82 })
    if (d === 0 && t >= at(8)) out.push({ key: `commit:${m.id}:${m.date}:D0`, category: 'deadlines', title: `Aujourd’hui : ${m.title}`, body: m.start ? `Engagement important à ${m.start}.` : 'Engagement important.', route: '/planning', priority: 92 })
  }

  // Sport et récupération (jamais d'encouragement à s'entraîner en alerte)
  const todaySession = c.sessions.find((s) => s.date === day && s.status === 'planned' && s.kind !== 'other')
  const hasCheck = c.checks.some((k) => k.day === day)
  if (todaySession) {
    if (c.recovery.level === 'ALERTE') out.push({ key: `recovery-alert:${day}`, category: 'recovery', title: 'Repos conseillé aujourd’hui', body: 'Alerte de récupération : la séance prévue ne doit pas avoir lieu avant réévaluation.', route: '/sport/recuperation', priority: 85 })
    else {
      if (!hasCheck && t >= at(9)) out.push({ key: `recovery:${day}`, category: 'recovery', title: 'Questionnaire de récupération', body: 'Environ 30 secondes pour adapter votre séance du jour.', route: '/sport/recuperation', priority: 55 })
      if (t >= at(16)) out.push({ key: `sport:${todaySession.id}:${day}`, category: 'sport', title: 'Séance prévue aujourd’hui', body: c.recovery.level === 'VIGILANCE' ? 'Vigilance : séance allégée, sans progression de charge.' : 'Prête quand vous l’êtes.', route: '/sport', priority: 45 })
    }
  }

  // Progression : montées de niveau et changements de rang (rien lors de la première observation)
  if (c.seen) {
    const dom: Array<['global' | 'life' | 'sport', string]> = [['global', 'Niveau global'], ['life', 'Niveau LIFE'], ['sport', 'Niveau SPORT']]
    for (const [k, label] of dom) if (c.levels[k] > c.seen[k]) out.push({ key: `levelup:${k}:${c.levels[k]}`, category: 'progress', title: `${label} ${c.levels[k]}`, body: 'Montée de niveau : bravo pour votre régularité.', route: '/rpg', priority: 60 })
    const rk: Array<['rankGlobal' | 'rankLife' | 'rankSport', string]> = [['rankGlobal', 'global'], ['rankLife', 'LIFE'], ['rankSport', 'SPORT']]
    for (const [k, label] of rk) if (c.levels[k] !== c.seen[k]) out.push({ key: `rank:${label}:${c.levels[k]}`, category: 'progress', title: `Nouveau rang ${label} : ${c.levels[k]}`, body: 'Votre rang a évolué.', route: '/rpg', priority: 62 })
  }

  // Prestige disponible (facultatif) et succès débloqués : une seule annonce chacun
  for (const p of c.prestigeReady ?? []) out.push({ key: `prestige:ready:${p.domain}:${p.number}`, category: 'progress', title: `Prestige ${p.domain} disponible`, body: 'Facultatif : ouvrez un nouveau cycle quand vous le souhaitez.', route: '/rpg/prestige', priority: 58 })
  for (const u of c.recentUnlocks ?? []) if (now.getTime() - new Date(u.at).getTime() < 48 * 3_600_000) out.push({ key: `unlock:${u.id}`, category: 'progress', title: `Succès débloqué : ${u.title}`, body: 'Retrouvez-le dans vos distinctions.', route: '/rpg/distinctions', priority: 52 })

  // Bilans : quotidien (20 h 30), hebdomadaire (dimanche 18 h), mensuel (dernier jour 18 h)
  if (t >= at(20, 30)) out.push({ key: `review:daily:${day}`, category: 'reviews', title: 'Votre bilan du jour est prêt', body: 'Accomplissements, XP gagnée et priorités de demain.', route: '/bilans', priority: 30 })
  if (now.getDay() === 0 && t >= at(18)) out.push({ key: `review:weekly:${weekKey(now)}`, category: 'reviews', title: 'Votre bilan de la semaine est prêt', body: 'Régularité, progression et recommandations.', route: '/bilans', priority: 35 })
  if (now.getDate() === lastDayOfMonth(now) && t >= at(18)) out.push({ key: `review:monthly:${day.slice(0, 7)}`, category: 'reviews', title: 'Votre bilan du mois est prêt', body: 'Tendances, records et recommandations à moyen terme.', route: '/bilans', priority: 36 })
  return out
}

export interface SelectContext {
  now: Date
  prefs: NotificationPrefs
  /** Clés déjà notifiées (historique) */
  sentKeys: Set<string>
  sentToday: number
  lastSentAt: Date | null
}

export const MIN_GAP_MINUTES = 30

/**
 * Filtre et limite : notifications désactivées, catégories coupées, plage de tranquillité, déjà notifié, plafond quotidien,
 * écart minimal entre deux envois. Retourne AU PLUS UNE notification par évaluation (la plus prioritaire) : pas de rafale.
 */
export function selectNotifications(list: Candidate[], s: SelectContext): Candidate[] {
  if (!s.prefs.enabled || inQuietHours(s.prefs.quiet, s.now)) return []
  if (s.sentToday >= FREQUENCY_CAP[s.prefs.frequency]) return []
  if (s.lastSentAt && (s.now.getTime() - s.lastSentAt.getTime()) / 60_000 < MIN_GAP_MINUTES) return []
  const eligible = list.filter((n) => s.prefs.categories[n.category] && !s.sentKeys.has(n.key)).sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))
  return eligible.slice(0, 1)
}

/** Niveaux et rangs courants, dans la forme comparée aux derniers niveaux « vus ». */
export function levelsOf(p: { global: { level: number }; life: { level: number }; sportLevel: { level: number }; rank: { rank: string }; lifeRank?: { rank: string }; sportRank?: { rank: string } }): SeenLevels {
  return { global: p.global.level, life: p.life.level, sport: p.sportLevel.level, rankGlobal: p.rank.rank, rankLife: p.lifeRank?.rank ?? p.rank.rank, rankSport: p.sportRank?.rank ?? p.rank.rank }
}
