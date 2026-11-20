import type { AttributeId } from './types'
import { addDays, dayKey, weekKey } from './dates'

export type QuestType = 'daily' | 'weekly' | 'personal' | 'exceptional'
export type Priority = 'low' | 'normal' | 'high'
export type Difficulty = 'easy' | 'normal' | 'hard' | 'epic'

export interface QuestStep {
  id: string
  title: string
}

export interface Category {
  id: string
  name: string
  /** Attribut RPG nourri par les XP de cette catégorie (personnalisable) */
  attribute: AttributeId
  order: number
  archived: boolean
  builtin: boolean
}

export interface Quest {
  id: string
  type: QuestType
  title: string
  description: string
  categoryId: string
  priority: Priority
  /** « YYYY-MM-DD », facultative */
  dueDate: string | null
  difficulty: Difficulty
  /** Estimation d'effort en minutes */
  effortMinutes: number
  steps: QuestStep[]
  /** Récompense XP totale (calculée par `core/rewards`) */
  rewardXp: number
  archived: boolean
  /** Jour prévu au planning central (« YYYY-MM-DD »), distinct de l'échéance ; null/absent = non placée */
  plannedFor?: string | null
  /** Rattachements (facultatifs) : une quête reste une vraie quête LIFE, validée par le moteur XP existant */
  goalId?: string | null
  projectId?: string | null
  stepId?: string | null
  createdAt: number
  updatedAt: number
}

/** Statut affiché (dérivé du journal, jamais stocké). */
export type QuestStatus = 'todo' | 'in_progress' | 'done' | 'overdue' | 'archived'

export const isRecurring = (t: QuestType) => t === 'daily' || t === 'weekly'

/** Clé de cycle : un jour, une semaine ISO, ou « once » pour les quêtes uniques. */
export function cycleKeyFor(type: QuestType, d: Date): string {
  if (type === 'daily') return dayKey(d)
  if (type === 'weekly') return weekKey(d)
  return 'once'
}

/** Date représentative du cycle précédent (pour les séries). */
export function previousCycleDate(type: QuestType, d: Date): Date {
  return addDays(d, type === 'weekly' ? -7 : -1)
}

export const questAwardKey = (questId: string, cycle: string) => `quest:${questId}:${cycle}`
export const stepAwardKey = (questId: string, stepId: string, cycle: string) => `step:${questId}:${stepId}:${cycle}`
export const effortAwardKey = (questId: string, cycle: string) => `effort:${questId}:${cycle}`

export const normalizeTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ')

/** Anti-farming : détecte une quête active au titre identique (avertissement, non bloquant). */
export function findSimilarQuest(quests: Quest[], title: string, excludeId?: string): Quest | undefined {
  const n = normalizeTitle(title)
  if (!n) return undefined
  return quests.find((q) => !q.archived && q.id !== excludeId && normalizeTitle(q.title) === n)
}
