import { ALL_ATTRIBUTE_IDS } from './attributes'
import { auditLedger, totalXp, xpByAttribute, xpByDomain, type XpEvent } from './ledger'
import { computeProgression } from './progression'
import { rankForLevel } from './rank'
import { levelFromXp } from './xp'

/**
 * Contrôle de cohérence du RPG transversal (LIFE + SPORT), recalculé depuis le journal. Aucun nouveau moteur :
 * il vérifie les règles — XP LIFE et SPORT indépendantes, 1 XP LIFE = 1 XP SPORT pour le niveau global, aucun double comptage,
 * niveaux et rangs indépendants par domaine, attributs cohérents avec le journal.
 */
export interface RpgCheck { id: string; label: string; ok: boolean; detail?: string }
export interface RpgAudit { ok: boolean; checks: RpgCheck[]; /** Fonctionnalités annoncées mais non développées (informatif, n'échoue jamais) */ notImplemented: string[] }

export function auditRpg(events: XpEvent[]): RpgAudit {
  const checks: RpgCheck[] = []
  const add = (id: string, label: string, ok: boolean, detail?: string) => checks.push({ id, label, ok, detail })
  const p = computeProgression(events)
  const dom = xpByDomain(events)
  const total = totalXp(events)

  const crossLife = events.filter((e) => e.domain === 'LIFE' && e.awardKey.startsWith('sport:'))
  const crossSport = events.filter((e) => e.domain === 'SPORT' && !e.awardKey.startsWith('sport:'))
  add('independence', 'XP LIFE et SPORT indépendantes (aucun événement dans le mauvais domaine)', crossLife.length === 0 && crossSport.length === 0, crossLife.length + crossSport.length ? `${crossLife.length + crossSport.length} événement(s) mal rattaché(s)` : undefined)
  add('global', 'XP globale = XP LIFE + XP SPORT (1 XP LIFE = 1 XP SPORT)', p.totalXp === dom.LIFE + dom.SPORT && p.totalXp === total, `${dom.LIFE} + ${dom.SPORT} = ${total}`)
  add('levels', 'Niveaux calculés séparément par domaine', p.life.level === levelFromXp(dom.LIFE).level && p.sportLevel.level === levelFromXp(dom.SPORT).level && p.global.level === levelFromXp(total).level)
  add('ranks', 'Rangs indépendants par domaine', p.lifeRank?.rank === rankForLevel(p.life.level).rank && p.sportRank?.rank === rankForLevel(p.sportLevel.level).rank && p.rank.rank === rankForLevel(p.global.level).rank, `global ${p.rank.rank} · LIFE ${p.lifeRank?.rank} · SPORT ${p.sportRank?.rank}`)
  const ledger = auditLedger(events)
  add('double-count', 'Aucun double comptage (une seule récompense ouverte par clé, soldes cohérents)', ledger.length === 0, ledger.slice(0, 2).join(' ; ') || undefined)
  const sportBase = events.filter((e) => e.awardKey.endsWith(':base') && e.awardKey.startsWith('sport:session:') && e.kind === 'award' && e.status === 'valid')
  const sessions = new Set(sportBase.map((e) => e.sourceId))
  add('one-award-per-session', 'Une seule récompense de base ouverte par séance SPORT', sessions.size === sportBase.length)
  const attr = xpByAttribute(events)
  const attrSum = ALL_ATTRIBUTE_IDS.reduce((n, id) => n + (attr[id] ?? 0), 0)
  const unattributed = events.filter((e) => e.attribute === null).reduce((n, e) => n + e.amount, 0)
  add('attributes', 'Attributs cohérents avec le journal (somme des attributs + XP sans attribut = XP totale)', attrSum + unattributed === total, `${attrSum} + ${unattributed} = ${total}`)
  return {
    ok: checks.every((c) => c.ok), checks,
    notImplemented: ['Prestige LIFE et SPORT (indépendants) : annoncé, non développé ; le modèle par domaine est prêt à l’accueillir.'],
  }
}
