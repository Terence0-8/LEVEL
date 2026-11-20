import { buildAttributes } from './attributes'
import { totalXp, xpByAttribute, xpByCategory, xpByDomain, type XpEvent } from './ledger'
import { rankForLevel } from './rank'
import { cycleStates, type CycleState, type PrestigeRecord } from './prestige'
import type { Activity, Attribute } from './types'
import { levelFromXp } from './xp'
import { domainRank } from './progressionConfig'

/** Forme commune de la progression (réelle ou de démonstration) consommée par l'UI. */
export interface ProgressSummary {
  totalXp: number
  global: ReturnType<typeof levelFromXp>
  rank: ReturnType<typeof rankForLevel>
  /** Rangs INDÉPENDANTS par domaine (chacun selon le niveau de son domaine) */
  lifeRank?: ReturnType<typeof domainRank>
  sportRank?: ReturnType<typeof domainRank>
  /** Cycles de prestige par domaine (XP du cycle, échelle, éligibilité) */
  cycles?: Record<'LIFE' | 'SPORT', CycleState>
  /** Niveau du domaine DANS LE CYCLE courant ; `xp` = XP totale du domaine (tout l'historique) */
  life: ReturnType<typeof levelFromXp> & { xp: number }
  sportLevel: ReturnType<typeof levelFromXp> & { xp: number }
  attributes: Attribute[]
  activities: Activity[]
}

/** Recalcule TOUTE la progression à partir du journal. */
export function computeProgression(events: XpEvent[], prestiges: PrestigeRecord[] = []): ProgressSummary & { byCategory: Record<string, number> } {
  const dom = xpByDomain(events)
  const total = totalXp(events)
  const global = levelFromXp(total)
  const cycles = cycleStates(events, prestiges)
  return {
    totalXp: total,
    global,
    rank: rankForLevel(global.level),
    lifeRank: cycles.LIFE.rank,
    sportRank: cycles.SPORT.rank,
    cycles,
    life: { xp: dom.LIFE, ...cycles.LIFE.level },
    sportLevel: { xp: dom.SPORT, ...cycles.SPORT.level },
    attributes: buildAttributes(xpByAttribute(events)),
    activities: eventsToActivities(events),
    byCategory: xpByCategory(events),
  }
}

export function eventsToActivities(events: XpEvent[]): Activity[] {
  return [...events]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((e) => ({
      id: e.id,
      at: e.at,
      label: e.kind === 'reversal' ? `Correction : ${e.label}` : e.label,
      domain: e.domain,
      xp: e.amount,
      corrected: e.kind === 'award' && e.status === 'reversed',
    }))
}
