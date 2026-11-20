import { dayKey } from './dates'
import { cycleKeyFor, effortAwardKey, questAwardKey, stepAwardKey, type Category, type Quest } from './quest'
import { openAwards, planAward, type CreditKind, type PlanResult, type XpEvent } from './ledger'
import {
  creditHeadroom, dampingMultiplier, effortCreditBase, isMicroTask, nextBaseShare, partialTargetBase, REWARD_CONFIG,
} from './rewards'
import { isCycleCompleted, openAwardsOfCycle } from './questState'
import { applyBonus } from './prestigeRewards'

export interface AwardContext {
  quest: Quest
  category: Category | undefined
  /** Événements de CETTE quête */
  questEvents: XpEvent[]
  /** Événements du jour d'ACCOMPLISSEMENT déclaré (toutes quêtes) pour l'anti-farming */
  todayEvents: XpEvent[]
  /** Instant d'enregistrement */
  now: Date
  /** Date d'accomplissement déclarée (= now pour une validation du jour) */
  doneAt: Date
  eventId: string
  /** Bonus d'XP LIFE (points de %) en vigueur le jour d'accomplissement ; appliqué à ce gain seulement, jamais rétroactivement */
  xpBonusPct?: number
}

const DIFF_FR = { easy: 'facile', normal: 'normale', hard: 'difficile', epic: 'épique' } as const

function base(ctx: AwardContext) {
  const { quest, category, now, doneAt } = ctx
  return {
    questId: quest.id,
    cycleKey: cycleKeyFor(quest.type, doneAt),
    domain: 'LIFE' as const,
    categoryId: quest.categoryId,
    attribute: category?.attribute ?? null,
    at: doneAt.toISOString(),
    recordedAt: now.toISOString(),
    retroactive: dayKey(doneAt) < dayKey(now),
    label: quest.title,
  }
}

const sameDay = (ctx: AwardContext, e: XpEvent) => dayKey(new Date(e.at)) === dayKey(ctx.doneAt)

function microQuestsRewardedToday(ctx: AwardContext): number {
  const ids = new Set<string>()
  for (const e of openAwards(ctx.todayEvents).values()) {
    if (e.micro && e.questId && e.questId !== ctx.quest.id && sameDay(ctx, e)) ids.add(e.questId)
  }
  return ids.size
}

function creditsDeclaredToday(ctx: AwardContext): number {
  return [...openAwards(ctx.todayEvents).values()].filter((e) => e.credit && sameDay(ctx, e)).length
}

/**
 * Prépare la récompense d'une quête simple (stepId = null) ou d'une étape.
 * Garanties : jamais deux fois la même clé ; Σ des gains d'un cycle ≤ récompense de la quête
 * (les crédits partiels/effort déjà accordés sont déduits) ; montant ≥ 0 (aucune pénalité).
 */
export function planCompletion(ctx: AwardContext, stepId: string | null): PlanResult<XpEvent> {
  const { quest } = ctx
  const cycle = cycleKeyFor(quest.type, ctx.doneAt)
  const key = stepId ? stepAwardKey(quest.id, stepId, cycle) : questAwardKey(quest.id, cycle)
  const awarded = openAwardsOfCycle(quest, ctx.questEvents, cycle)
  const awardedBase = awarded.reduce((n, e) => n + e.baseAmount, 0)
  const open = openAwards(ctx.questEvents)
  const remainingUnits = stepId ? quest.steps.filter((s) => !open.has(stepAwardKey(quest.id, s.id, cycle))).length : 1
  const baseAmount = nextBaseShare(quest.rewardXp, awardedBase, remainingUnits)
  const micro = isMicroTask(quest.effortMinutes)
  const mult = dampingMultiplier({ effortMinutes: quest.effortMinutes, microQuestsRewardedToday: microQuestsRewardedToday(ctx) })
  const amount = applyBonus(Math.round(baseAmount * mult), ctx.xpBonusPct ?? 0)
  const step = stepId ? quest.steps.find((s) => s.id === stepId) : undefined
  if (stepId && !step) return { ok: false, error: 'not_found' }
  const subject = step ? `Étape « ${step.title} » validée` : 'Quête validée'
  const retro = dayKey(ctx.doneAt) < dayKey(ctx.now)
  const reason =
    `${subject} (difficulté ${DIFF_FR[quest.difficulty]}, ~${quest.effortMinutes} min)` +
    (retro ? ` · accomplissement déclaré le ${dayKey(ctx.doneAt)}` : '') +
    (mult < 1 ? ` · réduit à ${Math.round(mult * 100)} % : micro-tâches du jour au-delà de ${REWARD_CONFIG.microFullRewardsPerDay}` : '') +
    (ctx.xpBonusPct ? ` · bonus d’XP permanent +${ctx.xpBonusPct} %` : '')
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

/** Montant total (UI : prévisualisation) d'une validation complète : toutes les étapes restantes ou la quête. */
export function previewCompletion(ctx: AwardContext): PlanResult<number> {
  const targets: Array<string | null> = ctx.quest.steps.length ? ctx.quest.steps.map((s) => s.id) : [null]
  let working = ctx.questEvents
  let total = 0
  let any = false
  for (const stepId of targets) {
    const plan = planCompletion({ ...ctx, questEvents: working }, stepId)
    if (!plan.ok) continue
    any = true
    total += plan.value.amount
    working = [...working, plan.value]
  }
  return any ? { ok: true, value: total } : { ok: false, error: 'already_awarded' }
}

export interface CreditInput {
  kind: CreditKind
  /** Part de travail accompli, en % (progression partielle) */
  percent?: number
  durationMinutes?: number | null
  note?: string
}

/**
 * Crédit partiel (proportionnel au travail accompli) ou effort sans objectif atteint (réduit, non nul).
 * Garde-fous : refusé pour les micro-tâches et les cycles déjà accomplis ; plafond < réussite complète ;
 * un seul effort par cycle ; progression strictement croissante ; réduction au-delà de N déclarations/jour.
 * Tout crédit est déduit de la validation finale éventuelle.
 */
export function planCredit(ctx: AwardContext, input: CreditInput): PlanResult<XpEvent> {
  const { quest } = ctx
  const cfg = REWARD_CONFIG
  if (isMicroTask(quest.effortMinutes)) return { ok: false, error: 'micro_not_allowed' }
  const cycle = cycleKeyFor(quest.type, ctx.doneAt)
  if (isCycleCompleted(quest, ctx.questEvents, cycle)) return { ok: false, error: 'cycle_completed' }

  const awarded = openAwardsOfCycle(quest, ctx.questEvents, cycle)
  const awardedBase = awarded.reduce((n, e) => n + e.baseAmount, 0)
  const headroom = creditHeadroom(quest.rewardXp, awardedBase)
  const duration = input.durationMinutes && input.durationMinutes > 0 ? Math.round(input.durationMinutes) : null

  let baseAmount: number
  let key: string
  let percent: number | null = null
  let reason: string
  if (input.kind === 'partial') {
    const p = Math.round(input.percent ?? NaN)
    if (!Number.isFinite(p) || p < cfg.partialMinPercent || p > cfg.partialMaxPercent) return { ok: false, error: 'invalid_percent' }
    const previous = Math.max(0, ...awarded.filter((e) => e.credit === 'partial').map((e) => e.percent ?? 0))
    if (p < previous + cfg.partialMinStepPercent) return { ok: false, error: 'no_progress' }
    const delta = partialTargetBase(quest.rewardXp, p) - awardedBase
    if (delta <= 0 || headroom <= 0) return { ok: false, error: 'no_progress' }
    baseAmount = Math.min(delta, headroom)
    percent = p
    const prefix = `partial:${quest.id}:${cycle}:`
    const used = ctx.questEvents.filter((e) => e.awardKey.startsWith(prefix)).map((e) => Number(e.awardKey.slice(prefix.length)) || 0)
    key = prefix + (Math.max(0, ...used) + 1)
    reason = `Progression partielle : ${p} % du travail accompli`
  } else {
    key = effortAwardKey(quest.id, cycle)
    if (openAwards(ctx.questEvents).has(key)) return { ok: false, error: 'effort_already_declared' }
    if (headroom <= 0) return { ok: false, error: 'no_progress' }
    baseAmount = Math.min(effortCreditBase(quest.rewardXp, quest.effortMinutes, duration), headroom)
    reason = `Effort sans objectif atteint${duration ? ` (${duration} min de travail)` : ''} : récompense réduite`
  }

  const mult = creditsDeclaredToday(ctx) >= cfg.creditDeclarationsPerDay ? cfg.creditOverCapMultiplier : 1
  const amount = Math.max(1, applyBonus(Math.round(baseAmount * mult), ctx.xpBonusPct ?? 0))
  if (mult < 1) reason += ` · réduit à ${Math.round(mult * 100)} % : plus de ${cfg.creditDeclarationsPerDay} déclarations ce jour-là`
  if (ctx.xpBonusPct) reason += ` · bonus d’XP permanent +${ctx.xpBonusPct} %`
  if (base(ctx).retroactive) reason += ` · accomplissement déclaré le ${dayKey(ctx.doneAt)}`

  return planAward(ctx.questEvents, {
    ...base(ctx),
    id: ctx.eventId,
    source: 'bonus',
    sourceId: quest.id,
    stepId: null,
    awardKey: key,
    amount,
    baseAmount,
    micro: false,
    credit: input.kind,
    percent,
    durationMinutes: duration,
    note: (input.note ?? '').trim().slice(0, 300),
    reason,
    label: `${input.kind === 'partial' ? 'Progression' : 'Effort'} : ${quest.title}`,
  })
}
