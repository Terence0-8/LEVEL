import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useAppState } from '@/app/AppState'
import { backupHealth } from '@/core/backupPolicy'
import { backupDb } from '@/data/backup/backupDb'

/** Lecture réactive des points de restauration et de l'état de protection (jamais le contenu chiffré). */
export function useBackupData() {
  const { now } = useAppState()
  const list = useLiveQuery(() => backupDb.backups.orderBy('createdAt').reverse().toArray(), [])
  const protection = useLiveQuery(async () => (await backupDb.keystore.get('main'))?.protection ?? null, [])
  const ready = list !== undefined && protection !== undefined
  const health = useMemo(
    () => backupHealth((list ?? []).map((m) => ({ id: m.id, createdAt: m.createdAt, reason: m.reason, verification: m.verification })),
      { configured: !!protection, testedAt: protection?.testedAt ?? null }, now),
    [list, protection, now],
  )
  return { ready, list: list ?? [], protection: protection ?? null, health }
}

/** Exécution d'une action asynchrone avec état d'attente et message d'erreur. */
import { useState } from 'react'
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opération impossible.')
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}
