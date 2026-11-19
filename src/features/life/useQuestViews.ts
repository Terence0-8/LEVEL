import { useMemo } from 'react'
import { useAppState } from '@/app/AppState'
import { cycleProgress, missedCycles, questStatus, streak, type CycleProgress } from '@/core/questState'
import type { Category, Quest, QuestStatus } from '@/core/quest'

export interface QuestView {
  quest: Quest
  category: Category | undefined
  cp: CycleProgress
  status: QuestStatus
  streak: number
  missed: number
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 }

/** Projette quêtes + journal en vues prêtes pour l'UI (tout est dérivé, rien n'est stocké). */
export function useQuestViews(): QuestView[] {
  const { quests, categories, events, now } = useAppState()
  return useMemo(() => {
    const cats = new Map(categories.map((c) => [c.id, c]))
    return quests
      .map((quest) => {
        const cp = cycleProgress(quest, events, now)
        return { quest, category: cats.get(quest.categoryId), cp, status: questStatus(quest, cp, now), streak: streak(quest, events, now), missed: missedCycles(quest, events, now).length }
      })
      .sort((a, b) =>
        PRIORITY_RANK[a.quest.priority] - PRIORITY_RANK[b.quest.priority] ||
        (a.quest.dueDate ?? '9999').localeCompare(b.quest.dueDate ?? '9999') ||
        a.quest.createdAt - b.quest.createdAt)
  }, [quests, categories, events, now])
}
