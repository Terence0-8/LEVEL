import { useLiveQuery } from 'dexie-react-hooks'
import { normalizeEvent } from '@/core/ledger'
import { mergePrefs } from '@/core/prefs'
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
  const commitments = useLiveQuery(() => db.commitments.orderBy('date').toArray(), [])
  const moves = useLiveQuery(() => db.planningMoves.orderBy('at').toArray(), [])
  const notifLog = useLiveQuery(() => db.notificationLog.orderBy('at').reverse().toArray(), [])
  const prefsRow = useLiveQuery(() => db.settings.get('appPrefs').then((r) => r ?? null), [])
  const goals = useLiveQuery(() => db.goals.toArray(), [])
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const indicators = useLiveQuery(() => db.indicators.toArray(), [])
  const readings = useLiveQuery(() => db.indicatorReadings.orderBy('at').toArray(), [])
  const ready = [goals, projects, indicators, readings, commitments, moves, notifLog, prefsRow, profile, settings, doneRows, quests, categories, events, analyses, revisions, sportProfile, prefs, customEx, sportSessions, checks, exStates, decisions, measures].every((x) => x !== undefined)
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
    goals: goals ?? [],
    projects: projects ?? [],
    indicators: indicators ?? [],
    readings: readings ?? [],
    commitments: commitments ?? [],
    moves: moves ?? [],
    notifLog: notifLog ?? [],
    prefs: mergePrefs(prefsRow?.value),
    sportRaw: { profile: sportProfile ?? null, prefs: prefs ?? [], custom: customEx ?? [], sessions: sportSessions ?? [], checks: checks ?? [], states: exStates ?? [], decisions: decisions ?? [], measures: measures ?? [] },
  }
}
