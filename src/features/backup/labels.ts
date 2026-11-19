import type { BackupReason } from '@/core/backupFormat'

export const REASON_LABEL: Record<BackupReason, string> = {
  'auto-periodic': 'Automatique · quotidienne',
  'auto-change': 'Automatique · après modification',
  'auto-critical': 'Automatique · après opération importante',
  'manual-snapshot': 'Manuelle',
  'manual-export': 'Export de fichier',
  setup: 'Initialisation du chiffrement',
  'pre-restore': 'Avant restauration',
  'post-restore': 'Après restauration',
}

export const formatSize = (bytes: number) => (bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1_048_576).toFixed(1)} Mo`)

const dt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const formatDateTime = (iso: string) => dt.format(new Date(iso))

export function relativeAge(iso: string, now: Date): string {
  const min = Math.round((now.getTime() - Date.parse(iso)) / 60_000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} jours`
}
