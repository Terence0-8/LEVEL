import type { XpEvent } from './ledger'
import { DOMAIN_LADDER, domainLevel, domainRank, domainXpToMax, xpScaleForCycle, type RankInfo } from './progressionConfig'
import type { Domain, LevelProgress } from './types'

/**
 * Prestige LIFE / SPORT, indépendants. Le journal d'XP n'est JAMAIS modifié : un cycle est une FENÊTRE du journal.
 * L'XP d'un cycle = somme des événements du domaine enregistrés (`recordedAt`) APRÈS le dernier prestige du domaine ;
 * une correction (annulation) compte dans le cycle de l'événement d'origine. Niveau, rang et attributs se recalculent donc toujours.
 * Le niveau global (LIFE + SPORT, tout l'historique) n'est pas concerné.
 */
export interface PrestigeRecord {
  /** `prestige:<DOMAINE>:<numéro>` — clé unique : impossible d'enregistrer deux fois le même prestige */
  id: string
  domain: Domain
  /** 1, 2, 3… : numéro de CE prestige */
  number: number
  /** ISO : instant de la confirmation */
  at: string
  /** Cycle terminé par ce prestige (= number) */
  cycle: number
  levelBefore: number
  rankBefore: string
  /** XP du cycle terminé */
  cycleXp: number
  /** XP totale du domaine (tout l'historique) à cet instant */
  totalXpBefore: number
  rewardId: string | null
  rewardName: string | null
  /** Bonus d'XP (en points de %) acquis par ce prestige, 0 si la récompense n'est pas un bonus */
  bonusGainedPct: number
  /** Paramètres du NOUVEAU cycle */
  nextXpScale: number
  nextXpToMax: number
}

export const prestigeId = (domain: Domain, number: number) => `prestige:${domain}:${number}`
export const prestigesOf = (list: PrestigeRecord[], domain: Domain) => list.filter((p) => p.domain === domain).sort((a, b) => a.number - b.number)

export interface CycleState {
  domain: Domain
  /** Cycle courant (1 sans prestige) */
  cycle: number
  prestigeCount: number
  /** Multiplicateur d'XP requise du cycle */
  scale: number
  /** XP du cycle courant */
  cycleXp: number
  /** XP du domaine, tout l'historique */
  totalXp: number
  level: LevelProgress
  rank: RankInfo
  /** Dernier niveau du rang SSS atteint : prestige proposé (facultatif) */
  eligible: boolean
  nextNumber: number
  /** XP de cycle pour atteindre le dernier niveau */
  xpToMax: number
  since: string | null
}

/** Cycle de chaque événement : un gain compte dans la fenêtre de son enregistrement, une annulation dans celle de l'événement annulé. */
function stamp(e: XpEvent, byId: Map<string, XpEvent>): string {
  const origin = e.kind === 'reversal' && e.correctsEventId ? byId.get(e.correctsEventId) : undefined
  return (origin ?? e).recordedAt || (origin ?? e).at
}

export function cycleStates(events: XpEvent[], prestiges: PrestigeRecord[]): Record<Domain, CycleState> {
  const byId = new Map(events.map((e) => [e.id, e]))
  const out = {} as Record<Domain, CycleState>
  for (const domain of ['LIFE', 'SPORT'] as const) {
    const mine = prestigesOf(prestiges, domain)
    const last = mine[mine.length - 1]
    const since = last?.at ?? null
    let cycleXp = 0, totalXp = 0
    for (const e of events) {
      if (e.domain !== domain) continue
      totalXp += e.amount
      if (!since || stamp(e, byId) > since) cycleXp += e.amount
    }
    cycleXp = Math.max(0, cycleXp)
    const cycle = mine.length + 1
    const level = domainLevel(cycleXp, cycle)
    out[domain] = {
      domain, cycle, prestigeCount: mine.length, scale: xpScaleForCycle(cycle), cycleXp, totalXp, level, rank: domainRank(level.level),
      eligible: level.level >= DOMAIN_LADDER.maxLevel, nextNumber: mine.length + 1, xpToMax: domainXpToMax(cycle), since,
    }
  }
  return out
}

/** Ce que le prestige conserve et réinitialise (affiché tel quel avant confirmation). */
export const PRESTIGE_KEEPS = [
  'Tout l’historique d’XP (le journal n’est jamais modifié)',
  'Les attributs et leurs valeurs',
  'Les statistiques, performances et records',
  'Les objectifs, projets, quêtes, indicateurs et séances',
  'Les récompenses, titres et succès déjà obtenus',
  'L’autre domaine, strictement inchangé',
]
export const prestigeResets = (domain: Domain) => [
  `Le niveau et la progression ${domain} repartent au niveau 1 (rang E) pour le nouveau cycle`,
]
