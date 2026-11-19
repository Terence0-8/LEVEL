import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { usePersistedState } from '@/data/hooks'
import { repos } from '@/data/repositories'
import { buildDemoView, type DemoView } from '@/mocks/demoView'
import type { Settings } from '@/data/repositories'

interface AppState {
  displayName: string
  settings: Settings
  /** null lorsque l'utilisateur masque les données de démonstration */
  demo: DemoView | null
  toggleDemoQuest: (id: string) => void
}

const Ctx = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { ready, profile, settings, doneQuests } = usePersistedState()

  const demo = useMemo(() => (settings.showDemoData ? buildDemoView(doneQuests) : null), [settings.showDemoData, doneQuests])

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion)
  }, [settings.reducedMotion])

  useEffect(() => {
    // Demande un stockage durable : évite l'éviction des données par le navigateur.
    void navigator.storage?.persist?.().catch(() => undefined)
  }, [])

  const value = useMemo<AppState>(
    () => ({ displayName: profile?.displayName ?? '…', settings, demo, toggleDemoQuest: (id) => void repos.demo.toggleQuest(id) }),
    [profile, settings, demo],
  )

  if (!ready) return <div style={{ minHeight: '100vh' }} aria-busy="true" />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppState() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppState hors AppStateProvider')
  return v
}
