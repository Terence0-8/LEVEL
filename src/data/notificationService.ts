import { dayKey } from '@/core/dates'
import { candidates, selectNotifications, type Candidate, type NotificationLogEntry, type NotifContext } from '@/core/notifications'
import { createPrefsService } from './prefsService'
import { db, type LevelDB } from './db'
import type { ServiceDeps } from './questService'

/**
 * Remise des notifications LOCALES. La décision (quoi, quand, combien) est dans `core/notifications` ; ce service :
 *  - détecte HONNÊTEMENT ce que la plateforme permet (`capability`) ;
 *  - journalise chaque notification (déduplication, plafond quotidien, boîte de réception dans l'appli) ;
 *  - remet une notification système si la permission est accordée, sinon la garde dans l'application (repli).
 *
 * Limite structurelle : une PWA sans serveur de notifications push ne peut pas se réveiller application fermée de façon fiable.
 * Level évalue donc ses rappels tant que l'appli est ouverte (onglet ou fenêtre, même en arrière-plan) et rattrape à l'ouverture :
 * les rappels « manqués » s'affichent alors dans la boîte de réception plutôt que d'être perdus.
 */
export type Permission = 'granted' | 'denied' | 'default' | 'unsupported'

export interface Platform {
  permission(): Permission
  request(): Promise<Permission>
  /** true si le système a affiché la notification */
  show(n: { title: string; body: string; tag: string; route: string }): Promise<boolean>
}

export interface Capability {
  permission: Permission
  /** Notifications système possibles (appli ouverte) */
  system: boolean
  /** Remise application fermée : jamais garantie sans serveur */
  backgroundDelivery: false
  mode: 'system' | 'inapp'
  summary: string
}

export const browserPlatform: Platform = {
  permission() {
    if (typeof Notification === 'undefined') return 'unsupported'
    return Notification.permission as Permission
  },
  async request() {
    if (typeof Notification === 'undefined') return 'unsupported'
    try { return (await Notification.requestPermission()) as Permission } catch { return 'denied' }
  },
  async show({ title, body, tag, route }) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.()
      const opts = { body, tag, icon: `${import.meta.env.BASE_URL}icon-192.png`, data: { route } }
      if (reg?.showNotification) await reg.showNotification(title, opts)
      else new Notification(title, opts)
      return true
    } catch { return false }
  },
}

export function describeCapability(platform: Platform): Capability {
  const permission = platform.permission()
  const system = permission === 'granted'
  const summary =
    permission === 'unsupported' ? 'Ce navigateur ne propose pas de notifications système. Level affiche vos rappels dans l’application.'
    : permission === 'denied' ? 'Les notifications système sont refusées dans ce navigateur. Level affiche vos rappels dans l’application ; vous pouvez réautoriser depuis les réglages du navigateur.'
    : permission === 'default' ? 'Les notifications système ne sont pas encore autorisées. En attendant, vos rappels s’affichent dans l’application.'
    : 'Notifications système actives tant que Level est ouvert (même en arrière-plan). Application fermée, aucune remise n’est garantie : les rappels manqués vous attendent dans la boîte de réception à l’ouverture.'
  return { permission, system, backgroundDelivery: false, mode: system ? 'system' : 'inapp', summary }
}

const defaultDeps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }
const KEEP = 200

export function createNotificationService(database: LevelDB = db, deps: ServiceDeps = defaultDeps, platform: Platform = browserPlatform) {
  const { now, id } = deps
  const prefs = createPrefsService(database)
  let running = false

  async function record(c: Pick<Candidate, 'key' | 'category' | 'title' | 'body' | 'route'>, channel: NotificationLogEntry['channel']): Promise<NotificationLogEntry> {
    const entry: NotificationLogEntry = { id: id(), key: c.key, category: c.category, title: c.title, body: c.body, route: c.route, at: now().toISOString(), channel, read: false }
    await database.notificationLog.add(entry)
    const count = await database.notificationLog.count()
    if (count > KEEP) {
      const old = await database.notificationLog.orderBy('at').limit(count - KEEP).primaryKeys()
      await database.notificationLog.bulkDelete(old)
    }
    return entry
  }

  return {
    capability: () => describeCapability(platform),
    requestPermission: () => platform.request(),

    /**
     * Évalue les rappels. `ctx.prefs` et `ctx.seen` sont fournis par l'appelant (état courant). Retourne la notification émise, s'il y en a une.
     * Un tick concurrent est ignoré (pas de rafale).
     */
    async tick(ctx: NotifContext): Promise<NotificationLogEntry | null> {
      if (running) return null
      running = true
      try {
        const log = await database.notificationLog.toArray()
        const real = log.filter((l) => !l.key.startsWith('test:'))
        const today = dayKey(ctx.now)
        const sentToday = real.filter((l) => dayKey(new Date(l.at)) === today)
        const last = real.map((l) => l.at).sort().pop()
        const list = candidates(ctx)
        const sentKeys = new Set(real.map((l) => l.key))
        const [pick] = selectNotifications(list, { now: ctx.now, prefs: ctx.prefs, sentKeys, sentToday: sentToday.length, lastSentAt: last ? new Date(last) : null })
        let entry: NotificationLogEntry | null = null
        if (pick) {
          const shown = await platform.show({ title: pick.title, body: pick.body, tag: pick.key, route: pick.route })
          entry = await record(pick, shown ? 'system' : 'inapp')
          sentKeys.add(pick.key)
        }
        // Niveaux « vus » : on les met à jour quand plus aucune annonce de progression n'est en attente (jamais perdue pendant la tranquillité).
        const pendingProgress = list.some((c) => c.category === 'progress' && !sentKeys.has(c.key) && ctx.prefs.categories.progress && ctx.prefs.enabled)
        if (!ctx.seen || !pendingProgress) {
          const same = ctx.seen && JSON.stringify(ctx.seen) === JSON.stringify(ctx.levels)
          if (!same) await prefs.update((p) => ({ ...p, seen: ctx.levels }))
        }
        return entry
      } finally {
        running = false
      }
    },

    /** Notification d'essai : ne compte ni dans le plafond ni dans la déduplication. */
    async sendTest(): Promise<NotificationLogEntry> {
      const c = { key: `test:${now().getTime()}`, category: 'fixed' as const, title: 'Notification d’essai', body: 'Si vous lisez ceci, les rappels de Level fonctionnent sur cet appareil.', route: '/profile' }
      const shown = await platform.show({ title: c.title, body: c.body, tag: c.key, route: c.route })
      return record(c, shown ? 'system' : 'inapp')
    },

    markRead: async (entryId: string) => { await database.notificationLog.update(entryId, { read: true }) },
    markAllRead: async () => { await database.notificationLog.toCollection().modify({ read: true }) },
    clear: async () => { await database.notificationLog.clear() },
  }
}

export const notificationService = createNotificationService()
