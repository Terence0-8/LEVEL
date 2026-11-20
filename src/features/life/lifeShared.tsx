import { useMemo, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { goalProgress, projectProgress, type GoalProgress, type ProjectProgress } from '@/core/goals'
import { GoalError } from '@/data/goalService'
import { QuestError } from '@/data/questService'
import { Icon } from '@/design/Icon'
import s from './life.module.css'

export const pct = (v: number) => `${Math.round(v * 100)} %`
export const errMsg = (e: unknown) => (e instanceof GoalError || e instanceof QuestError ? (e.message && e.message !== e.code ? e.message : 'Action impossible.') : 'Action impossible pour le moment.')

/** Avancements calculés (jamais stockés) pour tous les objectifs et projets. */
export function useLifeMaps() {
  const { goals, projects, quests, events, now } = useAppState()
  return useMemo(() => {
    const projectP = new Map<string, ProjectProgress>(projects.map((p) => [p.id, projectProgress(p, quests, events, now)]))
    const goalP = new Map<string, GoalProgress>(goals.map((g) => [g.id, goalProgress(g, { projects }, quests, events, now)]))
    return { projectP, goalP }
  }, [goals, projects, quests, events, now])
}

/** Exécute une commande et mémorise un éventuel message d'erreur à afficher. */
export function useRunner() {
  const [error, setError] = useState<string | null>(null)
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setError(null)
    try { return await fn() } catch (e) { setError(errMsg(e)); return undefined }
  }
  return { error, setError, run }
}

export function Box({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return <button type="button" className={s.box} aria-pressed={checked} aria-label={label} onClick={onToggle}>{checked ? <Icon name="check" size={16} /> : null}</button>
}

export const catName = (cats: Array<{ id: string; name: string }>, id: string) => cats.find((c) => c.id === id)?.name ?? 'Catégorie'
