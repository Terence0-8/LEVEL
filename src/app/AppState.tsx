import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePersistedState } from '@/data/hooks'
import { repos } from '@/data/repositories'
import { questService } from '@/data/questService'
import { backups, backupScheduler } from '@/data/backup'
import { buildDemoView, type DemoView } from '@/mocks/demoView'
import type { Settings } from '@/data/repositories'
import { computeProgression, type ProgressSummary } from '@/core/progression'
import { arrangeGlobalHome, type WidgetPlacement } from '@/core/homeLayout'
import { buildDashboard, type Dashboard } from '@/core/dashboard'
import { analyseLife, lifeProposals, type Finding, type Goal, type Indicator, type LifeProposal, type Project, type Reading } from '@/core/goals'
import type { AppPrefs } from '@/core/prefs'
import type { Commitment, PlanContext, PlanMove } from '@/core/planning'
import type { NotificationLogEntry } from '@/core/notifications'
import { useNotificationRunner } from './useNotificationRunner'
import { availableTitles, ACHIEVEMENT_BY_ID, type AchievementRow } from '@/core/achievements'
import type { CycleState, PrestigeRecord } from '@/core/prestige'
import { REWARD_BY_ID, totalBonusPct, type RewardRow } from '@/core/prestigeRewards'
import { rpgService } from '@/data/rpgService'
import { eventService } from '@/data/eventService'
import { analyse, type Observation } from '@/core/insights'
import type { LifeCtx, StrategyState } from '@/core/pilotage'
import { strategicProposals, type PilotageProposal, type StrategyCtx } from '@/core/strategy'
import { buildRecommendations, filterRecommendations, type RecState, type Recommendation } from '@/core/recommendations'
import type { RpgEvent } from '@/core/rpgEvents'
import type { Domain } from '@/core/types'
import type { Category, Quest } from '@/core/quest'
import type { XpEvent } from '@/core/ledger'
import { cycleInfo, type CycleInfo } from '@/core/sport/cycle'
import { defaultProfile, measuredLevel, operationalLevel, type SportProfile } from '@/core/sport/profile'
import { evaluateRecovery, type RecoveryState } from '@/core/sport/recovery'
import type { Pref } from '@/core/sport/generator'
import type { BodyMeasure, ExerciseState, ProgressionDecision, RecoveryCheck, SportSession } from '@/core/sport/session'
import type { Exercise, Experience } from '@/core/sport/types'
import { dayKey } from '@/core/dates'
import { findMissed, type MissedAnalysis, type MissedItem } from '@/core/missed'
import type { QuestRevision } from '@/core/revision'

/** Progression affichée : réelle (journal d'XP) ou de démonstration (mocks), jamais mélangées. */
export type Progress = ProgressSummary & { isDemo: boolean; layout: WidgetPlacement[] }

/** Vue RPG dérivée (jamais stockée) : cycles de prestige, bonus, titres et distinctions récentes. */
export interface RpgView {
  cycles: Record<Domain, CycleState>
  ownedIds: Set<string>
  titles: ReturnType<typeof availableTitles>
  equippedTitle: string | null
  /** Bonus d'XP permanent total (points de %) par domaine */
  bonus: Record<Domain, number>
  prestigeReady: Domain[]
  recent: Array<{ kind: 'achievement' | 'reward'; id: string; name: string; at: string }>
}

/** Intelligence locale : observations, recommandations (filtrées par les décisions passées) et événements à consulter. */
export interface IntelView {
  observations: Observation[]
  recommendations: Recommendation[]
  /** Événements non consultés, valides, hors historique reconstitué */
  unseen: RpgEvent[]
  /** Événement important le plus récent (valide) */
  latest: RpgEvent | null
}

export interface SportState {
  profile: SportProfile
  prefs: Pref[]
  custom: Exercise[]
  sessions: SportSession[]
  checks: RecoveryCheck[]
  states: ExerciseState[]
  decisions: ProgressionDecision[]
  measures: BodyMeasure[]
  recovery: RecoveryState
  cycle: CycleInfo
  measured: Experience | null
  operational: Experience
  today: string
}

interface AppState {
  displayName: string
  settings: Settings
  /** Données de démo (null si masquées) */
  demo: DemoView | null
  progress: Progress
  quests: Quest[]
  categories: Category[]
  events: XpEvent[]
  analyses: MissedAnalysis[]
  revisions: QuestRevision[]
  /** Éléments non réalisés, pas encore analysés (aucun effet sur l'XP) */
  missed: MissedItem[]
  sport: SportState
  /** Préférences générales (planning, notifications, RPG) */
  prefs: AppPrefs
  commitments: Commitment[]
  moves: PlanMove[]
  notifLog: NotificationLogEntry[]
  /** Contexte du planning central (LIFE + SPORT + engagements) */
  plan: PlanContext
  /** Tableau de bord global (null en mode démonstration) */
  dashboard: Dashboard | null
  /** Objectifs, projets, indicateurs et mesures (LIFE V1.1) */
  goals: Goal[]
  projects: Project[]
  indicators: Indicator[]
  readings: Reading[]
  /** Constats et adaptations proposées (jamais appliquées sans confirmation) */
  lifeFindings: Finding[]
  lifeProposals: LifeProposal[]
  prestiges: PrestigeRecord[]
  rewards: RewardRow[]
  achievements: AchievementRow[]
  rpg: RpgView
  rpgEvents: RpgEvent[]
  recStates: RecState[]
  intel: IntelView
  /** Vision, orientations, priorités, plans, cycles, revues et mémoire stratégique (Pilotage) */
  strategy: StrategyState
  /** Contexte LIFE partagé (références résolues, avancement calculé) */
  lifeCtx: LifeCtx
  pilotageProposals: PilotageProposal[]
  now: Date
  toggleDemoQuest: (id: string) => void
}

const Ctx = createContext<AppState | null>(null)

/** Horloge réactive : se met à jour chaque minute (changement de jour, de cycle). */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { ready, profile, settings, doneQuests, quests, categories, events, analyses, revisions, sportRaw, commitments, moves, notifLog, prefs, goals, projects, indicators, readings, prestiges, rewards, achievements, rpgEvents, recStates, strategyRaw } = usePersistedState()
  const now = useNow()

  const demo = useMemo(() => (settings.showDemoData ? buildDemoView(doneQuests) : null), [settings.showDemoData, doneQuests])

  const missed = useMemo(() => findMissed(quests, events, analyses, now), [quests, events, analyses, now])

  const sport = useMemo<SportState>(() => {
    const prof = sportRaw.profile ?? defaultProfile('')
    const today = dayKey(now)
    const recovery = evaluateRecovery({ checks: sportRaw.checks, sessions: sportRaw.sessions, now, today, custom: sportRaw.custom })
    const measured = measuredLevel(sportRaw.sessions, sportRaw.decisions.filter((d) => d.applied && d.action === 'increase').length, now)
    return { ...sportRaw, profile: prof, recovery, cycle: cycleInfo(prof.cycleStartWeek, now), measured, operational: operationalLevel(prof.experience, measured), today }
  }, [sportRaw, now])

  const plan = useMemo<PlanContext>(() => ({
    quests, events, commitments, sessions: sport.sessions, moves, prefs: prefs.planning, sportDays: sport.profile.availability.days, recovery: sport.recovery, now,
    life: { goals, projects, indicators, readings },
  }), [quests, events, commitments, sport, moves, prefs.planning, now, goals, projects, indicators, readings])

  const analysis = useMemo(() => {
    const input = { goals, projects, indicators, readings, quests, events, now, prefs: prefs.planning }
    const findings = analyseLife(input)
    return { findings, proposals: lifeProposals(findings, input) }
  }, [goals, projects, indicators, readings, quests, events, now, prefs.planning])

  const rpg = useMemo<RpgView>(() => {
    const cycles = computeProgression(events, prestiges).cycles!
    const titles = availableTitles(achievements, rewards)
    const recent = [
      ...achievements.map((a) => ({ kind: 'achievement' as const, id: a.id, name: ACHIEVEMENT_BY_ID[a.id]?.title ?? a.id, at: a.unlockedAt })),
      ...rewards.map((r) => ({ kind: 'reward' as const, id: r.id, name: REWARD_BY_ID[r.id]?.name ?? r.id, at: r.acquiredAt })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)
    return {
      cycles, ownedIds: new Set(rewards.map((r) => r.id)), titles, equippedTitle: prefs.rpg.title && titles.some((x) => x.id === prefs.rpg.title) ? prefs.rpg.title : null,
      bonus: { LIFE: totalBonusPct('LIFE', rewards), SPORT: totalBonusPct('SPORT', rewards) }, prestigeReady: (['LIFE', 'SPORT'] as const).filter((d) => cycles[d].eligible), recent,
    }
  }, [events, prestiges, achievements, rewards, prefs.rpg.title])

  const strategy = strategyRaw
  const lifeCtx = useMemo<LifeCtx>(() => ({ life: { goals, projects, indicators, readings }, quests, events, now }), [goals, projects, indicators, readings, quests, events, now])
  const strategyCtx = useMemo<StrategyCtx>(() => ({ strategy, prefs: prefs.pilotage, life: lifeCtx, findings: analysis.findings, planning: { dueQuestGoalIds: new Set<string>() } }), [strategy, prefs.pilotage, lifeCtx, analysis.findings])
  const pilotageProposals = useMemo(() => (demo ? [] : strategicProposals(strategyCtx)), [demo, strategyCtx])

  const intel = useMemo<IntelView>(() => {
    if (demo) return { observations: [], recommendations: [], unseen: [], latest: null }
    const observations = analyse({ plan, checks: sport.checks, categories, sportTarget: sport.profile.availability.strengthPerWeek, findings: analysis.findings, strategy: strategyCtx }, sport.recovery)
    const recommendations = filterRecommendations(buildRecommendations({ observations, lifeProposals: analysis.proposals, pilotageProposals, recovery: sport.recovery, now, hasSport: sport.sessions.length > 0 }), recStates, now)
    const valid = rpgEvents.filter((e) => !e.revokedAt)
    return { observations, recommendations, unseen: valid.filter((e) => !e.seenAt && !e.backfill), latest: valid.find((e) => e.importance !== 'info') ?? null }
  }, [demo, plan, sport, categories, analysis, strategyCtx, pilotageProposals, recStates, rpgEvents, now])

  const dashboard = useMemo<Dashboard | null>(() => (demo ? null : buildDashboard({ plan, checks: sport.checks, missedCount: missed.length, sportTarget: sport.profile.availability.strengthPerWeek, findings: analysis.findings, prestigeReady: rpg.prestigeReady, recentUnlocks: rpg.recent.filter((r) => now.getTime() - new Date(r.at).getTime() < 14 * 86_400_000).length })), [demo, plan, sport.checks, sport.profile.availability.strengthPerWeek, missed.length, analysis.findings, rpg])

  const progress = useMemo<Progress>(() => {
    if (demo) return { ...demo, isDemo: true }
    const p = computeProgression(events, prestiges)
    return { ...p, isDemo: false, layout: dashboard ? arrangeGlobalHome({ ...dashboard.home, insight: !!intel.latest || intel.observations.some((o) => o.reliability !== 'low') || intel.recommendations.length > 0 }) : [] }
  }, [demo, events, prestiges, dashboard, intel])

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion)
  }, [settings.reducedMotion])

  useEffect(() => {
    // Demande un stockage durable : évite l'éviction des données par le navigateur.
    void navigator.storage?.persist?.().catch(() => undefined)
    void questService.seedCategories()
    // Sauvegardes locales chiffrées : initialisation de la clé, planificateur, puis contrôle d'intégrité différé.
    void backups.init().then(() => backupScheduler.start())
    const verifyLater = setTimeout(() => void backups.verifyAll().catch(() => undefined), 8_000)
    return () => { clearTimeout(verifyLater); backupScheduler.stop() }
  }, [])

  useEffect(() => {
    // Succès : évalués quand les données changent (jamais en démonstration) ; écriture hors requête live, sans doublon possible.
    if (demo || !ready) return
    const h = setTimeout(() => void rpgService.syncAchievements().catch(() => undefined), 1200)
    return () => clearTimeout(h)
  }, [demo, ready, events, sport.sessions, sport.checks, goals, projects, indicators, readings, prestiges])

  useEffect(() => {
    // Journal RPG : recalculé depuis les faits (jamais en démonstration) ; après la synchronisation des succès et des récompenses
    if (demo || !ready) return
    const h = setTimeout(() => void eventService.sync().catch(() => undefined), 1800)
    return () => clearTimeout(h)
  }, [demo, ready, events, quests, sport.sessions, sport.checks, goals, projects, indicators, readings, prestiges, rewards, achievements])

  useNotificationRunner({ enabled: !demo && ready, prefs, quests, events, sessions: sport.sessions, checks: sport.checks, recovery: sport.recovery, commitments, progress, rpgEvents: rpgEvents.filter((e) => !e.revokedAt), recommendation: intel.recommendations[0] ?? null, strategy })

  const value = useMemo<AppState>(
    () => ({
      displayName: profile?.displayName ?? '…', settings, demo, progress, quests, categories, events, analyses, revisions, missed, sport, prefs, commitments, moves, notifLog, plan, dashboard, goals, projects, indicators, readings, lifeFindings: analysis.findings, lifeProposals: analysis.proposals, prestiges, rewards, achievements, rpg, rpgEvents, recStates, intel, strategy, lifeCtx, pilotageProposals, now,
      toggleDemoQuest: (id) => void repos.demo.toggleQuest(id),
    }),
    [profile, settings, demo, progress, quests, categories, events, analyses, revisions, missed, sport, prefs, commitments, moves, notifLog, plan, dashboard, goals, projects, indicators, readings, analysis, prestiges, rewards, achievements, rpg, rpgEvents, recStates, intel, strategy, lifeCtx, pilotageProposals, now],
  )

  if (!ready) return <div style={{ minHeight: '100vh' }} aria-busy="true" />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState hors AppStateProvider')
  return v
}

