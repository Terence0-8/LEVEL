import type { LevelProgress } from './types'

export const MAX_LEVEL = 100

/** XP requise pour passer du niveau `level` au suivant. Courbe douce : 100 · level^1.35. */
export function xpCostOfLevel(level: number): number {
  if (level < 1) throw new RangeError('level must be >= 1')
  return Math.round(100 * Math.pow(level, 1.35))
}

/** XP cumulée nécessaire pour ATTEINDRE `level` (niveau 1 = 0 XP). */
export function totalXpForLevel(level: number): number {
  let sum = 0
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l++) sum += xpCostOfLevel(l)
  return sum
}

/** Niveau et progression à partir d'une XP totale. */
export function levelFromXp(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp))
  let level = 1
  let remaining = xp
  while (level < MAX_LEVEL) {
    const cost = xpCostOfLevel(level)
    if (remaining < cost) {
      return { level, xpIntoLevel: remaining, xpForNext: cost, progress: remaining / cost, maxed: false }
    }
    remaining -= cost
    level++
  }
  return { level: MAX_LEVEL, xpIntoLevel: remaining, xpForNext: 0, progress: 1, maxed: true }
}
