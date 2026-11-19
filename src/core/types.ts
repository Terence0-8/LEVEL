/** Types du domaine Level. Aucun import UI ou stockage ici. */

export type Domain = 'LIFE' | 'SPORT'

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S'

export type AttributeId =
  | 'force'
  | 'endurance'
  | 'vitalite'
  | 'discipline'
  | 'intellect'
  | 'prosperite'

export interface Attribute {
  id: AttributeId
  label: string
  /** 0 – 100 */
  value: number
}

export interface Quest {
  id: string
  title: string
  domain: Domain
  xp: number
  attribute: AttributeId
  /** Échéance en heures à partir de maintenant (donnée de démo uniquement). */
  dueInHours?: number
}

export interface Activity {
  id: string
  /** ISO 8601 */
  at: string
  label: string
  domain: Domain
  /** Négatif pour une correction */
  xp: number
  /** Gain depuis annulé par une correction */
  corrected?: boolean
}

export interface LevelProgress {
  level: number
  /** XP accumulée dans le niveau courant */
  xpIntoLevel: number
  /** XP nécessaire pour passer au niveau suivant (0 si niveau max) */
  xpForNext: number
  /** 0 – 1 */
  progress: number
  maxed: boolean
}
