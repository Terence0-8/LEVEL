import type { Quest } from './quest'
import { isRecurring } from './quest'
import type { XpEvent } from './ledger'
import { cycleKeyFor } from './quest'
import { isCycleCompleted, missedCycles } from './questState'
import { dayKey } from './dates'
import { REWARD_CONFIG } from './rewards'
import type { Difficulty } from './quest'

/**
 * Analyse des quêtes non réalisées. N'a AUCUN effet sur l'XP : elle sert à comprendre
 * (cause) et à décider (report, simplification, remplacement, suspension).
 */
export type MissedCause = 'forgot' | 'no_time' | 'difficulty' | 'motivation' | 'unforeseen' | 'rest'
export type MissedAction = 'none' | 'postpone' | 'simplify' | 'replace' | 'suspend'

export interface MissedAnalysis {
  id: string
  questId: string
  /** Intitulé figé : reste lisible si la quête est supprimée */
  questTitle: string
  /** Cycle manqué (« 2026-11-18 », « 2026-W46 ») ou échéance (« due:2026-11-01 ») */
  cycleKey: string
  /** null si l'élément a simplement été ignoré */
  cause: MissedCause | null
  action: MissedAction
  /** Résumé de ce qui a été fait suite à l'analyse */
  actionDetail: string
  note: string
  dismissed: boolean
  createdAt: string
}

export interface MissedItem {
  quest: Quest
  cycleKey: string
  kind: 'cycle' | 'overdue'
}

export const analysisKey = (questId: string, cycleKey: string) => `${questId}|${cycleKey}`

/** Éléments non réalisés et pas encore analysés : cycles récurrents manqués + échéances dépassées. */
export function findMissed(quests: Quest[], events: XpEvent[], analyses: MissedAnalysis[], now: Date, max = REWARD_CONFIG.missedWindowCycles): MissedItem[] {
  const done = new Set(analyses.map((a) => analysisKey(a.questId, a.cycleKey)))
  const today = dayKey(now)
  const out: MissedItem[] = []
  for (const quest of quests) {
    if (quest.archived) continue
    if (isRecurring(quest.type)) {
      for (const key of missedCycles(quest, events, now, max)) {
        if (!done.has(analysisKey(quest.id, key))) out.push({ quest, cycleKey: key, kind: 'cycle' })
      }
    } else if (quest.dueDate && quest.dueDate < today && !isCycleCompleted(quest, events, cycleKeyFor(quest.type, now))) {
      const key = `due:${quest.dueDate}`
      if (!done.has(analysisKey(quest.id, key))) out.push({ quest, cycleKey: key, kind: 'overdue' })
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? b.cycleKey.localeCompare(a.cycleKey) : a.kind === 'overdue' ? -1 : 1))
}

export function causeStats(analyses: MissedAnalysis[]): Partial<Record<MissedCause, number>> {
  const out: Partial<Record<MissedCause, number>> = {}
  for (const a of analyses) if (a.cause) out[a.cause] = (out[a.cause] ?? 0) + 1
  return out
}

const LOWER: Record<Difficulty, Difficulty> = { easy: 'easy', normal: 'easy', hard: 'normal', epic: 'hard' }

/** Proposition de simplification : difficulté d'un cran en dessous, effort divisé par deux. */
export function simplifiedValues(q: Pick<Quest, 'difficulty' | 'effortMinutes'>) {
  return { difficulty: LOWER[q.difficulty], effortMinutes: Math.max(5, Math.round(q.effortMinutes / 2)) }
}
