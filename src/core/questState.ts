import { cycleKeyFor, effortAwardKey, isRecurring, previousCycleDate, questAwardKey, stepAwardKey, type Quest, type QuestStatus } from './quest'
import { openAwards, type XpEvent } from './ledger'
import { dayKey } from './dates'

/** État d'une quête dans son cycle courant, dérivé du journal (aucun drapeau stocké). */
export interface CycleProgress {
  cycleKey: string
  stepDone: Record<string, boolean>
  doneSteps: number
  totalSteps: number
  completed: boolean
  /** XP nette gagnée dans ce cycle pour cette quête */
  earnedXp: number
  /** 0–1 */
  progress: number
}

export function isCycleCompleted(quest: Quest, events: XpEvent[], cycle: string): boolean {
  const open = openAwards(events)
  if (quest.steps.length === 0) return open.has(questAwardKey(quest.id, cycle))
  return quest.steps.every((s) => open.has(stepAwardKey(quest.id, s.id, cycle)))
}

export function cycleProgress(quest: Quest, events: XpEvent[], now: Date): CycleProgress {
  const cycle = cycleKeyFor(quest.type, now)
  const open = openAwards(events)
  const stepDone: Record<string, boolean> = {}
  for (const s of quest.steps) stepDone[s.id] = open.has(stepAwardKey(quest.id, s.id, cycle))
  const doneSteps = Object.values(stepDone).filter(Boolean).length
  const completed = isCycleCompleted(quest, events, cycle)
  const earnedXp = [...open.values()].filter((e) => e.questId === quest.id && e.cycleKey === cycle).reduce((n, e) => n + e.amount, 0)
  const progress = quest.steps.length ? doneSteps / quest.steps.length : completed ? 1 : 0
  return { cycleKey: cycle, stepDone, doneSteps, totalSteps: quest.steps.length, completed, earnedXp, progress }
}

/** Gains ouverts (quête, étapes, effort) d'un cycle. */
export function openAwardsOfCycle(quest: Quest, events: XpEvent[], cycle: string): XpEvent[] {
  return [...openAwards(events).values()].filter((e) => e.questId === quest.id && e.cycleKey === cycle)
}

export function hasEffortCredit(quest: Quest, events: XpEvent[], cycle: string) {
  return openAwards(events).has(effortAwardKey(quest.id, cycle))
}

/**
 * Statut affiché. « En retard » est purement informatif : aucune pénalité d'XP.
 */
export function questStatus(quest: Quest, cp: CycleProgress, now: Date): QuestStatus {
  if (quest.archived) return 'archived'
  if (cp.completed) return 'done'
  if (quest.dueDate && !isRecurring(quest.type) && quest.dueDate < dayKey(now)) return 'overdue'
  if (cp.doneSteps > 0 || cp.earnedXp > 0) return 'in_progress'
  return 'todo'
}

/** Série de cycles consécutifs accomplis (quêtes récurrentes). Le cycle courant non terminé ne casse pas la série. */
export function streak(quest: Quest, events: XpEvent[], now: Date): number {
  if (!isRecurring(quest.type)) return 0
  let d = now
  let count = 0
  const cur = cycleKeyFor(quest.type, d)
  if (isCycleCompleted(quest, events, cur)) count++
  d = previousCycleDate(quest.type, d)
  for (let i = 0; i < 400; i++) {
    const key = cycleKeyFor(quest.type, d)
    if (!isCycleCompleted(quest, events, key)) break
    count++
    d = previousCycleDate(quest.type, d)
  }
  return count
}

/**
 * Cycles passés non accomplis depuis la création. N'a AUCUN effet sur l'XP ; sert à interrompre la
 * série et à alimenter une analyse ultérieure (bilans).
 */
export function missedCycles(quest: Quest, events: XpEvent[], now: Date, max = 14): string[] {
  if (!isRecurring(quest.type)) return []
  const first = cycleKeyFor(quest.type, new Date(quest.createdAt))
  const out: string[] = []
  let d = previousCycleDate(quest.type, now)
  for (let i = 0; i < max; i++) {
    const key = cycleKeyFor(quest.type, d)
    if (key < first) break
    if (!isCycleCompleted(quest, events, key)) out.push(key)
    d = previousCycleDate(quest.type, d)
  }
  return out
}
