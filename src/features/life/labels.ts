import type { Difficulty, Priority, QuestStatus, QuestType } from '@/core/quest'

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
