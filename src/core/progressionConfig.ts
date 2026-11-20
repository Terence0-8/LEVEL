import type { LevelProgress, Rank } from './types'
import { xpCostOfLevel } from './xp'

/**
 * CONFIGURATION CENTRALE de la progression RPG (V1.1). Toutes les valeurs ci-dessous sont PROVISOIRES et calibrables :
 * aucun seuil, coefficient ou bonus ne doit être codé ailleurs (composants, services).
 *
 * Analyse de l'existant : la courbe `100 · niveau^1,35` (xp.ts) est conservée telle quelle (aucun niveau déjà acquis ne change).
 * Elle rend le niveau 100 hors d'atteinte (≈ 2 M XP). Le niveau GLOBAL garde donc son échelle (1–100, règles inchangées) et reçoit
 * seulement deux rangs supplémentaires. Les niveaux de DOMAINE (LIFE, SPORT) ont une échelle plus courte (36 niveaux) pour que le
 * dernier niveau du rang SSS — condition du prestige — soit atteignable en quelques années : ≈ 193 000 XP, soit ≈ 3,5 ans à 150 XP/jour.
 */

export const RANK_ORDER: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS']
export const RANK_TITLES: Record<Rank, string> = { E: 'Éveillé', D: 'Initié', C: 'Aguerri', B: 'Vétéran', A: 'Élite', S: 'Souverain', SS: 'Sublime', SSS: 'Transcendant' }

export interface Ladder { maxLevel: number; /** Premier niveau de chaque rang */ minLevels: Record<Rank, number> }

/** Niveau global : échelle d'origine (E1 D10 C20 B35 A55 S80), prolongée par SS (90) et SSS (96). */
export const GLOBAL_LADDER: Ladder = { maxLevel: 100, minLevels: { E: 1, D: 10, C: 20, B: 35, A: 55, S: 80, SS: 90, SSS: 96 } }

/** Niveaux de domaine : 36 niveaux. E 1–5 · D 6–10 · C 11–15 · B 16–20 · A 21–25 · S 26–29 · SS 30–33 · SSS 34–36. */
export const DOMAIN_LADDER: Ladder = { maxLevel: 36, minLevels: { E: 1, D: 6, C: 11, B: 16, A: 21, S: 26, SS: 30, SSS: 34 } }

/** Prestige : chaque cycle augmente de +20 % l'XP requise par niveau (progressif, modéré, prévisible). Jamais d'effet sur les quêtes ou séances. */
export const PRESTIGE_CONFIG = { xpScaleStep: 0.2 }

/** Bonus d'XP permanents : 1er palier +5 %, puis chaque palier = 80 % du précédent (dégressif), 6 paliers au plus (≈ +18 % cumulés). */
export const XP_BONUS_CONFIG = { firstTierPct: 5, decay: 0.8, maxTiers: 6 }

/** Nombre maximal de récompenses proposées à chaque prestige (une par catégorie, mélangées). */
export const PROPOSALS_PER_PRESTIGE = 4

// ── Calculs ───────────────────────────────────────────────────────────
export interface RankInfo { rank: Rank; minLevel: number; title: string; next: { rank: Rank; minLevel: number; title: string } | null }

export function rankOn(level: number, ladder: Ladder): RankInfo {
  let idx = 0
  RANK_ORDER.forEach((r, i) => { if (level >= ladder.minLevels[r]) idx = i })
  const at = (i: number) => ({ rank: RANK_ORDER[i], minLevel: ladder.minLevels[RANK_ORDER[i]], title: RANK_TITLES[RANK_ORDER[i]] })
  return { ...at(idx), next: idx + 1 < RANK_ORDER.length ? at(idx + 1) : null }
}
export const domainRank = (level: number) => rankOn(level, DOMAIN_LADDER)

/** Échelle d'XP du cycle (1 = premier cycle, sans prestige). */
export const xpScaleForCycle = (cycle: number) => Math.round((1 + PRESTIGE_CONFIG.xpScaleStep * Math.max(0, cycle - 1)) * 100) / 100

export const domainCost = (level: number, scale: number) => Math.round(xpCostOfLevel(level) * scale)

/** XP de cycle nécessaire pour ATTEINDRE un niveau de domaine (niveau 1 = 0). */
export function domainXpForLevel(level: number, scale: number): number {
  let sum = 0
  for (let l = 1; l < Math.min(level, DOMAIN_LADDER.maxLevel); l++) sum += domainCost(l, scale)
  return sum
}
export const domainXpToMax = (cycle: number) => domainXpForLevel(DOMAIN_LADDER.maxLevel, xpScaleForCycle(cycle))

/** Niveau et progression d'un domaine à partir de l'XP DU CYCLE courant. Au dernier niveau, l'XP continue de s'accumuler (`xpIntoLevel`). */
export function domainLevel(cycleXp: number, cycle = 1): LevelProgress {
  const scale = xpScaleForCycle(cycle)
  let remaining = Math.max(0, Math.floor(cycleXp))
  for (let level = 1; level < DOMAIN_LADDER.maxLevel; level++) {
    const cost = domainCost(level, scale)
    if (remaining < cost) return { level, xpIntoLevel: remaining, xpForNext: cost, progress: remaining / cost, maxed: false }
    remaining -= cost
  }
  return { level: DOMAIN_LADDER.maxLevel, xpIntoLevel: remaining, xpForNext: 0, progress: 1, maxed: true }
}
