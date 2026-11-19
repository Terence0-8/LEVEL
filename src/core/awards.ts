import { dayKey } from './dates'
import { effortAwardKey, cycleKeyFor, questAwardKey, stepAwardKey, type Category, type Quest } from './quest'
import { openAwards, planAward, type PlanResult, type XpEvent } from './ledger'
import { dampingMultiplier, effortCredit, isMicroTask, nextBaseShare, REWARD_CONFIG } from './rewards'
import { openAwardsOfCycle, hasEffortCredit, isCycleCompleted } from './questState'

export interface AwardContext {
  quest: Quest
  category: Category | undefined
  /** Événements de CETTE quête */
  questEvents: XpEvent[]
  /** Événements du jour courant (toutes quêtes) pour l'anti-farming */
  todayEvents: XpEvent[]
  now: Date
  eventId: string
}

const DIFF_FR = { easy: 'facile', normal: 'normale', hard: 'difficile', epic: 'épique' } as const

function base(ctx: AwardContext) {
  const { quest, category, now } = ctx
  return {
    questId: quest.id,
    cycleKey: cycleKeyFor(quest.type, now),
    domain: 'LIFE' as const,
    categoryId: quest.categoryId,
    attribute: category?.attribute ?? null,
    at: now.toISOString(),
    label: quest.title,
  }
}

function microQuestsRewardedToday(ctx: AwardContext): number {
  const today = dayKey(ctx.now)
  const ids = new Set<string>()
  for (const e of openAwards(ctx.todayEvents).values()) {
    if (e.micro && e.questId && e.questId !== ctx.quest.id && dayKey(new Date(e.at)) === today) ids.add(e.questId)
  }
  return ids.size
}

/**
 * Prépare la récompense d'une quête simple (stepId = null) ou d'une étape.
 * Garanties : jamais deux fois la même clé ; Σ des gains d'un cycle ≤ récompense de la quête ;
 * montant ≥ 0 (aucune pénalité).
 */
export function planCompletion(ctx: AwardContext, stepId: string | null): PlanResult<XpEvent> {
  const { quest } = ctx
  const cycle = cycleKeyFor(quest.type, ctx.now)
  const key = stepId ? stepAwardKey(quest.id, stepId, cycle) : questAwardKey(quest.id, cycle)
  const awarded = openAwardsOfCycle(quest, ctx.questEvents, cycle)
  const awardedBase = awarded.reduce((n, e) => n + e.baseAmount, 0)
  const open = openAwards(ctx.questEvents)
  const remainingUnits = stepId ? quest.steps.filter((s) => !open.has(stepAwardKey(quest.id, s.id, cycle))).length : 1
  const baseAmount = nextBaseShare(quest.rewardXp, awardedBase, remainingUnits)
  const micro = isMicroTask(quest.effortMinutes)
  const mult = dampingMultiplier({ effortMinutes: quest.effortMinutes, microQuestsRewardedToday: microQuestsRewardedToday(ctx) })
  const amount = Math.round(baseAmount * mult)
  const step = stepId ? quest.steps.find((s) => s.id === stepId) : undefined
  if (stepId && !step) return { ok: false, error: 'not_found' }
  const subject = step ? `Étape « ${step.title} » validée` : 'Quête validée'
  const reason =
    `${subject} (difficulté ${DIFF_FR[quest.difficulty]}, ~${quest.effortMinutes} min)` +
    (mult < 1 ? ` · réduit à ${Math.round(mult * 100)} % : micro-tâches du jour au-delà de ${REWARD_CONFIG.microFullRewardsPerDay}` : '')
  return planAward(ctx.questEvents, {
    ...base(ctx),
    id: ctx.eventId,
    source: step ? 'step' : 'quest',
    sourceId: step ? step.id : quest.id,
    stepId: step?.id ?? null,
    awardKey: key,
    amount,
    baseAmount,
    micro,
    reason,
    label: step ? `${quest.title} — ${step.title}` : quest.title,
  })
}

/** Récompense l'effort sans résultat (mécanisme préparé, non exposé en UI). Déduit de la récompense finale. */
export function planEffortCredit(ctx: AwardContext): PlanResult<XpEvent> {
  const { quest } = ctx
  const cycle = cycleKeyFor(quest.type, ctx.now)
  if (isCycleCompleted(quest, ctx.questEvents, cycle) || hasEffortCredit(quest, ctx.questEvents, cycle)) return { ok: false, error: 'already_awarded' }
  const amount = effortCredit(quest.rewardXp)
  return planAward(ctx.questEvents, {
    ...base(ctx),
    id: ctx.eventId,
    source: 'bonus',
    sourceId: quest.id,
    stepId: null,
    awardKey: effortAwardKey(quest.id, cycle),
    amount,
    baseAmount: amount,
    micro: false,
    reason: `Effort reconnu sans résultat final (${Math.round(REWARD_CONFIG.effortCreditRatio * 100)} % de la récompense, déduit de la validation éventuelle)`,
    label: `Effort : ${quest.title}`,
  })
}
