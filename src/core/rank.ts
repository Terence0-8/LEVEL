import type { Rank } from './types'
import { GLOBAL_LADDER, RANK_ORDER, RANK_TITLES, rankOn } from './progressionConfig'

/** Seuils de niveau GLOBAL pour chaque rang (configuration centrale : `progressionConfig.ts`). */
export const RANK_THRESHOLDS: ReadonlyArray<{ rank: Rank; minLevel: number; title: string }> = RANK_ORDER.map((rank) => ({ rank, minLevel: GLOBAL_LADDER.minLevels[rank], title: RANK_TITLES[rank] }))

/** Rang du niveau global. Pour un domaine, voir `domainRank`. */
export const rankForLevel = (level: number) => rankOn(level, GLOBAL_LADDER)
