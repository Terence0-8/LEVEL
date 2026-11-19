import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePersistedState } from '@/data/hooks'
import { repos } from '@/data/repositories'
import { questService } from '@/data/questService'
import { backups, backupScheduler } from '@/data/backup'
import { buildDemoView, type DemoView } from '@/mocks/demoView'
import type { Settings } from '@/data/repositories'
import { computeProgression, type ProgressSummary } from '@/core/progression'
import { arrangeHome, type WidgetPlacement } from '@/core/homeLayout'
import { cycleProgress, questStatus } from '@/core/questState'
import { isRecurring, type Category, type Quest } from '@/core/quest'
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
  const { ready, profile, settings, doneQuests, quests, categories, events, analyses, revisions, sportRaw } = usePersistedState()
  const now = useNow()

  const demo = useMemo(() => (settings.showDemoData ? buildDemoView(doneQuests) : null), [settings.showDemoData, doneQuests])

  const progress = useMemo<Progress>(() => {
    if (demo) return { ...demo, isDemo: true }
    const p = computeProgression(events)
    const pending = quests.filter((q) => !q.archived && questStatus(q, cycleProgress(q, events, now), now) !== 'done')
    const due = pending
      .filter((q) => q.dueDate)
      .map((q) => (new Date(q.dueDate + 'T23:59:59').getTime() - now.getTime()) / 3_600_000)
    const dailyOpen = pending.some((q) => isRecurring(q.type))
    const layout = arrangeHome({
      now,
      pendingQuests: pending.length,
      nearestDeadlineHours: due.length ? Math.min(...due) : dailyOpen ? 24 : null,
      sportPlannedToday: false,
      recovery: 100,
    }).filter((w) => w.id !== 'sport')
    return { ...p, isDemo: false, layout }
  }, [demo, events, quests, now])

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

  const missed = useMemo(() => findMissed(quests, events, analyses, now), [quests, events, analyses, now])

  const sport = useMemo<SportState>(() => {
    const prof = sportRaw.profile ?? defaultProfile('')
    const today = dayKey(now)
    const recovery = evaluateRecovery({ checks: sportRaw.checks, sessions: sportRaw.sessions, now, today, custom: sportRaw.custom })
    const measured = measuredLevel(sportRaw.sessions, sportRaw.decisions.filter((d) => d.applied && d.action === 'increase').length, now)
    return { ...sportRaw, profile: prof, recovery, cycle: cycleInfo(prof.cycleStartWeek, now), measured, operational: operationalLevel(prof.experience, measured), today }
  }, [sportRaw, now])

  const value = useMemo<AppState>(
    () => ({
      displayName: profile?.displayName ?? '…', settings, demo, progress, quests, categories, events, analyses, revisions, missed, sport, now,
      toggleDemoQuest: (id) => void repos.demo.toggleQuest(id),
    }),
    [profile, settings, demo, progress, quests, categories, events, analyses, revisions, missed, sport, now],
  )

  if (!ready) return <div style={{ minHeight: '100vh' }} aria-busy="true" />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState hors AppStateProvider')
  return v
}

