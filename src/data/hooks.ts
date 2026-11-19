import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { DEFAULT_SETTINGS, repos, type Settings } from './repositories'

/** Hooks réactifs : l'UI se met à jour automatiquement quand IndexedDB change. */
export function usePersistedState() {
  const profile = useLiveQuery(() => repos.profile.get(), [])
  const settings = useLiveQuery(() => repos.settings.getAll(), [])
  const doneRows = useLiveQuery(() => db.demoQuestState.toArray(), [])
  const ready = profile !== undefined && settings !== undefined && doneRows !== undefined
  return {
    ready,
    profile: profile ?? null,
    settings: (settings ?? DEFAULT_SETTINGS) as Settings,
    doneQuests: new Map((doneRows ?? []).map((r) => [r.questId, r.doneAt])),
  }
}
