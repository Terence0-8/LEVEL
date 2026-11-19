import type { Rank } from './types'

/** Seuils de niveau global pour chaque rang (hypothèse v0.1, voir docs). */
export const RANK_THRESHOLDS: ReadonlyArray<{ rank: Rank; minLevel: number; title: string }> = [
  { rank: 'E', minLevel: 1, title: 'Éveillé' },
  { rank: 'D', minLevel: 10, title: 'Initié' },
  { rank: 'C', minLevel: 20, title: 'Aguerri' },
  { rank: 'B', minLevel: 35, title: 'Vétéran' },
  { rank: 'A', minLevel: 55, title: 'Élite' },
  { rank: 'S', minLevel: 80, title: 'Souverain' },
]

export function rankForLevel(level: number) {
  let current = RANK_THRESHOLDS[0]
  for (const r of RANK_THRESHOLDS) if (level >= r.minLevel) current = r
  const idx = RANK_THRESHOLDS.indexOf(current)
  const next = RANK_THRESHOLDS[idx + 1] ?? null
  return { ...current, next }
}
