import { mergePrefs, type AppPrefs } from '@/core/prefs'
import { db, type LevelDB } from './db'

/**
 * Préférences générales de l'application (planning, notifications, RPG, niveaux déjà vus).
 * Stockées dans `settings` (clé « appPrefs ») : elles sont donc couvertes par les sauvegardes chiffrées, sans nouvelle table.
 * Les réglages propres aux modules (profil sportif, barèmes LIFE…) restent dans leurs modules : ce service ne les duplique pas.
 */
export const PREFS_KEY = 'appPrefs'

export async function readPrefs(database: LevelDB = db): Promise<AppPrefs> {
  const row = await database.settings.get(PREFS_KEY)
  return mergePrefs(row?.value)
}

export function createPrefsService(database: LevelDB = db) {
  return {
    /** Mise à jour fonctionnelle dans UNE transaction : deux modifications concurrentes ne s'écrasent pas. */
    update: (fn: (current: AppPrefs) => AppPrefs): Promise<AppPrefs> =>
      database.transaction('rw', database.settings, async () => {
        const next = mergePrefs(fn(await readPrefs(database)))
        await database.settings.put({ key: PREFS_KEY, value: next })
        return next
      }),
    reset: (): Promise<AppPrefs> => prefsService.update(() => mergePrefs(undefined)),
  }
}
export const prefsService = createPrefsService()
