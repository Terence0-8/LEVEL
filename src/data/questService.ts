import { planCompletion, planCredit, type AwardContext, type CreditInput } from '@/core/awards'
import { ATTRIBUTE_IDS } from '@/core/attributes'
import { dayKey, daysBetweenKeys, fromDayKey, isDayKey } from '@/core/dates'
import { cycleKeyFor, questAwardKey, stepAwardKey, type Category, type Difficulty, type Priority, type Quest, type QuestStep, type QuestType } from '@/core/quest'
import { openAwards, planReversal, type PlanError, type XpEvent } from '@/core/ledger'
import { simplifiedValues, type MissedAction, type MissedAnalysis, type MissedCause } from '@/core/missed'
import { diffQuest } from '@/core/revision'
import { computeQuestReward, REWARD_CONFIG } from '@/core/rewards'
import type { AttributeId } from '@/core/types'
import { db, type LevelDB } from './db'

/**
 * Commandes métier LIFE : chaque commande est UNE transaction IndexedDB atomique.
 * Les règles (récompenses, unicité, anti-farming) sont dans `core/` ; ce module orchestre et persiste.
 */

export type QuestErrorCode =
  | PlanError
  | 'invalid_title' | 'invalid_effort' | 'unknown_category' | 'not_found' | 'invalid_step' | 'invalid_name' | 'no_attribute'
  | 'future_date' | 'retro_out_of_range' | 'invalid_date'
  | 'already_analyzed' | 'invalid_cause' | 'invalid_due' | 'invalid_replacement'

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

export interface DeclareOptions {
  /** Date d'accomplissement déclarée « YYYY-MM-DD » (défaut : aujourd'hui). Antérieure = validation rétroactive. */
  doneOn?: string
}

export interface MissedAnalysisInput {
  questId: string
  cycleKey: string
  /** null uniquement si `dismissed` */
  cause: MissedCause | null
  action: MissedAction
  note?: string
  /** `postpone` sur une quête unique : nouvelle échéance */
  dueDate?: string
  /** `replace` : titre de la quête de remplacement */
  newTitle?: string
  /** Ignorer sans analyser */
  dismissed?: boolean
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

export const questToInput = (q: Quest): QuestInput => ({
  type: q.type, title: q.title, description: q.description, categoryId: q.categoryId, priority: q.priority,
  dueDate: q.dueDate, difficulty: q.difficulty, effortMinutes: q.effortMinutes, steps: q.steps,
})

export function createQuestService(database: LevelDB = db, deps: ServiceDeps = defaultDeps) {
  const { now, id } = deps
  const stores = () => [database.quests, database.xpEvents, database.categories, database.settings, database.analyses, database.revisions]
  const tx = <T>(fn: () => Promise<T>) => database.transaction('rw', stores(), fn)

  async function getQuest(questId: string): Promise<Quest> {
    const q = await database.quests.get(questId)
    if (!q) throw new QuestError('not_found')
    return q
  }

  /** Date d'accomplissement : aujourd'hui (instant exact) ou une date passée dans la fenêtre autorisée (midi). */
  function resolveDoneAt(doneOn: string | undefined, at: Date): Date {
    const today = dayKey(at)
    if (!doneOn || doneOn === today) return at
    if (!isDayKey(doneOn)) throw new QuestError('invalid_date')
    if (doneOn > today) throw new QuestError('future_date')
    if (daysBetweenKeys(doneOn, today) > REWARD_CONFIG.retroactiveMaxDays) throw new QuestError('retro_out_of_range')
    return fromDayKey(doneOn)
  }

  async function contextFor(quest: Quest, doneAt: Date): Promise<AwardContext> {
    const at = now()
    const questEvents = await database.xpEvents.where('questId').equals(quest.id).toArray()
    const start = new Date(doneAt.getFullYear(), doneAt.getMonth(), doneAt.getDate())
    const end = new Date(doneAt.getFullYear(), doneAt.getMonth(), doneAt.getDate() + 1)
    const todayEvents = await database.xpEvents.where('at').between(start.toISOString(), end.toISOString(), true, false).toArray()
    const category = await database.categories.get(quest.categoryId)
    return { quest, category, questEvents, todayEvents, now: at, doneAt, eventId: id() }
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

  /** Cœur de la modification (appelé dans une transaction). Journalise une révision ; n'altère pas les gains acquis. */
  async function applyUpdate(questId: string, input: QuestInput, note = ''): Promise<Quest> {
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
    const changes = diffQuest(existing, next)
    if (changes.length > 0) {
      await database.revisions.add({
        id: id(), questId, at: at.toISOString(), changes,
        awardedXp: open.reduce((n, e) => n + e.amount, 0),
        note: note || 'Les récompenses déjà acquises ne sont pas modifiées ; le nouveau barème vaut pour les prochains gains.',
      })
    }
    await reverseAwards(events, [...removed, ...questLevel], 'Quête modifiée : récompense recalculée', at)
    return next
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
     * Modifie une quête. Les gains passés restent tels quels (journal immuable) et une révision
     * consigne l'ancien/nouvel état, sauf :
     *  - étapes supprimées → leurs gains ouverts sont annulés (correction tracée) ;
     *  - quête simple devenue composée → son gain « quête » est annulé (redistribué sur les étapes).
     */
    async updateQuest(questId: string, input: QuestInput): Promise<Quest> {
      return tx(() => applyUpdate(questId, input))
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
        await database.revisions.where('questId').equals(questId).delete()
        await database.quests.delete(questId)
      })
    },

    // ─── Validation ──────────────────────────────────────────────
    /**
     * Valide une quête (réussite complète). Composée : valide toutes les étapes restantes.
     * Idempotent (aucun double gain). `doneOn` antérieur = validation rétroactive.
     */
    async completeQuest(questId: string, opts: DeclareOptions = {}): Promise<XpEvent[]> {
      return tx(async () => {
        const quest = await getQuest(questId)
        const doneAt = resolveDoneAt(opts.doneOn, now())
        const ctx = await contextFor(quest, doneAt)
        const awarded: XpEvent[] = []
        let working = ctx.questEvents
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

    async completeStep(questId: string, stepId: string, opts: DeclareOptions = {}): Promise<XpEvent | null> {
      return tx(async () => {
        const quest = await getQuest(questId)
        if (!quest.steps.some((s) => s.id === stepId)) throw new QuestError('invalid_step')
        const ctx = await contextFor(quest, resolveDoneAt(opts.doneOn, now()))
        const plan = planCompletion(ctx, stepId)
        if (!plan.ok) return null
        await database.xpEvents.add(plan.value)
        return plan.value
      })
    },

    /**
     * Progression partielle (proportionnelle) ou effort sans objectif atteint (réduit, non nul).
     * Lève une `QuestError` explicite si un garde-fou refuse la déclaration.
     */
    async declareWork(questId: string, input: CreditInput & DeclareOptions): Promise<XpEvent> {
      return tx(async () => {
        const quest = await getQuest(questId)
        const ctx = await contextFor(quest, resolveDoneAt(input.doneOn, now()))
        const plan = planCredit(ctx, input)
        if (!plan.ok) throw new QuestError(plan.error)
        await database.xpEvents.add(plan.value)
        return plan.value
      })
    },

    /** Raccourci : effort sans résultat sans durée ni commentaire (null si refusé). */
    async recordEffort(questId: string): Promise<XpEvent | null> {
      try {
        return await this.declareWork(questId, { kind: 'effort' })
      } catch (e) {
        if (e instanceof QuestError && e.code !== 'not_found') return null
        throw e
      }
    },

    /** Correction explicite : annule la validation d'une étape (ou de la quête simple si stepId = null). */
    async undoValidation(questId: string, stepId: string | null, reason = 'Correction manuelle', cycleKey?: string): Promise<XpEvent[]> {
      return tx(async () => {
        const quest = await getQuest(questId)
        const at = now()
        const cycle = cycleKey ?? cycleKeyFor(quest.type, at)
        const events = await database.xpEvents.where('questId').equals(questId).toArray()
        const key = stepId ? stepAwardKey(quest.id, stepId, cycle) : questAwardKey(quest.id, cycle)
        return reverseAwards(events, [key], reason, at)
      })
    },

    /** Correction explicite de toute la validation d'un cycle (courant par défaut) : quête, étapes, crédits. */
    async undoQuestValidation(questId: string, reason = 'Correction manuelle', cycleKey?: string): Promise<XpEvent[]> {
      return tx(async () => {
        const quest = await getQuest(questId)
        const at = now()
        const cycle = cycleKey ?? cycleKeyFor(quest.type, at)
        const events = await database.xpEvents.where('questId').equals(questId).toArray()
        const keys = [...openAwards(events).values()].filter((e) => e.questId === questId && e.cycleKey === cycle).map((e) => e.awardKey)
        return reverseAwards(events, keys, reason, at)
      })
    },

    /** Annule un gain précis du journal (quelle que soit sa date). Retourne null s'il est déjà annulé. */
    async reverseEvent(eventId: string, reason = 'Correction manuelle'): Promise<XpEvent | null> {
      return tx(async () => {
        const ev = await database.xpEvents.get(eventId)
        if (!ev || ev.kind !== 'award') throw new QuestError('not_found')
        const sameKey = await database.xpEvents.where('awardKey').equals(ev.awardKey).toArray()
        if (openAwards(sameKey).get(ev.awardKey)?.id !== eventId) return null
        const [rev] = await reverseAwards(sameKey, [ev.awardKey], reason, now())
        return rev ?? null
      })
    },

    // ─── Analyse des quêtes manquées (aucun effet sur l'XP) ───────
    async recordMissedAnalysis(input: MissedAnalysisInput): Promise<MissedAnalysis> {
      return tx(async () => {
        const quest = await getQuest(input.questId)
        const existing = await database.analyses.where('questId').equals(input.questId).toArray()
        if (existing.some((a) => a.cycleKey === input.cycleKey)) throw new QuestError('already_analyzed')
        if (!input.dismissed && !input.cause) throw new QuestError('invalid_cause')
        let detail = input.dismissed ? 'Ignoré' : 'Aucune action'
        const action: MissedAction = input.dismissed ? 'none' : input.action

        if (action === 'postpone') {
          if (quest.type === 'daily' || quest.type === 'weekly') {
            detail = 'Report : à rattraper via une validation rétroactive ou à poursuivre au prochain cycle'
          } else {
            if (!input.dueDate || !isDayKey(input.dueDate) || input.dueDate < dayKey(now())) throw new QuestError('invalid_due')
            await applyUpdate(quest.id, { ...questToInput(quest), dueDate: input.dueDate }, 'Report décidé après analyse d’une quête manquée.')
            detail = `Échéance reportée au ${input.dueDate}`
          }
        } else if (action === 'simplify') {
          const s = simplifiedValues(quest)
          await applyUpdate(quest.id, { ...questToInput(quest), ...s }, 'Simplification décidée après analyse : les récompenses déjà acquises sont inchangées.')
          detail = `Simplifiée : difficulté ${quest.difficulty} → ${s.difficulty}, effort ${quest.effortMinutes} → ${s.effortMinutes} min`
        } else if (action === 'replace') {
          const title = (input.newTitle ?? '').trim()
          if (!title || title.length > 80) throw new QuestError('invalid_replacement')
          const copy = normalize({ ...questToInput(quest), title, steps: [], dueDate: null })
          await database.quests.add(copy)
          await database.quests.put({ ...quest, archived: true, updatedAt: now().getTime() })
          detail = `Remplacée par « ${title} »`
        } else if (action === 'suspend') {
          await database.quests.put({ ...quest, archived: true, updatedAt: now().getTime() })
          detail = 'Suspendue (archivée) : réactivable à tout moment'
        }

        const row: MissedAnalysis = {
          id: id(), questId: quest.id, questTitle: quest.title, cycleKey: input.cycleKey,
          cause: input.dismissed ? null : input.cause, action, actionDetail: detail,
          note: (input.note ?? '').trim().slice(0, 300), dismissed: !!input.dismissed, createdAt: now().toISOString(),
        }
        await database.analyses.add(row)
        return row
      })
    },
  }
}

export const questService = createQuestService()
