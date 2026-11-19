import { TABLE_KEYS, TABLE_NAMES, type BackupTables } from '@/core/backupFormat'
import type { LevelDB } from '../db'

/** Lecture cohérente (une seule transaction) de TOUTES les tables, triées par clé primaire. */
export async function readTables(database: LevelDB): Promise<BackupTables> {
  const tables = TABLE_NAMES.map((n) => database.table(n))
  return database.transaction('r', tables, async () => {
    const out = {} as BackupTables
    for (const n of TABLE_NAMES) {
      const key = TABLE_KEYS[n]
      const rows = (await database.table(n).toArray()) as Array<Record<string, unknown>>
      out[n] = rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])))
    }
    return out
  })
}

/** Remplace TOUTES les tables de façon atomique : en cas d'erreur, la transaction annule tout. */
export async function writeTables(database: LevelDB, tables: BackupTables): Promise<void> {
  const stores = TABLE_NAMES.map((n) => database.table(n))
  await database.transaction('rw', stores, async () => {
    for (const n of TABLE_NAMES) {
      await database.table(n).clear()
      if (tables[n].length) await database.table(n).bulkAdd(tables[n])
    }
  })
}
