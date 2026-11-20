import { evaluateAchievements, type AchievementRow } from '@/core/achievements'
import { normalizeEvent } from '@/core/ledger'
import { cycleStates, prestigeId, type PrestigeRecord } from '@/core/prestige'
import { proposeRewards, REWARD_BY_ID } from '@/core/prestigeRewards'
import { xpScaleForCycle, domainXpToMax } from '@/core/progressionConfig'
import type { Domain } from '@/core/types'
import { db, type LevelDB } from './db'
import type { ServiceDeps } from './questService'

/**
 * Commandes RPG : prestige, récompenses, succès. Ce service n'écrit JAMAIS dans `xpEvents` (le prestige est un enregistrement
 * d'historique : le journal d'XP n'est ni modifié ni supprimé). Toutes les règles sont revérifiées ici, pas seulement dans l'interface.
 */
export type RpgErrorCode = 'not_eligible' | 'invalid_reward' | 'duplicate' | 'reward_required'
export class RpgError extends Error {
  constructor(public code: RpgErrorCode, message: string) { super(message) }
}

const defaultDeps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }

export function createRpgService(database: LevelDB = db, deps: ServiceDeps = defaultDeps) {
  const { now } = deps
  const stamp = () => now().toISOString()

  return {
    /**
     * Prestige d'UN domaine, en une seule transaction : éligibilité, choix de récompense valide, numéro unique, enregistrement du
     * prestige ET de la récompense. Si une étape échoue, rien n'est écrit (aucun domaine partiellement réinitialisé).
     * `rewardId` doit figurer parmi les propositions du moment ; null seulement si le catalogue est épuisé pour ce domaine.
     */
    prestige: (domain: Domain, rewardId: string | null): Promise<PrestigeRecord> =>
      database.transaction('rw', [database.xpEvents, database.prestiges, database.rpgRewards], async () => {
        const events = (await database.xpEvents.toArray()).map(normalizeEvent)
        const prestiges = await database.prestiges.toArray()
        const owned = await database.rpgRewards.toArray()
        const st = cycleStates(events, prestiges)[domain]
        if (!st.eligible) throw new RpgError('not_eligible', `Le prestige ${domain} n’est pas disponible : le dernier niveau du rang SSS n’est pas atteint.`)
        const number = st.nextNumber
        const id = prestigeId(domain, number)
        if (await database.prestiges.get(id)) throw new RpgError('duplicate', 'Ce prestige est déjà enregistré.')
        const proposals = proposeRewards(domain, number, new Set(owned.map((r) => r.id)))
        if (proposals.length && !rewardId) throw new RpgError('reward_required', 'Choisissez une récompense avant de confirmer.')
        if (rewardId && !proposals.some((p) => p.id === rewardId)) throw new RpgError('invalid_reward', 'Cette récompense n’est pas proposée pour ce prestige.')
        const def = rewardId ? REWARD_BY_ID[rewardId] : null
        const at = stamp()
        const record: PrestigeRecord = {
          id, domain, number, at, cycle: number, levelBefore: st.level.level, rankBefore: st.rank.rank, cycleXp: st.cycleXp, totalXpBefore: st.totalXp,
          rewardId: def?.id ?? null, rewardName: def?.name ?? null, bonusGainedPct: def?.effect.type === 'xp-bonus' ? def.effect.pct : 0,
          nextXpScale: xpScaleForCycle(number + 1), nextXpToMax: domainXpToMax(number + 1),
        }
        await database.prestiges.add(record)
        if (def) await database.rpgRewards.add({ id: def.id, acquiredAt: at, prestigeId: id, domain, category: def.category })
        return record
      }),

    /** Débloque les succès dont la condition est vérifiée. Jamais deux fois ; la date d'obtention d'un succès n'est jamais modifiée. */
    syncAchievements: () =>
      database.transaction('rw', [database.xpEvents, database.sportSessions, database.recoveryChecks, database.goals, database.projects, database.indicators, database.indicatorReadings, database.prestiges, database.achievements], async () => {
        const [events, sessions, checks, goals, projects, indicators, readings, prestiges, known] = await Promise.all([
          database.xpEvents.toArray(), database.sportSessions.toArray(), database.recoveryChecks.toArray(), database.goals.toArray(), database.projects.toArray(),
          database.indicators.toArray(), database.indicatorReadings.toArray(), database.prestiges.toArray(), database.achievements.toArray(),
        ])
        const evs = events.map(normalizeEvent)
        const have = new Set(known.map((a) => a.id))
        const ids = evaluateAchievements({ events: evs, sessions, checks, goals, projects, indicators, readings, prestiges, cycles: cycleStates(evs, prestiges), now: now() })
        const fresh: AchievementRow[] = ids.filter((i) => !have.has(i)).map((id) => ({ id, unlockedAt: stamp() }))
        if (fresh.length) await database.achievements.bulkAdd(fresh)
        return fresh
      }),
  }
}

export const rpgService = createRpgService()
