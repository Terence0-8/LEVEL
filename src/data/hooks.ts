import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { DEFAULT_SETTINGS, repos, type Settings } from './repositories'

/** Hooks réactifs : l'UI se met à jour automatiquement quand IndexedDB change. Lecture seule. */
export function usePersistedState() {
  const profile = useLiveQuery(() => repos.profile.get(), [])
  const settings = useLiveQuery(() => repos.settings.getAll(), [])
  const doneRows = useLiveQuery(() => db.demoQuestState.toArray(), [])
  const quests = useLiveQuery(() => db.quests.orderBy('createdAt').toArray(), [])
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), [])
  const events = useLiveQuery(() => db.xpEvents.orderBy('at').toArray(), [])
  const ready = [profile, settings, doneRows, quests, categories, events].every((x) => x !== undefined)
  return {
    ready,
    profile: profile ?? null,
    settings: (settings ?? DEFAULT_SETTINGS) as Settings,
    doneQuests: new Map((doneRows ?? []).map((r) => [r.questId, r.doneAt])),
    quests: quests ?? [],
    categories: categories ?? [],
    events: events ?? [],
  }
}
