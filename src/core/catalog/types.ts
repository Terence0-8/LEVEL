import type { Difficulty, Priority, QuestType } from '../quest'

/**
 * Catalogue de modèles : des MODÈLES (jamais des données personnelles). Un modèle n'a ni XP ni état : l'ajout à ses activités crée une vraie quête LIFE,
 * validée et récompensée par le moteur existant (`core/rewards`). Identifiants stables ; `v` = version du modèle (le catalogue peut évoluer
 * sans jamais écraser ce que l'utilisateur a personnalisé).
 */
export interface QuestTemplate {
  id: string
  v: number
  name: string
  description: string
  categoryId: string
  type: QuestType
  minutes: number
  difficulty: Difficulty
  priority?: Priority
  /** Étapes facultatives : une quête « de progression » a plusieurs étapes */
  steps?: string[]
  tags: string[]
  /** Objectif LIFE suggéré (texte), jamais créé automatiquement */
  goalHint?: string
  /** Modèle créé par l'utilisateur à partir d'une de ses quêtes */
  custom?: boolean
}

export interface QuestPack {
  id: string
  v: number
  name: string
  description: string
  /** Pour qui ? (une phrase) */
  forWho: string
  templateIds: string[]
}

export interface CatalogState {
  /** Quêtes créées depuis un modèle : modèle → quêtes (identifiants LIFE) et version du modèle à ce moment-là */
  installed: Record<string, Array<{ questId: string; v: number; at: string }>>
  favorites: string[]
  custom: QuestTemplate[]
}
export const EMPTY_CATALOG: CatalogState = { installed: {}, favorites: [], custom: [] }
