import { SPORT_CONFIG } from './config'
import { weekKey, mondayOf } from '../dates'

export type CyclePhase = 'development' | 'consolidation' | 'deload' | 'resumption'
export const PHASE_LABEL: Record<CyclePhase, string> = { development: 'Développement', consolidation: 'Consolidation', deload: 'Allègement', resumption: 'Reprise' }
export const PHASE_HINT: Record<CyclePhase, string> = {
  development: 'Semaines de travail : la progression peut être proposée après plusieurs expositions.',
  consolidation: 'On stabilise : aucune augmentation de charge cette semaine.',
  deload: 'Semaine allégée : moins de volume et de charge pour récupérer.',
  resumption: 'Reprise progressive avant un nouveau cycle de développement.',
}

export interface CycleInfo {
  phase: CyclePhase
  /** Semaine dans le cycle (1-based) */
  week: number
  totalWeeks: number
  volumeFactor: number
  loadFactor: number
  allowIncrease: boolean
}

const C = SPORT_CONFIG.cycle

/** Cycle adaptatif piloté par la date de début (modifiable par l'utilisateur). Pur. */
export function cycleInfo(cycleStartWeek: string | null, now: Date): CycleInfo {
  const total = C.developmentWeeks + C.consolidationWeeks + C.deloadWeeks + C.resumptionWeeks
  let elapsed = 0
  if (cycleStartWeek) {
    // retrouve le lundi de la semaine de départ en parcourant en arrière depuis maintenant
    let d = mondayOf(now)
    for (let i = 0; i < 200 && weekKey(d) !== cycleStartWeek; i++) { d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7) }
    elapsed = weekKey(d) === cycleStartWeek ? Math.round((mondayOf(now).getTime() - d.getTime()) / (7 * 86_400_000)) : 0
  }
  const w = elapsed % total
  const phase: CyclePhase = w < C.developmentWeeks ? 'development' : w < C.developmentWeeks + C.consolidationWeeks ? 'consolidation' : w < total - C.resumptionWeeks ? 'deload' : 'resumption'
  return {
    phase, week: w + 1, totalWeeks: total,
    volumeFactor: phase === 'deload' ? C.deloadVolumeFactor : phase === 'resumption' ? C.resumptionVolumeFactor : 1,
    loadFactor: phase === 'deload' ? 0.9 : phase === 'resumption' ? 0.95 : 1,
    allowIncrease: phase === 'development',
  }
}
