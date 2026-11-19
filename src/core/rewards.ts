import type { Difficulty } from './quest'

/**
 * ⚠️ BARÈMES PROVISOIRES — à calibrer (voir PRODUCT_SPEC « Équilibrage »).
 * Toute valeur numérique de l'économie XP vit ici et nulle part ailleurs.
 */
export const REWARD_CONFIG = {
  baseByDifficulty: { easy: 20, normal: 40, hard: 70, epic: 120 } satisfies Record<Difficulty, number>,
  /** Facteur d'effort = (minutes / referenceMinutes)^0.5, borné */
  referenceMinutes: 30,
  effortFactorMin: 0.5,
  effortFactorMax: 2,
  roundTo: 5,
  minReward: 5,
  maxReward: 400,
  /** Une quête est une « micro-tâche » si son effort est ≤ ce seuil */
  microEffortMinutes: 10,
  /** Nombre de micro-quêtes récompensées à plein tarif par jour */
  microFullRewardsPerDay: 3,
  /** Multiplicateur au-delà : réduit, jamais négatif */
  microDampedMultiplier: 0.25,
  /** Part de la récompense créditée pour un effort sans résultat (« préparé », non exposé en UI) */
  effortCreditRatio: 0.25,
} as const

/** Récompense totale d'une quête : difficulté × effort. La priorité n'influence PAS l'XP (anti-farming). */
export function computeQuestReward(input: { difficulty: Difficulty; effortMinutes: number }, cfg = REWARD_CONFIG): number {
  const c = cfg
  const factor = Math.min(c.effortFactorMax, Math.max(c.effortFactorMin, Math.sqrt(Math.max(1, input.effortMinutes) / c.referenceMinutes)))
  const raw = c.baseByDifficulty[input.difficulty] * factor
  const rounded = Math.round(raw / c.roundTo) * c.roundTo
  return Math.min(c.maxReward, Math.max(c.minReward, rounded))
}

export const isMicroTask = (effortMinutes: number, cfg = REWARD_CONFIG) => effortMinutes <= cfg.microEffortMinutes

/**
 * Amortissement des micro-tâches : au-delà de N micro-quêtes distinctes récompensées le même jour,
 * le montant est multiplié par `microDampedMultiplier` (≥ 0 : jamais de pénalité).
 */
export function dampingMultiplier(opts: { effortMinutes: number; microQuestsRewardedToday: number }, cfg = REWARD_CONFIG): number {
  if (!isMicroTask(opts.effortMinutes, cfg)) return 1
  return opts.microQuestsRewardedToday >= cfg.microFullRewardsPerDay ? cfg.microDampedMultiplier : 1
}

/** Crédit d'effort pour une tentative sans résultat. */
export function effortCredit(rewardXp: number, cfg = REWARD_CONFIG): number {
  return Math.max(1, Math.round(rewardXp * cfg.effortCreditRatio))
}

/**
 * Répartit le reste de la récompense (en base, avant amortissement) sur les étapes non validées :
 * la somme des étapes ne peut jamais dépasser la récompense de la quête.
 */
export function nextBaseShare(rewardXp: number, awardedBase: number, remainingUnits: number): number {
  const remaining = Math.max(0, rewardXp - awardedBase)
  if (remainingUnits <= 1) return remaining
  return Math.round(remaining / remainingUnits)
}
