import { buildAttributes } from './attributes'
import { totalXp, xpByAttribute, xpByCategory, xpByDomain, type XpEvent } from './ledger'
import { rankForLevel } from './rank'
import type { Activity, Attribute } from './types'
import { levelFromXp } from './xp'

/** Forme commune de la progression (réelle ou de démonstration) consommée par l'UI. */
export interface ProgressSummary {
  totalXp: number
  global: ReturnType<typeof levelFromXp>
  rank: ReturnType<typeof rankForLevel>
  /** Rangs INDÉPENDANTS par domaine (chacun selon le niveau de son domaine) */
  lifeRank?: ReturnType<typeof rankForLevel>
  sportRank?: ReturnType<typeof rankForLevel>
  life: ReturnType<typeof levelFromXp> & { xp: number }
  sportLevel: ReturnType<typeof levelFromXp> & { xp: number }
  attributes: Attribute[]
  activities: Activity[]
}

/** Recalcule TOUTE la progression à partir du journal. */
export function computeProgression(events: XpEvent[]): ProgressSummary & { byCategory: Record<string, number> } {
  const dom = xpByDomain(events)
  const total = totalXp(events)
  const global = levelFromXp(total)
  return {
    totalXp: total,
    global,
    rank: rankForLevel(global.level),
    lifeRank: rankForLevel(levelFromXp(dom.LIFE).level),
    sportRank: rankForLevel(levelFromXp(dom.SPORT).level),
    life: { xp: dom.LIFE, ...levelFromXp(dom.LIFE) },
    sportLevel: { xp: dom.SPORT, ...levelFromXp(dom.SPORT) },
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
