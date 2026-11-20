import { computeQuestReward } from '../rewards'
import type { Difficulty, Quest, QuestType } from '../quest'
import { QUEST_PACKS, QUEST_TEMPLATES } from './lifeCatalog'
import type { CatalogState, QuestPack, QuestTemplate } from './types'

/** Fonctions pures du catalogue LIFE : recherche, filtres, détection des doublons, aperçu d'XP (calculé par le moteur existant). */

export const TYPE_FILTERS: Array<{ id: QuestType | 'all'; label: string }> = [
  { id: 'all', label: 'Tous' }, { id: 'daily', label: 'Chaque jour' }, { id: 'weekly', label: 'Chaque semaine' }, { id: 'personal', label: 'Ponctuelles' }, { id: 'exceptional', label: 'Exceptionnelles' },
]
export const DURATION_FILTERS: Array<{ id: 'all' | 'short' | 'medium' | 'long'; label: string; test: (m: number) => boolean }> = [
  { id: 'all', label: 'Toutes durées', test: () => true }, { id: 'short', label: '≤ 20 min', test: (m) => m <= 20 }, { id: 'medium', label: '25 – 60 min', test: (m) => m > 20 && m <= 60 }, { id: 'long', label: '> 1 h', test: (m) => m > 60 },
]

export function frequencyLabel(t: Pick<QuestTemplate, 'type' | 'steps'>): string {
  if (t.type === 'daily') return 'Chaque jour'
  if (t.type === 'weekly') return 'Chaque semaine'
  if (t.type === 'exceptional') return 'Défi exceptionnel'
  return t.steps?.length ? `En ${t.steps.length} étapes` : 'Une fois'
}
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Facile', normal: 'Moyenne', hard: 'Difficile', epic: 'Épique' }

/** XP indicative : calculée par `core/rewards` (aucun barème ici). La récompense réelle dépend aussi des règles anti-farming à la validation. */
export const xpHint = (t: Pick<QuestTemplate, 'difficulty' | 'minutes'>) => computeQuestReward({ difficulty: t.difficulty, effortMinutes: t.minutes })

export const normTitle = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export const allTemplates = (state: CatalogState): QuestTemplate[] => [...QUEST_TEMPLATES, ...state.custom.map((c) => ({ ...c, custom: true }))]
export const templateById = (id: string, state: CatalogState) => allTemplates(state).find((t) => t.id === id)

export type TemplateStatus = 'added' | 'similar' | 'new'
/**
 * Un modèle est « déjà ajouté » si une quête active créée depuis lui existe encore ; « proche » si une quête active porte le même titre
 * (évite les doublons même quand la quête a été créée à la main). Une quête archivée ou supprimée ne compte plus.
 */
export function templateStatus(t: QuestTemplate, quests: Quest[], state: CatalogState): TemplateStatus {
  const live = new Map(quests.filter((q) => !q.archived).map((q) => [q.id, q]))
  if ((state.installed[t.id] ?? []).some((r) => live.has(r.questId))) return 'added'
  const n = normTitle(t.name)
  return [...live.values()].some((q) => normTitle(q.title) === n) ? 'similar' : 'new'
}

/** Une version plus récente du modèle existe : information seulement, jamais d'écrasement de la quête personnalisée. */
export function hasUpdate(t: QuestTemplate, state: CatalogState): boolean {
  return (state.installed[t.id] ?? []).some((r) => r.v < t.v)
}

export interface TemplateFilter { categoryId?: string; type?: QuestType | 'all'; duration?: 'all' | 'short' | 'medium' | 'long'; query?: string; favoritesOnly?: boolean; customOnly?: boolean }
export function searchTemplates(list: QuestTemplate[], f: TemplateFilter, favorites: string[]): QuestTemplate[] {
  const q = f.query ? normTitle(f.query) : ''
  const dur = DURATION_FILTERS.find((d) => d.id === (f.duration ?? 'all'))!
  return list.filter((t) =>
    (!f.categoryId || t.categoryId === f.categoryId) && (!f.type || f.type === 'all' || t.type === f.type) && dur.test(t.minutes) &&
    (!f.favoritesOnly || favorites.includes(t.id)) && (!f.customOnly || t.custom) &&
    (!q || normTitle(`${t.name} ${t.description} ${t.tags.join(' ')}`).includes(q)),
  )
}

export const packTemplates = (p: QuestPack, state: CatalogState): QuestTemplate[] => p.templateIds.map((id) => templateById(id, state)).filter((t): t is QuestTemplate => !!t)
/** Charge d'un pack : nombre de quêtes quotidiennes et minutes par jour (pour ne jamais imposer une routine excessive) */
export function packLoad(p: QuestPack, state: CatalogState) {
  const ts = packTemplates(p, state)
  const daily = ts.filter((t) => t.type === 'daily')
  return { items: ts.length, daily: daily.length, dailyMinutes: daily.reduce((n, t) => n + t.minutes, 0) }
}

export const PACK_LIMITS = { maxDaily: 3, maxItems: 6 } as const

export function templateToQuestInput(t: QuestTemplate, o: Partial<Pick<QuestTemplate, 'type' | 'minutes' | 'difficulty' | 'priority'>> = {}) {
  return {
    type: o.type ?? t.type, title: t.name, description: t.description, categoryId: t.categoryId, priority: o.priority ?? t.priority ?? ('normal' as const),
    difficulty: o.difficulty ?? t.difficulty, effortMinutes: o.minutes ?? t.minutes, steps: (t.steps ?? []).map((title) => ({ title })), dueDate: null,
  }
}

export { QUEST_PACKS, QUEST_TEMPLATES }
