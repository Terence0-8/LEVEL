import type { AttributeId, Domain } from './types'

/**
 * Journal d'XP : append-only. L'XP n'est JAMAIS stockée comme un solde modifiable :
 * tout solde, niveau ou attribut se recalcule en additionnant les événements.
 *
 *  - `award`    : gain (amount > 0)
 *  - `reversal` : correction/annulation d'un gain (amount = -gain, `correctsEventId` = gain annulé)
 * Σ amount de tous les événements = XP courante. Le `status` d'un gain annulé passe à `reversed`
 * (information d'audit ; le calcul ne s'appuie pas dessus, voir `auditLedger`).
 */

export type XpSource = 'quest' | 'step' | 'activity' | 'bonus'
export type XpEventKind = 'award' | 'reversal'
export type XpEventStatus = 'valid' | 'reversed'

export interface XpEvent {
  id: string
  kind: XpEventKind
  source: XpSource
  /** Identifiant de l'objet récompensé (quête, étape…) */
  sourceId: string
  questId: string | null
  stepId: string | null
  /** Clé d'unicité d'une récompense : une même clé ne peut avoir qu'un gain ouvert à la fois. */
  awardKey: string
  cycleKey: string
  domain: Domain
  categoryId: string | null
  attribute: AttributeId | null
  amount: number
  /** Montant avant amortissement anti-farming (gains uniquement) */
  baseAmount: number
  micro: boolean
  /** ISO 8601 */
  at: string
  /** Justification lisible */
  reason: string
  /** Intitulé figé au moment de l'événement (reste lisible si la quête est supprimée) */
  label: string
  status: XpEventStatus
  correctsEventId: string | null
  reversedByEventId: string | null
}

export type AwardInput = Omit<XpEvent, 'kind' | 'status' | 'correctsEventId' | 'reversedByEventId'>

/** Gains non annulés, par clé. */
export function openAwards(events: XpEvent[]): Map<string, XpEvent> {
  const reversed = new Set(events.filter((e) => e.kind === 'reversal' && e.correctsEventId).map((e) => e.correctsEventId!))
  const out = new Map<string, XpEvent>()
  for (const e of events) if (e.kind === 'award' && !reversed.has(e.id)) out.set(e.awardKey, e)
  return out
}

export const isAwardOpen = (events: XpEvent[], key: string) => openAwards(events).has(key)

export type PlanResult<T> = { ok: true; value: T } | { ok: false; error: 'already_awarded' | 'not_found' | 'invalid_amount' }

/** Prépare un gain. Refuse si la clé est déjà récompensée (jamais deux fois la même étape). */
export function planAward(events: XpEvent[], input: AwardInput): PlanResult<XpEvent> {
  if (!Number.isFinite(input.amount) || input.amount < 0) return { ok: false, error: 'invalid_amount' }
  if (isAwardOpen(events, input.awardKey)) return { ok: false, error: 'already_awarded' }
  return { ok: true, value: { ...input, kind: 'award', status: 'valid', correctsEventId: null, reversedByEventId: null } }
}

/** Prépare l'annulation d'un gain ouvert (identifié par sa clé). */
export function planReversal(
  events: XpEvent[],
  awardKey: string,
  meta: { id: string; at: string; reason: string },
): PlanResult<{ reversal: XpEvent; originalId: string }> {
  const original = openAwards(events).get(awardKey)
  if (!original) return { ok: false, error: 'not_found' }
  const reversal: XpEvent = {
    ...original,
    id: meta.id,
    kind: 'reversal',
    amount: -original.amount,
    baseAmount: -original.baseAmount,
    at: meta.at,
    reason: meta.reason,
    status: 'valid',
    correctsEventId: original.id,
    reversedByEventId: null,
  }
  return { ok: true, value: { reversal, originalId: original.id } }
}

export const totalXp = (events: XpEvent[], filter?: (e: XpEvent) => boolean) =>
  events.filter(filter ?? (() => true)).reduce((n, e) => n + e.amount, 0)

export function xpByDomain(events: XpEvent[]): Record<Domain, number> {
  return { LIFE: totalXp(events, (e) => e.domain === 'LIFE'), SPORT: totalXp(events, (e) => e.domain === 'SPORT') }
}

export function xpByAttribute(events: XpEvent[]): Partial<Record<AttributeId, number>> {
  const out: Partial<Record<AttributeId, number>> = {}
  for (const e of events) if (e.attribute) out[e.attribute] = (out[e.attribute] ?? 0) + e.amount
  return out
}

export function xpByCategory(events: XpEvent[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of events) if (e.categoryId) out[e.categoryId] = (out[e.categoryId] ?? 0) + e.amount
  return out
}

/** Contrôle d'intégrité : retourne la liste des anomalies (vide = journal sain). */
export function auditLedger(events: XpEvent[]): string[] {
  const problems: string[] = []
  const byId = new Map(events.map((e) => [e.id, e]))
  const reversedIds = new Set<string>()
  for (const e of events) {
    if (e.kind === 'award' && e.amount < 0) problems.push(`gain négatif : ${e.id}`)
    if (e.kind === 'reversal') {
      const target = e.correctsEventId ? byId.get(e.correctsEventId) : undefined
      if (!target || target.kind !== 'award') problems.push(`annulation orpheline : ${e.id}`)
      else if (target.amount !== -e.amount) problems.push(`annulation de montant incohérent : ${e.id}`)
      if (e.correctsEventId) {
        if (reversedIds.has(e.correctsEventId)) problems.push(`gain annulé deux fois : ${e.correctsEventId}`)
        reversedIds.add(e.correctsEventId)
      }
    }
  }
  const open = new Map<string, number>()
  for (const e of events) if (e.kind === 'award' && !reversedIds.has(e.id)) open.set(e.awardKey, (open.get(e.awardKey) ?? 0) + 1)
  for (const [k, n] of open) if (n > 1) problems.push(`récompense multiple pour ${k}`)
  for (const e of events) {
    if (e.kind === 'award' && (e.status === 'reversed') !== reversedIds.has(e.id)) problems.push(`statut incohérent : ${e.id}`)
  }
  const validSum = events.filter((e) => e.kind === 'award' && !reversedIds.has(e.id)).reduce((n, e) => n + e.amount, 0)
  if (validSum !== totalXp(events)) problems.push('solde ≠ somme des gains non annulés')
  return problems
}
