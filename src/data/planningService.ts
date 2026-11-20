import { dayKey, isDayKey } from '@/core/dates'
import { simplifiedValues } from '@/core/missed'
import { capacityOn, isImportantQuest, type Commitment, type PlanMove, type Proposal } from '@/core/planning'
import { isRecurring, type Quest } from '@/core/quest'
import { db, type LevelDB } from './db'
import { readPrefs } from './prefsService'
import { createQuestService, questToInput, type ServiceDeps } from './questService'
import { sportService } from './sportService'

/**
 * Commandes du planning central. Les programmations internes LIFE et SPORT restent indépendantes : ce service ne fait que
 * (1) gérer les engagements, (2) placer une quête sur un jour (`plannedFor`, distinct de l'échéance),
 * (3) appliquer — après confirmation — les propositions de `core/planning`, en RE-VÉRIFIANT les règles au moment de l'écriture.
 * Chaque déplacement est tracé dans `planningMoves`. Une échéance, un engagement ou une quête importante n'est jamais modifié ici.
 */
export type PlanningErrorCode = 'not_found' | 'invalid' | 'protected' | 'past' | 'after_due' | 'unavailable_day' | 'not_applicable'
export class PlanningError extends Error {
  constructor(public code: PlanningErrorCode, message: string) { super(message) }
}

const defaultDeps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }

export interface CommitmentInput { title: string; date: string; start?: string | null; minutes: number; important: boolean; note?: string }

export function createPlanningService(database: LevelDB = db, deps: ServiceDeps = defaultDeps, applySportWeek: () => Promise<unknown> = () => sportService.applyWeekPlan()) {
  const { now, id } = deps
  const quests = createQuestService(database, deps)
  const stamp = () => now().toISOString()

  function checkCommitment(input: CommitmentInput): Omit<Commitment, 'id' | 'createdAt'> {
    const title = input.title.trim()
    if (!title || title.length > 80) throw new PlanningError('invalid', 'Donnez un titre de 1 à 80 caractères.')
    if (!isDayKey(input.date)) throw new PlanningError('invalid', 'Date invalide.')
    if (input.start && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.start)) throw new PlanningError('invalid', 'Heure invalide (HH:MM).')
    const minutes = Math.round(input.minutes)
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 720) throw new PlanningError('invalid', 'Durée entre 5 min et 12 h.')
    return { title, date: input.date, start: input.start || null, minutes, important: input.important, note: (input.note ?? '').trim().slice(0, 300) }
  }

  async function questForMove(questId: string, opts: { allowImportant?: boolean } = {}): Promise<Quest> {
    const q = await database.quests.get(questId)
    if (!q || q.archived) throw new PlanningError('not_found', 'Quête introuvable.')
    if (q.type === 'daily') throw new PlanningError('protected', 'Une quête quotidienne se répète chaque jour : elle ne se déplace pas.')
    if (!opts.allowImportant && isImportantQuest(q)) throw new PlanningError('protected', 'Une quête importante n’est jamais déplacée automatiquement.')
    return q
  }

  async function place(q: Quest, to: string | null, reason: string, byLevel: boolean) {
    const today = dayKey(now())
    if (to) {
      if (!isDayKey(to)) throw new PlanningError('invalid', 'Date invalide.')
      if (to < today) throw new PlanningError('past', 'Choisissez aujourd’hui ou un jour à venir.')
      if (q.dueDate && to > q.dueDate) throw new PlanningError('after_due', `Ce jour est après l’échéance (${q.dueDate}). Modifiez d’abord l’échéance si c’est voulu.`)
      const prefs = await readPrefs(database)
      if (capacityOn(prefs.planning, to) === 0 && byLevel) throw new PlanningError('unavailable_day', 'Ce jour est marqué indisponible.')
    }
    const from = q.plannedFor ?? q.dueDate ?? null
    await database.quests.put({ ...q, plannedFor: to, updatedAt: now().getTime() })
    const move: PlanMove = { id: id(), kind: 'quest', refId: q.id, title: q.title, from, to, at: stamp(), reason, byLevel }
    await database.planningMoves.add(move)
    return move
  }

  const tx = <T>(fn: () => Promise<T>) => database.transaction('rw', [database.quests, database.planningMoves, database.settings], fn)

  return {
    // ── Engagements ──
    addCommitment: async (input: CommitmentInput): Promise<Commitment> => {
      const c: Commitment = { id: id(), createdAt: stamp(), ...checkCommitment(input) }
      await database.commitments.add(c)
      return c
    },
    updateCommitment: (commitmentId: string, input: CommitmentInput) => database.transaction('rw', database.commitments, async () => {
      const cur = await database.commitments.get(commitmentId)
      if (!cur) throw new PlanningError('not_found', 'Engagement introuvable.')
      const next = { ...cur, ...checkCommitment(input) }
      await database.commitments.put(next)
      return next
    }),
    removeCommitment: async (commitmentId: string) => { await database.commitments.delete(commitmentId) },

    // ── Placement manuel d'une quête sur un jour (choix de l'utilisateur) ──
    /** `plannedFor` : jour prévu au planning ; `null` retire la quête du planning. L'échéance n'est jamais touchée. */
    setQuestDay: (questId: string, date: string | null) => tx(async () => place(await questForMove(questId, { allowImportant: true }), date, 'Choix de l’utilisateur', false)),

    /** Applique UNE proposition après confirmation. Les règles sont re-vérifiées sur les données actuelles. */
    applyProposal: async (p: Proposal): Promise<{ applied: string }> => {
      if (p.kind === 'reorganise-sport') { await applySportWeek(); return { applied: 'Semaine sportive réorganisée par le moteur SPORT.' } }
      if (p.kind === 'review-repeated' || !p.questId) throw new PlanningError('not_applicable', 'Cette proposition se traite depuis la quête elle-même.')
      const questId = p.questId
      if (p.kind === 'move-quest') {
        return tx(async () => {
          const q = await questForMove(questId)
          if (q.dueDate && q.dueDate < dayKey(now())) throw new PlanningError('protected', 'Une quête en retard n’est pas déplacée automatiquement.')
          if (isRecurring(q.type) && q.type === 'daily') throw new PlanningError('protected', 'Quête récurrente.')
          await place(q, p.to ?? null, `Proposition acceptée : ${p.detail}`, true)
          return { applied: `« ${q.title} » déplacée au ${p.to}.` }
        })
      }
      if (p.kind === 'unschedule-quest') {
        return tx(async () => {
          const q = await questForMove(questId)
          if (q.dueDate) throw new PlanningError('protected', 'Une quête avec échéance reste au planning.')
          await place(q, null, 'Proposition acceptée : tâche secondaire retirée de la journée', true)
          return { applied: `« ${q.title} » retirée de la journée.` }
        })
      }
      if (p.kind === 'simplify-quest') {
        const q = await questForMove(questId)
        const s = simplifiedValues(q)
        if (s.effortMinutes >= q.effortMinutes && s.difficulty === q.difficulty) throw new PlanningError('not_applicable', 'Cette quête est déjà simple.')
        await quests.updateQuest(q.id, { ...questToInput(q), difficulty: s.difficulty, effortMinutes: s.effortMinutes })
        await database.planningMoves.add({ id: id(), kind: 'quest', refId: q.id, title: q.title, from: null, to: null, at: stamp(), reason: `Simplifiée sur proposition : effort ${q.effortMinutes} → ${s.effortMinutes} min`, byLevel: true })
        return { applied: `« ${q.title} » simplifiée.` }
      }
      throw new PlanningError('not_applicable', 'Proposition inconnue.')
    },
  }
}

export const planningService = createPlanningService()
