import { useLiveQuery } from 'dexie-react-hooks'
import { normalizeEvent } from '@/core/ledger'
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
  const analyses = useLiveQuery(() => db.analyses.orderBy('createdAt').reverse().toArray(), [])
  const revisions = useLiveQuery(() => db.revisions.orderBy('at').reverse().toArray(), [])
  const sportProfile = useLiveQuery(() => db.sportProfile.get('me').then((p) => p ?? null), [])
  const prefs = useLiveQuery(() => db.exercisePrefs.toArray(), [])
  const customEx = useLiveQuery(() => db.customExercises.toArray(), [])
  const sportSessions = useLiveQuery(() => db.sportSessions.orderBy('date').toArray(), [])
  const checks = useLiveQuery(() => db.recoveryChecks.orderBy('at').toArray(), [])
  const exStates = useLiveQuery(() => db.exerciseStates.toArray(), [])
  const decisions = useLiveQuery(() => db.progressionLog.orderBy('at').toArray(), [])
  const measures = useLiveQuery(() => db.bodyMeasures.orderBy('date').toArray(), [])
  const ready = [profile, settings, doneRows, quests, categories, events, analyses, revisions, sportProfile, prefs, customEx, sportSessions, checks, exStates, decisions, measures].every((x) => x !== undefined)
  return {
    ready,
    profile: profile ?? null,
    settings: (settings ?? DEFAULT_SETTINGS) as Settings,
    doneQuests: new Map((doneRows ?? []).map((r) => [r.questId, r.doneAt])),
    quests: quests ?? [],
    categories: categories ?? [],
    events: (events ?? []).map(normalizeEvent),
    analyses: analyses ?? [],
    revisions: revisions ?? [],
    sportRaw: { profile: sportProfile ?? null, prefs: prefs ?? [], custom: customEx ?? [], sessions: sportSessions ?? [], checks: checks ?? [], states: exStates ?? [], decisions: decisions ?? [], measures: measures ?? [] },
  }
}
