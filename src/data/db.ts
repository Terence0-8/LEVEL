import Dexie, { type Table } from 'dexie'
import type { Category, Quest } from '@/core/quest'
import type { XpEvent } from '@/core/ledger'
import type { MissedAnalysis } from '@/core/missed'
import type { QuestRevision } from '@/core/revision'
import type { Pref } from '@/core/sport/generator'
import type { SportProfile } from '@/core/sport/profile'
import type { BodyMeasure, ExerciseState, ProgressionDecision, RecoveryCheck, SportSession } from '@/core/sport/session'
import type { Exercise } from '@/core/sport/types'
import type { Commitment, PlanMove } from '@/core/planning'
import type { NotificationLogEntry } from '@/core/notifications'

/**
 * Base locale de Level (IndexedDB). Le schéma est versionné : toute évolution
 * passe par une nouvelle `version(n).stores(...)` + `upgrade` si nécessaire.
 * Les tables "demo*" ne contiennent QUE l'état lié aux données fictives.
 */

export interface ProfileRow {
  id: 'me'
  displayName: string
  createdAt: number
}

export interface SettingRow {
  key: string
  value: unknown
}

export interface DemoQuestStateRow {
  questId: string
  doneAt: number
}

export class LevelDB extends Dexie {
  profile!: Table<ProfileRow, string>
  settings!: Table<SettingRow, string>
  demoQuestState!: Table<DemoQuestStateRow, string>
  categories!: Table<Category, string>
  quests!: Table<Quest, string>
  /** Journal d'XP append-only : source de vérité de toute progression */
  xpEvents!: Table<XpEvent, string>
  /** Analyses des quêtes manquées (historique conservé, sans effet sur l'XP) */
  analyses!: Table<MissedAnalysis, string>
  /** Trace des modifications de quêtes */
  revisions!: Table<QuestRevision, string>
  // ── SPORT (v4) ──
  sportProfile!: Table<SportProfile, string>
  exercisePrefs!: Table<Pref, string>
  customExercises!: Table<Exercise, string>
  sportSessions!: Table<SportSession, string>
  recoveryChecks!: Table<RecoveryCheck, string>
  exerciseStates!: Table<ExerciseState, string>
  progressionLog!: Table<ProgressionDecision, string>
  bodyMeasures!: Table<BodyMeasure, string>
  // ── Orchestration (v5) ──
  /** Engagements saisis dans le planning central (rendez-vous, obligations) */
  commitments!: Table<Commitment, string>
  /** Trace des réorganisations de quêtes (manuelles ou proposées par Level) */
  planningMoves!: Table<PlanMove, string>
  /** Historique des notifications émises (déduplication, plafond, boîte de réception) */
  notificationLog!: Table<NotificationLogEntry, string>

  constructor(name = 'level') {
    super(name)
    this.version(1).stores({
      profile: 'id',
      settings: 'key',
      demoQuestState: 'questId',
    })
    this.version(2).stores({
      profile: 'id',
      settings: 'key',
      demoQuestState: 'questId',
      categories: 'id, order',
      quests: 'id, archived, createdAt',
      xpEvents: 'id, awardKey, questId, at, domain',
    })
    // v3 : analyses des quêtes manquées et révisions de quêtes (tables ajoutées, données existantes inchangées ;
    // les nouveaux champs d'événements sont complétés à la lecture par `normalizeEvent`).
    this.version(3).stores({
      profile: 'id',
      settings: 'key',
      demoQuestState: 'questId',
      categories: 'id, order',
      quests: 'id, archived, createdAt',
      xpEvents: 'id, awardKey, questId, at, domain',
      analyses: 'id, questId, createdAt',
      revisions: 'id, questId, at',
    })
    // v4 : module SPORT (tables ajoutées, données existantes inchangées). L'XP SPORT vit dans `xpEvents`, comme LIFE.
    this.version(4).stores({
      profile: 'id',
      settings: 'key',
      demoQuestState: 'questId',
      categories: 'id, order',
      quests: 'id, archived, createdAt',
      xpEvents: 'id, awardKey, questId, at, domain',
      analyses: 'id, questId, createdAt',
      revisions: 'id, questId, at',
      sportProfile: 'id',
      exercisePrefs: 'exerciseId',
      customExercises: 'id',
      sportSessions: 'id, date, status, kind',
      recoveryChecks: 'id, day, at',
      exerciseStates: 'exerciseId',
      progressionLog: 'id, exerciseId, at',
      bodyMeasures: 'id, date',
    })
    // v5 : orchestration transversale (tables ajoutées, données existantes inchangées). Les préférences générales vivent dans `settings` (clé « appPrefs »).
    this.version(5).stores({
      profile: 'id',
      settings: 'key',
      demoQuestState: 'questId',
      categories: 'id, order',
      quests: 'id, archived, createdAt',
      xpEvents: 'id, awardKey, questId, at, domain',
      analyses: 'id, questId, createdAt',
      revisions: 'id, questId, at',
      sportProfile: 'id',
      exercisePrefs: 'exerciseId',
      customExercises: 'id',
      sportSessions: 'id, date, status, kind',
      recoveryChecks: 'id, day, at',
      exerciseStates: 'exerciseId',
      progressionLog: 'id, exerciseId, at',
      bodyMeasures: 'id, date',
      commitments: 'id, date',
      planningMoves: 'id, refId, at',
      notificationLog: 'id, key, at',
    })
  }
}

export const db = new LevelDB()
