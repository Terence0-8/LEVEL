import type { Quest } from './quest'

/**
 * Trace des modifications d'une quête. Règle : modifier difficulté, effort ou catégorie ne réécrit
 * JAMAIS silencieusement les récompenses déjà acquises ; la révision consigne l'ancien et le nouvel état.
 */
export type QuestField = 'title' | 'description' | 'type' | 'categoryId' | 'priority' | 'dueDate' | 'difficulty' | 'effortMinutes' | 'steps' | 'rewardXp'

export interface QuestChange {
  field: QuestField
  from: string
  to: string
}

export interface QuestRevision {
  id: string
  questId: string
  /** ISO 8601 */
  at: string
  changes: QuestChange[]
  /** XP déjà acquise sur cette quête au moment de la modification (conservée telle quelle) */
  awardedXp: number
  note: string
}

const FIELDS: QuestField[] = ['title', 'description', 'type', 'categoryId', 'priority', 'dueDate', 'difficulty', 'effortMinutes', 'rewardXp']

export function diffQuest(prev: Quest, next: Quest): QuestChange[] {
  const out: QuestChange[] = []
  for (const f of FIELDS) {
    const a = String(prev[f] ?? '')
    const b = String(next[f] ?? '')
    if (a !== b) out.push({ field: f, from: a, to: b })
  }
  const sa = prev.steps.map((s) => s.title).join(' | ')
  const sb = next.steps.map((s) => s.title).join(' | ')
  if (sa !== sb) out.push({ field: 'steps', from: sa, to: sb })
  return out
}
