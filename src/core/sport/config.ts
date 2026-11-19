import type { PriorityLevel } from './types'

/**
 * ⚠️ BARÈMES ET SEUILS SPORT — PROVISOIRES, à calibrer. Centralisés ici (comme `core/rewards.ts` pour LIFE).
 * Règle fondamentale : 1 XP SPORT = 1 XP LIFE pour le niveau global ; seuls les barèmes propres à la discipline diffèrent.
 */
export const SPORT_CONFIG = {
  xp: {
    /** XP d'une séance complète (avant facteur de durée) */
    base: { strength: 90, run: 80, hiit: 70, mobility: 35, other: 0 },
    /**
     * Travail significatif : nombre MINIMAL de séries réalisées pour qu'une séance rapporte de l'XP. Ce n'est pas un taux :
     * au-dessus, la récompense est strictement proportionnelle au travail accompli (séance écourtée = XP proportionnelle).
     */
    minSignificantSets: 3,
    /** Facteur de durée = √(minutes / référence), borné */
    durationReferenceMin: 45,
    durationFactorMin: 0.6,
    durationFactorMax: 1.5,
    /** Course : durée minimale pour gagner de l'XP (min) ; sortie « récupération » plafonnée */
    runMinMinutes: 10,
    recoveryRunCapFactor: 0.6,
    /**
     * Deuxième séance du jour : exceptionnelle, à l'initiative de l'utilisateur, récompensée seulement si la récupération le
     * permettait au départ (niveau NORMAL). Protections anti-farming : plafonds par jour et par semaine, coefficient réduit,
     * délai minimal entre deux séances (une séance scindée en deux ne double pas la récompense).
     */
    extraSession: { maxRewardedPerDay: 2, maxExtraPerWeek: 3, multiplier: 0.75, minHoursBetween: 4 },
    /** Régularité : objectif hebdomadaire atteint (séances sur jours distincts) */
    regularityWeek: 40,
    /** Record personnel : XP, plafond par séance, expositions minimales avant qu'un record compte */
    pr: 25,
    prMaxPerSession: 2,
    prMinPriorExposures: 3,
    prMinImprovementPct: 2,
    /** Respect de la récupération (repos décidé en vigilance/alerte) : XP et plafond hebdomadaire */
    rest: 15,
    restMaxPerWeek: 2,
    /**
     * Le repos ne rapporte de l'XP que si Level le RECOMMANDE de façon pertinente : niveau VIGILANCE/ALERTE ET charge récente
     * objective (séances organisées). Une simple déclaration personnelle ne suffit pas.
     */
    restMinLocalFatigue: 50,
    restMinSessionsIn3Days: 2,
    /** Progression confirmée par l'utilisateur après plusieurs expositions (maîtrise technique) */
    progressionConfirmed: 20,
  },
  progression: {
    /** Expositions (séances) minimales avant de recommander une augmentation */
    minExposures: 3,
    /** Délai minimal entre deux augmentations d'un même exercice (jours) : pas de progression jour après jour */
    minDaysBetweenIncreases: 6,
    /** RPE moyen maximal pour augmenter ; au-delà de rpeReduce → réduction */
    rpeIncreaseMax: 8,
    rpeReduce: 9.5,
    /** Technique minimale (1–3) pour augmenter */
    techniqueMin: 2,
    /** Réduction recommandée */
    decreasePct: 10,
    /** Pas d'augmentation par défaut (kg) selon le matériel */
    stepKg: { dumbbells: 2, kettlebell: 2, barbell: 2.5, machines: 5, cables: 2.5, bands: 0 },
  },
  generator: {
    /** Séries hebdomadaires cibles par groupe, selon la priorité */
    weeklySets: { develop: 14, progress: 10, maintain: 6 } satisfies Record<PriorityLevel, number>,
    /** Temps moyen par exercice (min), repos compris */
    minutesPerExercise: 8,
    minExercises: 3,
    maxExercises: 8,
    /** Fatigue locale maximale (0–100) pour solliciter un groupe */
    localFatigueMax: 65,
    /** Un groupe entraîné il y a moins de ... heures est en récupération */
    minHoursBetweenSameGroup: 44,
    setsPerExercise: { beginner: 2, intermediate: 3, advanced: 3 },
    repRange: { compound: [6, 10], isolation: [10, 15], bodyweight: [8, 15] },
    timeTargetSec: [30, 45],
    restSec: { compound: 120, isolation: 75, bodyweight: 60, time: 45 },
    /** Évaluation prudente : première exposition, charge « très facile » */
    firstExposureRir: 4,
  },
  cycle: {
    /** Cycle adaptatif : semaines de développement, consolidation, allègement, reprise */
    developmentWeeks: 3,
    consolidationWeeks: 1,
    deloadWeeks: 1,
    resumptionWeeks: 1,
    deloadVolumeFactor: 0.6,
    resumptionVolumeFactor: 0.85,
  },
  recovery: {
    /** Pénalités de l'indice (0–100) */
    fatiguePenalty: 14,
    sleepPenalty: 8,
    sorenessPenalty: 7,
    painPenalty: { none: 0, light: 12, strong: 35 },
    loadPenaltyMax: 20,
    /** Demi-vie de la fatigue locale (heures) */
    halfLifeHours: 36,
    /** Séries pondérées par groupe donnant 100 de fatigue locale */
    setsFor100: 12,
    vigilanceBelow: 62,
    alertBelow: 35,
    /** Douleur légère répétée sur plusieurs jours consécutifs → alerte */
    persistentPainDays: 3,
    vigilanceVolumeFactor: 0.7,
  },
  run: {
    /** Augmentation hebdomadaire maximale du volume (%) ; un seul des trois leviers (volume, sortie longue, intensité) par semaine */
    maxWeeklyVolumeIncreasePct: 10,
    easyShareMin: 0.7,
    /** Une sortie de récupération dépassant ce RPE est signalée */
    recoveryRpeMax: 4,
    firstTestMinutes: 20,
  },
} as const
