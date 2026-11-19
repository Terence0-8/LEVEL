import type { Difficulty, Priority, QuestStatus, QuestType } from '@/core/quest'
import type { MissedAction, MissedCause } from '@/core/missed'
import type { QuestField } from '@/core/revision'
import { dateOfWeekKey } from '@/core/dates'

export const TYPE_LABEL: Record<QuestType, string> = { daily: 'Quotidienne', weekly: 'Hebdomadaire', personal: 'Personnelle', exceptional: 'Exceptionnelle' }
export const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as QuestType[]).map((value) => ({ value, label: TYPE_LABEL[value] }))
export const TYPE_HINT: Record<QuestType, string> = {
  daily: 'Se réarme chaque jour ; une série compte les jours accomplis.',
  weekly: 'Se réarme chaque semaine.',
  personal: 'Quête unique, à votre rythme.',
  exceptional: 'Quête unique, hors routine.',
}

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Basse', normal: 'Normale', high: 'Haute' }
export const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABEL) as Priority[]).map((value) => ({ value, label: PRIORITY_LABEL[value] }))

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Facile', normal: 'Normale', hard: 'Difficile', epic: 'Épique' }
export const DIFFICULTY_OPTIONS = (Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((value) => ({ value, label: DIFFICULTY_LABEL[value] }))

export const EFFORT_OPTIONS = [5, 15, 30, 60, 120, 240].map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : `${m / 60} h` }))

export const STATUS_LABEL: Record<QuestStatus, string> = { todo: 'À faire', in_progress: 'En cours', done: 'Accomplie', overdue: 'Échéance passée', archived: 'Archivée' }

export const formatDue = (d: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00'))

export const CAUSE_LABEL: Record<MissedCause, string> = {
  forgot: 'Oubli', no_time: 'Manque de temps', difficulty: 'Difficulté', motivation: 'Motivation', unforeseen: 'Imprévu', rest: 'Repos nécessaire',
}
export const CAUSES = Object.keys(CAUSE_LABEL) as MissedCause[]

export const ACTION_LABEL: Record<MissedAction, string> = {
  none: 'Rien pour l’instant', postpone: 'Reporter', simplify: 'Simplifier', replace: 'Remplacer', suspend: 'Suspendre',
}
export const ACTION_HINT: Record<MissedAction, string> = {
  none: 'Garder la quête telle quelle.',
  postpone: 'Nouvelle échéance (quête unique) ou rattrapage daté (quête récurrente).',
  simplify: 'Difficulté d’un cran en dessous, effort divisé par deux.',
  replace: 'Créer une quête plus adaptée et archiver celle-ci.',
  suspend: 'Archiver la quête ; elle pourra être réactivée.',
}

export const FIELD_LABEL: Record<QuestField, string> = {
  title: 'Titre', description: 'Description', type: 'Type', categoryId: 'Catégorie', priority: 'Priorité', dueDate: 'Échéance',
  difficulty: 'Difficulté', effortMinutes: 'Effort (min)', steps: 'Étapes', rewardXp: 'Récompense (XP)',
}

export function formatFieldValue(field: QuestField, value: string, categoryName: (id: string) => string): string {
  if (value === '') return '—'
  if (field === 'type') return TYPE_LABEL[value as QuestType] ?? value
  if (field === 'priority') return PRIORITY_LABEL[value as Priority] ?? value
  if (field === 'difficulty') return DIFFICULTY_LABEL[value as Difficulty] ?? value
  if (field === 'categoryId') return categoryName(value)
  return value
}

const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/** Libellé lisible d'un cycle manqué : jour, semaine ou échéance. */
export function formatCycle(cycleKey: string): string {
  if (cycleKey.startsWith('due:')) return `Échéance du ${formatDue(cycleKey.slice(4))}`
  if (cycleKey.includes('-W')) {
    const monday = dateOfWeekKey(cycleKey)
    return `Semaine du ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(monday)}`
  }
  const s = longDay.format(new Date(cycleKey + 'T12:00:00'))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Date « YYYY-MM-DD » à proposer pour rattraper un cycle (null si non rattrapable). */
export function catchUpDate(cycleKey: string): string | null {
  if (cycleKey.startsWith('due:')) return null
  if (cycleKey.includes('-W')) {
    const d = dateOfWeekKey(cycleKey)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return cycleKey
}

export const ERROR_MESSAGES: Record<string, string> = {
  invalid_percent: 'Indiquez une part de travail entre 10 % et 90 %.',
  no_progress: 'Rien de nouveau à récompenser : la progression doit dépasser d’au moins 10 points la précédente, ou le plafond avant réussite est atteint.',
  effort_already_declared: 'Un effort a déjà été enregistré pour ce cycle.',
  micro_not_allowed: 'Pour une micro-tâche (10 min ou moins), validez-la simplement : pas de crédit partiel.',
  cycle_completed: 'Cette quête est déjà validée pour cette date.',
  already_awarded: 'Cette quête est déjà validée pour cette date.',
  future_date: 'La date ne peut pas être dans le futur.',
  retro_out_of_range: 'Validation rétroactive limitée à 14 jours en arrière.',
  invalid_date: 'Date invalide.',
  already_analyzed: 'Cet élément a déjà été analysé.',
  invalid_cause: 'Choisissez une cause.',
  invalid_due: 'Choisissez une échéance à partir d’aujourd’hui.',
  invalid_replacement: 'Donnez un titre de 80 caractères maximum pour la quête de remplacement.',
}
