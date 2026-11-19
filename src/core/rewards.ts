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
  /** Effort sans objectif atteint : part MAXIMALE de la récompense (atteinte seulement si la durée égale l'estimation) */
  effortCreditRatio: 0.25,
  /** Facteur appliqué si aucune durée n'est déclarée */
  effortNoDurationFactor: 0.6,
  /** Facteur plancher selon la durée déclarée / estimée */
  effortDurationFactorMin: 0.4,
  /** Progression partielle : bornes (en % du travail) et pas minimal entre deux déclarations */
  partialMinPercent: 10,
  partialMaxPercent: 90,
  partialMinStepPercent: 10,
  /** Garde-fou : déclarations de crédit (partiel/effort) récompensées à plein tarif par jour, toutes quêtes confondues */
  creditDeclarationsPerDay: 3,
  /** Au-delà, montant réduit mais jamais nul */
  creditOverCapMultiplier: 0.25,
  /** Validation rétroactive : fenêtre maximale (jours en arrière) */
  retroactiveMaxDays: 14,
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

/**
 * Répartit le reste de la récompense (en base, avant amortissement) sur les étapes non validées :
 * la somme des étapes ne peut jamais dépasser la récompense de la quête.
 */
export function nextBaseShare(rewardXp: number, awardedBase: number, remainingUnits: number): number {
  const remaining = Math.max(0, rewardXp - awardedBase)
  if (remainingUnits <= 1) return remaining
  return Math.round(remaining / remainingUnits)
}

/** Cible cumulée (base) pour une progression partielle de `percent` % du travail. */
export const partialTargetBase = (rewardXp: number, percent: number) => Math.round((rewardXp * percent) / 100)

/** Marge restante pour les crédits : un crédit ne peut jamais valoir une réussite complète. */
export function creditHeadroom(rewardXp: number, awardedBase: number, cfg = REWARD_CONFIG): number {
  return Math.max(0, Math.floor((rewardXp * cfg.partialMaxPercent) / 100) - awardedBase)
}

/**
 * Effort sans objectif atteint : récompense réduite mais non nulle, modulée par la durée déclarée
 * (rapportée à l'estimation) ; jamais la récompense maximale.
 */
export function effortCreditBase(rewardXp: number, effortMinutes: number, durationMinutes: number | null, cfg = REWARD_CONFIG): number {
  const factor = durationMinutes
    ? Math.min(1, Math.max(cfg.effortDurationFactorMin, durationMinutes / Math.max(1, effortMinutes)))
    : cfg.effortNoDurationFactor
  return Math.max(1, Math.round(rewardXp * cfg.effortCreditRatio * factor))
}
