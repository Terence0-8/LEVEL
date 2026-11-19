import { db } from '../db'
import { backupDb } from './backupDb'
import { createBackupService } from './backupService'
import { createBackupScheduler } from './scheduler'

/** Singletons de l'application. */
export const backups = createBackupService(db, backupDb)
export const backupScheduler = createBackupScheduler(db, backups)
export { BackupError, parseEnvelopeText } from './backupService'
export type { RestorePlan, RestoreReport, Secret } from './backupService'
