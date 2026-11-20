import { dayKey, isDayKey } from '@/core/dates'
import { analyseLife } from '@/core/goals'
import { normalizeEvent } from '@/core/ledger'
import {
  activeFundamental, cycleId, IMPORTANCE_LABEL, monthRange, nextQuarter, ORIENTATION_STATUS_LABEL, periodFacts, planId, PRIORITY_LEVEL_LABEL, PRIORITY_STATUS_LABEL, quarterOf, quarterRange, REVIEW_KIND_LABEL, yearRange,
  type AnnualPlan, type Cycle, type Horizon, type Orientation, type OrientationStatus, type PeriodFacts, type Priority, type PriorityLevel, type PriorityStatus, type Quarter, type ReviewKind, type StrategyLogEntry, type StrategyReview, type StrategyState, type Vision,
} from '@/core/pilotage'
import type { PilotageProposal } from '@/core/strategy'
import { db, type LevelDB } from './db'
import { readPrefs } from './prefsService'
import type { ServiceDeps } from './questService'

/**
 * Commandes PILOTAGE. La couche stratégique ne fait que RÉFÉRENCER LIFE (objectifs, projets, indicateurs) : aucune écriture dans `quests`,
 * `goals`, `projects`, `indicators` ni `xpEvents`. Chaque modification importante ajoute une entrée à la mémoire stratégique (`strategyLog`,
 * append-only) dans la MÊME transaction : rien n'est écrasé en silence et rien n'est à moitié écrit.
 */
export type PilotageErrorCode = 'invalid' | 'not_found' | 'over_limit' | 'stale'
export class PilotageError extends Error {
  constructor(public code: PilotageErrorCode, message: string) { super(message) }
}
const bad = (m: string) => new PilotageError('invalid', m)
const defaultDeps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }

const text = (v: string | undefined, max = 2000) => (v ?? '').trim().slice(0, max)
const lines = (v: string[] | undefined, max = 20) => (v ?? []).map((x) => x.trim()).filter(Boolean).slice(0, max)

export interface VisionInput { title: string; description?: string; desiredSituation?: string; ambitions?: string; aspirations?: string; preserve?: string; changes?: string; horizons?: Partial<Record<Horizon, string>> }
export interface OrientationInput { name: string; description?: string; visionId?: string | null; importance: 1 | 2 | 3; horizon: Horizon; currentState?: string; desiredState?: string }
export interface PriorityInput { title: string; description?: string; orientationId?: string | null; level: PriorityLevel; horizon: Horizon; dueDate?: string | null; temporary?: boolean; goalIds?: string[]; constraints?: string }
export interface PlanInput { aims?: string; why?: string; actions?: string; orientationIds?: string[]; priorityIds?: string[]; expectedResults?: string[]; goalIds?: string[]; projectIds?: string[]; constraints?: string }
export interface CycleInput { orientationIds?: string[]; priorityIds?: string[]; goalIds?: string[]; projectIds?: string[]; expectedResults?: string[]; indicatorIds?: string[] }
export interface ReviewInput { kind: ReviewKind; period?: string; answers?: Record<string, string>; decisions?: string }

export function createPilotageService(database: LevelDB = db, deps: ServiceDeps = defaultDeps) {
  const { now, id } = deps
  const stamp = () => now().toISOString()
  const tables = () => [database.visions, database.orientations, database.priorities, database.annualPlans, database.cycles, database.strategyReviews, database.strategyLog, database.goals, database.projects, database.indicators, database.indicatorReadings, database.quests, database.xpEvents, database.settings]
  const tx = <T>(fn: () => Promise<T>) => database.transaction('rw', tables(), fn)

  async function log(e: Omit<StrategyLogEntry, 'id' | 'at'>) { await database.strategyLog.add({ id: id(), at: stamp(), ...e }) }

  const validIds = async (table: 'goals' | 'projects' | 'indicators', ids: string[] = []) => {
    const rows = await database[table].toArray()
    const have = new Set(rows.map((r) => r.id))
    return [...new Set(ids)].filter((x) => have.has(x))
  }
  const isHorizon = (h: string): h is Horizon => h === 'short' || h === 'mid' || h === 'long'

  /** Faits mesurés d'une période, depuis LIFE (conservés avec la revue). */
  async function factsFor(range: { from: string; to: string }, scope: Parameters<typeof periodFacts>[1]): Promise<PeriodFacts> {
    const [goals, projects, indicators, readings, quests, xp, vis, ori, pri, plans, cycles, reviews, logs] = await Promise.all([
      database.goals.toArray(), database.projects.toArray(), database.indicators.toArray(), database.indicatorReadings.toArray(), database.quests.toArray(), database.xpEvents.toArray(),
      database.visions.toArray(), database.orientations.toArray(), database.priorities.toArray(), database.annualPlans.toArray(), database.cycles.toArray(), database.strategyReviews.toArray(), database.strategyLog.toArray(),
    ])
    const events = xp.map(normalizeEvent)
    const state: StrategyState = { visions: vis, orientations: ori, priorities: pri, plans, cycles, reviews, log: logs }
    const prefs = (await readPrefs(database)).planning
    const life = { goals, projects, indicators, readings }
    const findings = analyseLife({ ...life, quests, events, now: now(), prefs })
    return periodFacts(range, scope, state, { life, quests, events, now: now() }, findings)
  }

  return {
    // ── Vision ──
    /** Crée la vision, ou la révise (la version précédente est conservée dans la mémoire stratégique). */
    saveVision: (input: VisionInput) => tx(async () => {
      const title = text(input.title, 120)
      if (!title) throw bad('Donnez un titre à votre vision.')
      const next = { title, description: text(input.description), desiredSituation: text(input.desiredSituation), ambitions: text(input.ambitions), aspirations: text(input.aspirations), preserve: text(input.preserve), changes: text(input.changes), horizons: { short: text(input.horizons?.short, 1000), mid: text(input.horizons?.mid, 1000), long: text(input.horizons?.long, 1000) } }
      const cur = (await database.visions.toArray()).find((v) => v.status === 'active')
      if (!cur) {
        const v: Vision = { id: id(), ...next, status: 'active', createdAt: stamp(), revisedAt: stamp() }
        await database.visions.add(v)
        await log({ kind: 'vision', action: 'vision-created', refType: 'vision', refId: v.id, title: v.title, summary: `Vision créée : « ${v.title} »`, after: next })
        return v
      }
      const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k]))
      if (!changed.length) return cur
      const v: Vision = { ...cur, ...next, revisedAt: stamp() }
      await database.visions.put(v)
      await log({ kind: 'vision', action: 'vision-revised', refType: 'vision', refId: v.id, title: v.title, summary: `Vision révisée (${changed.length} champ${changed.length > 1 ? 's' : ''}) : « ${v.title} »`, before: Object.fromEntries(changed.map((k) => [k, cur[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) })
      return v
    }),
    /** Nouvelle vision : l'ancienne est archivée et reste consultable. */
    replaceVision: (input: VisionInput) => tx(async () => {
      const title = text(input.title, 120)
      if (!title) throw bad('Donnez un titre à votre vision.')
      const cur = (await database.visions.toArray()).filter((v) => v.status === 'active')
      for (const v of cur) { await database.visions.put({ ...v, status: 'archived' }); await log({ kind: 'vision', action: 'vision-archived', refType: 'vision', refId: v.id, title: v.title, summary: `Vision archivée : « ${v.title} »`, before: { ...v } }) }
      const v: Vision = { id: id(), title, description: text(input.description), desiredSituation: text(input.desiredSituation), ambitions: text(input.ambitions), aspirations: text(input.aspirations), preserve: text(input.preserve), changes: text(input.changes), horizons: { short: text(input.horizons?.short, 1000), mid: text(input.horizons?.mid, 1000), long: text(input.horizons?.long, 1000) }, status: 'active', createdAt: stamp(), revisedAt: stamp() }
      await database.visions.add(v)
      await log({ kind: 'vision', action: 'vision-created', refType: 'vision', refId: v.id, title, summary: `Nouvelle vision : « ${title} »`, after: { title } })
      return v
    }),

    // ── Orientations ──
    createOrientation: (input: OrientationInput) => tx(async () => {
      const name = text(input.name, 80)
      if (!name) throw bad('Donnez un nom à l’orientation.')
      if (![1, 2, 3].includes(input.importance) || !isHorizon(input.horizon)) throw bad('Importance ou horizon invalide.')
      if (input.visionId && !(await database.visions.get(input.visionId))) throw bad('Vision introuvable.')
      const all = await database.orientations.toArray()
      const o: Orientation = { id: id(), name, description: text(input.description), visionId: input.visionId ?? null, importance: input.importance, horizon: input.horizon, status: 'todo', currentState: text(input.currentState), desiredState: text(input.desiredState), indicatorIds: [], goalIds: [], projectIds: [], order: all.length ? Math.max(...all.map((x) => x.order)) + 1 : 0, archived: false, createdAt: stamp(), updatedAt: stamp(), statusAt: stamp() }
      await database.orientations.add(o)
      await log({ kind: 'orientation', action: 'orientation-created', refType: 'orientation', refId: o.id, title: name, summary: `Orientation créée : « ${name} »`, after: { importance: o.importance, horizon: o.horizon } })
      return o
    }),
    updateOrientation: (oid: string, input: OrientationInput) => tx(async () => {
      const cur = await database.orientations.get(oid); if (!cur) throw new PilotageError('not_found', 'Orientation introuvable.')
      const name = text(input.name, 80); if (!name) throw bad('Donnez un nom à l’orientation.')
      const next = { name, description: text(input.description), visionId: input.visionId ?? null, importance: input.importance, horizon: input.horizon, currentState: text(input.currentState), desiredState: text(input.desiredState) }
      const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => next[k] !== cur[k])
      if (!changed.length) return cur
      const o: Orientation = { ...cur, ...next, updatedAt: stamp() }
      await database.orientations.put(o)
      await log({ kind: 'orientation', action: changed.includes('importance') ? 'orientation-importance' : 'orientation-changed', refType: 'orientation', refId: oid, title: name, summary: changed.includes('importance') ? `« ${name} » : importance ${IMPORTANCE_LABEL[cur.importance]} → ${IMPORTANCE_LABEL[next.importance]}` : `Orientation modifiée : « ${name} » (${changed.join(', ')})`, before: Object.fromEntries(changed.map((k) => [k, cur[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) })
      return o
    }),
    setOrientationStatus: (oid: string, status: OrientationStatus, note = '') => tx(async () => {
      const cur = await database.orientations.get(oid); if (!cur) throw new PilotageError('not_found', 'Orientation introuvable.')
      if (cur.status === status) return cur
      const o = { ...cur, status, statusAt: stamp(), updatedAt: stamp() }
      await database.orientations.put(o)
      await log({ kind: 'orientation', action: 'orientation-status', refType: 'orientation', refId: oid, title: cur.name, summary: `« ${cur.name} » : ${ORIENTATION_STATUS_LABEL[cur.status]} → ${ORIENTATION_STATUS_LABEL[status]}`, before: { status: cur.status }, after: { status }, note: text(note, 300) })
      return o
    }),
    /** Rattache (ou détache) des éléments LIFE. Détacher ne supprime JAMAIS l'objectif, le projet ou l'indicateur. */
    setOrientationLinks: (oid: string, links: { goalIds?: string[]; projectIds?: string[]; indicatorIds?: string[] }) => tx(async () => {
      const cur = await database.orientations.get(oid); if (!cur) throw new PilotageError('not_found', 'Orientation introuvable.')
      const goalIds = links.goalIds ? await validIds('goals', links.goalIds) : cur.goalIds
      const projectIds = links.projectIds ? await validIds('projects', links.projectIds) : cur.projectIds
      const indicatorIds = links.indicatorIds ? await validIds('indicators', links.indicatorIds) : cur.indicatorIds
      const diff = (a: string[], b: string[]) => ({ added: b.filter((x) => !a.includes(x)).length, removed: a.filter((x) => !b.includes(x)).length })
      const dg = diff(cur.goalIds, goalIds), dp = diff(cur.projectIds, projectIds), di = diff(cur.indicatorIds, indicatorIds)
      if (!(dg.added + dg.removed + dp.added + dp.removed + di.added + di.removed)) return cur
      const o = { ...cur, goalIds, projectIds, indicatorIds, updatedAt: stamp() }
      await database.orientations.put(o)
      await log({ kind: 'orientation', action: 'orientation-links', refType: 'orientation', refId: oid, title: cur.name, summary: `« ${cur.name} » : objectifs +${dg.added}/−${dg.removed}, projets +${dp.added}/−${dp.removed}, indicateurs +${di.added}/−${di.removed}`, before: { goalIds: cur.goalIds, projectIds: cur.projectIds, indicatorIds: cur.indicatorIds }, after: { goalIds, projectIds, indicatorIds } })
      return o
    }),
    archiveOrientation: (oid: string, archived: boolean) => tx(async () => {
      const cur = await database.orientations.get(oid); if (!cur) throw new PilotageError('not_found', 'Orientation introuvable.')
      if (cur.archived === archived) return cur
      const o = { ...cur, archived, updatedAt: stamp() }
      await database.orientations.put(o)
      await log({ kind: 'orientation', action: archived ? 'orientation-archived' : 'orientation-restored', refType: 'orientation', refId: oid, title: cur.name, summary: `« ${cur.name} » ${archived ? 'archivée' : 'réactivée'} (historique conservé)` })
      return o
    }),
    moveOrientation: (oid: string, dir: -1 | 1) => tx(async () => {
      const list = (await database.orientations.toArray()).sort((a, b) => a.order - b.order)
      const i = list.findIndex((o) => o.id === oid), j = i + dir
      if (i < 0 || j < 0 || j >= list.length) return
      const a = list[i], b = list[j]
      await database.orientations.bulkPut([{ ...a, order: b.order }, { ...b, order: a.order }])
    }),

    // ── Priorités (limite souple de priorités fondamentales actives) ──
    createPriority: (input: PriorityInput, opts: { allowOverLimit?: boolean } = {}) => tx(async () => {
      const title = text(input.title, 100); if (!title) throw bad('Donnez un intitulé à la priorité.')
      if (!isHorizon(input.horizon)) throw bad('Horizon invalide.')
      if (input.dueDate && !isDayKey(input.dueDate)) throw bad('Échéance invalide.')
      if (input.orientationId && !(await database.orientations.get(input.orientationId))) throw bad('Orientation introuvable.')
      if (input.level === 'fundamental' && !opts.allowOverLimit) await checkLimit(0)
      const p: Priority = { id: id(), title, description: text(input.description), orientationId: input.orientationId ?? null, level: input.level, horizon: input.horizon, dueDate: input.dueDate ?? null, status: 'active', temporary: !!input.temporary, goalIds: await validIds('goals', input.goalIds), constraints: text(input.constraints), createdAt: stamp(), updatedAt: stamp(), statusAt: stamp(), levelAt: stamp() }
      await database.priorities.add(p)
      await log({ kind: 'priority', action: 'priority-created', refType: 'priority', refId: p.id, title, summary: `Priorité créée : « ${title} » (${PRIORITY_LEVEL_LABEL[p.level].toLowerCase()})`, after: { level: p.level } })
      return p
    }),
    updatePriority: (pid: string, input: PriorityInput, opts: { allowOverLimit?: boolean } = {}) => tx(async () => {
      const cur = await database.priorities.get(pid); if (!cur) throw new PilotageError('not_found', 'Priorité introuvable.')
      const title = text(input.title, 100); if (!title) throw bad('Donnez un intitulé à la priorité.')
      if (input.dueDate && !isDayKey(input.dueDate)) throw bad('Échéance invalide.')
      if (input.orientationId && !(await database.orientations.get(input.orientationId))) throw bad('Orientation introuvable.')
      if (input.level === 'fundamental' && cur.level !== 'fundamental' && cur.status === 'active' && !opts.allowOverLimit) await checkLimit(0)
      const goalIds = await validIds('goals', input.goalIds)
      const next = { title, description: text(input.description), orientationId: input.orientationId ?? null, level: input.level, horizon: input.horizon, dueDate: input.dueDate ?? null, temporary: !!input.temporary, goalIds, constraints: text(input.constraints) }
      const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k]))
      if (!changed.length) return cur
      const p: Priority = { ...cur, ...next, updatedAt: stamp(), levelAt: next.level !== cur.level ? stamp() : cur.levelAt }
      await database.priorities.put(p)
      await log({ kind: 'priority', action: changed.includes('level') ? 'priority-level' : 'priority-changed', refType: 'priority', refId: pid, title, summary: changed.includes('level') ? `« ${title} » : ${PRIORITY_LEVEL_LABEL[cur.level]} → ${PRIORITY_LEVEL_LABEL[next.level]}` : `Priorité modifiée : « ${title} » (${changed.join(', ')})`, before: Object.fromEntries(changed.map((k) => [k, cur[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) })
      return p
    }),
    setPriorityStatus: (pid: string, status: PriorityStatus, note = '', opts: { allowOverLimit?: boolean } = {}) => tx(async () => {
      const cur = await database.priorities.get(pid); if (!cur) throw new PilotageError('not_found', 'Priorité introuvable.')
      if (cur.status === status) return cur
      if (status === 'active' && cur.level === 'fundamental' && !opts.allowOverLimit) await checkLimit(0)
      const p = { ...cur, status, statusAt: stamp(), updatedAt: stamp() }
      await database.priorities.put(p)
      await log({ kind: 'priority', action: 'priority-status', refType: 'priority', refId: pid, title: cur.title, summary: `« ${cur.title} » : ${PRIORITY_STATUS_LABEL[cur.status]} → ${PRIORITY_STATUS_LABEL[status]}`, before: { status: cur.status }, after: { status }, note: text(note, 300) })
      return p
    }),

    // ── Plan annuel ──
    savePlan: (year: number, input: PlanInput) => tx(async () => {
      if (!Number.isInteger(year) || year < 2000 || year > 2200) throw bad('Année invalide.')
      const cur = await database.annualPlans.get(planId(year))
      const vals = {
        aims: text(input.aims ?? cur?.aims), why: text(input.why ?? cur?.why), actions: text(input.actions ?? cur?.actions), constraints: text(input.constraints ?? cur?.constraints), expectedResults: lines(input.expectedResults ?? cur?.expectedResults),
        orientationIds: [...new Set(input.orientationIds ?? cur?.orientationIds ?? [])], priorityIds: [...new Set(input.priorityIds ?? cur?.priorityIds ?? [])],
        goalIds: await validIds('goals', input.goalIds ?? cur?.goalIds ?? []), projectIds: await validIds('projects', input.projectIds ?? cur?.projectIds ?? []),
      }
      if (!cur) {
        const p: AnnualPlan = { id: planId(year), year, ...vals, status: 'active', createdAt: stamp(), updatedAt: stamp() }
        await database.annualPlans.add(p)
        await log({ kind: 'plan', action: 'plan-created', refType: 'plan', refId: p.id, title: `Plan ${year}`, summary: `Plan annuel ${year} créé` })
        return p
      }
      const changed = (Object.keys(vals) as Array<keyof typeof vals>).filter((k) => JSON.stringify(vals[k]) !== JSON.stringify(cur[k]))
      if (!changed.length) return cur
      const p: AnnualPlan = { ...cur, ...vals, updatedAt: stamp() }
      await database.annualPlans.put(p)
      await log({ kind: 'plan', action: 'plan-changed', refType: 'plan', refId: p.id, title: `Plan ${year}`, summary: `Plan annuel ${year} modifié (${changed.join(', ')})`, before: Object.fromEntries(changed.map((k) => [k, cur[k]])), after: Object.fromEntries(changed.map((k) => [k, vals[k]])) })
      return p
    }),

    // ── Cycles trimestriels ──
    saveCycle: (year: number, quarter: Quarter, input: CycleInput) => tx(async () => {
      const cid = cycleId(year, quarter)
      const cur = await database.cycles.get(cid)
      const vals = {
        orientationIds: [...new Set(input.orientationIds ?? cur?.orientationIds ?? [])], priorityIds: [...new Set(input.priorityIds ?? cur?.priorityIds ?? [])],
        goalIds: await validIds('goals', input.goalIds ?? cur?.goalIds ?? []), projectIds: await validIds('projects', input.projectIds ?? cur?.projectIds ?? []),
        indicatorIds: await validIds('indicators', input.indicatorIds ?? cur?.indicatorIds ?? []), expectedResults: lines(input.expectedResults ?? cur?.expectedResults),
      }
      if (!cur) {
        const current = year === now().getFullYear() && quarter === quarterOf(now())
        const c: Cycle = { id: cid, year, quarter, ...vals, status: current ? 'active' : 'planned', createdAt: stamp(), updatedAt: stamp() }
        await database.cycles.add(c)
        await log({ kind: 'cycle', action: 'cycle-created', refType: 'cycle', refId: cid, title: `T${quarter} ${year}`, summary: `Cycle T${quarter} ${year} créé` })
        return c
      }
      const changed = (Object.keys(vals) as Array<keyof typeof vals>).filter((k) => JSON.stringify(vals[k]) !== JSON.stringify(cur[k]))
      if (!changed.length) return cur
      const c: Cycle = { ...cur, ...vals, updatedAt: stamp() }
      await database.cycles.put(c)
      await log({ kind: 'cycle', action: 'cycle-changed', refType: 'cycle', refId: cid, title: `T${quarter} ${year}`, summary: `Cycle T${quarter} ${year} modifié (${changed.join(', ')})`, before: Object.fromEntries(changed.map((k) => [k, cur[k]])), after: Object.fromEntries(changed.map((k) => [k, vals[k]])) })
      return c
    }),
    setCycleStatus: (cid: string, status: Cycle['status']) => tx(async () => {
      const cur = await database.cycles.get(cid); if (!cur) throw new PilotageError('not_found', 'Cycle introuvable.')
      if (cur.status === status) return cur
      const c = { ...cur, status, updatedAt: stamp() }
      await database.cycles.put(c)
      await log({ kind: 'cycle', action: 'cycle-status', refType: 'cycle', refId: cid, title: `T${cur.quarter} ${cur.year}`, summary: `Cycle T${cur.quarter} ${cur.year} : ${cur.status} → ${status}`, before: { status: cur.status }, after: { status } })
      return c
    }),

    /** Faits d'une revue (aperçu avant enregistrement) : lecture seule. */
    previewFacts: (kind: ReviewKind, period: string): Promise<PeriodFacts> => database.transaction('r', tables(), async () => {
      const { range, scope } = await scopeOf(kind, period)
      return factsFor(range, scope)
    }),

    /**
     * Enregistre une revue : faits conservés avec elle. Une nouvelle revue de la même période REMPLACE la précédente dans la table, mais la
     * précédente reste dans la mémoire stratégique. Pour un trimestre, la clôture du cycle et la création facultative du cycle suivant se font
     * dans la même transaction (tout ou rien) ; pour une année, idem pour le plan de l'année suivante.
     */
    saveReview: (input: ReviewInput & { closeCycle?: boolean; createNext?: { priorityIds: string[]; orientationIds: string[] } | null; nextYear?: { priorityIds: string[]; orientationIds: string[] } | null }) => tx(async () => {
      const period = input.period ?? defaultPeriod(input.kind)
      const { range, scope } = await scopeOf(input.kind, period)
      const facts = await factsFor(range, scope)
      const rid = `review:${input.kind}:${period}`
      const prev = await database.strategyReviews.get(rid)
      const r: StrategyReview = { id: rid, kind: input.kind, period, at: stamp(), answers: Object.fromEntries(Object.entries(input.answers ?? {}).map(([k, v]) => [k, text(v)])), decisions: text(input.decisions), facts }
      await database.strategyReviews.put(r)
      await log({ kind: 'review', action: prev ? 'review-replaced' : 'review-done', refType: 'review', refId: rid, title: `${REVIEW_KIND_LABEL[input.kind]} ${period}`, summary: `${REVIEW_KIND_LABEL[input.kind]} ${period} ${prev ? 'refaite' : 'enregistrée'}`, before: prev ? { at: prev.at, decisions: prev.decisions, answers: prev.answers } : undefined, note: r.decisions || undefined })
      if (input.kind === 'quarterly' && input.closeCycle) {
        const [y, qs] = period.split('-Q'); const cy = await database.cycles.get(cycleId(Number(y), Number(qs) as Quarter))
        if (cy && cy.status !== 'closed') {
          await database.cycles.put({ ...cy, status: 'closed', updatedAt: stamp() })
          await log({ kind: 'cycle', action: 'cycle-closed', refType: 'cycle', refId: cy.id, title: `T${cy.quarter} ${cy.year}`, summary: `Cycle T${cy.quarter} ${cy.year} clos après revue` })
        }
        if (input.createNext) {
          const nq = nextQuarter(Number(y), Number(qs) as Quarter), nid = cycleId(nq.year, nq.quarter)
          if (!(await database.cycles.get(nid))) {
            const c: Cycle = { id: nid, year: nq.year, quarter: nq.quarter, orientationIds: [...new Set(input.createNext.orientationIds)], priorityIds: [...new Set(input.createNext.priorityIds)], goalIds: [], projectIds: [], expectedResults: [], indicatorIds: [], status: 'planned', createdAt: stamp(), updatedAt: stamp() }
            await database.cycles.add(c)
            await log({ kind: 'cycle', action: 'cycle-created', refType: 'cycle', refId: nid, title: `T${nq.quarter} ${nq.year}`, summary: `Cycle T${nq.quarter} ${nq.year} préparé depuis la revue`, note: 'Priorités choisies par l’utilisateur' })
          }
        }
      }
      if (input.kind === 'annual' && input.nextYear) {
        const y = Number(period) + 1
        if (!(await database.annualPlans.get(planId(y)))) {
          const p: AnnualPlan = { id: planId(y), year: y, aims: '', why: '', actions: '', orientationIds: [...new Set(input.nextYear.orientationIds)], priorityIds: [...new Set(input.nextYear.priorityIds)], expectedResults: [], goalIds: [], projectIds: [], constraints: '', status: 'active', createdAt: stamp(), updatedAt: stamp() }
          await database.annualPlans.add(p)
          await log({ kind: 'plan', action: 'plan-created', refType: 'plan', refId: p.id, title: `Plan ${y}`, summary: `Plan annuel ${y} préparé depuis la revue annuelle ${period}` })
        }
        const old = await database.annualPlans.get(planId(Number(period)))
        if (old && old.status !== 'closed') await database.annualPlans.put({ ...old, status: 'closed', updatedAt: stamp() })
      }
      return r
    }),

    /** Applique une proposition stratégique APRÈS confirmation ; l'état est revérifié (elle peut être périmée). */
    applyProposal: (p: PilotageProposal) => tx(async () => {
      const cur = await database.priorities.get(p.priorityId)
      if (!cur || cur.status !== 'active') throw new PilotageError('stale', 'Cette priorité n’est plus active : la proposition est périmée.')
      if (p.kind === 'demote-priority') {
        if (cur.level !== 'fundamental') throw new PilotageError('stale', 'Cette priorité n’est plus fondamentale.')
        const next = { ...cur, level: 'important' as const, levelAt: stamp(), updatedAt: stamp() }
        await database.priorities.put(next)
        await log({ kind: 'priority', action: 'priority-level', refType: 'priority', refId: cur.id, title: cur.title, summary: `« ${cur.title} » : ${PRIORITY_LEVEL_LABEL.fundamental} → ${PRIORITY_LEVEL_LABEL.important}`, before: { level: 'fundamental' }, after: { level: 'important' }, note: 'Sur proposition de Level, confirmée par l’utilisateur' })
        return { applied: `« ${cur.title} » passe en priorité importante.` }
      }
      await database.priorities.put({ ...cur, status: 'paused', statusAt: stamp(), updatedAt: stamp() })
      await log({ kind: 'priority', action: 'priority-status', refType: 'priority', refId: cur.id, title: cur.title, summary: `« ${cur.title} » : Active → En pause`, before: { status: 'active' }, after: { status: 'paused' }, note: 'Sur proposition de Level, confirmée par l’utilisateur' })
      return { applied: `« ${cur.title} » est mise en pause.` }
    }),

    /** Note de décision libre (mémoire stratégique). */
    logDecision: async (title: string, note: string) => { const t = text(title, 120); if (!t) throw bad('Donnez un titre à la décision.'); await database.strategyLog.add({ id: id(), at: stamp(), kind: 'decision', action: 'decision', refType: 'review', refId: 'decision', title: t, summary: t, note: text(note, 1000) }) },
  }

  async function checkLimit(extra: number) {
    const prefs = (await readPrefs(database)).pilotage
    const count = activeFundamental(await database.priorities.toArray()).length + extra
    if (count + 1 > prefs.maxFundamental) throw new PilotageError('over_limit', `Vous avez déjà ${count} priorité${count > 1 ? 's' : ''} fondamentale${count > 1 ? 's' : ''} active${count > 1 ? 's' : ''} (limite choisie : ${prefs.maxFundamental}).`)
  }
  function defaultPeriod(kind: ReviewKind): string {
    const n = now()
    return kind === 'monthly' ? `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}` : kind === 'quarterly' ? `${n.getFullYear()}-Q${quarterOf(n)}` : kind === 'annual' ? String(n.getFullYear()) : dayKey(n)
  }
  async function scopeOf(kind: ReviewKind, period: string): Promise<{ range: { from: string; to: string }; scope: Parameters<typeof periodFacts>[1] }> {
    if (kind === 'monthly') { if (!/^\d{4}-\d{2}$/.test(period)) throw bad('Période invalide.'); return { range: monthRange(period), scope: null } }
    if (kind === 'quarterly') {
      const m = /^(\d{4})-Q([1-4])$/.exec(period); if (!m) throw bad('Période invalide.')
      const cy = await database.cycles.get(cycleId(Number(m[1]), Number(m[2]) as Quarter))
      return { range: quarterRange(Number(m[1]), Number(m[2]) as Quarter), scope: cy ? { goalIds: cy.goalIds, projectIds: cy.projectIds, indicatorIds: cy.indicatorIds, priorityIds: cy.priorityIds } : null }
    }
    if (kind === 'annual') {
      if (!/^\d{4}$/.test(period)) throw bad('Période invalide.')
      const pl = await database.annualPlans.get(planId(Number(period)))
      return { range: yearRange(Number(period)), scope: pl ? { goalIds: pl.goalIds, projectIds: pl.projectIds, priorityIds: pl.priorityIds } : null }
    }
    if (!isDayKey(period)) throw bad('Période invalide.')
    const to = period; const d = new Date(period + 'T12:00:00'); d.setDate(d.getDate() - 30)
    return { range: { from: dayKey(d), to }, scope: null }
  }
}

export const pilotageService = createPilotageService()
