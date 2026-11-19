import { planCompletion, planEffortCredit, type AwardContext } from '@/core/awards'
import { ATTRIBUTE_IDS } from '@/core/attributes'
import { cycleKeyFor, isRecurring, stepAwardKey, type Category, type Difficulty, type Priority, type Quest, type QuestStep, type QuestType } from '@/core/quest'
import { openAwards, planReversal, type XpEvent } from '@/core/ledger'
import { computeQuestReward } from '@/core/rewards'
import type { AttributeId } from '@/core/types'
import { db, type LevelDB } from './db'

/**
 * Commandes métier LIFE : chaque commande est UNE transaction IndexedDB atomique.
 * Les règles (récompenses, unicité, anti-farming) sont dans `core/` ; ce module orchestre et persiste.
 */

export type QuestErrorCode = 'invalid_title' | 'invalid_effort' | 'unknown_category' | 'not_found' | 'invalid_step' | 'invalid_name' | 'no_attribute'

export class QuestError extends Error {
  constructor(public code: QuestErrorCode, message?: string) {
    super(message ?? code)
  }
}

export interface QuestInput {
  type: QuestType
  title: string
  description?: string
  categoryId: string
  priority: Priority
  dueDate?: string | null
  difficulty: Difficulty
  effortMinutes: number
  /** Étapes : `id` conservé pour les étapes existantes, absent pour les nouvelles */
  steps?: Array<{ id?: string; title: string }>
}

export const DEFAULT_CATEGORIES: Array<{ id: string; name: string; attribute: AttributeId }> = [
  { id: 'cat-pro', name: 'Professionnel', attribute: 'discipline' },
  { id: 'cat-culture', name: 'Culture & connaissances', attribute: 'intellect' },
  { id: 'cat-finances', name: 'Économie & finances', attribute: 'prosperite' },
  { id: 'cat-perso', name: 'Développement personnel', attribute: 'endurance' },
  { id: 'cat-social', name: 'Social & relations', attribute: 'vitalite' },
  { id: 'cat-projets', name: 'Projets personnels', attribute: 'force' },
  { id: 'cat-hygiene', name: 'Hygiène de vie', attribute: 'vitalite' },
]

export interface ServiceDeps {
  now: () => Date
  id: () => string
}

const defaultDeps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }

export function createQuestService(database: LevelDB = db, deps: ServiceDeps = defaultDeps) {
  const { now, id } = deps
  const stores = () => [database.quests, database.xpEvents, database.categories, database.settings]

  const tx = <T>(fn: () => Promise<T>) => database.transaction('rw', stores(), fn)

  async function getQuest(questId: string): Promise<Quest> {
    const q = await database.quests.get(questId)
    if (!q) throw new QuestError('not_found')
    return q
  }

  async function contextFor(quest: Quest, at: Date): Promise<{ ctx: AwardContext; questEvents: XpEvent[] }> {
    const questEvents = await database.xpEvents.where('questId').equals(quest.id).toArray()
    const start = new Date(at.getFullYear(), at.getMonth(), at.getDate()).toISOString()
    const todayEvents = await database.xpEvents.where('at').aboveOrEqual(start).toArray()
    const category = await database.categories.get(quest.categoryId)
    return { questEvents, ctx: { quest, category, questEvents, todayEvents, now: at, eventId: id() } }
  }

  /** Annule les gains ouverts sélectionnés ; marque les originaux « reversed ». */
  async function reverseAwards(events: XpEvent[], keys: string[], reason: string, at: Date): Promise<XpEvent[]> {
    const done: XpEvent[] = []
    let working = events
    for (const key of keys) {
      const plan = planReversal(working, key, { id: id(), at: at.toISOString(), reason })
      if (!plan.ok) continue
      await database.xpEvents.add(plan.value.reversal)
      await database.xpEvents.update(plan.value.originalId, { status: 'reversed', reversedByEventId: plan.value.reversal.id })
      working = [...working.map((e) => (e.id === plan.value.originalId ? { ...e, status: 'reversed' as const, reversedByEventId: plan.value.reversal.id } : e)), plan.value.reversal]
      done.push(plan.value.reversal)
    }
    return done
  }

  function normalize(input: QuestInput, existing?: Quest) {
    const title = input.title.trim()
    if (!title || title.length > 80) throw new QuestError('invalid_title')
    if (!Number.isFinite(input.effortMinutes) || input.effortMinutes < 1 || input.effortMinutes > 1440) throw new QuestError('invalid_effort')
    const steps: QuestStep[] = (input.steps ?? [])
      .map((s) => ({ id: s.id ?? id(), title: s.title.trim() }))
      .filter((s) => s.title.length > 0)
    if (steps.some((s) => s.title.length > 80) || steps.length > 20) throw new QuestError('invalid_step')
    const base = existing ?? ({ id: id(), createdAt: now().getTime(), archived: false } as Pick<Quest, 'id' | 'createdAt' | 'archived'>)
    return {
      ...base,
      type: input.type,
      title,
      description: (input.description ?? '').trim().slice(0, 500),
      categoryId: input.categoryId,
      priority: input.priority,
      dueDate: input.dueDate || null,
      difficulty: input.difficulty,
      effortMinutes: Math.round(input.effortMinutes),
      steps,
      rewardXp: computeQuestReward({ difficulty: input.difficulty, effortMinutes: input.effortMinutes }),
      updatedAt: now().getTime(),
    } satisfies Quest
  }

  async function assertCategory(categoryId: string) {
    if (!(await database.categories.get(categoryId))) throw new QuestError('unknown_category')
  }

  return {
    // ─── Catégories ──────────────────────────────────────────────
    async seedCategories() {
      await tx(async () => {
        const flag = await database.settings.get('categoriesSeeded')
        if (flag?.value === true) return
        if ((await database.categories.count()) === 0) {
          await database.categories.bulkAdd(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i, archived: false, builtin: true })))
        }
        await database.settings.put({ key: 'categoriesSeeded', value: true })
      })
    },
    async addCategory(name: string, attribute: AttributeId): Promise<Category> {
      const clean = name.trim()
      if (!clean || clean.length > 40) throw new QuestError('invalid_name')
      if (!ATTRIBUTE_IDS.includes(attribute)) throw new QuestError('no_attribute')
      return tx(async () => {
        const order = (await database.categories.count()) + 1
        const cat: Category = { id: id(), name: clean, attribute, order, archived: false, builtin: false }
        await database.categories.add(cat)
        return cat
      })
    },
    async updateCategory(categoryId: string, patch: Partial<Pick<Category, 'name' | 'attribute' | 'archived'>>) {
      await tx(async () => {
        const cat = await database.categories.get(categoryId)
        if (!cat) throw new QuestError('not_found')
        const next = { ...cat, ...patch }
        next.name = next.name.trim()
        if (!next.name || next.name.length > 40) throw new QuestError('invalid_name')
        if (!ATTRIBUTE_IDS.includes(next.attribute)) throw new QuestError('no_attribute')
        await database.categories.put(next)
      })
    },

    // ─── Quêtes ──────────────────────────────────────────────────
    async createQuest(input: QuestInput): Promise<Quest> {
      return tx(async () => {
        await assertCategory(input.categoryId)
        const quest = normalize(input)
        await database.quests.add(quest)
        return quest
      })
    },

    /**
     * Modifie une quête. Les gains passés restent tels quels (journal immuable), sauf :
     *  - étapes supprimées → leurs gains ouverts sont annulés ;
     *  - quête simple devenue composée → son gain « quête » est annulé (redistribué sur les étapes).
     */
    async updateQuest(questId: string, input: QuestInput): Promise<Quest> {
      return tx(async () => {
        const existing = await getQuest(questId)
        await assertCategory(input.categoryId)
        const next = normalize(input, existing)
        await database.quests.put(next)
        const at = now()
        const events = await database.xpEvents.where('questId').equals(questId).toArray()
        const open = [...openAwards(events).values()].filter((e) => e.questId === questId)
        const keep = new Set(next.steps.map((s) => s.id))
        const removed = open.filter((e) => e.stepId && !keep.has(e.stepId)).map((e) => e.awardKey)
        const questLevel = next.steps.length > 0 ? open.filter((e) => e.source === 'quest').map((e) => e.awardKey) : []
        await reverseAwards(events, [...removed, ...questLevel], 'Quête modifiée : récompense recalculée', at)
        return next
      })
    },

    async setArchived(questId: string, archived: boolean) {
      await tx(async () => {
        const q = await getQuest(questId)
        await database.quests.put({ ...q, archived, updatedAt: now().getTime() })
      })
    },

    /** Suppression : annule TOUS les gains ouverts de la quête (journal conservé), puis supprime la quête. */
    async deleteQuest(questId: string) {
      await tx(async () => {
        await getQuest(questId)
        const events = await database.xpEvents.where('questId').equals(questId).toArray()
        const keys = [...openAwards(events).values()].filter((e) => e.questId === questId).map((e) => e.awardKey)
        await reverseAwards(events, keys, 'Quête supprimée : XP retirée', now())
        await database.quests.delete(questId)
      })
    },

    // ─── Validation ──────────────────────────────────────────────
    /** Valide une quête. Composée : valide toutes les étapes restantes. Idempotent (aucun double gain). */
    async completeQuest(questId: string): Promise<XpEvent[]> {
      return tx(async () => {
        const quest = await getQuest(questId)
        const at = now()
        const { ctx, questEvents } = await contextFor(quest, at)
        const awarded: XpEvent[] = []
        let working = questEvents
        const targets: Array<string | null> = quest.steps.length ? quest.steps.map((s) => s.id) : [null]
        for (const stepId of targets) {
          const plan = planCompletion({ ...ctx, questEvents: working, eventId: id() }, stepId)
          if (!plan.ok) continue
          await database.xpEvents.add(plan.value)
          working = [...working, plan.value]
          awarded.push(plan.value)
        }
        return awarded
      })
    },

    async completeStep(questId: string, stepId: string): Promise<XpEvent | null> {
      return tx(async () => {
        const quest = await getQuest(questId)
        if (!quest.steps.some((s) => s.id === stepId)) throw new QuestError('invalid_step')
        const { ctx } = await contextFor(quest, now())
        const plan = planCompletion(ctx, stepId)
        if (!plan.ok) return null
        await database.xpEvents.add(plan.value)
        return plan.value
      })
    },

    /** Correction explicite : annule la validation d'une étape (ou de la quête simple si stepId = null). */
    async undoValidation(questId: string, stepId: string | null, reason = 'Correction manuelle'): Promise<XpEvent[]> {
      return tx(async () => {
        const quest = await getQuest(questId)
        const at = now()
        const cycle = cycleKeyFor(quest.type, at)
        const events = await database.xpEvents.where('questId').equals(questId).toArray()
        const key = stepId ? stepAwardKey(quest.id, stepId, cycle) : `quest:${quest.id}:${cycle}`
        return reverseAwards(events, [key], reason, at)
      })
    },

    /** Correction explicite de toute la validation du cycle courant (quête, étapes, crédit d'effort). */
    async undoQuestValidation(questId: string, reason = 'Correction manuelle'): Promise<XpEvent[]> {
      return tx(async () => {
        const quest = await getQuest(questId)
        const at = now()
        const cycle = cycleKeyFor(quest.type, at)
        const events = await database.xpEvents.where('questId').equals(questId).toArray()
        const keys = [...openAwards(events).values()].filter((e) => e.questId === questId && e.cycleKey === cycle).map((e) => e.awardKey)
        return reverseAwards(events, keys, reason, at)
      })
    },

    /** Crédit d'effort sans résultat (préparé ; non exposé en UI à ce stade). */
    async recordEffort(questId: string): Promise<XpEvent | null> {
      return tx(async () => {
        const quest = await getQuest(questId)
        const { ctx } = await contextFor(quest, now())
        const plan = planEffortCredit(ctx)
        if (!plan.ok) return null
        await database.xpEvents.add(plan.value)
        return plan.value
      })
    },
  }
}

export const questService = createQuestService()
export { isRecurring }
