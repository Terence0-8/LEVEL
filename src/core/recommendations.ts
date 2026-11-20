import { dayKey, addDays } from './dates'
import type { LifeProposal } from './goals'
import type { Observation, Reliability } from './insights'
import type { RecoveryState } from './sport/recovery'

/**
 * Recommandations CONTEXTUALISÉES et EXPLICABLES, calculées à partir des observations (et des propositions LIFE existantes).
 * Chaque recommandation expose : constat, éléments justificatifs, recommandation, bénéfice attendu, niveau de confiance.
 * Level ne modifie JAMAIS rien seul : une recommandation « appliquable » ne s'exécute qu'après confirmation, et seulement via une commande
 * existante (proposition LIFE confirmée). Les décisions (acceptée, refusée, reportée, ignorée) sont conservées pour ne pas se répéter :
 * une recommandation refusée ou ignorée ne revient que si sa SIGNATURE (la situation) a changé significativement.
 * Sécurité SPORT : aucune recommandation d'entraînement n'est produite si la récupération n'est pas normale.
 */
export type RecDecision = 'accepted' | 'declined' | 'snoozed' | 'ignored'
export const REC_DECISION_LABEL: Record<RecDecision, string> = { accepted: 'Acceptée', declined: 'Refusée', snoozed: 'Reportée', ignored: 'Ignorée' }

export type RecAction =
  | { type: 'open'; route: string; label: string }
  | { type: 'life-proposal'; proposal: LifeProposal }

export interface Recommendation {
  /** Identifiant stable de la règle (+ objet) */
  id: string
  domain: 'LIFE' | 'SPORT' | 'MIXED' | 'RPG'
  title: string
  /** 1. Constat */
  finding: string
  /** 2. Éléments qui le justifient */
  evidence: string[]
  /** 3. Recommandation */
  recommendation: string
  /** 4. Bénéfice attendu */
  benefit: string
  /** 5. Niveau de confiance */
  confidence: Reliability
  action: RecAction | null
  /** Situation observée : change quand la situation change de façon significative */
  signature: string
  priority: number
}

/** Décision enregistrée (table `recommendationStates`) : historique minimal, jamais d'effet sur l'XP. */
export interface RecState { id: string; status: RecDecision; signature: string; at: string; snoozeUntil: string | null }

export interface RecCtx {
  observations: Observation[]
  lifeProposals: LifeProposal[]
  recovery: RecoveryState
  now: Date
  /** Il existe des données SPORT (séances) : sinon aucune recommandation sportive */
  hasSport: boolean
}

const OBS = (o: Observation[], id: string) => o.find((x) => x.id === id)
const obsStarting = (o: Observation[], p: string) => o.filter((x) => x.id.startsWith(p))
const CONF_ORDER = { high: 2, medium: 1, low: 0 } as const

export function buildRecommendations(c: RecCtx): Recommendation[] {
  const out: Recommendation[] = []
  const o = c.observations
  const unsafe = c.recovery.level !== 'NORMAL'

  // Projet en retard / inactif / goulot : adaptations proposées par LIFE V1.1, appliquées seulement sur confirmation
  for (const p of c.lifeProposals) {
    if (p.kind === 'shift-project-deadline' || p.kind === 'pause-project') {
      out.push({
        id: `rec:life:${p.id}`, domain: 'LIFE', title: p.kind === 'pause-project' ? 'Mettre un projet en pause' : 'Réorganiser une échéance de projet',
        finding: p.kind === 'pause-project' ? 'Un projet en cours n’a enregistré aucune activité depuis longtemps.' : 'Une échéance de projet est dépassée.',
        evidence: [p.detail], recommendation: p.title, benefit: p.kind === 'pause-project' ? 'Alléger la charge mentale sans abandonner le projet ; il se reprend à tout moment.' : 'Repartir d’une échéance réaliste plutôt que de traîner un retard.',
        confidence: 'high', action: { type: 'life-proposal', proposal: p }, signature: p.id, priority: p.severity === 'warn' ? 80 : 50,
      })
    } else if (p.kind === 'review-project' || p.kind === 'review-goal') {
      out.push({
        id: `rec:life:${p.id}`, domain: 'LIFE', title: p.kind === 'review-goal' ? 'Réexaminer un objectif' : 'Simplifier ou réorganiser un projet',
        finding: p.kind === 'review-goal' ? 'Un objectif semble difficile à tenir avec le temps disponible ou avance peu.' : 'Un projet comporte une étape bloquée, en retard ou une échéance proche.',
        evidence: [p.detail], recommendation: p.title, benefit: 'Un objectif réaliste se tient mieux : l’ajuster vaut mieux que le subir.',
        confidence: 'medium', action: { type: 'open', route: p.kind === 'review-goal' ? '/life/objectifs' : '/life/projets', label: 'Ouvrir pour décider' }, signature: p.id, priority: p.severity === 'warn' ? 70 : 40,
      })
    }
  }

  // Charge et échéances : réorganiser (planning)
  const cluster = OBS(o, 'cross-deadline-cluster'), over = OBS(o, 'cross-overload'), cap = OBS(o, 'cross-capacity')
  const heavy = over ?? cluster ?? cap
  if (heavy) out.push({ id: 'rec:planning-reorganise', domain: 'MIXED', title: 'Alléger ou réorganiser la semaine', finding: heavy.title, evidence: [...heavy.evidence, ...(cap && cap !== heavy ? cap.evidence : [])], recommendation: 'Ouvrir le planning : Level y propose des déplacements, simplifications ou retraits, que vous confirmez un par un.', benefit: 'Une semaine moins dense laisse de la marge pour les imprévus et la récupération.', confidence: heavy.reliability, action: { type: 'open', route: '/planning', label: 'Ouvrir le planning' }, signature: heavy.signature, priority: 75 })

  // Rééquilibrer les quêtes (catégories laissées de côté)
  const quiet = OBS(o, 'life-categories-quiet')
  if (quiet) out.push({ id: 'rec:life-rebalance', domain: 'LIFE', title: 'Rééquilibrer les catégories', finding: quiet.title, evidence: quiet.evidence, recommendation: 'Si ces catégories comptent pour vous, ajoutez-y une petite quête facile cette semaine ; sinon, archivez-les : les deux choix sont valables.', benefit: 'Un équilibre choisi (et non subi) entre vos domaines de vie.', confidence: quiet.reliability, action: { type: 'open', route: '/life', label: 'Ouvrir LIFE' }, signature: quiet.signature, priority: 35 })

  // Baisse durable de réalisation : alléger les routines
  const decline = OBS(o, 'cross-decline')
  if (decline) out.push({ id: 'rec:simplify-routines', domain: 'LIFE', title: 'Simplifier temporairement les routines', finding: decline.title, evidence: decline.evidence, recommendation: 'Réduire pour quelques semaines le nombre de quêtes récurrentes ou leur effort estimé, puis réaugmenter progressivement.', benefit: 'Retrouver un rythme tenable : mieux vaut peu de routines tenues que beaucoup abandonnées.', confidence: decline.reliability, action: { type: 'open', route: '/life', label: 'Ouvrir LIFE' }, signature: decline.signature, priority: 55 })

  // Indicateur qui s'éloigne de la cible
  for (const ind of obsStarting(o, 'indicator-trend:').filter((x) => x.tone === 'neutral')) out.push({ id: `rec:${ind.id}`, domain: 'LIFE', title: 'Faire le point sur un indicateur', finding: ind.title, evidence: ind.evidence, recommendation: 'Vérifier que la cible est toujours pertinente et noter une nouvelle mesure ; un petit ajustement suffit souvent.', benefit: 'Garder un indicateur utile plutôt qu’un chiffre qui décourage.', confidence: ind.reliability, action: { type: 'open', route: '/life/indicateurs', label: 'Ouvrir les indicateurs' }, signature: ind.signature, priority: 30 })

  // SPORT — sécurité d'abord : récupération insuffisante → repos adapté ; jamais d'incitation à s'entraîner
  if (c.hasSport) {
    const spike = OBS(o, 'sport-load-spike')
    if (unsafe || spike) out.push({ id: 'rec:sport-recover', domain: 'SPORT', title: 'Prévoir une récupération adaptée', finding: unsafe ? 'Votre état de récupération demande de la prudence.' : (spike?.title ?? ''), evidence: unsafe ? [`niveau de récupération : ${c.recovery.level === 'ALERTE' ? 'alerte' : 'vigilance'} (indice ${c.recovery.index}/100)`, ...c.recovery.messages.slice(0, 2)] : (spike?.evidence ?? []), recommendation: unsafe ? 'Privilégier le repos ou une activité très douce, refaire le questionnaire demain, et ne reprendre qu’une fois la récupération revenue à la normale. En cas de douleur persistante, demandez conseil à un professionnel.' : 'Prévoir une semaine plus légère après cette hausse de charge.', benefit: 'Assimiler les efforts et limiter les risques de blessure.', confidence: unsafe ? 'high' : (spike?.reliability ?? 'medium'), action: { type: 'open', route: '/sport/recuperation', label: 'Ouvrir la récupération' }, signature: unsafe ? `unsafe:${c.recovery.level}` : (spike?.signature ?? ''), priority: unsafe ? 95 : 65 })

    // Reprise progressive : uniquement si la récupération est normale
    if (!unsafe) {
      const pause = OBS(o, 'regularity-pause') ?? OBS(o, 'regularity-resume')
      if (pause && pause.id === 'regularity-pause') out.push({ id: 'rec:resume-gradually', domain: 'SPORT', title: 'Reprendre progressivement', finding: pause.title, evidence: pause.evidence, recommendation: 'Quand vous le souhaitez : une séance courte et facile, sans chercher à retrouver le niveau d’avant d’un coup. Si une douleur ou une fatigue persiste, le repos reste le bon choix.', benefit: 'Une reprise douce se maintient mieux qu’un retour brutal.', confidence: pause.reliability, action: { type: 'open', route: '/sport', label: 'Ouvrir SPORT' }, signature: pause.signature, priority: 45 })
    }
  }

  // Valoriser une régularité qui ne se voit pas immédiatement
  const stable = OBS(o, 'regularity-stable')
  if (stable) out.push({ id: 'rec:value-regularity', domain: 'RPG', title: 'Valoriser votre régularité', finding: stable.title, evidence: stable.evidence, recommendation: 'Rien à changer : continuez à ce rythme. Cette constance pèse davantage que les pics d’activité, même si le niveau monte lentement.', benefit: 'Garder un rythme durable, sans surenchère.', confidence: stable.reliability, action: null, signature: stable.signature, priority: 20 })

  return out.sort((a, b) => b.priority - a.priority || CONF_ORDER[b.confidence] - CONF_ORDER[a.confidence] || a.id.localeCompare(b.id))
}

/**
 * Filtre selon les décisions passées : acceptée, refusée ou ignorée → masquée tant que la situation (signature) n'a pas changé ;
 * reportée → masquée jusqu'à la date de report ; une signature différente la fait réapparaître.
 */
export function filterRecommendations(recs: Recommendation[], states: RecState[], now: Date): Recommendation[] {
  const by = new Map(states.map((s) => [s.id, s]))
  const today = dayKey(now)
  return recs.filter((r) => {
    const s = by.get(r.id)
    if (!s) return true
    if (s.signature !== r.signature) return true
    if (s.status === 'snoozed') return !s.snoozeUntil || s.snoozeUntil <= today
    return false
  })
}

export const snoozeUntil = (now: Date, days = 7) => dayKey(addDays(now, days))
