import Dexie, { type Table } from 'dexie'

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

  constructor(name = 'level') {
    super(name)
    this.version(1).stores({
      profile: 'id',
      settings: 'key',
      demoQuestState: 'questId',
    })
  }
}

export const db = new LevelDB()
