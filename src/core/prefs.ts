/**
 * Préférences GÉNÉRALES de l'application (nouvelles : notifications, planning, RPG).
 * Les réglages propres à LIFE (catégories) et à SPORT (profil) restent dans leurs modules : ils ne sont pas dupliqués ici.
 */
export type NotifCategory = 'fixed' | 'quests' | 'deadlines' | 'sport' | 'recovery' | 'progress' | 'reviews' | 'insights'

export const NOTIF_CATEGORY_LABEL: Record<NotifCategory, string> = {
  fixed: 'Rappels à heures fixes', quests: 'Quêtes du jour', deadlines: 'Échéances', sport: 'Sport', recovery: 'Questionnaire de récupération',
  progress: 'Progression et montées de niveau', reviews: 'Bilans périodiques', insights: 'Événements marquants et recommandations',
}
export const NOTIF_CATEGORIES = Object.keys(NOTIF_CATEGORY_LABEL) as NotifCategory[]

export type NotifFrequency = 'minimal' | 'normal' | 'frequent'
/** Nombre maximal de notifications par jour selon la fréquence choisie. */
export const FREQUENCY_CAP: Record<NotifFrequency, number> = { minimal: 2, normal: 4, frequent: 8 }
export const FREQUENCY_LABEL: Record<NotifFrequency, string> = { minimal: 'Minimale', normal: 'Normale', frequent: 'Fréquente' }

export interface Reminder { id: string; /** « HH:MM » */ time: string; label: string; enabled: boolean }

export interface NotificationPrefs {
  enabled: boolean
  frequency: NotifFrequency
  quiet: { enabled: boolean; start: string; end: string }
  categories: Record<NotifCategory, boolean>
  reminders: Reminder[]
}

export interface PlanningPrefs {
  /** Minutes de travail réalistes par jour (LIFE + SPORT + engagements) : au-delà, la journée est surchargée */
  dailyCapacityMin: number
  /** Jours disponibles (0 = lundi … 6 = dimanche) */
  days: number[]
  /** Marge laissée libre : Level ne remplit jamais toute la journée */
  marginPct: number
}

export interface SeenLevels { global: number; life: number; sport: number; rankGlobal: string; rankLife: string; rankSport: string }

import { DEFAULT_PILOTAGE_PREFS, PILOTAGE_CONFIG, type PilotagePrefs } from './pilotage'

export interface AppPrefs {
  planning: PlanningPrefs
  notifications: NotificationPrefs
  rpg: { celebrations: boolean; /** Titre affiché (identifiant `ach:…` ou `rw:…`) */ title: string | null; /** Effet de montée de niveau (identifiant de récompense) */ effect: string | null; /** Cadre de rang (identifiant de récompense) */ frame: string | null }
  /** Pilotage stratégique : limite souple de priorités fondamentales, rappels de revue (facultatifs) */
  pilotage: PilotagePrefs
  /** Derniers niveaux/rangs signalés (détecte les montées de niveau à notifier) */
  seen: SeenLevels | null
}

export const DEFAULT_PREFS: AppPrefs = {
  planning: { dailyCapacityMin: 240, days: [0, 1, 2, 3, 4, 5, 6], marginPct: 20 },
  notifications: {
    enabled: true, frequency: 'normal', quiet: { enabled: true, start: '22:00', end: '07:00' },
    categories: { fixed: true, quests: true, deadlines: true, sport: true, recovery: true, progress: true, reviews: true, insights: true },
    reminders: [],
  },
  rpg: { celebrations: true, title: null, effect: null, frame: null },
  pilotage: DEFAULT_PILOTAGE_PREFS,
  seen: null,
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d)

/** Fusionne des préférences enregistrées (éventuellement anciennes ou partielles) avec les valeurs par défaut, en les assainissant. */
export function mergePrefs(raw: unknown): AppPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const n = (r.notifications ?? {}) as Record<string, any>
  const p = (r.planning ?? {}) as Record<string, any>
  const d = DEFAULT_PREFS
  const time = (v: unknown, def: string) => (typeof v === 'string' && HHMM.test(v) ? v : def)
  return {
    planning: {
      dailyCapacityMin: num(p.dailyCapacityMin, 30, 960, d.planning.dailyCapacityMin),
      days: Array.isArray(p.days) ? [...new Set((p.days as unknown[]).filter((x): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6))].sort() : d.planning.days,
      marginPct: num(p.marginPct, 0, 50, d.planning.marginPct),
    },
    notifications: {
      enabled: typeof n.enabled === 'boolean' ? n.enabled : d.notifications.enabled,
      frequency: ['minimal', 'normal', 'frequent'].includes(n.frequency) ? n.frequency : d.notifications.frequency,
      quiet: { enabled: typeof n.quiet?.enabled === 'boolean' ? n.quiet.enabled : d.notifications.quiet.enabled, start: time(n.quiet?.start, d.notifications.quiet.start), end: time(n.quiet?.end, d.notifications.quiet.end) },
      categories: Object.fromEntries(NOTIF_CATEGORIES.map((c) => [c, typeof n.categories?.[c] === 'boolean' ? n.categories[c] : d.notifications.categories[c]])) as Record<NotifCategory, boolean>,
      reminders: Array.isArray(n.reminders)
        ? (n.reminders as any[]).filter((x) => x && typeof x.id === 'string' && HHMM.test(x.time)).slice(0, 8).map((x) => ({ id: x.id, time: x.time, label: String(x.label ?? 'Rappel').slice(0, 60), enabled: x.enabled !== false }))
        : [],
    },
    rpg: {
      celebrations: typeof r.rpg?.celebrations === 'boolean' ? r.rpg.celebrations : d.rpg.celebrations,
      title: typeof r.rpg?.title === 'string' ? r.rpg.title.slice(0, 80) : null,
      effect: typeof r.rpg?.effect === 'string' ? r.rpg.effect.slice(0, 40) : null,
      frame: typeof r.rpg?.frame === 'string' ? r.rpg.frame.slice(0, 40) : null,
    },
    pilotage: {
      maxFundamental: num(r.pilotage?.maxFundamental, PILOTAGE_CONFIG.maxFundamentalRange[0], PILOTAGE_CONFIG.maxFundamentalRange[1], d.pilotage.maxFundamental),
      reminders: { monthly: typeof r.pilotage?.reminders?.monthly === 'boolean' ? r.pilotage.reminders.monthly : d.pilotage.reminders.monthly, quarterly: typeof r.pilotage?.reminders?.quarterly === 'boolean' ? r.pilotage.reminders.quarterly : d.pilotage.reminders.quarterly, annual: typeof r.pilotage?.reminders?.annual === 'boolean' ? r.pilotage.reminders.annual : d.pilotage.reminders.annual },
    },
    seen: r.seen && typeof r.seen === 'object' && Number.isFinite(r.seen.global) ? (r.seen as SeenLevels) : null,
  }
}

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

/** Plage de tranquillité (gère le passage de minuit : 22:00 → 07:00). */
export function inQuietHours(q: NotificationPrefs['quiet'], now: Date): boolean {
  if (!q.enabled) return false
  const m = now.getHours() * 60 + now.getMinutes()
  const s = mins(q.start), e = mins(q.end)
  if (s === e) return false
  return s < e ? m >= s && m < e : m >= s || m < e
}
