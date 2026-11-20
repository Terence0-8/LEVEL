import { addDays, dayKey, daysBetweenKeys } from './dates'
import type { Finding } from './goals'
import type { Observation, Reliability } from './insights'
import { activeFundamental, goalActivityDays, orientationProgress, projectsOfGoal, resolveGoals, resolveProjects, type LifeCtx, type Orientation, type PilotagePrefs, type Priority, type StrategyState, quarterRange, cycleId, quarterOf } from './pilotage'

/**
 * Intelligence STRATÉGIQUE locale : règles supplémentaires branchées sur le moteur d'analyse existant (`insights.analyse`) et le moteur de
 * recommandations (`recommendations.buildRecommendations`) — pas un second moteur. Elles produisent des `Observation` avec leur certitude :
 *  - `certain` : un fait vérifiable dans les données (ex. limite de priorités fondamentales dépassée) ;
 *  - `probable` : une incompatibilité probable (ex. aucune activité alors qu'une priorité est fondamentale) ;
 *  - `estimate` : une simple estimation.
 * Aucune conclusion psychologique ; un changement de priorité n'est jamais un manque de discipline ; sous le minimum de données, la règle se tait.
 */
export const STRATEGY_CONFIG = {
  idleDays: 28,
  noTimeDays: 14,
  orientationWeeks: 4,
  changeWindowDays: 60,
  changesForObservation: 4,
  visionStaleDays: 365,
  invisibleProgress: 0.1,
  cycleHalf: 0.5,
}

const rel = (n: number, medium: number, high: number): Reliability => (n >= high ? 'high' : n >= medium ? 'medium' : 'low')

export interface StrategyCtx {
  strategy: StrategyState
  prefs: PilotagePrefs
  life: LifeCtx
  findings: Finding[]
  planning: { dueQuestGoalIds: Set<string> }
}

/** Proposition appliquable (après confirmation) sur une priorité : la seule modification directe que Pilotage peut suggérer. */
export interface PilotageProposal { id: string; kind: 'demote-priority' | 'pause-priority'; priorityId: string; title: string; detail: string }

const activeOrientation = (o: Orientation) => !o.archived && o.status === 'active'
const daysSince = (iso: string, now: Date) => daysBetweenKeys(dayKey(new Date(iso)), dayKey(now))
const range = (now: Date, days: number) => ({ from: dayKey(addDays(now, -days + 1)), to: dayKey(now) })

function prioActivity(p: Priority, c: StrategyCtx, days: number): number {
  const r = range(c.life.now, days)
  const out = new Set<string>()
  for (const g of resolveGoals(p.goalIds, c.life.life)) for (const d of goalActivityDays(g, projectsOfGoal(g, c.life.life), c.life, r.from, r.to)) out.add(d)
  return out.size
}
function orientActivityDays(o: Orientation, c: StrategyCtx, from: string, to: string): Set<string> {
  const out = new Set<string>()
  const gs = resolveGoals(o.goalIds, c.life.life)
  for (const g of gs) for (const d of goalActivityDays(g, projectsOfGoal(g, c.life.life), c.life, from, to)) out.add(d)
  for (const d of goalActivityDays(null, resolveProjects(o.projectIds, c.life.life), c.life, from, to)) out.add(d)
  return out
}

export function strategicObservations(c: StrategyCtx): Observation[] {
  const s = c.strategy
  const out: Observation[] = []
  const now = c.life.now
  const today = dayKey(now)
  const life = c.life.life
  if (!s.orientations.length && !s.priorities.length && !s.visions.length && !s.cycles.length) return out
  const activeOr = s.orientations.filter(activeOrientation)
  const fundamental = activeFundamental(s.priorities)
  const firstActivity = c.life.events.filter((e) => e.kind === 'award' && e.amount > 0).map((e) => dayKey(new Date(e.at))).sort()[0]
  const history = firstActivity ? daysBetweenKeys(firstActivity, today) : 0

  // Cohérence : orientations sans objectif concret
  for (const o of activeOr) {
    const linked = resolveGoals(o.goalIds, life).length + resolveProjects(o.projectIds, life).length
    if (linked === 0 && daysSince(o.createdAt, now) >= 7) out.push({ id: `strat-orientation-empty:${o.id}`, domain: 'LIFE', window: 'month', nature: 'fact', tone: 'neutral', certainty: 'certain', title: `Orientation sans objectif concret : ${o.name}`, detail: 'Cette orientation est active mais aucun objectif ni projet LIFE n’y contribue encore. Une orientation peut rester une direction ; la traduire en objectif la rend mesurable.', evidence: [`orientation créée le ${o.createdAt.slice(0, 10)}`, '0 objectif, 0 projet rattaché'], reliability: 'high', samples: 1, signature: `or-empty:${o.id}`, route: '/pilotage/orientations' })
  }

  // Priorités qui ne se traduisent pas en actions
  for (const p of s.priorities.filter((x) => x.status === 'active' && x.level !== 'secondary')) {
    const age = daysSince(p.createdAt, now)
    const goals = resolveGoals(p.goalIds, life)
    if (!goals.length) { if (age >= 7) out.push({ id: `strat-priority-unlinked:${p.id}`, domain: 'LIFE', window: 'month', nature: 'fact', tone: 'neutral', certainty: 'certain', title: `Priorité sans objectif associé : ${p.title}`, detail: 'Aucun objectif LIFE n’est rattaché à cette priorité : elle ne peut donc pas se traduire en actions mesurables.', evidence: [`priorité ${p.level === 'fundamental' ? 'fondamentale' : 'importante'} créée le ${p.createdAt.slice(0, 10)}`, '0 objectif associé'], reliability: 'high', samples: 1, signature: `pr-unlinked:${p.id}`, route: '/pilotage/priorites' }); continue }
    if (age >= STRATEGY_CONFIG.idleDays && history >= STRATEGY_CONFIG.idleDays) {
      const n = prioActivity(p, c, STRATEGY_CONFIG.idleDays)
      if (n === 0) { out.push({ id: `strat-priority-idle:${p.id}`, domain: 'LIFE', window: 'long', nature: 'fact', tone: 'attention', certainty: 'probable', title: `Priorité sans activité récente : ${p.title}`, detail: 'Aucune action enregistrée sur les objectifs de cette priorité depuis 28 jours. Elle est peut-être devenue secondaire : c’est un choix à confirmer, pas un reproche.', evidence: [`${goals.length} objectif${goals.length > 1 ? 's' : ''} associé${goals.length > 1 ? 's' : ''}`, 'aucune quête récompensée ni étape validée sur 28 jours', `priorité créée il y a ${age} jours`], reliability: rel(age, 28, 56), samples: age, signature: `pr-idle:${p.id}`, route: '/pilotage/priorites' }); continue }
    }
    // Aucun temps consacré : rien d'activité sur 14 jours ET rien de planifié sur les 14 prochains jours
    if (p.level === 'fundamental' && age >= STRATEGY_CONFIG.noTimeDays && history >= STRATEGY_CONFIG.noTimeDays && prioActivity(p, c, STRATEGY_CONFIG.noTimeDays) === 0) {
      const horizon = dayKey(addDays(now, 14))
      const scheduled = c.life.quests.some((q) => !q.archived && ((q.goalId && p.goalIds.includes(q.goalId)) || (q.projectId && goals.some((g) => life.projects.some((pr) => pr.goalId === g.id && pr.id === q.projectId)))) && ((q.plannedFor && q.plannedFor >= today && q.plannedFor <= horizon) || (q.dueDate && q.dueDate >= today && q.dueDate <= horizon)))
      if (!scheduled) out.push({ id: `strat-priority-notime:${p.id}`, domain: 'LIFE', window: 'month', nature: 'estimate', tone: 'attention', certainty: 'probable', title: `Priorité fondamentale sans temps consacré : ${p.title}`, detail: 'Ni activité récente ni quête planifiée dans les 14 prochains jours pour cette priorité. Si elle est fondamentale, elle mérite un créneau ; sinon, la rétrograder clarifie la situation.', evidence: ['0 jour d’activité sur 14 jours', 'aucune quête associée planifiée ou à échéance sous 14 jours'], reliability: rel(age, 14, 42), samples: age, signature: `pr-notime:${p.id}`, route: '/planning' })
    }
  }

  // Limite (souple) de priorités fondamentales
  if (fundamental.length > c.prefs.maxFundamental) out.push({ id: 'strat-fundamental-limit', domain: 'MIXED', window: 'month', nature: 'fact', tone: 'attention', certainty: 'certain', title: `${fundamental.length} priorités fondamentales actives (limite choisie : ${c.prefs.maxFundamental})`, detail: 'Quand tout est fondamental, plus rien ne l’est : la limite est celle que vous avez fixée et vous pouvez la changer. Concentrer les efforts augmente les chances d’aboutir.', evidence: fundamental.map((p) => p.title), reliability: 'high', samples: fundamental.length, signature: `fund:${fundamental.length}:${c.prefs.maxFundamental}`, route: '/pilotage/priorites' })

  // Objectifs qui ne contribuent plus à une orientation active
  for (const g of life.goals.filter((x) => x.status === 'active')) {
    const ors = s.orientations.filter((o) => o.goalIds.includes(g.id))
    if (ors.length && ors.every((o) => o.archived || o.status === 'paused' || o.status === 'achieved' || o.status === 'abandoned')) out.push({ id: `strat-goal-orphan:${g.id}`, domain: 'LIFE', window: 'month', nature: 'fact', tone: 'neutral', certainty: 'certain', title: `Objectif sans orientation active : ${g.title}`, detail: 'Toutes les orientations auxquelles cet objectif contribue sont en pause, accomplies, abandonnées ou archivées. L’objectif peut rester utile seul, ou être rattaché à une autre orientation.', evidence: ors.map((o) => `${o.name} : ${o.archived ? 'archivée' : o.status}`), reliability: 'high', samples: ors.length, signature: `goal-orphan:${g.id}:${ors.map((o) => o.id).sort().join(',')}`, route: '/life/objectifs' })
  }
  // Projets qui s'éloignent de leur finalité
  for (const p of life.projects.filter((x) => x.status === 'active')) {
    const ors = s.orientations.filter((o) => !o.archived && o.projectIds.includes(p.id))
    const parent = p.goalId ? life.goals.find((g) => g.id === p.goalId) : undefined
    if (ors.length && parent && ['abandoned', 'achieved', 'paused'].includes(parent.status)) out.push({ id: `strat-project-drift:${p.id}`, domain: 'LIFE', window: 'month', nature: 'fact', tone: 'neutral', certainty: 'probable', title: `Projet à rattacher à sa finalité : ${p.title}`, detail: `Le projet est actif alors que l’objectif auquel il contribue est ${parent.status === 'achieved' ? 'atteint' : parent.status === 'paused' ? 'en pause' : 'abandonné'}. Il peut être terminé, repensé ou rattaché à un autre objectif.`, evidence: [`objectif « ${parent.title} » : ${parent.status}`, `orientation${ors.length > 1 ? 's' : ''} : ${ors.map((o) => o.name).join(', ')}`], reliability: 'high', samples: 1, signature: `proj-drift:${p.id}:${parent.status}`, route: '/life/projets' })
  }
  if (fundamental.length >= 1) {
    const linked = new Set([...s.orientations.flatMap((o) => o.projectIds), ...s.cycles.flatMap((x) => x.projectIds), ...s.plans.flatMap((x) => x.projectIds)])
    const goalLinked = new Set([...s.orientations.flatMap((o) => o.goalIds), ...s.priorities.flatMap((x) => x.goalIds), ...s.cycles.flatMap((x) => x.goalIds)])
    const r = range(now, 28)
    const loose = life.projects.filter((p) => p.status === 'active' && !linked.has(p.id) && !(p.goalId && goalLinked.has(p.goalId)) && goalActivityDays(null, [p], c.life, r.from, r.to).size > 0)
    if (history >= 28 && loose.length) out.push({ id: 'strat-projects-unlinked', domain: 'LIFE', window: 'month', nature: 'estimate', tone: 'neutral', certainty: 'estimate', title: `${loose.length} projet${loose.length > 1 ? 's' : ''} actif${loose.length > 1 ? 's' : ''} sans lien avec vos priorités`, detail: 'Ces projets mobilisent de l’énergie mais ne sont rattachés à aucune orientation, priorité ou cycle. Ils peuvent être voulus : ce constat sert seulement à le vérifier.', evidence: loose.slice(0, 5).map((p) => p.title), reliability: rel(history, 28, 84), samples: loose.length, signature: `proj-loose:${loose.map((p) => p.id).sort().join(',')}`, route: '/pilotage/orientations' })
  }

  // Évolution dans le temps : orientations régulières ou aux progrès peu visibles
  for (const o of activeOr) {
    if (daysSince(o.createdAt, now) < STRATEGY_CONFIG.orientationWeeks * 7) continue
    let weeksActive = 0
    for (let w = 0; w < STRATEGY_CONFIG.orientationWeeks; w++) { const to = dayKey(addDays(now, -7 * w)), from = dayKey(addDays(now, -7 * w - 6)); if (orientActivityDays(o, c, from, to).size > 0) weeksActive++ }
    const pr = orientationProgress(o, c.life).value
    if (weeksActive === STRATEGY_CONFIG.orientationWeeks) out.push({ id: `strat-orientation-regular:${o.id}`, domain: 'LIFE', window: 'long', nature: 'fact', tone: 'positive', title: `Orientation qui avance régulièrement : ${o.name}`, detail: 'De l’activité réelle chaque semaine sur les objectifs et projets de cette orientation.', evidence: [`${weeksActive} semaines sur ${STRATEGY_CONFIG.orientationWeeks} avec de l’activité`, pr !== null ? `avancement des éléments rattachés : ${Math.round(pr * 100)} %` : 'avancement non mesurable'], reliability: 'medium', samples: weeksActive, signature: `or-regular:${o.id}`, route: '/pilotage/orientations' })
    else if (weeksActive >= 3 && pr !== null && pr < STRATEGY_CONFIG.invisibleProgress) out.push({ id: `strat-progress-invisible:${o.id}`, domain: 'LIFE', window: 'long', nature: 'estimate', tone: 'positive', title: `Progrès réguliers mais peu visibles : ${o.name}`, detail: 'L’activité est régulière alors que l’avancement chiffré reste faible : c’est fréquent sur les ambitions de long terme.', evidence: [`${weeksActive} semaines actives sur ${STRATEGY_CONFIG.orientationWeeks}`, `avancement : ${Math.round(pr * 100)} %`], reliability: 'low', samples: weeksActive, signature: `or-invisible:${o.id}`, route: '/pilotage/orientations' })
  }

  // Changements de cap fréquents (neutre : une trajectoire qui évolue n'est pas un échec)
  const since = dayKey(addDays(now, -STRATEGY_CONFIG.changeWindowDays))
  const changes = s.log.filter((e) => ['priority-level', 'priority-status', 'orientation-status'].includes(e.action) && dayKey(new Date(e.at)) >= since)
  if (changes.length >= STRATEGY_CONFIG.changesForObservation) out.push({ id: 'strat-direction-changes', domain: 'MIXED', window: 'long', nature: 'interpretation', tone: 'neutral', title: 'Plusieurs ajustements de cap récents', detail: 'Les priorités et orientations ont évolué plusieurs fois récemment. S’adapter aux circonstances est normal : ce constat n’indique aucun manque de constance. Une revue peut aider à clarifier le cap.', evidence: changes.slice(0, 5).map((e) => e.summary).concat([`${changes.length} changements en ${STRATEGY_CONFIG.changeWindowDays} jours`]), reliability: rel(changes.length, 4, 8), samples: changes.length, signature: `changes:${Math.floor(changes.length / 2)}`, route: '/pilotage/historique' })

  // Calendriers qui deviennent irréalistes (objectifs de priorités ou de cycles) : on réutilise les constats LIFE
  const inStrategy = new Set([...s.priorities.filter((p) => p.status === 'active').flatMap((p) => p.goalIds), ...s.cycles.filter((x) => x.status === 'active' || x.status === 'planned').flatMap((x) => x.goalIds), ...s.orientations.filter(activeOrientation).flatMap((o) => o.goalIds)])
  for (const f of c.findings.filter((x) => (x.kind === 'goal-incompatible' || x.kind === 'goal-lagging') && x.refType === 'goal' && inStrategy.has(x.refId))) out.push({ id: `strat-goal-timeline:${f.refId}`, domain: 'LIFE', window: 'month', nature: 'estimate', tone: 'attention', certainty: f.kind === 'goal-incompatible' ? 'probable' : 'estimate', title: `Calendrier à revoir : ${life.goals.find((g) => g.id === f.refId)?.title ?? 'objectif'}`, detail: f.detail, evidence: [f.title, f.detail], reliability: 'medium', samples: 1, signature: `timeline:${f.id}`, route: '/life/objectifs' })

  // Cycle trimestriel en cours : cohérence à mi-parcours
  const cy = s.cycles.find((x) => x.id === cycleId(now.getFullYear(), quarterOf(now)) && (x.status === 'active' || x.status === 'planned'))
  if (cy) {
    const r = quarterRange(cy.year, cy.quarter)
    const total = Math.max(1, daysBetweenKeys(r.from, r.to) + 1), elapsed = daysBetweenKeys(r.from, today) + 1
    const pr = cy.priorityIds.map((id) => s.priorities.find((p) => p.id === id)).filter((p): p is Priority => !!p && p.status !== 'dropped')
    if (!pr.length && !cy.goalIds.length && !cy.projectIds.length) out.push({ id: `strat-cycle-empty:${cy.id}`, domain: 'MIXED', window: 'month', nature: 'fact', tone: 'neutral', certainty: 'certain', title: 'Cycle du trimestre sans élément sélectionné', detail: 'Le cycle existe mais ne retient aucune priorité, aucun objectif ni projet. Un cycle sert à sélectionner l’essentiel du trimestre.', evidence: ['0 priorité, 0 objectif, 0 projet'], reliability: 'high', samples: 1, signature: `cycle-empty:${cy.id}`, route: '/pilotage/cycles' })
    else if (pr.length >= 2 && elapsed / total >= STRATEGY_CONFIG.cycleHalf) {
      const active = pr.filter((p) => resolveGoals(p.goalIds, life).some((g) => goalActivityDays(g, projectsOfGoal(g, life), c.life, r.from, today).size > 0))
      if (active.length * 2 < pr.length) out.push({ id: `strat-cycle-incoherent:${cy.id}`, domain: 'MIXED', window: 'month', nature: 'estimate', tone: 'attention', certainty: 'probable', title: 'Cycle du trimestre à revoir', detail: 'Plus de la moitié du trimestre est écoulée et moins de la moitié des priorités retenues a connu de l’activité. Le cycle peut être ajusté : ce n’est pas un échec, la situation a peut-être changé.', evidence: [`${active.length} priorité${active.length > 1 ? 's' : ''} active${active.length > 1 ? 's' : ''} sur ${pr.length}`, `${Math.round((elapsed / total) * 100)} % du trimestre écoulé`], reliability: rel(pr.length + Math.floor(elapsed / 14), 3, 6), samples: pr.length, signature: `cycle-inc:${cy.id}:${active.length}/${pr.length}`, route: '/pilotage/cycles' })
    }
  }

  // Vision : relecture douce
  const v = s.visions.find((x) => x.status === 'active')
  if (v && daysSince(v.revisedAt, now) >= STRATEGY_CONFIG.visionStaleDays) out.push({ id: 'strat-vision-stale', domain: 'RPG', window: 'long', nature: 'fact', tone: 'neutral', title: 'Votre vision n’a pas été relue depuis plus d’un an', detail: 'Une vision évolue avec la vie. Relire la vôtre peut confirmer qu’elle vous ressemble toujours, ou la faire évoluer ; rien d’urgent.', evidence: [`dernière révision : ${v.revisedAt.slice(0, 10)}`], reliability: 'high', samples: 1, signature: `vision-stale:${v.revisedAt.slice(0, 7)}`, route: '/pilotage/vision' })
  return out
}

/** Propositions appliquables (après confirmation) : rétrograder la priorité fondamentale la moins active quand la limite est dépassée, ou une priorité fondamentale inactive. */
export function strategicProposals(c: StrategyCtx): PilotageProposal[] {
  const out: PilotageProposal[] = []
  const fund = activeFundamental(c.strategy.priorities)
  if (fund.length > c.prefs.maxFundamental) {
    const ranked = fund.map((p) => ({ p, n: prioActivity(p, c, STRATEGY_CONFIG.idleDays) })).sort((a, b) => a.n - b.n || a.p.createdAt.localeCompare(b.p.createdAt))
    const pick = ranked[0].p
    out.push({ id: `demote:${pick.id}:limit`, kind: 'demote-priority', priorityId: pick.id, title: `Passer « ${pick.title} » en priorité importante`, detail: `${fund.length} priorités fondamentales actives pour une limite de ${c.prefs.maxFundamental}. « ${pick.title} » est celle qui a connu le moins d’activité récente (${ranked[0].n} jour${ranked[0].n > 1 ? 's' : ''} sur ${STRATEGY_CONFIG.idleDays}). Elle reste active, avec un niveau d’importance moindre.` })
  }
  for (const p of fund) if (!out.some((x) => x.priorityId === p.id) && daysSince(p.createdAt, c.life.now) >= STRATEGY_CONFIG.idleDays && resolveGoals(p.goalIds, c.life.life).length > 0 && prioActivity(p, c, STRATEGY_CONFIG.idleDays) === 0)
    out.push({ id: `demote:${p.id}:idle`, kind: 'demote-priority', priorityId: p.id, title: `Réexaminer « ${p.title} » : la passer en priorité importante`, detail: 'Aucune activité sur ses objectifs depuis 28 jours : elle est peut-être devenue secondaire. La rétrograder libère de la place pour ce qui avance vraiment.' })
  return out
}
