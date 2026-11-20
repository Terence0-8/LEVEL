import { dayKey } from './dates'
import { PROPOSALS_PER_PRESTIGE, XP_BONUS_CONFIG } from './progressionConfig'
import type { Difficulty } from './quest'
import type { Domain } from './types'

/**
 * Catalogue de récompenses de prestige. EXTENSIBLE : ajouter une entrée dans `STATIC_REWARDS` (ou une famille générée) suffit.
 * Jamais de doublon : une récompense obtenue (même identifiant) n'est plus proposée ; si le catalogue est épuisé pour un domaine,
 * le prestige se fait sans récompense plutôt que d'en inventer une.
 */
export type RewardCategory = 'progression' | 'title' | 'cosmetic' | 'content'
export const REWARD_CATEGORY_LABEL: Record<RewardCategory, string> = { progression: 'Bonus de progression', title: 'Titre exclusif', cosmetic: 'Personnalisation', content: 'Contenu exclusif' }
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Commun', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire' }

export interface Challenge { id: string; title: string; description: string; effortMinutes: number; difficulty: Difficulty; categoryId: string }
export type RewardEffect =
  | { type: 'xp-bonus'; domain: Domain; pct: number; tier: number }
  | { type: 'title'; title: string }
  | { type: 'levelup-effect'; css: string }
  | { type: 'rank-frame'; css: string }
  | { type: 'challenges'; challenges: Challenge[] }

export interface RewardDef {
  id: string
  category: RewardCategory
  /** Domaine pour lequel elle est proposée ('ANY' : les deux) */
  domain: Domain | 'ANY'
  name: string
  description: string
  rarity: Rarity
  effect: RewardEffect
  /** Palier précédent à posséder (bonus dégressifs : un palier à la fois) */
  requires?: string
}

const tierPct = (tier: number) => Math.round(XP_BONUS_CONFIG.firstTierPct * Math.pow(XP_BONUS_CONFIG.decay, tier - 1) * 10) / 10
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

const xpTiers = (domain: Domain): RewardDef[] => Array.from({ length: XP_BONUS_CONFIG.maxTiers }, (_, i) => {
  const tier = i + 1
  const pct = tierPct(tier)
  return {
    id: `xp-${domain.toLowerCase()}-${tier}`, category: 'progression', domain, name: `Élan ${domain} ${ROMAN[i]}`,
    description: `+${pct} % d’XP ${domain} sur les validations des jours suivants (cumulatif, de moins en moins élevé). Aucun gain passé n’est modifié.`,
    rarity: tier <= 2 ? 'rare' : 'epic', effect: { type: 'xp-bonus', domain, pct, tier }, requires: tier > 1 ? `xp-${domain.toLowerCase()}-${tier - 1}` : undefined,
  } satisfies RewardDef
})

const ch = (id: string, title: string, description: string, effortMinutes: number, difficulty: Difficulty, categoryId: string): Challenge => ({ id, title, description, effortMinutes, difficulty, categoryId })

export const STATIC_REWARDS: RewardDef[] = [
  { id: 'title-life-cartographer', category: 'title', domain: 'LIFE', name: 'Cartographe de vie', description: 'Titre à afficher sur votre profil.', rarity: 'rare', effect: { type: 'title', title: 'Cartographe de vie' } },
  { id: 'title-life-architect', category: 'title', domain: 'LIFE', name: 'Architecte des jours', description: 'Titre à afficher sur votre profil.', rarity: 'epic', effect: { type: 'title', title: 'Architecte des jours' } },
  { id: 'title-life-sage', category: 'title', domain: 'LIFE', name: 'Sage des projets', description: 'Titre à afficher sur votre profil.', rarity: 'epic', effect: { type: 'title', title: 'Sage des projets' } },
  { id: 'title-sport-forger', category: 'title', domain: 'SPORT', name: 'Forgeron de souffle', description: 'Titre à afficher sur votre profil.', rarity: 'rare', effect: { type: 'title', title: 'Forgeron de souffle' } },
  { id: 'title-sport-keeper', category: 'title', domain: 'SPORT', name: 'Gardien du rythme', description: 'Titre à afficher sur votre profil.', rarity: 'epic', effect: { type: 'title', title: 'Gardien du rythme' } },
  { id: 'title-sport-tempered', category: 'title', domain: 'SPORT', name: 'Trempé', description: 'Titre à afficher sur votre profil.', rarity: 'epic', effect: { type: 'title', title: 'Trempé' } },
  { id: 'title-any-returned', category: 'title', domain: 'ANY', name: 'Revenu de l’autre rive', description: 'Titre rare des esprits qui recommencent plus fort.', rarity: 'legendary', effect: { type: 'title', title: 'Revenu de l’autre rive' } },
  { id: 'fx-halo', category: 'cosmetic', domain: 'ANY', name: 'Halo champagne', description: 'Effet de montée de niveau : un halo doré s’élargit autour du nouveau niveau.', rarity: 'rare', effect: { type: 'levelup-effect', css: 'fxHalo' } },
  { id: 'fx-embers', category: 'cosmetic', domain: 'ANY', name: 'Braises dorées', description: 'Effet de montée de niveau : de fines braises s’élèvent.', rarity: 'epic', effect: { type: 'levelup-effect', css: 'fxEmbers' } },
  { id: 'frame-obsidian', category: 'cosmetic', domain: 'ANY', name: 'Cadre obsidienne', description: 'Apparence de rang : liseré obsidienne sur la carte de niveau.', rarity: 'rare', effect: { type: 'rank-frame', css: 'frameObsidian' } },
  { id: 'frame-gilded', category: 'cosmetic', domain: 'ANY', name: 'Cadre or champagne', description: 'Apparence de rang : double liseré or champagne sur la carte de niveau.', rarity: 'epic', effect: { type: 'rank-frame', css: 'frameGilded' } },
  { id: 'pack-life-focus', category: 'content', domain: 'LIFE', name: 'Défis de concentration', description: 'Trois défis facultatifs, à ajouter comme de vraies quêtes (leur XP vient des quêtes, rien de plus).', rarity: 'rare',
    effect: { type: 'challenges', challenges: [
      ch('c-focus-1', 'Une heure sans distraction', 'Une plage de travail profond, notifications coupées.', 60, 'normal', 'cat-pro'),
      ch('c-focus-2', 'Ranger son espace de travail', 'Un bureau net pour repartir sereinement.', 30, 'easy', 'cat-perso'),
      ch('c-focus-3', 'Planifier la semaine suivante', 'Trois priorités claires, pas plus.', 30, 'normal', 'cat-perso'),
    ] } },
  { id: 'pack-life-master', category: 'content', domain: 'LIFE', name: 'Objectifs de maîtrise', description: 'Trois défis de long souffle, à ajouter comme de vraies quêtes si l’envie y est.', rarity: 'epic',
    effect: { type: 'challenges', challenges: [
      ch('c-master-1', 'Terminer un chantier en attente', 'Choisissez le projet qui traîne et finalisez-le.', 120, 'hard', 'cat-projets'),
      ch('c-master-2', 'Apprendre une compétence nouvelle', 'Une session d’initiation sérieuse.', 90, 'hard', 'cat-culture'),
      ch('c-master-3', 'Faire le point financier', 'Revoir budget et épargne, décider une action.', 60, 'normal', 'cat-finances'),
    ] } },
  { id: 'pack-sport-care', category: 'content', domain: 'SPORT', name: 'Défis de souplesse', description: 'Trois défis doux, à ajouter comme quêtes (sans pression de performance).', rarity: 'rare',
    effect: { type: 'challenges', challenges: [
      ch('c-care-1', 'Vingt minutes d’étirements', 'Séance calme, sans objectif de performance.', 20, 'easy', 'cat-hygiene'),
      ch('c-care-2', 'Marche de récupération', 'Une marche tranquille de 30 minutes.', 30, 'easy', 'cat-hygiene'),
      ch('c-care-3', 'Bilan de la semaine sportive', 'Relire sensations, fatigue et envies.', 15, 'easy', 'cat-perso'),
    ] } },
  { id: 'pack-sport-craft', category: 'content', domain: 'SPORT', name: 'Objectifs de technique', description: 'Trois défis de qualité, à ajouter comme quêtes.', rarity: 'epic',
    effect: { type: 'challenges', challenges: [
      ch('c-craft-1', 'Filmer un mouvement et le corriger', 'Observer sa technique sans charge lourde.', 30, 'normal', 'cat-hygiene'),
      ch('c-craft-2', 'Apprendre un nouvel exercice', 'Sur la bibliothèque, avec une charge légère.', 30, 'normal', 'cat-hygiene'),
      ch('c-craft-3', 'Préparer son matériel et son créneau', 'Un cadre simple pour la semaine.', 20, 'easy', 'cat-perso'),
    ] } },
]

export const REWARD_CATALOG: RewardDef[] = [...xpTiers('LIFE'), ...xpTiers('SPORT'), ...STATIC_REWARDS]
export const REWARD_BY_ID: Record<string, RewardDef> = Object.fromEntries(REWARD_CATALOG.map((r) => [r.id, r]))

/** Une récompense obtenue (table `rpgRewards`, clé = identifiant du catalogue : impossible de l'obtenir deux fois). */
export interface RewardRow { id: string; acquiredAt: string; prestigeId: string | null; domain: Domain | null; category: RewardCategory }

// ── Bonus d'XP ────────────────────────────────────────────────────────
/**
 * Bonus d'XP (points de %) en vigueur un jour donné pour un domaine : somme des bonus possédés, appliquée À PARTIR DU LENDEMAIN
 * de l'obtention. Ainsi, aucun gain déjà inscrit (même du jour du prestige) n'est jamais réévalué.
 */
export function xpBonusPct(domain: Domain, owned: RewardRow[], day: string): number {
  let pct = 0
  for (const r of owned) {
    const def = REWARD_BY_ID[r.id]
    if (def?.effect.type === 'xp-bonus' && def.effect.domain === domain && dayKey(new Date(r.acquiredAt)) < day) pct += def.effect.pct
  }
  return Math.round(pct * 10) / 10
}
export const applyBonus = (amount: number, pct: number) => (pct > 0 ? Math.round(amount * (1 + pct / 100)) : amount)
export const totalBonusPct = (domain: Domain, owned: RewardRow[]) => xpBonusPct(domain, owned, '9999-12-31')

// ── Propositions ──────────────────────────────────────────────────────
function seeded(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  let a = h >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const shuffle = <T,>(xs: T[], rnd: () => number) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

/** Récompenses encore disponibles pour un domaine (non obtenues, palier précédent possédé). */
export function availableRewards(domain: Domain, ownedIds: Set<string>, catalog: RewardDef[] = REWARD_CATALOG): RewardDef[] {
  return catalog.filter((r) => (r.domain === domain || r.domain === 'ANY') && !ownedIds.has(r.id) && (!r.requires || ownedIds.has(r.requires)))
}

/**
 * Propositions d'un prestige : mélangées, de catégories différentes, sans doublon et sans récompense déjà obtenue.
 * DÉTERMINISTES (graine = domaine + numéro + récompenses déjà possédées) : les mêmes propositions s'affichent avant et pendant la confirmation.
 */
export function proposeRewards(domain: Domain, number: number, ownedIds: Set<string>, catalog: RewardDef[] = REWARD_CATALOG): RewardDef[] {
  const rnd = seeded(`${domain}:${number}:${[...ownedIds].sort().join(',')}`)
  const byCat = new Map<RewardCategory, RewardDef[]>()
  for (const r of availableRewards(domain, ownedIds, catalog)) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r])
  const picks = shuffle([...byCat.keys()], rnd).slice(0, PROPOSALS_PER_PRESTIGE).map((c) => { const list = byCat.get(c)!; return list[Math.floor(rnd() * list.length)] })
  return shuffle(picks, rnd)
}
