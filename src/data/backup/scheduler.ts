import { BACKUP_POLICY } from '@/core/backupPolicy'
import type { Table } from 'dexie'
import type { LevelDB } from '../db'
import type { BackupService } from './backupService'

export type ChangeKind = 'normal' | 'critical'

export interface SchedulerDeps {
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (h: unknown) => void
  policy?: typeof BACKUP_POLICY
}

/**
 * Déclenche les sauvegardes automatiques :
 *  - périodiquement (au démarrage puis toutes les 30 min : sauvegarde si la dernière a plus de 24 h) ;
 *  - après un changement de données, avec temporisation (anti-rafale) ;
 *  - plus vite après une opération IMPORTANTE : suppression de quête, annulation/correction d'XP.
 * Les sauvegardes identiques à la précédente sont ignorées par le service (pas de doublon).
 * Aucune dépendance réseau.
 */
export function createBackupScheduler(main: LevelDB, service: BackupService, deps: SchedulerDeps = {}) {
  const clock = deps.now ?? (() => Date.now())
  const setT = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearT = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const policy = deps.policy ?? BACKUP_POLICY

  let pending: ChangeKind | null = null
  let timer: unknown = null
  let periodic: ReturnType<typeof setInterval> | null = null
  let lastChangeRun = 0
  let lastError: string | null = null
  let attached = false
  const handlers: Array<() => void> = []

  async function run() {
    timer = null
    const kind = pending
    pending = null
    if (!kind) return
    try {
      await service.createBackup(kind === 'critical' ? 'auto-critical' : 'auto-change')
      lastChangeRun = clock()
      lastError = null
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Sauvegarde automatique impossible.'
    }
  }

  function notify(kind: ChangeKind) {
    if (service.isBusy()) return
    pending = pending === 'critical' || kind === 'critical' ? 'critical' : 'normal'
    const debounce = pending === 'critical' ? policy.criticalDebounceMs : policy.changeDebounceMs
    const minInterval = pending === 'critical' ? policy.criticalMinIntervalMs : policy.changeMinIntervalMs
    const delay = Math.max(debounce, lastChangeRun + minInterval - clock())
    if (timer) clearT(timer)
    timer = setT(() => void run(), delay)
  }

  async function checkPeriodic() {
    try {
      const last = await service.lastBackupAt()
      if (!last || clock() - last.getTime() > policy.periodicHours * 3_600_000) await service.createBackup('auto-periodic')
      lastError = null
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Sauvegarde périodique impossible.'
    }
  }

  function attachHooks() {
    if (attached) return
    attached = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const on = <A extends unknown[]>(table: Table<any, any, any>, ev: 'creating' | 'updating' | 'deleting', fn: (...a: A) => ChangeKind) => {
      const h = (...a: unknown[]) => { notify(fn(...(a as A))) }
      ;(table.hook as unknown as (e: string, f: (...a: unknown[]) => void) => void)(ev, h)
      handlers.push(() => (table.hook as unknown as (e: string) => { unsubscribe: (f: unknown) => void })(ev).unsubscribe(h))
    }
    // Opérations importantes : suppression d'une quête, annulation d'un gain (événement de correction)
    on(main.quests, 'deleting', () => 'critical')
    on(main.xpEvents, 'creating', (_pk: unknown, obj: { kind?: string }) => (obj?.kind === 'reversal' ? 'critical' : 'normal'))
    // Changements ordinaires
    on(main.sportSessions, 'deleting', () => 'critical')
    on(main.xpEvents, 'updating', () => 'normal')
    for (const t of [main.quests, main.categories, main.analyses, main.revisions, main.profile, main.sportProfile, main.sportSessions, main.recoveryChecks, main.exerciseStates, main.progressionLog, main.bodyMeasures, main.customExercises, main.exercisePrefs] as const) {
      on(t, 'creating', () => 'normal')
      on(t, 'updating', () => 'normal')
    }
  }

  return {
    /** Démarre : hooks de changement, contrôle périodique immédiat puis régulier. */
    start() {
      attachHooks()
      void checkPeriodic()
      if (!periodic) periodic = setInterval(() => void checkPeriodic(), policy.periodicCheckMs)
    },
    stop() {
      if (timer) clearT(timer)
      timer = null
      if (periodic) clearInterval(periodic)
      periodic = null
      handlers.splice(0).forEach((u) => u())
      attached = false
    },
    notify,
    /** Exécute immédiatement la sauvegarde en attente (tests, fermeture). */
    async flush() { if (timer) clearT(timer); await run() },
    checkPeriodic,
    hasPending: () => pending !== null,
    lastError: () => lastError,
  }
}
