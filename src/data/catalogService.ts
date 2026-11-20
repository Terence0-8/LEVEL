import { EMPTY_CATALOG, type CatalogState, type QuestTemplate } from '@/core/catalog/types'
import { allTemplates, normTitle, packTemplates, templateById, templateStatus, templateToQuestInput } from '@/core/catalog/catalog'
import { QUEST_PACKS } from '@/core/catalog/lifeCatalog'
import type { Quest } from '@/core/quest'
import { db, type LevelDB } from './db'
import { createQuestService, questToInput, type ServiceDeps } from './questService'

export const CATALOG_KEY = 'lifeCatalog'

export class CatalogError extends Error {
  constructor(public code: 'not_found' | 'already_added' | 'invalid', message: string) { super(message) }
}

export async function readCatalog(database: LevelDB = db): Promise<CatalogState> {
  const row = await database.settings.get(CATALOG_KEY)
  const v = (row?.value ?? {}) as Partial<CatalogState>
  return { installed: v.installed && typeof v.installed === 'object' ? v.installed : {}, favorites: Array.isArray(v.favorites) ? v.favorites : [], custom: Array.isArray(v.custom) ? v.custom : [] }
}

/**
 * Catalogue LIFE : ajoute des modèles aux activités de l'utilisateur. Un modèle devient une VRAIE quête (`questService.createQuest`) :
 * aucun XP n'est attribué ici, la récompense passe par le moteur existant à la validation. Les données du catalogue (favoris, modèles
 * personnels, quêtes issues d'un modèle) vivent dans `settings` : sauvegardées et restaurées avec le reste, sans nouvelle table.
 */
export function createCatalogService(database: LevelDB = db, deps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }) {
  const quests = createQuestService(database, deps)
  const stores = () => [database.quests, database.xpEvents, database.categories, database.settings, database.analyses, database.revisions, database.rpgRewards]
  const tx = <T>(fn: () => Promise<T>) => database.transaction('rw', stores(), fn)
  const write = (s: CatalogState) => database.settings.put({ key: CATALOG_KEY, value: s })

  async function addOne(state: CatalogState, t: QuestTemplate, o: Parameters<typeof templateToQuestInput>[1], allowDuplicate: boolean) {
    const existing = await database.quests.toArray()
    if (!allowDuplicate && templateStatus(t, existing, state) !== 'new') return null
    const q = await quests.createQuest(templateToQuestInput(t, o))
    state.installed[t.id] = [...(state.installed[t.id] ?? []), { questId: q.id, v: t.v, at: deps.now().toISOString() }]
    return q
  }

  return {
    /** Ajoute un modèle (éventuellement personnalisé). Refuse un doublon actif sauf confirmation explicite. */
    addTemplate: (templateId: string, o: Parameters<typeof templateToQuestInput>[1] & { allowDuplicate?: boolean } = {}) => tx(async () => {
      const state = await readCatalog(database)
      const t = templateById(templateId, state)
      if (!t) throw new CatalogError('not_found', 'Modèle introuvable.')
      const q = await addOne(state, t, o, !!o.allowDuplicate)
      if (!q) throw new CatalogError('already_added', 'Cette quête est déjà dans vos activités.')
      await write(state)
      return q
    }),

    /**
     * Active un pack : crée les quêtes choisies (l'utilisateur peut en retirer et changer le rythme avant). Les quêtes déjà présentes sont
     * ignorées (aucun doublon). Tout ou rien : une erreur n'ajoute aucune quête.
     */
    addPack: (packId: string, selection?: Array<{ templateId: string; type?: QuestTemplate['type'] }>) => tx(async () => {
      const state = await readCatalog(database)
      const pack = QUEST_PACKS.find((p) => p.id === packId)
      if (!pack) throw new CatalogError('not_found', 'Pack introuvable.')
      const chosen: Array<{ templateId: string; type?: QuestTemplate['type'] }> = selection ?? packTemplates(pack, state).map((t) => ({ templateId: t.id }))
      const created: Quest[] = []; const skipped: string[] = []
      for (const c of chosen) {
        if (!pack.templateIds.includes(c.templateId)) throw new CatalogError('invalid', 'Cette quête ne fait pas partie du pack.')
        const t = templateById(c.templateId, state)!
        const q = await addOne(state, t, { type: c.type }, false)
        if (q) created.push(q); else skipped.push(t.name)
      }
      await write(state)
      return { created, skipped }
    }),

    toggleFavorite: (templateId: string) => tx(async () => {
      const state = await readCatalog(database)
      state.favorites = state.favorites.includes(templateId) ? state.favorites.filter((x) => x !== templateId) : [...state.favorites, templateId]
      await write(state)
      return state.favorites.includes(templateId)
    }),

    /** Enregistre une quête existante comme modèle personnel (le modèle est une copie : modifier la quête ne le change pas). */
    saveAsTemplate: (questId: string) => tx(async () => {
      const q = await database.quests.get(questId)
      if (!q) throw new CatalogError('not_found', 'Quête introuvable.')
      const state = await readCatalog(database)
      if (allTemplates(state).some((t) => t.custom && normTitle(t.name) === normTitle(q.title))) throw new CatalogError('already_added', 'Un modèle porte déjà ce nom.')
      const t: QuestTemplate = { id: `custom.${deps.id()}`, v: 1, name: q.title, description: q.description, categoryId: q.categoryId, type: q.type, minutes: q.effortMinutes, difficulty: q.difficulty, priority: q.priority, steps: q.steps.map((s) => s.title), tags: ['perso'], custom: true }
      state.custom = [...state.custom, t]
      await write(state)
      return t
    }),

    deleteCustomTemplate: (templateId: string) => tx(async () => {
      const state = await readCatalog(database)
      if (!state.custom.some((t) => t.id === templateId)) throw new CatalogError('not_found', 'Modèle introuvable.')
      state.custom = state.custom.filter((t) => t.id !== templateId); state.favorites = state.favorites.filter((x) => x !== templateId)
      await write(state)
    }),

    /** Duplique une quête (nouvelle quête indépendante, sans historique ni XP). */
    duplicateQuest: (questId: string) => tx(async () => {
      const q = await database.quests.get(questId)
      if (!q) throw new CatalogError('not_found', 'Quête introuvable.')
      const input = questToInput(q)
      return quests.createQuest({ ...input, title: `${q.title} (copie)`.slice(0, 80), steps: q.steps.map((s) => ({ title: s.title })), dueDate: null })
    }),
  }
}
export const catalogService = createCatalogService()
export { EMPTY_CATALOG }
