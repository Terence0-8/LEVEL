import { db, type LevelDB, type ProfileRow } from './db'

/** Accès aux données. L'UI ne parle jamais directement à Dexie. */

export const DEFAULT_PROFILE_NAME = 'Éveillé'

export interface Settings {
  /** Affiche les données fictives de démonstration */
  showDemoData: boolean
  reducedMotion: boolean
  /** Les catégories LIFE initiales ont été créées (évite de les recréer si l'utilisateur les supprime) */
  categoriesSeeded: boolean
}

export const DEFAULT_SETTINGS: Settings = { showDemoData: false, reducedMotion: false, categoriesSeeded: false }

export function createRepositories(database: LevelDB = db) {
  return {
    profile: {
      /** Lecture seule (sûre dans une requête live) : retourne un profil par défaut tant que rien n'est enregistré. */
      async get(): Promise<ProfileRow> {
        const row = await database.profile.get('me')
        return row ?? { id: 'me', displayName: DEFAULT_PROFILE_NAME, createdAt: 0 }
      },
      async setName(displayName: string) {
        const clean = displayName.trim().slice(0, 24) || DEFAULT_PROFILE_NAME
        const current = await this.get()
        await database.profile.put({ ...current, displayName: clean, createdAt: current.createdAt || Date.now() })
      },
    },
    settings: {
      async getAll(): Promise<Settings> {
        const rows = await database.settings.toArray()
        const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
        for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value
        return out as unknown as Settings
      },
      async set<K extends keyof Settings>(key: K, value: Settings[K]) {
        await database.settings.put({ key, value })
      },
    },
    demo: {
      async toggleQuest(questId: string) {
        const existing = await database.demoQuestState.get(questId)
        if (existing) await database.demoQuestState.delete(questId)
        else await database.demoQuestState.put({ questId, doneAt: Date.now() })
      },
      async reset() {
        await database.demoQuestState.clear()
      },
    },
  }
}

export const repos = createRepositories()
