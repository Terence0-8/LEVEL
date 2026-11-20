import { dayKey, isDayKey } from '@/core/dates'
import { DEFAULT_UNIT, type Frequency, type Goal, type GoalStatus, type Indicator, type IndicatorKind, type LifeProposal, type Milestone, type Project, type ProjectStatus, type Reading, type Step, type Criterion } from '@/core/goals'
import type { Priority } from '@/core/quest'
import { isRecurring } from '@/core/quest'
import { db, type LevelDB } from './db'
import type { ServiceDeps } from './questService'
import { detachFromStrategy } from './pilotageService'
import type { GoneRefs } from '@/core/pilotage'

/**
 * Commandes objectifs / projets / étapes / indicateurs. RÈGLE D'OR : ce service n'écrit JAMAIS dans `xpEvents`.
 * Valider une étape, un projet ou un objectif ne rapporte aucune XP : seules les quêtes rattachées (validées par `questService`)
 * récompensent. Les suppressions ne touchent jamais aux quêtes ni à l'XP : elles détachent les quêtes (elles redeviennent indépendantes).
 */
export type GoalErrorCode = 'not_found' | 'invalid' | 'invalid_link' | 'stale'
export class GoalError extends Error {
  constructor(public code: GoalErrorCode, message: string) { super(message) }
}

const defaultDeps: ServiceDeps = { now: () => new Date(), id: () => crypto.randomUUID() }
const bad = (m: string) => new GoalError('invalid', m)

export interface GoalInput {
  title: string; description?: string; categoryId: string; dueDate?: string | null; priority: Priority; importance: 1 | 2 | 3
  status?: GoalStatus; criteria?: Array<{ id?: string; title: string; done?: boolean }>; milestones?: Array<{ id?: string; title: string; dueDate?: string | null; done?: boolean }>
  indicatorIds?: string[]; conflictsWith?: string[]
}
export interface ProjectInput {
  title: string; description?: string; categoryId: string; goalId?: string | null; priority: Priority; startDate?: string | null; dueDate?: string | null; status?: ProjectStatus
}
export interface IndicatorInput { name: string; categoryId: string; kind: IndicatorKind; unit?: string; target?: number | null; frequency?: Frequency | null; important?: boolean }
export interface QuestLink { goalId?: string | null; projectId?: string | null; stepId?: string | null }

export function createGoalService(database: LevelDB = db, deps: ServiceDeps = defaultDeps) {
  const { now, id } = deps
  const stamp = () => now().toISOString()
  /** Supprimer un élément LIFE retire aussi les liens de Pilotage qui le référencent (même transaction, tracé dans la mémoire stratégique). */
  const detachStrategy = (gone: GoneRefs) => detachFromStrategy(database, gone, { stamp, id }, 'Élément LIFE supprimé : lien stratégique retiré')
  const tx = <T>(fn: () => Promise<T>) => database.transaction('rw', [database.goals, database.projects, database.indicators, database.indicatorReadings, database.quests, database.categories, database.planningMoves, database.orientations, database.priorities, database.annualPlans, database.cycles, database.strategyLog], fn)

  const title = (t: string, max = 80) => { const v = t.trim(); if (!v || v.length > max) throw bad(`Donnez un titre de 1 à ${max} caractères.`); return v }
  const date = (d: string | null | undefined, label: string) => { if (d && !isDayKey(d)) throw bad(`${label} invalide.`); return d || null }
  const cat = async (categoryId: string) => { if (!(await database.categories.get(categoryId))) throw bad('Choisissez une catégorie existante.') }
  async function goalOf(gid: string) { const g = await database.goals.get(gid); if (!g) throw new GoalError('not_found', 'Objectif introuvable.'); return g }
  async function projectOf(pid: string) { const p = await database.projects.get(pid); if (!p) throw new GoalError('not_found', 'Projet introuvable.'); return p }

  const mkCriteria = (list: GoalInput['criteria'] = [], old: Criterion[] = []): Criterion[] => list.map((c) => {
    const prev = old.find((o) => o.id === c.id)
    const done = c.done ?? prev?.done ?? false
    return { id: c.id ?? id(), title: title(c.title, 120), done, doneAt: done ? (prev?.done ? prev.doneAt : stamp()) : null }
  })
  const mkMilestones = (list: GoalInput['milestones'] = [], old: Milestone[] = []): Milestone[] => list.map((m) => {
    const prev = old.find((o) => o.id === m.id)
    const done = m.done ?? prev?.done ?? false
    return { id: m.id ?? id(), title: title(m.title, 120), dueDate: date(m.dueDate, 'Échéance d’étape'), done, doneAt: done ? (prev?.done ? prev.doneAt : stamp()) : null }
  })

  async function normalizeGoal(input: GoalInput, existing?: Goal): Promise<Goal> {
    await cat(input.categoryId)
    if (![1, 2, 3].includes(input.importance)) throw bad('Importance invalide.')
    const goals = await database.goals.toArray()
    const ok = (ids: string[] = []) => [...new Set(ids)].filter((x) => x !== existing?.id && goals.some((g) => g.id === x))
    const inds = await database.indicators.toArray()
    const status = input.status ?? existing?.status ?? 'todo'
    return {
      id: existing?.id ?? id(), title: title(input.title), description: (input.description ?? '').trim().slice(0, 1000), categoryId: input.categoryId,
      createdAt: existing?.createdAt ?? stamp(), dueDate: date(input.dueDate, 'Échéance'), priority: input.priority, importance: input.importance, status,
      criteria: mkCriteria(input.criteria, existing?.criteria), milestones: mkMilestones(input.milestones, existing?.milestones),
      indicatorIds: [...new Set(input.indicatorIds ?? [])].filter((x) => inds.some((i) => i.id === x)), conflictsWith: ok(input.conflictsWith),
      statusAt: existing && existing.status === status ? existing.statusAt : stamp(), updatedAt: stamp(),
    }
  }

  async function normalizeProject(input: ProjectInput, existing?: Project): Promise<Project> {
    await cat(input.categoryId)
    if (input.goalId) await goalOf(input.goalId)
    const start = date(input.startDate, 'Date de début'), due = date(input.dueDate, 'Échéance')
    if (start && due && due < start) throw bad('L’échéance doit suivre la date de début.')
    const status = input.status ?? existing?.status ?? 'prepare'
    return {
      id: existing?.id ?? id(), title: title(input.title), description: (input.description ?? '').trim().slice(0, 1000), categoryId: input.categoryId, goalId: input.goalId ?? null,
      priority: input.priority, startDate: start, dueDate: due, status, steps: existing?.steps ?? [], createdAt: existing?.createdAt ?? stamp(), updatedAt: stamp(),
      statusAt: existing && existing.status === status ? existing.statusAt : stamp(),
    }
  }

  /** Modification fonctionnelle d'un projet (étapes) dans une transaction : pas d'écrasement entre deux modifications. */
  const editProject = (pid: string, fn: (p: Project) => Project) => tx(async () => {
    const next = { ...fn(await projectOf(pid)), updatedAt: stamp() }
    await database.projects.put(next)
    return next
  })
  const mapStep = (p: Project, sid: string, fn: (s: Step) => Step): Project => {
    if (!p.steps.some((s) => s.id === sid)) throw new GoalError('not_found', 'Étape introuvable.')
    return { ...p, steps: p.steps.map((s) => (s.id === sid ? fn(s) : s)) }
  }

  async function detachQuests(where: (q: { goalId?: string | null; projectId?: string | null; stepId?: string | null }) => boolean, patch: QuestLink) {
    const qs = (await database.quests.toArray()).filter(where)
    await database.quests.bulkPut(qs.map((q) => ({ ...q, ...patch, updatedAt: now().getTime() })))
  }

  return {
    // ── Objectifs ──
    createGoal: (input: GoalInput) => tx(async () => { const g = await normalizeGoal(input); await database.goals.add(g); return g }),
    updateGoal: (gid: string, input: GoalInput) => tx(async () => { const g = await normalizeGoal(input, await goalOf(gid)); await database.goals.put(g); return g }),
    setGoalStatus: (gid: string, status: GoalStatus) => tx(async () => { const g = await goalOf(gid); const n = { ...g, status, statusAt: g.status === status ? g.statusAt : stamp(), updatedAt: stamp() }; await database.goals.put(n); return n }),
    toggleCriterion: (gid: string, cid: string) => tx(async () => {
      const g = await goalOf(gid)
      const n = { ...g, updatedAt: stamp(), criteria: g.criteria.map((c) => (c.id === cid ? { ...c, done: !c.done, doneAt: c.done ? null : stamp() } : c)) }
      await database.goals.put(n); return n
    }),
    toggleMilestone: (gid: string, mid: string) => tx(async () => {
      const g = await goalOf(gid)
      const n = { ...g, updatedAt: stamp(), milestones: g.milestones.map((m) => (m.id === mid ? { ...m, done: !m.done, doneAt: m.done ? null : stamp() } : m)) }
      await database.goals.put(n); return n
    }),
    /** Supprime l'objectif. Projets et quêtes sont CONSERVÉS (détachés) ; XP et historique intacts. */
    deleteGoal: (gid: string) => tx(async () => {
      await goalOf(gid)
      for (const p of await database.projects.where('goalId').equals(gid).toArray()) await database.projects.put({ ...p, goalId: null, updatedAt: stamp() })
      await detachQuests((q) => q.goalId === gid, { goalId: null })
      for (const o of await database.goals.toArray()) if (o.conflictsWith.includes(gid)) await database.goals.put({ ...o, conflictsWith: o.conflictsWith.filter((x) => x !== gid) })
      await database.goals.delete(gid)
      await detachStrategy({ goal: new Set([gid]) })
    }),

    // ── Projets ──
    createProject: (input: ProjectInput) => tx(async () => { const p = await normalizeProject(input); await database.projects.add(p); return p }),
    updateProject: (pid: string, input: ProjectInput) => tx(async () => { const p = await normalizeProject(input, await projectOf(pid)); await database.projects.put(p); return p }),
    setProjectStatus: (pid: string, status: ProjectStatus) => editProject(pid, (p) => ({ ...p, status, statusAt: p.status === status ? p.statusAt : stamp() })),
    /** Supprime le projet. Ses quêtes sont CONSERVÉES et redeviennent indépendantes (XP et historique intacts). */
    deleteProject: (pid: string) => tx(async () => {
      await projectOf(pid)
      await detachQuests((q) => q.projectId === pid, { projectId: null, stepId: null })
      await database.projects.delete(pid)
      await detachStrategy({ project: new Set([pid]) })
    }),

    // ── Étapes et sous-tâches ──
    addStep: (pid: string, input: { title: string; dueDate?: string | null }) => editProject(pid, (p) => ({ ...p, steps: [...p.steps, { id: id(), title: title(input.title, 120), dueDate: date(input.dueDate, 'Échéance'), done: false, doneAt: null, blocked: null, subtasks: [] }] })),
    updateStep: (pid: string, sid: string, patch: { title?: string; dueDate?: string | null; blocked?: string | null }) => editProject(pid, (p) => mapStep(p, sid, (s) => ({
      ...s, title: patch.title !== undefined ? title(patch.title, 120) : s.title, dueDate: patch.dueDate !== undefined ? date(patch.dueDate, 'Échéance') : s.dueDate,
      blocked: patch.blocked !== undefined ? (patch.blocked?.trim() ? patch.blocked.trim().slice(0, 200) : null) : s.blocked,
    }))),
    removeStep: (pid: string, sid: string) => tx(async () => {
      const p = await projectOf(pid)
      await detachQuests((q) => q.stepId === sid, { stepId: null })
      const n = { ...p, steps: p.steps.filter((s) => s.id !== sid), updatedAt: stamp() }
      await database.projects.put(n); return n
    }),
    moveStep: (pid: string, sid: string, dir: -1 | 1) => editProject(pid, (p) => {
      const i = p.steps.findIndex((s) => s.id === sid); const j = i + dir
      if (i < 0 || j < 0 || j >= p.steps.length) return p
      const steps = [...p.steps]; [steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...p, steps }
    }),
    /** Validation EXPLICITE d'une étape. N'écrit aucune XP. */
    toggleStep: (pid: string, sid: string) => editProject(pid, (p) => mapStep(p, sid, (s) => ({ ...s, done: !s.done, doneAt: s.done ? null : stamp(), blocked: s.done ? s.blocked : null }))),
    addSubtask: (pid: string, sid: string, text: string) => editProject(pid, (p) => mapStep(p, sid, (s) => ({ ...s, subtasks: [...s.subtasks, { id: id(), title: title(text, 120), done: false, doneAt: null }] }))),
    toggleSubtask: (pid: string, sid: string, tid: string) => editProject(pid, (p) => mapStep(p, sid, (s) => ({ ...s, subtasks: s.subtasks.map((t) => (t.id === tid ? { ...t, done: !t.done, doneAt: t.done ? null : stamp() } : t)) }))),
    removeSubtask: (pid: string, sid: string, tid: string) => editProject(pid, (p) => mapStep(p, sid, (s) => ({ ...s, subtasks: s.subtasks.filter((t) => t.id !== tid) }))),

    // ── Rattachement d'une quête existante ──
    /** Rattache (ou détache) une quête. La quête reste une vraie quête LIFE ; sa récompense XP est inchangée. */
    linkQuest: (questId: string, link: QuestLink) => tx(async () => {
      const q = await database.quests.get(questId)
      if (!q) throw new GoalError('not_found', 'Quête introuvable.')
      let { goalId = null, projectId = null, stepId = null } = link
      if (projectId) {
        const p = await projectOf(projectId).catch(() => { throw new GoalError('invalid_link', 'Projet introuvable.') })
        if (isRecurring(q.type)) throw new GoalError('invalid_link', 'Une quête récurrente se rattache à un objectif, pas à un projet.')
        if (stepId && !p.steps.some((s) => s.id === stepId)) throw new GoalError('invalid_link', 'Cette étape n’appartient pas au projet.')
        goalId = null
      } else {
        stepId = null
        if (goalId) await goalOf(goalId).catch(() => { throw new GoalError('invalid_link', 'Objectif introuvable.') })
      }
      await database.quests.put({ ...q, goalId, projectId, stepId, updatedAt: now().getTime() })
    }),

    // ── Indicateurs ──
    createIndicator: (input: IndicatorInput) => tx(async () => {
      await cat(input.categoryId)
      const ind: Indicator = { id: id(), name: title(input.name, 60), categoryId: input.categoryId, kind: input.kind, unit: (input.unit ?? DEFAULT_UNIT[input.kind]).trim().slice(0, 12), target: input.target ?? null, frequency: input.frequency ?? null, important: !!input.important, archived: false, createdAt: stamp() }
      if (ind.target !== null && !Number.isFinite(ind.target)) throw bad('Valeur cible invalide.')
      await database.indicators.add(ind); return ind
    }),
    updateIndicator: (iid: string, input: IndicatorInput & { archived?: boolean }) => tx(async () => {
      const cur = await database.indicators.get(iid); if (!cur) throw new GoalError('not_found', 'Indicateur introuvable.')
      await cat(input.categoryId)
      const n: Indicator = { ...cur, name: title(input.name, 60), categoryId: input.categoryId, kind: input.kind, unit: (input.unit ?? cur.unit).trim().slice(0, 12), target: input.target ?? null, frequency: input.frequency ?? null, important: !!input.important, archived: input.archived ?? cur.archived }
      await database.indicators.put(n); return n
    }),
    /** Supprime l'indicateur ET son historique de mesures (confirmation exigée côté interface). Aucun effet sur l'XP. */
    deleteIndicator: (iid: string) => tx(async () => {
      await database.indicatorReadings.where('indicatorId').equals(iid).delete()
      for (const g of await database.goals.toArray()) if (g.indicatorIds.includes(iid)) await database.goals.put({ ...g, indicatorIds: g.indicatorIds.filter((x) => x !== iid) })
      await database.indicators.delete(iid)
      await detachStrategy({ indicator: new Set([iid]) })
    }),
    addReading: (iid: string, input: { value: number; at?: string; note?: string }) => tx(async () => {
      if (!(await database.indicators.get(iid))) throw new GoalError('not_found', 'Indicateur introuvable.')
      if (!Number.isFinite(input.value)) throw bad('Saisissez une valeur numérique.')
      const at = input.at ?? dayKey(now())
      if (!isDayKey(at)) throw bad('Date invalide.')
      if (at > dayKey(now())) throw bad('Une mesure ne peut pas être datée dans le futur.')
      const r: Reading = { id: id(), indicatorId: iid, value: input.value, at, note: (input.note ?? '').trim().slice(0, 200), recordedAt: stamp() }
      await database.indicatorReadings.add(r); return r
    }),
    updateReading: (rid: string, input: { value: number; at: string; note?: string }) => tx(async () => {
      const r = await database.indicatorReadings.get(rid); if (!r) throw new GoalError('not_found', 'Mesure introuvable.')
      if (!Number.isFinite(input.value) || !isDayKey(input.at) || input.at > dayKey(now())) throw bad('Mesure invalide.')
      const n = { ...r, value: input.value, at: input.at, note: (input.note ?? r.note).trim().slice(0, 200) }
      await database.indicatorReadings.put(n); return n
    }),
    deleteReading: async (rid: string) => { await database.indicatorReadings.delete(rid) },

    // ── Propositions de Level (confirmées par l'utilisateur, revérifiées à l'écriture, tracées) ──
    applyLifeProposal: (p: LifeProposal) => tx(async () => {
      if (!p.projectId) throw new GoalError('invalid', 'Cette proposition se traite depuis l’écran concerné.')
      const proj = await projectOf(p.projectId)
      if (p.kind === 'pause-project') {
        if (proj.status !== 'active') throw new GoalError('stale', 'Ce projet n’est plus en cours.')
        await database.projects.put({ ...proj, status: 'paused', statusAt: stamp(), updatedAt: stamp() })
        await database.planningMoves.add({ id: id(), kind: 'project', refId: proj.id, title: proj.title, from: null, to: null, at: stamp(), reason: 'Projet mis en pause sur proposition confirmée', byLevel: true })
        return { applied: `« ${proj.title} » mis en pause.` }
      }
      if (p.kind === 'shift-project-deadline') {
        if (!p.to || !isDayKey(p.to) || p.to < dayKey(now())) throw bad('Nouvelle échéance invalide.')
        if (proj.status !== 'prepare' && proj.status !== 'active') throw new GoalError('stale', 'Ce projet n’est plus ouvert.')
        await database.projects.put({ ...proj, dueDate: p.to, updatedAt: stamp() })
        await database.planningMoves.add({ id: id(), kind: 'project', refId: proj.id, title: proj.title, from: proj.dueDate, to: p.to, at: stamp(), reason: 'Échéance décalée sur proposition confirmée', byLevel: true })
        return { applied: `Échéance de « ${proj.title} » décalée au ${p.to}.` }
      }
      throw new GoalError('invalid', 'Cette proposition se traite depuis l’écran concerné.')
    }),
  }
}

export const goalService = createGoalService()
