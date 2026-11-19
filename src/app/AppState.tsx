import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePersistedState } from '@/data/hooks'
import { repos } from '@/data/repositories'
import { questService } from '@/data/questService'
import { buildDemoView, type DemoView } from '@/mocks/demoView'
import type { Settings } from '@/data/repositories'
import { computeProgression, type ProgressSummary } from '@/core/progression'
import { arrangeHome, type WidgetPlacement } from '@/core/homeLayout'
import { cycleProgress, questStatus } from '@/core/questState'
import { isRecurring, type Category, type Quest } from '@/core/quest'
import type { XpEvent } from '@/core/ledger'

/** Progression affichée : réelle (journal d'XP) ou de démonstration (mocks), jamais mélangées. */
export type Progress = ProgressSummary & { isDemo: boolean; layout: WidgetPlacement[] }

interface AppState {
  displayName: string
  settings: Settings
  /** Données de démo (null si masquées) */
  demo: DemoView | null
  progress: Progress
  quests: Quest[]
  categories: Category[]
  events: XpEvent[]
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
  const { ready, profile, settings, doneQuests, quests, categories, events } = usePersistedState()
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
  }, [])

  const value = useMemo<AppState>(
    () => ({
      displayName: profile?.displayName ?? '…', settings, demo, progress, quests, categories, events, now,
      toggleDemoQuest: (id) => void repos.demo.toggleQuest(id),
    }),
    [profile, settings, demo, progress, quests, categories, events, now],
  )

  if (!ready) return <div style={{ minHeight: '100vh' }} aria-busy="true" />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState hors AppStateProvider')
  return v
}

