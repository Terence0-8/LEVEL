import { ALL_ATTRIBUTE_IDS } from './attributes'
import { auditLedger, totalXp, xpByAttribute, xpByDomain, type XpEvent } from './ledger'
import { computeProgression } from './progression'
import { rankForLevel } from './rank'
import { levelFromXp } from './xp'
import { cycleStates, prestigesOf, type PrestigeRecord } from './prestige'
import { domainRank } from './progressionConfig'
import { REWARD_BY_ID, type RewardRow } from './prestigeRewards'
import { ACHIEVEMENT_BY_ID, type AchievementRow } from './achievements'

/**
 * Contrôle de cohérence du RPG transversal (LIFE + SPORT), recalculé depuis le journal. Aucun nouveau moteur :
 * il vérifie les règles — XP LIFE et SPORT indépendantes, 1 XP LIFE = 1 XP SPORT pour le niveau global, aucun double comptage,
 * niveaux et rangs indépendants par domaine, attributs cohérents avec le journal.
 */
export interface RpgCheck { id: string; label: string; ok: boolean; detail?: string }
export interface RpgAudit { ok: boolean; checks: RpgCheck[]; /** Fonctionnalités annoncées mais non développées (informatif, n'échoue jamais) */ notImplemented: string[] }

export function auditRpg(events: XpEvent[], prestiges: PrestigeRecord[] = [], rewards: RewardRow[] = [], achievements: AchievementRow[] = []): RpgAudit {
  const checks: RpgCheck[] = []
  const add = (id: string, label: string, ok: boolean, detail?: string) => checks.push({ id, label, ok, detail })
  const p = computeProgression(events, prestiges)
  const cy = cycleStates(events, prestiges)
  const dom = xpByDomain(events)
  const total = totalXp(events)

  const crossLife = events.filter((e) => e.domain === 'LIFE' && e.awardKey.startsWith('sport:'))
  const crossSport = events.filter((e) => e.domain === 'SPORT' && !e.awardKey.startsWith('sport:'))
  add('independence', 'XP LIFE et SPORT indépendantes (aucun événement dans le mauvais domaine)', crossLife.length === 0 && crossSport.length === 0, crossLife.length + crossSport.length ? `${crossLife.length + crossSport.length} événement(s) mal rattaché(s)` : undefined)
  add('global', 'XP globale = XP LIFE + XP SPORT (1 XP LIFE = 1 XP SPORT)', p.totalXp === dom.LIFE + dom.SPORT && p.totalXp === total, `${dom.LIFE} + ${dom.SPORT} = ${total}`)
  add('levels', 'Niveaux calculés séparément par domaine', p.life.level === cy.LIFE.level.level && p.sportLevel.level === cy.SPORT.level.level && p.global.level === levelFromXp(total).level, `LIFE ${p.life.level} · SPORT ${p.sportLevel.level} · global ${p.global.level}`)
  add('ranks', 'Rangs indépendants par domaine', p.lifeRank?.rank === domainRank(p.life.level).rank && p.sportRank?.rank === domainRank(p.sportLevel.level).rank && p.rank.rank === rankForLevel(p.global.level).rank, `global ${p.rank.rank} · LIFE ${p.lifeRank?.rank} · SPORT ${p.sportRank?.rank}`)
  const seq = (['LIFE', 'SPORT'] as const).every((d) => prestigesOf(prestiges, d).every((x, i) => x.number === i + 1 && x.id === `prestige:${d}:${i + 1}` && x.domain === d))
  add('prestige-sequence', 'Prestiges numérotés sans trou ni doublon, par domaine', seq)
  add('prestige-cycles', 'XP de cycle cohérente (jamais négative, jamais supérieure à l’XP totale du domaine)', (['LIFE', 'SPORT'] as const).every((d) => cy[d].cycleXp >= 0 && cy[d].cycleXp <= Math.max(0, cy[d].totalXp) + (cy[d].totalXp < 0 ? -cy[d].totalXp : 0)))
  const ids = rewards.map((r) => r.id)
  add('rewards-unique', 'Récompenses uniques et connues du catalogue (aucun doublon)', new Set(ids).size === ids.length && ids.every((i) => !!REWARD_BY_ID[i]))
  const aids = achievements.map((a) => a.id)
  add('achievements-unique', 'Succès uniques et connus du catalogue', new Set(aids).size === aids.length && aids.every((i) => !!ACHIEVEMENT_BY_ID[i]))
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
    notImplemented: [],
  }
}
