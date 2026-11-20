import { ACHIEVEMENT_BY_ID, type AchievementRow } from './achievements'
import { attributeValue } from './attributes'
import { addDays, dayKey, daysBetweenKeys, fromDayKey, mondayOf } from './dates'
import { formatValue, isOpenGoal, isOpenProject, readingsOf, type Goal, type Indicator, type Project, type Reading } from './goals'
import type { XpEvent } from './ledger'
import { cycleStates, type PrestigeRecord } from './prestige'
import { REWARD_BY_ID, REWARD_CATEGORY_LABEL, type RewardRow } from './prestigeRewards'
import { DOMAIN_LADDER, domainLevel, domainRank } from './progressionConfig'
import type { Quest } from './quest'
import { isCycleCompleted } from './questState'
import { EXERCISE_BY_ID } from './sport/exercises'
import type { RecoveryCheck, SportSession } from './sport/session'
import type { Exercise } from './sport/types'
import { isFinished, setMetric } from './sport/xp'
import type { AttributeId, Domain } from './types'
import { ATTRIBUTE_LABELS } from './attributes'
import { levelFromXp } from './xp'

/**
 * Événements RPG : les moments qui méritent réellement d'être remarqués. Pur et déterministe : `detectEvents` recalcule, depuis les faits
 * vérifiables (journal d'XP, séances, objectifs, projets, indicateurs, prestiges, récompenses, succès), TOUS les événements actuellement vrais,
 * chacun avec une clé unique et la date réelle du fait. Le service n'inscrit que les clés manquantes (jamais de doublon) ; un événement dont le
 * fait n'est plus vrai après une correction est marqué « révoqué » (il reste dans l'historique). Jamais d'effet sur le journal d'XP.
 * Les actions ordinaires (une quête, une série) ne sont PAS des événements.
 */
export type EventCategory = 'progression' | 'life' | 'sport' | 'regularity'
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = { progression: 'Progression RPG', life: 'LIFE', sport: 'SPORT', regularity: 'Régularité et évolution' }
export type Importance = 'info' | 'important' | 'major' | 'exceptional'
export const IMPORTANCE_LABEL: Record<Importance, string> = { info: 'Information', important: 'Important', major: 'Majeur', exceptional: 'Exceptionnel' }
export const IMPORTANCE_RANK: Record<Importance, number> = { info: 0, important: 1, major: 2, exceptional: 3 }
export type EventDomain = Domain | 'RPG' | 'MIXED'

export interface RpgEvent {
  /** Clé unique déterministe (ex. `level-up:LIFE:1:12`) : le même fait ne produit jamais deux événements */
  id: string
  category: EventCategory
  type: string
  importance: Importance
  /** ISO : date réelle du fait */
  at: string
  domain: EventDomain
  title: string
  /** Description factuelle (la narration contextualisée est dans `core/narration.ts`) */
  description: string
  /** Origine identifiable : table ou calcul d'où vient le fait */
  origin: 'xp-journal' | 'achievements' | 'rewards' | 'prestiges' | 'goals' | 'projects' | 'indicators' | 'quests' | 'sport-sessions' | 'recovery-checks'
  refType?: 'goal' | 'project' | 'indicator' | 'quest' | 'session' | 'achievement' | 'reward' | 'prestige' | 'attribute'
  refId?: string
  /** Écran concerné */
  route?: string
  /** Faits chiffrés ayant servi à décrire l'événement (source de toute narration) */
  data: Record<string, string | number>
  /** Consultation : null = nouveau. Un événement consulté n'est jamais supprimé. */
  seenAt: string | null
  /** Le fait n'est plus vrai après une correction : l'événement reste dans l'historique, signalé comme corrigé */
  revokedAt: string | null
  /** Créé lors de la première synchronisation (historique reconstitué) : jamais présenté comme nouveau */
  backfill: boolean
  createdAt: string
}
export type EventCandidate = Omit<RpgEvent, 'seenAt' | 'revokedAt' | 'backfill' | 'createdAt'>

export interface EventCtx {
  events: XpEvent[]
  prestiges: PrestigeRecord[]
  rewards: RewardRow[]
  achievements: AchievementRow[]
  quests: Quest[]
  goals: Goal[]
  projects: Project[]
  indicators: Indicator[]
  readings: Reading[]
  sessions: SportSession[]
  checks: RecoveryCheck[]
  sportTarget: number
  now: Date
  custom?: Exercise[]
}

// ── Paramètres (provisoires, centralisés) ─────────────────────────────
export const EVENT_CONFIG = {
  /** Série de jours d'une quête quotidienne */
  questStreaks: [7, 30, 100],
  /** Seuils d'attribut (valeur 0–100) */
  attributeMilestones: [25, 50, 75, 90],
  /** XP globale */
  xpCaps: [1000, 5000, 10000, 25000, 50000, 100000],
  /** Séances SPORT terminées */
  sessionCounts: [10, 25, 50, 100, 250],
  /** Semaines consécutives régulières (≥ 3 jours actifs) */
  regularWeeks: [4, 8, 12, 26],
  /** Interruption (jours sans aucune activité) à partir de laquelle une reprise mérite d'être notée */
  resumeGapDays: 14,
  sportReturnGapDays: 14,
  projectIdleDays: 21,
  dueSoonDays: 7,
  /** Amélioration minimale pour un record (relative) et progrès cumulés d'un exercice */
  prMinGain: 0.025,
  exerciseProgress: [0.1, 0.25, 0.5],
  enduranceGain: 0.05,
  minActiveDaysPerWeek: 3,
  levelEveryGlobal: 5,
}

const isoOfDay = (k: string) => fromDayKey(k).toISOString()
const stampOf = (e: XpEvent, byId: Map<string, XpEvent>) => { const o = e.kind === 'reversal' && e.correctsEventId ? byId.get(e.correctsEventId) : undefined; return (o ?? e).recordedAt || (o ?? e).at }
const dayOfIso = (iso: string) => dayKey(new Date(iso))

type Draft = Omit<EventCandidate, 'domain' | 'title' | 'description'> & { domain: EventDomain; title: string; description: string }
const EV = (e: Draft): EventCandidate => e

// ── A. Progression ────────────────────────────────────────────────────
export function levelTimeline(events: XpEvent[], prestiges: PrestigeRecord[], domain: Domain) {
  const byId = new Map(events.map((e) => [e.id, e]))
  const marks = prestiges.filter((p) => p.domain === domain).sort((a, b) => a.number - b.number).map((p) => p.at)
  const rows = events.filter((e) => e.domain === domain).map((e) => ({ e, own: e.recordedAt || e.at, st: stampOf(e, byId) })).sort((a, b) => a.own.localeCompare(b.own))
  const cycleXp = new Map<number, number>()
  const maxSeen = new Map<number, number>()
  const out: Array<{ cycle: number; level: number; rank: string; at: string }> = []
  for (const { e, own, st } of rows) {
    const cycle = marks.filter((m) => st > m).length + 1
    const xp = Math.max(0, (cycleXp.get(cycle) ?? 0) + e.amount)
    cycleXp.set(cycle, xp)
    const lv = domainLevel(xp, cycle).level
    const prev = maxSeen.get(cycle) ?? 1
    if (lv > prev) { for (let l = prev + 1; l <= lv; l++) out.push({ cycle, level: l, rank: domainRank(l).rank, at: own }); maxSeen.set(cycle, lv) }
    else if (!maxSeen.has(cycle)) maxSeen.set(cycle, 1)
  }
  return out
}

function progressionEvents(c: EventCtx): EventCandidate[] {
  const out: EventCandidate[] = []
  for (const domain of ['LIFE', 'SPORT'] as const) {
    // Cohérence avec les corrections : dans le cycle courant, un niveau que le journal ne justifie plus n'est plus détecté (le service le révoque)
    const curState = cycleStates(c.events, c.prestiges)[domain]
    const tl = levelTimeline(c.events, c.prestiges, domain).filter((t) => t.cycle < curState.cycle || t.level <= curState.level.level)
    for (const t of tl) {
      const rankChanged = t.level > 1 && domainRank(t.level).rank !== domainRank(t.level - 1).rank
      const prevAt = tl.find((x) => x.cycle === t.cycle && x.level === t.level - 1)?.at
      const rawDays = prevAt ? daysBetweenKeys(dayOfIso(prevAt), dayOfIso(t.at)) : 0
      const days = rawDays > 0 ? rawDays : undefined
      if (rankChanged) {
        out.push(EV({ id: `rank-up:${domain}:${t.cycle}:${t.rank}`, category: 'progression', type: 'rank-up', importance: t.rank === 'SSS' || t.rank === 'SS' ? 'exceptional' : 'major', at: t.at, domain, title: `Rang ${t.rank} atteint en ${domain}`, description: `${domain} passe au rang ${t.rank} (niveau ${t.level}${t.cycle > 1 ? `, cycle ${t.cycle}` : ''}).`, origin: 'xp-journal', route: '/rpg', data: { domain, rank: t.rank, level: t.level, cycle: t.cycle } }))
      }
      out.push(EV({ id: `level-up:${domain}:${t.cycle}:${t.level}`, category: 'progression', type: 'level-up', importance: t.level % 5 === 0 ? 'important' : 'info', at: t.at, domain, title: `${domain} niveau ${t.level}`, description: `${domain} atteint le niveau ${t.level}${days !== undefined ? ` (${days} jour${days > 1 ? 's' : ''} après le niveau précédent)` : ''}.`, origin: 'xp-journal', route: '/rpg', data: { domain, level: t.level, cycle: t.cycle, rank: t.rank, ...(days !== undefined ? { days } : {}) } }))
    }
  }
  // Niveau global (multiples de 5) et caps d'XP : parcours chronologique de tout le journal
  const sorted = [...c.events].sort((a, b) => (a.recordedAt || a.at).localeCompare(b.recordedAt || b.at))
  let total = 0, gMax = 1
  const caps = new Set<number>()
  const attrXp: Partial<Record<AttributeId, number>> = {}
  const attrDone = new Set<string>()
  for (const e of sorted) {
    const at = e.recordedAt || e.at
    total = Math.max(0, total + e.amount)
    const gl = levelFromXp(total).level
    while (gMax < gl) { gMax++; if (gMax % EVENT_CONFIG.levelEveryGlobal === 0) out.push(EV({ id: `global-level:${gMax}`, category: 'progression', type: 'global-level', importance: gMax % 10 === 0 ? 'major' : 'important', at, domain: 'RPG', title: `Niveau global ${gMax}`, description: `Le niveau global atteint ${gMax} (XP LIFE et SPORT réunies).`, origin: 'xp-journal', route: '/rpg', data: { level: gMax } })) }
    for (const cap of EVENT_CONFIG.xpCaps) if (total >= cap && !caps.has(cap)) { caps.add(cap); out.push(EV({ id: `cap-xp:${cap}`, category: 'regularity', type: 'cap-xp', importance: cap >= 50000 ? 'exceptional' : cap >= 10000 ? 'major' : cap >= 5000 ? 'important' : 'info', at, domain: 'RPG', title: `${new Intl.NumberFormat('fr-FR').format(cap)} XP au total`, description: `Cap personnel franchi : ${cap} XP cumulées (LIFE + SPORT).`, origin: 'xp-journal', route: '/rpg', data: { xp: cap } })) }
    if (e.attribute) {
      attrXp[e.attribute] = Math.max(0, (attrXp[e.attribute] ?? 0) + e.amount)
      const v = attributeValue(attrXp[e.attribute]!)
      for (const m of EVENT_CONFIG.attributeMilestones) if (v >= m && !attrDone.has(`${e.attribute}:${m}`)) {
        attrDone.add(`${e.attribute}:${m}`)
        out.push(EV({ id: `attribute:${e.attribute}:${m}`, category: 'progression', type: 'attribute-milestone', importance: m >= 75 ? 'major' : 'important', at, domain: 'RPG', title: `${ATTRIBUTE_LABELS[e.attribute]} à ${m}`, description: `L'attribut ${ATTRIBUTE_LABELS[e.attribute]} atteint ${m} sur 100.`, origin: 'xp-journal', refType: 'attribute', refId: e.attribute, route: '/rpg/attributs', data: { attribute: ATTRIBUTE_LABELS[e.attribute], value: m } }))
      }
    }
  }
  // Prestige disponible : première date où le cycle courant atteint le dernier niveau
  for (const d of ['LIFE', 'SPORT'] as const) {
    const cur = cycleStates(c.events, c.prestiges)[d]
    const maxed = levelTimeline(c.events, c.prestiges, d).filter((t) => t.level === DOMAIN_LADDER.maxLevel && (t.cycle < cur.cycle || cur.eligible))
    for (const t of maxed) out.push(EV({ id: `prestige-ready:${d}:${t.cycle}`, category: 'progression', type: 'prestige-ready', importance: 'major', at: t.at, domain: d, title: `Prestige ${d} disponible`, description: `${d} atteint le dernier niveau du rang SSS : le prestige n° ${t.cycle} est possible (facultatif).`, origin: 'xp-journal', refType: 'prestige', route: `/rpg/prestige`, data: { domain: d, number: t.cycle } }))
  }
  // Historique persistant : prestiges, récompenses, succès (réutilisent leurs tables)
  for (const p of c.prestiges) out.push(EV({ id: `prestige-done:${p.domain}:${p.number}`, category: 'progression', type: 'prestige-done', importance: 'exceptional', at: p.at, domain: p.domain, title: `Prestige ${p.domain} n° ${p.number}`, description: `Prestige ${p.domain} n° ${p.number} accompli depuis le niveau ${p.levelBefore} (rang ${p.rankBefore}).${p.rewardName ? ` Récompense : ${p.rewardName}.` : ''}`, origin: 'prestiges', refType: 'prestige', refId: p.id, route: '/rpg/prestige', data: { domain: p.domain, number: p.number, level: p.levelBefore, rank: p.rankBefore, ...(p.rewardName ? { reward: p.rewardName } : {}) } }))
  for (const r of c.rewards) { const d = REWARD_BY_ID[r.id]; if (d) out.push(EV({ id: `reward:${r.id}`, category: 'progression', type: 'reward', importance: d.rarity === 'legendary' ? 'major' : 'important', at: r.acquiredAt, domain: r.domain ?? 'RPG', title: `Récompense : ${d.name}`, description: `${REWARD_CATEGORY_LABEL[d.category]} obtenue : ${d.name}.`, origin: 'rewards', refType: 'reward', refId: r.id, route: '/rpg/recompenses', data: { reward: d.name, category: REWARD_CATEGORY_LABEL[d.category], rarity: d.rarity } })) }
  for (const a of c.achievements) { const d = ACHIEVEMENT_BY_ID[a.id]; if (d) out.push(EV({ id: `achievement:${a.id}`, category: 'progression', type: 'achievement', importance: d.rarity === 'legendary' ? 'exceptional' : d.rarity === 'epic' ? 'major' : d.rarity === 'rare' ? 'important' : 'info', at: a.unlockedAt, domain: d.domain === 'RPG' ? 'RPG' : d.domain, title: `Succès : ${d.title}`, description: d.description, origin: 'achievements', refType: 'achievement', refId: a.id, route: '/rpg/distinctions', data: { achievement: d.title, rarity: d.rarity } })) }
  return out
}

// ── B. LIFE ───────────────────────────────────────────────────────────
function lifeEvents(c: EventCtx): EventCandidate[] {
  const out: EventCandidate[] = []
  const today = dayKey(c.now)
  for (const g of c.goals) {
    if (g.status === 'achieved') out.push(EV({ id: `goal-achieved:${g.id}`, category: 'life', type: 'goal-achieved', importance: g.importance === 3 ? 'exceptional' : 'major', at: g.statusAt, domain: 'LIFE', title: `Objectif atteint : ${g.title}`, description: `L'objectif « ${g.title} » est marqué comme atteint.`, origin: 'goals', refType: 'goal', refId: g.id, route: '/life/objectifs', data: { goal: g.title } }))
    if (isOpenGoal(g) && g.status === 'active' && g.dueDate && g.dueDate >= today) { const d = daysBetweenKeys(today, g.dueDate); if (d <= EVENT_CONFIG.dueSoonDays) out.push(EV({ id: `goal-due-soon:${g.id}:${g.dueDate}`, category: 'life', type: 'goal-due-soon', importance: 'important', at: c.now.toISOString(), domain: 'LIFE', title: `Échéance proche : ${g.title}`, description: `L'objectif « ${g.title} » arrive à échéance le ${g.dueDate} (dans ${d} jour${d > 1 ? 's' : ''}).`, origin: 'goals', refType: 'goal', refId: g.id, route: '/life/objectifs', data: { goal: g.title, days: d, due: g.dueDate } })) }
  }
  for (const p of c.projects) {
    if (p.status === 'done') out.push(EV({ id: `project-done:${p.id}`, category: 'life', type: 'project-done', importance: 'major', at: p.statusAt, domain: 'LIFE', title: `Projet terminé : ${p.title}`, description: `Le projet « ${p.title} » est terminé${p.steps.length ? ` (${p.steps.filter((s) => s.done).length}/${p.steps.length} étapes validées)` : ''}.`, origin: 'projects', refType: 'project', refId: p.id, route: '/life/projets', data: { project: p.title, steps: p.steps.filter((s) => s.done).length } }))
    const done = p.steps.filter((s) => s.done && s.doneAt).sort((a, b) => a.doneAt!.localeCompare(b.doneAt!))
    if (p.steps.length >= 3) {
      const half = Math.ceil(p.steps.length / 2)
      if (done.length >= half) out.push(EV({ id: `project-half:${p.id}`, category: 'life', type: 'project-step-key', importance: 'important', at: done[half - 1].doneAt!, domain: 'LIFE', title: `Mi-parcours : ${p.title}`, description: `La moitié des étapes du projet « ${p.title} » est validée (${half}/${p.steps.length}).`, origin: 'projects', refType: 'project', refId: p.id, route: '/life/projets', data: { project: p.title, done: half, total: p.steps.length } }))
      if (done.length === p.steps.length) out.push(EV({ id: `project-steps-all:${p.id}`, category: 'life', type: 'project-step-key', importance: 'important', at: done[done.length - 1].doneAt!, domain: 'LIFE', title: `Toutes les étapes validées : ${p.title}`, description: `Les ${p.steps.length} étapes du projet « ${p.title} » sont validées.`, origin: 'projects', refType: 'project', refId: p.id, route: '/life/projets', data: { project: p.title, total: p.steps.length } }))
    }
    // Projet relancé après une longue inactivité
    if (isOpenProject(p) || p.status === 'paused') {
      const ids = new Set(c.quests.filter((q) => q.projectId === p.id).map((q) => q.id))
      const stamps = [p.createdAt, ...p.steps.flatMap((s) => [s.doneAt, ...s.subtasks.map((t) => t.doneAt)].filter(Boolean) as string[]), ...c.events.filter((e) => e.kind === 'award' && e.questId && ids.has(e.questId)).map((e) => e.recordedAt || e.at)].sort()
      for (let i = 1; i < stamps.length; i++) {
        const gap = daysBetweenKeys(dayOfIso(stamps[i - 1]), dayOfIso(stamps[i]))
        if (gap >= EVENT_CONFIG.projectIdleDays && i > 0) out.push(EV({ id: `project-resumed:${p.id}:${dayOfIso(stamps[i])}`, category: 'life', type: 'project-resumed', importance: 'info', at: stamps[i], domain: 'LIFE', title: `Projet relancé : ${p.title}`, description: `Le projet « ${p.title} » reprend après ${gap} jours sans activité.`, origin: 'projects', refType: 'project', refId: p.id, route: '/life/projets', data: { project: p.title, days: gap } }))
      }
    }
  }
  // Séries de quêtes quotidiennes
  for (const q of c.quests) if (q.type === 'daily' && !q.archived) {
    const awards = c.events.filter((e) => e.questId === q.id && e.kind === 'award' && e.status === 'valid' && e.cycleKey && /^\d{4}-\d{2}-\d{2}$/.test(e.cycleKey)).sort((a, b) => a.cycleKey.localeCompare(b.cycleKey))
    const seen = new Map<string, XpEvent>()
    for (const a of awards) if (!seen.has(a.cycleKey) && isCycleCompleted(q, c.events, a.cycleKey)) seen.set(a.cycleKey, a)
    let run = 0, prev: string | null = null
    for (const [k, a] of [...seen].sort((x, y) => x[0].localeCompare(y[0]))) {
      run = prev && daysBetweenKeys(prev, k) === 1 ? run + 1 : 1
      prev = k
      for (const n of EVENT_CONFIG.questStreaks) if (run === n) out.push(EV({ id: `quest-streak:${q.id}:${n}`, category: 'life', type: 'quest-streak', importance: n >= 100 ? 'major' : n >= 30 ? 'important' : 'info', at: a.recordedAt || a.at, domain: 'LIFE', title: `${n} jours de suite : ${q.title}`, description: `La quête quotidienne « ${q.title} » est accomplie ${n} jours consécutifs.`, origin: 'quests', refType: 'quest', refId: q.id, route: '/life', data: { quest: q.title, days: n } }))
    }
  }
  // Indicateurs : cap de 50 % et de 100 % du chemin vers la cible
  for (const ind of c.indicators) if (ind.target !== null && !ind.archived) {
    const list = readingsOf(c.readings, ind.id)
    if (list.length < 3) continue
    const first = list[0].value
    const span = ind.target - first
    if (span === 0) continue
    for (const [pct, imp] of [[50, 'info'], [100, 'important']] as const) {
      const hit = list.find((r) => (r.value - first) / span >= pct / 100)
      if (hit) out.push(EV({ id: `indicator:${ind.id}:${pct}`, category: 'life', type: 'indicator-progress', importance: imp, at: hit.recordedAt || isoOfDay(hit.at), domain: 'LIFE', title: pct === 100 ? `Cible atteinte : ${ind.name}` : `Mi-chemin : ${ind.name}`, description: `${ind.name} : ${formatValue(ind.kind, ind.unit, hit.value)} (cible ${formatValue(ind.kind, ind.unit, ind.target)}), ${pct} % du chemin parcouru depuis la première mesure.`, origin: 'indicators', refType: 'indicator', refId: ind.id, route: '/life/indicateurs', data: { indicator: ind.name, value: formatValue(ind.kind, ind.unit, hit.value), pct } }))
    }
  }
  return out
}

// ── C. SPORT ──────────────────────────────────────────────────────────
function sportEvents(c: EventCtx): EventCandidate[] {
  const out: EventCandidate[] = []
  const done = c.sessions.filter((s) => isFinished(s) && s.kind !== 'other').sort((a, b) => a.date.localeCompare(b.date) || (a.endedAt ?? a.createdAt).localeCompare(b.endedAt ?? b.createdAt))
  const exOf = (id: string) => EXERCISE_BY_ID[id] ?? c.custom?.find((x) => x.id === id)
  const best = new Map<string, number>(), first = new Map<string, number>(), exposures = new Map<string, number>(), progressDone = new Set<string>()
  let bestRunKm = 0, runs = 0
  const paces: number[] = []
  let lastEndurance = ''
  done.forEach((s, idx) => {
    const when = s.endedAt ?? isoOfDay(s.date)
    const n = idx + 1
    for (const k of EVENT_CONFIG.sessionCounts) if (n === k) out.push(EV({ id: `sport-sessions:${k}`, category: 'sport', type: 'sport-sessions', importance: k >= 250 ? 'exceptional' : k >= 50 ? 'major' : k >= 25 ? 'important' : 'info', at: when, domain: 'SPORT', title: `${k} séances terminées`, description: `${k}ᵉ séance SPORT terminée.`, origin: 'sport-sessions', refType: 'session', refId: s.id, route: '/sport/historique', data: { sessions: k } }))
    // Retour après interruption
    if (idx >= 3) { const gap = daysBetweenKeys(done[idx - 1].date, s.date); if (gap >= EVENT_CONFIG.sportReturnGapDays) out.push(EV({ id: `sport-return:${s.id}`, category: 'sport', type: 'sport-return', importance: 'info', at: when, domain: 'SPORT', title: 'Retour à l’entraînement', description: `Séance SPORT après ${gap} jours sans entraînement.`, origin: 'sport-sessions', refType: 'session', refId: s.id, route: '/sport/historique', data: { days: gap } })) }
    // Records et progrès par exercice
    const seenToday = new Set<string>()
    for (const l of s.slots.flatMap((sl) => sl.logs)) {
      const ex = exOf(l.exerciseId); const m = setMetric(l, ex)
      if (m === null || !ex || seenToday.has(l.exerciseId)) continue
      const prevBest = best.get(l.exerciseId)
      const nExp = exposures.get(l.exerciseId) ?? 0
      if (prevBest === undefined) { first.set(l.exerciseId, m); best.set(l.exerciseId, m); exposures.set(l.exerciseId, 1); seenToday.add(l.exerciseId); continue }
      if (m > prevBest) {
        if (nExp >= 2 && m >= prevBest * (1 + EVENT_CONFIG.prMinGain)) { out.push(EV({ id: `sport-pr:${l.exerciseId}:${s.id}`, category: 'sport', type: 'sport-pr', importance: 'important', at: when, domain: 'SPORT', title: `Record : ${ex.name}`, description: `Nouveau record sur « ${ex.name} » (+${Math.round((m / prevBest - 1) * 100)} % par rapport au précédent).`, origin: 'sport-sessions', refType: 'session', refId: s.id, route: '/sport/progression', data: { exercise: ex.name, gain: Math.round((m / prevBest - 1) * 100) } })) }
        best.set(l.exerciseId, m)
        const gain = m / first.get(l.exerciseId)! - 1
        for (const t of EVENT_CONFIG.exerciseProgress) if (gain >= t && !progressDone.has(`${l.exerciseId}:${t}`) && nExp >= 3) { progressDone.add(`${l.exerciseId}:${t}`); out.push(EV({ id: `sport-progress:${l.exerciseId}:${Math.round(t * 100)}`, category: 'sport', type: 'sport-progress', importance: t >= 0.5 ? 'major' : 'important', at: when, domain: 'SPORT', title: `Progression : ${ex.name}`, description: `Sur « ${ex.name} », la performance a progressé de plus de ${Math.round(t * 100)} % depuis la première séance.`, origin: 'sport-sessions', refType: 'session', refId: s.id, route: '/sport/progression', data: { exercise: ex.name, pct: Math.round(t * 100) } })) }
      }
      exposures.set(l.exerciseId, nExp + 1); seenToday.add(l.exerciseId)
    }
    // Course : distance et endurance (allure)
    if (s.kind === 'run' && s.run) {
      runs++
      if (runs >= 3 && s.run.distanceKm >= bestRunKm * 1.1 && bestRunKm > 0) out.push(EV({ id: `sport-run-distance:${s.id}`, category: 'sport', type: 'sport-pr', importance: 'important', at: when, domain: 'SPORT', title: 'Plus longue sortie', description: `Nouvelle plus longue sortie : ${s.run.distanceKm} km.`, origin: 'sport-sessions', refType: 'session', refId: s.id, route: '/sport/progression', data: { km: s.run.distanceKm } }))
      bestRunKm = Math.max(bestRunKm, s.run.distanceKm)
      if (s.run.distanceKm >= 3 && s.run.family !== 'recovery') {
        const prev = paces.slice(-3)
        if (prev.length === 3 && paces.length >= 4) { const avg = prev.reduce((a, b) => a + b, 0) / 3; if (s.run.paceSecPerKm <= avg * (1 - EVENT_CONFIG.enduranceGain) && (!lastEndurance || daysBetweenKeys(lastEndurance, s.date) >= 14)) { lastEndurance = s.date; out.push(EV({ id: `sport-endurance:${s.id}`, category: 'sport', type: 'sport-endurance', importance: 'important', at: when, domain: 'SPORT', title: 'Endurance en progrès', description: `Allure plus rapide d'au moins ${Math.round(EVENT_CONFIG.enduranceGain * 100)} % que la moyenne des trois dernières sorties (${Math.floor(s.run.paceSecPerKm / 60)}:${String(s.run.paceSecPerKm % 60).padStart(2, '0')} /km).`, origin: 'sport-sessions', refType: 'session', refId: s.id, route: '/sport/progression', data: { pace: `${Math.floor(s.run.paceSecPerKm / 60)}:${String(s.run.paceSecPerKm % 60).padStart(2, '0')}` } })) } }
        paces.push(s.run.paceSecPerKm)
      }
    }
  })
  // Régularité sportive : semaines consécutives avec l'objectif de séances atteint
  const target = Math.max(1, c.sportTarget)
  const perWeek = new Map<string, Set<string>>()
  for (const s of done) { const w = dayKey(mondayOf(fromDayKey(s.date))); perWeek.set(w, (perWeek.get(w) ?? new Set()).add(s.date)) }
  const thisWeek = dayKey(mondayOf(c.now))
  let run = 0, prevW: string | null = null
  for (const w of [...perWeek.keys()].sort()) {
    if (w >= thisWeek) break
    if ((perWeek.get(w)?.size ?? 0) >= target) {
      run = prevW && dayKey(addDays(fromDayKey(prevW), 7)) === w ? run + 1 : 1
      for (const k of EVENT_CONFIG.regularWeeks) if (run === k) out.push(EV({ id: `sport-regularity:${k}`, category: 'sport', type: 'sport-regularity', importance: k >= 26 ? 'exceptional' : k >= 8 ? 'major' : 'important', at: isoOfDay(dayKey(addDays(fromDayKey(w), 6))), domain: 'SPORT', title: `${k} semaines de régularité sportive`, description: `L'objectif de ${target} séance${target > 1 ? 's' : ''} par semaine est tenu ${k} semaines de suite.`, origin: 'sport-sessions', route: '/sport/progression', data: { weeks: k, target } }))
      prevW = w
    } else { run = 0; prevW = null }
  }
  // Récupération : retour à la normale après une vigilance ou une alerte
  const checks = [...c.checks].sort((a, b) => a.at.localeCompare(b.at))
  let lastRec = ''
  checks.forEach((k, i) => { const p = checks[i - 1]; if (p && k.safety === 'NORMAL' && p.safety !== 'NORMAL' && daysBetweenKeys(p.day, k.day) <= 10 && (!lastRec || daysBetweenKeys(lastRec, k.day) >= 7)) { lastRec = k.day; out.push(EV({ id: `recovery-improved:${k.id}`, category: 'sport', type: 'recovery-improved', importance: 'info', at: k.at, domain: 'SPORT', title: 'Récupération revenue à la normale', description: `Le questionnaire du ${k.day} indique un état normal après ${p.safety === 'ALERTE' ? 'une alerte' : 'une vigilance'} le ${p.day}.`, origin: 'recovery-checks', route: '/sport/recuperation', data: { from: p.safety, day: k.day } })) } })
  return out
}

// ── D. Régularité et évolution ────────────────────────────────────────
function regularityEvents(c: EventCtx): EventCandidate[] {
  const out: EventCandidate[] = []
  const gains = c.events.filter((e) => e.kind === 'award' && e.status === 'valid' && e.amount > 0)
  const days = [...new Set(gains.map((e) => dayOfIso(e.at)))].sort()
  const thisWeek = dayKey(mondayOf(c.now))
  const byWeek = new Map<string, Set<string>>(), domainsByWeek = new Map<string, Set<Domain>>()
  for (const e of gains) { const k = dayOfIso(e.at); const w = dayKey(mondayOf(fromDayKey(k))); byWeek.set(w, (byWeek.get(w) ?? new Set()).add(k)); domainsByWeek.set(w, (domainsByWeek.get(w) ?? new Set()).add(e.domain)) }
  const sweep = (ok: (w: string) => boolean, thresholds: number[], mk: (n: number, endDay: string) => EventCandidate) => {
    let run = 0, prev: string | null = null
    for (const w of [...byWeek.keys()].sort()) {
      if (w >= thisWeek) break
      if (ok(w)) { run = prev && dayKey(addDays(fromDayKey(prev), 7)) === w ? run + 1 : 1; for (const n of thresholds) if (run === n) out.push(mk(n, dayKey(addDays(fromDayKey(w), 6)))); prev = w } else { run = 0; prev = null }
    }
  }
  sweep((w) => (byWeek.get(w)?.size ?? 0) >= EVENT_CONFIG.minActiveDaysPerWeek, EVENT_CONFIG.regularWeeks, (n, end) => EV({ id: `regular-weeks:${n}`, category: 'regularity', type: 'regular-weeks', importance: n >= 26 ? 'exceptional' : n >= 8 ? 'major' : 'important', at: isoOfDay(end), domain: 'RPG', title: `${n} semaines de régularité`, description: `${n} semaines de suite avec au moins ${EVENT_CONFIG.minActiveDaysPerWeek} jours d'activité : un rythme durable, sans course au volume.`, origin: 'xp-journal', route: '/rpg/analyse', data: { weeks: n } }))
  sweep((w) => (domainsByWeek.get(w)?.size ?? 0) >= 2, [4, 12], (n, end) => EV({ id: `balance:${n}`, category: 'regularity', type: 'balance', importance: 'important', at: isoOfDay(end), domain: 'MIXED', title: 'LIFE et SPORT en équilibre', description: `${n} semaines de suite avec de l'activité dans LIFE et dans SPORT.`, origin: 'xp-journal', route: '/rpg/analyse', data: { weeks: n } }))
  // Reprise après une longue période sans activité (≥ 14 jours), après un historique d'au moins 5 jours actifs
  days.forEach((d, i) => { if (i >= 5) { const gap = daysBetweenKeys(days[i - 1], d); if (gap > EVENT_CONFIG.resumeGapDays) out.push(EV({ id: `resume:${d}`, category: 'regularity', type: 'resume', importance: 'important', at: isoOfDay(d), domain: 'RPG', title: 'Reprise après une pause', description: `L'activité reprend après ${gap - 1} jours de pause. Une pause fait partie du rythme.`, origin: 'xp-journal', route: '/rpg/analyse', data: { days: gap - 1 } })) } })
  return out
}

/** Tous les événements actuellement vrais (sans doublon d'identifiant, ordre chronologique). */
export function detectEvents(c: EventCtx): EventCandidate[] {
  const all = [...progressionEvents(c), ...lifeEvents(c), ...sportEvents(c), ...regularityEvents(c)]
  const byId = new Map<string, EventCandidate>()
  for (const e of all) if (!byId.has(e.id)) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

// ── Filtres du journal ────────────────────────────────────────────────
export type JournalFilter = 'all' | 'LIFE' | 'SPORT' | 'rpg' | 'rewards' | 'important'
export const JOURNAL_FILTERS: Array<[JournalFilter, string]> = [['all', 'Tout'], ['LIFE', 'LIFE'], ['SPORT', 'SPORT'], ['rpg', 'Progression RPG'], ['rewards', 'Succès et récompenses'], ['important', 'Importants']]
export function matchesFilter(e: Pick<RpgEvent, 'domain' | 'category' | 'type' | 'importance'>, f: JournalFilter): boolean {
  switch (f) {
    case 'all': return true
    case 'LIFE': return e.domain === 'LIFE' || e.category === 'life'
    case 'SPORT': return e.domain === 'SPORT' || e.category === 'sport'
    case 'rpg': return e.category === 'progression' && e.type !== 'achievement' && e.type !== 'reward'
    case 'rewards': return e.type === 'achievement' || e.type === 'reward'
    case 'important': return IMPORTANCE_RANK[e.importance] >= IMPORTANCE_RANK.important
  }
}
