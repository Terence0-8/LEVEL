import { dayKey, weekKey } from './dates'
import { isAutoReason, PROTECTED_REASONS, type BackupReason, type Verification } from './backupFormat'

/** Paramètres de la stratégie de sauvegarde (centralisés, ajustables). */
export const BACKUP_POLICY = {
  /** Sauvegarde périodique si la dernière a plus de N heures */
  periodicHours: 24,
  /** Vérification de la périodicité pendant que l'application est ouverte */
  periodicCheckMs: 30 * 60_000,
  /** Après un changement ordinaire : attendre N ms d'inactivité, pas plus d'une sauvegarde par intervalle */
  changeDebounceMs: 60_000,
  changeMinIntervalMs: 15 * 60_000,
  /** Après une opération importante (suppression de quête, correction/annulation d'XP, restauration) */
  criticalDebounceMs: 3_000,
  criticalMinIntervalMs: 60_000,
  /** Rétention des sauvegardes automatiques */
  keepRecent: 8,
  keepDaily: 14,
  keepWeekly: 8,
  /** Sauvegardes de sécurité avant restauration conservées */
  keepPreRestore: 5,
  /** Au-delà, l'état de santé passe en « attention » */
  staleAfterHours: 48,
} as const

export interface BackupListItem {
  id: string
  createdAt: string
  reason: BackupReason
  verification: Verification | null
}

/**
 * Sélectionne les sauvegardes à supprimer. Règles :
 *  - les sauvegardes manuelles, d'export et d'initialisation ne sont jamais supprimées automatiquement ;
 *  - 'pre-restore' : les N plus récentes ;
 *  - automatiques : les `keepRecent` plus récentes + la plus récente de chacun des `keepDaily` derniers jours
 *    + la plus récente de chacune des `keepWeekly` dernières semaines ;
 *  - la plus récente sauvegarde vérifiée « ok » n'est JAMAIS supprimée.
 */
export function selectBackupsToDelete(items: BackupListItem[], now: Date, policy = BACKUP_POLICY): string[] {
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const keep = new Set<string>()

  const newestOk = sorted.find((i) => i.verification && (i.verification.status === 'ok' || i.verification.status === 'warning'))
  if (newestOk) keep.add(newestOk.id)

  for (const i of sorted) if ((PROTECTED_REASONS as string[]).includes(i.reason)) keep.add(i.id)

  sorted.filter((i) => i.reason === 'pre-restore').slice(0, policy.keepPreRestore).forEach((i) => keep.add(i.id))

  const auto = sorted.filter((i) => isAutoReason(i.reason) || i.reason === 'post-restore')
  auto.slice(0, policy.keepRecent).forEach((i) => keep.add(i.id))

  const dayCut = new Date(now); dayCut.setDate(dayCut.getDate() - policy.keepDaily)
  const weekCut = new Date(now); weekCut.setDate(weekCut.getDate() - policy.keepWeekly * 7)
  const seenDays = new Set<string>()
  const seenWeeks = new Set<string>()
  for (const i of auto) {
    const d = new Date(i.createdAt)
    if (d >= dayCut) {
      const k = dayKey(d)
      if (!seenDays.has(k)) { seenDays.add(k); keep.add(i.id) }
    } else if (d >= weekCut) {
      const k = weekKey(d)
      if (!seenWeeks.has(k)) { seenWeeks.add(k); keep.add(i.id) }
    }
  }

  return sorted.filter((i) => !keep.has(i.id)).map((i) => i.id)
}

export type HealthLevel = 'ok' | 'attention' | 'critical'
export interface BackupHealth {
  level: HealthLevel
  /** Messages d'action, du plus important au moins important */
  messages: string[]
}

/** État de santé des sauvegardes, dérivé (jamais affirmé sans preuve). */
export function backupHealth(
  items: BackupListItem[],
  protection: { configured: boolean; testedAt?: string | null },
  now: Date,
  policy = BACKUP_POLICY,
): BackupHealth {
  const messages: string[] = []
  let level: HealthLevel = 'ok'
  const raise = (l: HealthLevel, m: string) => { messages.push(m); if (l === 'critical' || level === 'ok') level = l }
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const latest = sorted[0]
  const goodExists = sorted.some((i) => i.verification && (i.verification.status === 'ok' || i.verification.status === 'warning'))

  if (!latest) raise('critical', 'Aucune sauvegarde pour l’instant.')
  else if (latest.verification && (latest.verification.status === 'corrupt' || latest.verification.status === 'incompatible')) raise('critical', 'La dernière sauvegarde est illisible.')
  else if (!goodExists) raise('critical', 'Aucune sauvegarde vérifiée.')
  if (latest) {
    const ageH = (now.getTime() - Date.parse(latest.createdAt)) / 3_600_000
    if (ageH > policy.staleAfterHours) raise('attention', 'La dernière sauvegarde date de plus de 48 h.')
  }
  if (!protection.configured) raise('attention', 'Aucune phrase secrète : vos sauvegardes ne sont pas récupérables hors de cet appareil.')
  else if (!protection.testedAt) raise('attention', 'La récupération avec votre phrase secrète n’a pas encore été testée.')
  return { level, messages }
}
