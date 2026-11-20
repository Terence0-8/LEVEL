import { normalizeEvent } from '@/core/ledger'
import { detectEvents, type RpgEvent } from '@/core/rpgEvents'
import { snoozeUntil, type Recommendation, type RecDecision, type RecState } from '@/core/recommendations'
import { defaultProfile } from '@/core/sport/profile'
import { db, type LevelDB } from './db'
import type { ServiceDeps } from './questService'

/**
 * Journal RPG et décisions sur les recommandations. Les événements sont RECALCULÉS depuis les faits (`detectEvents`, pur) ; le service n'inscrit
 * que les clés manquantes (jamais de doublon, même si la synchronisation tourne deux fois en parallèle : clé primaire = clé déterministe).
 * Il n'écrit JAMAIS dans `xpEvents`. Un événement n'est jamais supprimé : après une correction qui contredit le fait, il est « révoqué »
 * (visible et signalé), et redevient valide si le fait redevient vrai. Les événements d'une période passée gardent leur date d'origine.
 */
const defaultDeps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }
/** Événements qui décrivent un instant (ex. « échéance proche ») : ils ne sont pas révoqués quand l'instant est passé */
const PERMANENT_TYPES = new Set(['goal-due-soon'])
const INIT_KEY = 'rpgEventsInit'

export function createEventService(database: LevelDB = db, deps: ServiceDeps = defaultDeps) {
  const { now } = deps
  const stamp = () => now().toISOString()
  const tables = () => [database.xpEvents, database.prestiges, database.rpgRewards, database.achievements, database.quests, database.goals, database.projects, database.indicators, database.indicatorReadings, database.sportSessions, database.recoveryChecks, database.sportProfile, database.customExercises, database.rpgEvents, database.settings]

  return {
    /** Synchronise le journal avec les faits actuels. Retourne les événements créés. */
    sync: (): Promise<RpgEvent[]> => database.transaction('rw', tables(), async () => {
      const [xp, prestiges, rewards, achievements, quests, goals, projects, indicators, readings, sessions, checks, profile, custom, existing] = await Promise.all([
        database.xpEvents.toArray(), database.prestiges.toArray(), database.rpgRewards.toArray(), database.achievements.toArray(), database.quests.toArray(), database.goals.toArray(),
        database.projects.toArray(), database.indicators.toArray(), database.indicatorReadings.toArray(), database.sportSessions.toArray(), database.recoveryChecks.toArray(),
        database.sportProfile.get('me'), database.customExercises.toArray(), database.rpgEvents.toArray(),
      ])
      // Première synchronisation (mise à jour d'une version antérieure ou restauration d'une ancienne sauvegarde) : l'historique est reconstitué
      // sans être présenté comme « nouveau ». Sur une installation neuve, le drapeau est posé dès la première synchronisation (même sans donnée) :
      // les premiers faits sont alors de vrais nouveaux événements.
      const initialized = await database.settings.get(INIT_KEY)
      const target = (profile ?? defaultProfile('')).availability.strengthPerWeek
      const candidates = detectEvents({ events: xp.map(normalizeEvent), prestiges, rewards, achievements, quests, goals, projects, indicators, readings, sessions, checks, sportTarget: target, now: now(), custom })
      const have = new Map(existing.map((e) => [e.id, e]))
      const firstRun = !initialized
      const at = stamp()
      const created: RpgEvent[] = []
      const seen = new Set<string>()
      for (const c of candidates) {
        seen.add(c.id)
        const cur = have.get(c.id)
        if (!cur) created.push({ ...c, seenAt: firstRun ? at : null, revokedAt: null, backfill: firstRun, createdAt: at })
        else if (cur.revokedAt) await database.rpgEvents.update(cur.id, { revokedAt: null })
      }
      if (created.length) await database.rpgEvents.bulkAdd(created)
      if (!initialized) await database.settings.put({ key: INIT_KEY, value: at })
      for (const e of existing) if (!seen.has(e.id) && !e.revokedAt && !PERMANENT_TYPES.has(e.type)) await database.rpgEvents.update(e.id, { revokedAt: at })
      return created
    }),

    /** Consultation : l'événement reste dans l'historique. */
    markSeen: async (id: string) => { const e = await database.rpgEvents.get(id); if (e && !e.seenAt) await database.rpgEvents.update(id, { seenAt: stamp() }) },
    markAllSeen: () => database.transaction('rw', database.rpgEvents, async () => { const at = stamp(); await database.rpgEvents.filter((e) => !e.seenAt).modify({ seenAt: at }) }),

    /** Décision de l'utilisateur sur une recommandation (acceptée, refusée, reportée, ignorée). N'applique rien par elle-même. */
    decide: async (rec: Pick<Recommendation, 'id' | 'signature'>, status: RecDecision): Promise<RecState> => {
      const s: RecState = { id: rec.id, status, signature: rec.signature, at: stamp(), snoozeUntil: status === 'snoozed' ? snoozeUntil(now(), 7) : null }
      await database.recommendationStates.put(s)
      return s
    },
    resetDecision: async (id: string) => { await database.recommendationStates.delete(id) },
  }
}

export const eventService = createEventService()
