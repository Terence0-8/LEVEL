import { addDays, dayKey, daysBetweenKeys, fromDayKey, mondayOf } from './dates'
import type { Finding } from './goals'
import { indicatorState } from './goals'
import type { XpEvent } from './ledger'
import { buildPlan, detectConflicts, usableOn, type PlanContext } from './planning'
import { lifeExecution } from './reports'
import type { Category } from './quest'
import { EXERCISE_BY_ID } from './sport/exercises'
import type { RecoveryState } from './sport/recovery'
import type { RecoveryCheck } from './sport/session'
import { muscleSplit } from './sport/stats'
import { MUSCLE_LABEL, type MuscleGroup } from './sport/types'
import { isFinished, setMetric } from './sport/xp'
import { strategicObservations, type StrategyCtx } from './strategy'

/**
 * Moteur d'analyse LOCAL : règles et statistiques simples, jamais un chatbot. Il produit des OBSERVATIONS explicables (constat, éléments
 * chiffrés, fenêtre d'analyse, fiabilité) à partir des données existantes. Principes :
 *  - proportionné aux données : sous le minimum d'échantillons une règle ne produit RIEN (pas de tendance fondée sur une action) ;
 *  - régularité ≠ quantité ; une pause ou une récupération n'est jamais un échec ;
 *  - aucune cause psychologique ou émotionnelle n'est déduite ;
 *  - aucune observation SPORT n'encourage à s'entraîner malgré une récupération insuffisante.
 */
export type Window = 'day' | 'week' | 'month' | 'long'
export const WINDOW_LABEL: Record<Window, string> = { day: 'Jour', week: 'Semaine', month: 'Mois', long: 'Tendance longue' }
export type Reliability = 'low' | 'medium' | 'high'
export const RELIABILITY_LABEL: Record<Reliability, string> = { low: 'Fiabilité faible', medium: 'Fiabilité moyenne', high: 'Fiabilité élevée' }
/** Nature du contenu : fait mesuré, estimation chiffrée, ou lecture du moteur (interprétation prudente) */
export type Nature = 'fact' | 'estimate' | 'interpretation'
export const NATURE_LABEL: Record<Nature, string> = { fact: 'Mesuré', estimate: 'Estimation', interpretation: 'Lecture du moteur' }

export interface Observation {
  /** Identifiant stable de la règle (+ objet) */
  id: string
  domain: 'LIFE' | 'SPORT' | 'RPG' | 'MIXED'
  window: Window
  nature: Nature
  tone: 'positive' | 'neutral' | 'attention'
  title: string
  detail: string
  /** Éléments chiffrés qui justifient le constat */
  evidence: string[]
  reliability: Reliability
  /** Taille de l'échantillon (semaines, séances, mesures…) */
  samples: number
  /** Signature de la situation : change quand la situation change de façon significative */
  signature: string
  route?: string
  /** Certitude : fait vérifiable, incompatibilité probable ou simple estimation (analyses de capacité et de stratégie) */
  certainty?: 'certain' | 'probable' | 'estimate'
}

export interface InsightCtx {
  plan: PlanContext
  checks: RecoveryCheck[]
  categories: Category[]
  sportTarget: number
  findings: Finding[]
  /** Pilotage (facultatif) : ajoute les observations de cohérence stratégique */
  strategy?: StrategyCtx
}

/** Minimums d'échantillons (provisoires) : en dessous, la règle se tait. */
export const INSIGHT_CONFIG = {
  weeksForTrend: 8,
  weeksForStable: 4,
  minActiveDaysPerWeek: 3,
  pauseDays: 10,
  monthDays: 28,
  minPlannedForExecution: 8,
  minReadings: 3,
  indicatorChangePct: 5,
  sportMinSessionsPerPeriod: 2,
  volumeChangePct: 20,
  loadSpikeFactor: 1.3,
  muscleMinSessions: 6,
  maxActiveProjects: 4,
  clusterDays: 5,
  clusterCount: 3,
  declinePoints: 30,
}

const rel = (n: number, medium: number, high: number): Reliability => (n >= high ? 'high' : n >= medium ? 'medium' : 'low')
const pct = (v: number) => `${Math.round(v * 100)} %`
const gains = (events: XpEvent[]) => events.filter((e) => e.kind === 'award' && e.status === 'valid' && e.amount > 0)
const dayOf = (iso: string) => dayKey(new Date(iso))

/** Série hebdomadaire d'activité (lundi → dimanche) sur les `weeks` dernières semaines COMPLÈTES, plus la semaine en cours à part. */
export function weeklyActivity(events: XpEvent[], now: Date, weeks: number) {
  const g = gains(events)
  const start = addDays(mondayOf(now), -7 * weeks)
  const out: Array<{ week: string; days: number; xp: number }> = []
  for (let i = 0; i < weeks; i++) {
    const from = dayKey(addDays(start, 7 * i)), to = dayKey(addDays(start, 7 * i + 6))
    const inW = g.filter((e) => { const d = dayOf(e.at); return d >= from && d <= to })
    out.push({ week: from, days: new Set(inW.map((e) => dayOf(e.at))).size, xp: inW.reduce((n, e) => n + e.amount, 0) })
  }
  return out
}

const firstActivityDay = (events: XpEvent[]) => gains(events).map((e) => dayOf(e.at)).sort()[0] ?? null
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0 }

// ── Régularité (transversal : jamais la quantité) ─────────────────────
function regularity(c: InsightCtx): Observation[] {
  const { events, now } = c.plan
  const out: Observation[] = []
  const first = firstActivityDay(events)
  if (!first) return out
  const today = dayKey(now)
  const history = daysBetweenKeys(first, today)
  const series = weeklyActivity(events, now, 12).filter((w) => w.week >= dayKey(mondayOf(fromDayKey(first))))
  const k = INSIGHT_CONFIG.weeksForStable
  const lastK = series.slice(-k)
  if (lastK.length === k && lastK.every((w) => w.days >= INSIGHT_CONFIG.minActiveDaysPerWeek)) {
    out.push({ id: 'regularity-stable', domain: 'RPG', window: 'long', nature: 'fact', tone: 'positive', title: `Rythme régulier depuis ${k} semaines`, detail: 'Au moins trois jours d’activité par semaine : le rythme compte plus que le volume.', evidence: lastK.map((w) => `semaine du ${w.week} : ${w.days} jours actifs`), reliability: rel(series.length, 6, 10), samples: lastK.length, signature: `stable:${k}`, route: '/rpg/journal' })
  }
  // Pause récente (jamais présentée comme un échec)
  const lastDay = gains(events).map((e) => dayOf(e.at)).sort().pop()!
  const quiet = daysBetweenKeys(lastDay, today)
  const priorActive = series.slice(-7, -1).filter((w) => w.days >= INSIGHT_CONFIG.minActiveDaysPerWeek).length
  if (quiet >= INSIGHT_CONFIG.pauseDays && priorActive >= 2) {
    out.push({ id: 'regularity-pause', domain: 'RPG', window: 'week', nature: 'fact', tone: 'neutral', title: `Pause de ${quiet} jours`, detail: 'Une pause fait partie du rythme : repos, imprévu ou simple coupure. Level ne la juge pas ; une reprise progressive reste possible quand vous le souhaitez.', evidence: [`dernière activité enregistrée le ${lastDay}`, `${priorActive} semaine${priorActive > 1 ? 's' : ''} régulière${priorActive > 1 ? 's' : ''} avant la pause`], reliability: rel(priorActive, 2, 4), samples: priorActive, signature: `pause:${lastDay}`, route: '/rpg/analyse' })
  }
  // Reprise (activité récente après un trou)
  const recent = gains(events).map((e) => dayOf(e.at)).sort()
  const uniq = [...new Set(recent)]
  const lastIdx = uniq.length - 1
  if (lastIdx >= 5 && daysBetweenKeys(uniq[lastIdx], today) <= 7) {
    const gap = daysBetweenKeys(uniq[lastIdx - 1], uniq[lastIdx])
    if (gap >= INSIGHT_CONFIG.pauseDays) out.push({ id: 'regularity-resume', domain: 'RPG', window: 'week', nature: 'fact', tone: 'positive', title: 'Reprise de l’activité', detail: `L'activité reprend après ${gap - 1} jours de pause. Reprendre à son rythme est le bon signal.`, evidence: [`dernière activité avant la pause : ${uniq[lastIdx - 1]}`, `reprise : ${uniq[lastIdx]}`], reliability: rel(uniq.length, 8, 20), samples: uniq.length, signature: `resume:${uniq[lastIdx]}`, route: '/rpg/journal' })
  }
  // Évolution de la fréquence (jours actifs / semaine), seulement avec assez de recul
  if (series.length >= INSIGHT_CONFIG.weeksForTrend && history >= 7 * INSIGHT_CONFIG.weeksForTrend) {
    const a = avg(series.slice(-4).map((w) => w.days)), b = avg(series.slice(-8, -4).map((w) => w.days))
    if (Math.abs(a - b) >= 1) out.push({ id: 'frequency-trend', domain: 'RPG', window: 'long', nature: 'estimate', tone: a > b ? 'positive' : 'neutral', title: a > b ? 'Fréquence en hausse' : 'Fréquence en baisse', detail: a > b ? 'Davantage de jours actifs par semaine récemment.' : 'Moins de jours actifs par semaine récemment : la charge, un repos ou une période chargée peuvent l’expliquer ; rien n’indique un problème en soi.', evidence: [`4 dernières semaines : ${a.toFixed(1)} jours actifs / semaine`, `4 semaines précédentes : ${b.toFixed(1)}`], reliability: rel(series.length, 8, 12), samples: series.length, signature: `freq:${a > b ? 'up' : 'down'}:${Math.round(Math.abs(a - b))}`, route: '/rpg/analyse' })
  }
  // Semaine inhabituellement riche
  const cur = weeklyActivity(events, addDays(now, 7), 1)[0]
  const prior = series.slice(-6).filter((w) => w.xp > 0).map((w) => w.xp)
  if (prior.length >= 4 && cur.xp >= 1.8 * median(prior) && cur.xp > 0) out.push({ id: 'unusual-progress', domain: 'RPG', window: 'week', nature: 'estimate', tone: 'positive', title: 'Semaine particulièrement riche', detail: 'La progression de cette semaine dépasse nettement votre rythme habituel.', evidence: [`semaine en cours : ${cur.xp} XP`, `médiane des semaines précédentes : ${Math.round(median(prior))} XP`], reliability: rel(prior.length, 4, 6), samples: prior.length, signature: `unusual:${cur.week}`, route: '/rpg/journal' })
  return out
}

// ── LIFE ──────────────────────────────────────────────────────────────
function lifeObs(c: InsightCtx): Observation[] {
  const { events, quests, now } = c.plan
  const out: Observation[] = []
  const today = dayKey(now)
  const first = firstActivityDay(events)
  const catName = (id: string) => c.categories.find((x) => x.id === id)?.name ?? 'Catégorie'
  const m = INSIGHT_CONFIG.monthDays
  if (first && daysBetweenKeys(first, today) >= 2 * m) {
    const cut1 = dayKey(addDays(now, -m)), cut2 = dayKey(addDays(now, -2 * m))
    const xp = (from: string, to: string) => { const mp = new Map<string, number>(); for (const e of gains(events)) if (e.domain === 'LIFE' && e.categoryId) { const d = dayOf(e.at); if (d >= from && d < to) mp.set(e.categoryId, (mp.get(e.categoryId) ?? 0) + e.amount) } return mp }
    const cur = xp(cut1, dayKey(addDays(now, 1))), prev = xp(cut2, cut1)
    const risen = [...cur].filter(([id, v]) => v > (prev.get(id) ?? 0) * 1.25 && v > 0 && (prev.get(id) ?? 0) > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    if (risen.length) out.push({ id: 'life-categories-up', domain: 'LIFE', window: 'month', nature: 'fact', tone: 'positive', title: 'Catégories en progression', detail: `Plus d'activité qu'au mois précédent dans : ${risen.map(([id]) => catName(id)).join(', ')}.`, evidence: risen.map(([id, v]) => `${catName(id)} : ${v} XP (mois précédent : ${prev.get(id) ?? 0})`), reliability: rel(risen.length + cur.size, 3, 6), samples: cur.size, signature: `up:${risen.map(([id]) => id).sort().join(',')}`, route: '/life' })
    const active = new Set(quests.filter((q) => !q.archived).map((q) => q.categoryId))
    const neglected = [...active].filter((id) => !cur.get(id) && (prev.get(id) ?? 0) > 0)
    if (neglected.length && cur.size >= 1) out.push({ id: 'life-categories-quiet', domain: 'LIFE', window: 'month', nature: 'fact', tone: 'neutral', title: 'Catégories laissées de côté', detail: `Aucune activité ce mois-ci dans : ${neglected.map(catName).join(', ')} (alors qu'il y en avait le mois précédent). Cela peut être un choix : Level ne suppose aucune cause.`, evidence: neglected.map((id) => `${catName(id)} : 0 XP ce mois-ci, ${prev.get(id)} XP le mois précédent`), reliability: rel(prev.size, 2, 4), samples: prev.size, signature: `quiet:${neglected.sort().join(',')}`, route: '/life' })
  }
  // Prévu / réalisé sur 28 jours
  const ex = lifeExecution(quests, events, dayKey(addDays(now, -m + 1)), today, now)
  if (ex.planned >= INSIGHT_CONFIG.minPlannedForExecution) out.push({ id: 'life-plan-vs-done', domain: 'LIFE', window: 'month', nature: 'estimate', tone: ex.done / ex.planned >= 0.7 ? 'positive' : 'neutral', title: 'Prévu et réalisé sur 28 jours', detail: 'Ce rapport mesure l’exécution du planning, pas votre valeur : un planning trop chargé donne le même chiffre qu’un manque de temps.', evidence: [`${ex.done} élément${ex.done > 1 ? 's' : ''} réalisé${ex.done > 1 ? 's' : ''} sur ${ex.planned} prévu${ex.planned > 1 ? 's' : ''} (${pct(ex.done / ex.planned)})`], reliability: rel(ex.planned, 8, 20), samples: ex.planned, signature: `exec:${Math.round((ex.done / ex.planned) * 10)}`, route: '/bilans' })
  // Projets, échéances : on réutilise les constats de LIFE V1.1
  for (const f of c.findings.filter((x) => ['project-late', 'step-blocked', 'project-due-soon', 'project-inactive', 'goal-late', 'goal-lagging'].includes(x.kind)).slice(0, 4)) {
    out.push({ id: `life-finding:${f.id}`, domain: 'LIFE', window: f.kind === 'project-due-soon' ? 'week' : 'month', nature: 'fact', tone: f.severity === 'warn' ? 'attention' : 'neutral', title: f.title, detail: f.detail, evidence: [f.detail], reliability: 'high', samples: 1, signature: f.id, route: f.refType === 'goal' ? '/life/objectifs' : '/life/projets' })
  }
  // Indicateurs : amélioration ou éloignement de la cible (au moins 3 mesures)
  for (const ind of c.plan.life?.indicators.filter((i) => !i.archived) ?? []) {
    const st = indicatorState(ind, c.plan.life!.readings)
    const list = st.list.filter((r) => daysBetweenKeys(r.at, today) <= 90)
    if (list.length < INSIGHT_CONFIG.minReadings || ind.target === null) continue
    const a = list[0].value, b = list[list.length - 1].value
    const wantUp = ind.target > a
    const gain = (b - a) / Math.max(1e-9, Math.abs(a))
    if (Math.abs(gain) * 100 < INSIGHT_CONFIG.indicatorChangePct) continue
    const better = wantUp ? b > a : b < a
    out.push({ id: `indicator-trend:${ind.id}`, domain: 'LIFE', window: 'month', nature: 'fact', tone: better ? 'positive' : 'neutral', title: better ? `${ind.name} : en amélioration` : `${ind.name} : s'éloigne de la cible`, detail: better ? 'Les mesures se rapprochent de la cible.' : 'Les dernières mesures s’éloignent de la cible. Une mesure isolée peut varier : c’est la tendance sur plusieurs mesures qui compte.', evidence: [`première mesure sur 90 jours : ${a}`, `dernière : ${b}`, `cible : ${ind.target}`, `${list.length} mesures`], reliability: rel(list.length, 5, 8), samples: list.length, signature: `ind:${ind.id}:${better ? 'up' : 'down'}`, route: '/life/indicateurs' })
  }
  return out
}

// ── SPORT ─────────────────────────────────────────────────────────────
function sportObs(c: InsightCtx, recovery: RecoveryState): Observation[] {
  const { sessions, now } = c.plan
  const out: Observation[] = []
  const done = sessions.filter(isFinished).filter((s) => s.kind !== 'other')
  if (!done.length) return out
  const monday = mondayOf(now)
  const weekStart = (i: number) => dayKey(addDays(monday, -7 * i))
  /** Séances de la semaine i (0 = semaine en cours, jusqu'à aujourd'hui ; i ≥ 1 = semaines complètes précédentes) */
  const week = (i: number) => done.filter((s) => s.date >= weekStart(i) && s.date <= (i === 0 ? dayKey(now) : dayKey(addDays(monday, -7 * (i - 1) - 1))))
  const weeks = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => week(from + k)).flat()
  const sets = (list: typeof done) => list.reduce((n, s) => n + s.slots.reduce((a, sl) => a + sl.logs.length, 0), 0)
  const last4 = weeks(1, 4), prev4 = weeks(5, 8)
  const m = INSIGHT_CONFIG.sportMinSessionsPerPeriod
  if (last4.length >= m && prev4.length >= m) {
    const a = sets(last4), b = sets(prev4)
    if (b > 0 && Math.abs(a / b - 1) * 100 >= INSIGHT_CONFIG.volumeChangePct) out.push({ id: 'sport-volume-trend', domain: 'SPORT', window: 'long', nature: 'estimate', tone: 'neutral', title: a > b ? 'Volume d’entraînement en hausse' : 'Volume d’entraînement en baisse', detail: a > b ? 'Plus de séries sur les 4 dernières semaines. Une hausse se prépare avec de la récupération.' : 'Moins de séries sur les 4 dernières semaines : repos, semaine allégée ou emploi du temps chargé, sans conclusion à en tirer.', evidence: [`4 dernières semaines : ${a} séries (${last4.length} séances)`, `4 semaines précédentes : ${b} séries (${prev4.length} séances)`], reliability: rel(last4.length + prev4.length, 6, 12), samples: last4.length + prev4.length, signature: `vol:${a > b ? 'up' : 'down'}:${Math.round(Math.abs(a / b - 1) * 5)}`, route: '/sport/progression' })
  }
  // Charge : semaine récente nettement au-dessus de la moyenne des 3 précédentes
  const wk = week(0), before = [week(1), week(2), week(3)]
  if (before.every((w) => w.length >= 1)) {
    const cur = sets(wk), base = avg(before.map(sets))
    if (base > 0 && cur >= base * INSIGHT_CONFIG.loadSpikeFactor && wk.length >= 2) out.push({ id: 'sport-load-spike', domain: 'SPORT', window: 'week', nature: 'estimate', tone: 'attention', title: 'Charge en nette hausse cette semaine', detail: recovery.level === 'NORMAL' ? 'Le volume dépasse nettement la moyenne des trois semaines précédentes. Une semaine plus légère ensuite aide à assimiler.' : 'Le volume dépasse nettement la moyenne alors que la récupération demande de la prudence : le repos prime.', evidence: [`cette semaine : ${cur} séries`, `moyenne des 3 semaines précédentes : ${Math.round(base)} séries`, `récupération : ${recovery.level === 'NORMAL' ? 'normale' : recovery.level === 'VIGILANCE' ? 'vigilance' : 'alerte'}`], reliability: rel(wk.length + 3, 4, 6), samples: wk.length + 3, signature: `spike:${weekStart(0)}`, route: '/sport/recuperation' })
  }
  // Progression des performances (≥ 4 expositions)
  const per = new Map<string, number[]>()
  for (const s of done) for (const l of s.slots.flatMap((sl) => sl.logs)) { const ex = EXERCISE_BY_ID[l.exerciseId]; const v = setMetric(l, ex); if (v !== null) per.set(l.exerciseId, [...(per.get(l.exerciseId) ?? []), v]) }
  const progressing = [...per].filter(([, v]) => v.length >= 4 && Math.max(...v.slice(-2)) >= v[0] * 1.05).map(([id, v]) => ({ id, name: EXERCISE_BY_ID[id]?.name ?? id, gain: Math.max(...v.slice(-2)) / v[0] - 1, n: v.length })).sort((a, b) => b.gain - a.gain).slice(0, 3)
  if (progressing.length) out.push({ id: 'sport-performance', domain: 'SPORT', window: 'long', nature: 'fact', tone: 'positive', title: 'Performances en progression', detail: `Progrès mesurés depuis la première séance sur : ${progressing.map((p) => p.name).join(', ')}.`, evidence: progressing.map((p) => `${p.name} : +${Math.round(p.gain * 100)} % (${p.n} séances)`), reliability: rel(Math.min(...progressing.map((p) => p.n)), 4, 8), samples: progressing.length, signature: `perf:${progressing.map((p) => p.id).sort().join(',')}`, route: '/sport/progression' })
  // Groupes musculaires (28 jours, assez de séances)
  const recent = done.filter((s) => s.date >= dayKey(addDays(now, -28)))
  if (recent.length >= INSIGHT_CONFIG.muscleMinSessions) {
    const split = muscleSplit(recent)
    const worked = (Object.entries(split) as Array<[MuscleGroup, number]>).sort((a, b) => b[1] - a[1])
    const never = worked.filter(([, v]) => v === 0).map(([g]) => MUSCLE_LABEL[g])
    out.push({ id: 'sport-muscles', domain: 'SPORT', window: 'month', nature: 'fact', tone: 'neutral', title: 'Groupes musculaires sollicités', detail: never.length ? `Peu ou pas sollicités sur 28 jours : ${never.slice(0, 5).join(', ')}.` : 'Tous les groupes ont été sollicités sur 28 jours.', evidence: worked.slice(0, 3).map(([g, v]) => `${MUSCLE_LABEL[g]} : ${v} séries pondérées`).concat(never.length ? [`${never.length} groupe${never.length > 1 ? 's' : ''} non sollicité${never.length > 1 ? 's' : ''}`] : []), reliability: rel(recent.length, 6, 12), samples: recent.length, signature: `muscles:${never.sort().join(',')}`, route: '/sport/progression' })
  }
  // Fréquence vs objectif
  if (recent.length >= 1) {
    const perWeek = recent.length / 4
    out.push({ id: 'sport-frequency', domain: 'SPORT', window: 'month', nature: 'fact', tone: 'neutral', title: 'Fréquence des séances', detail: `${perWeek.toFixed(1)} séance${perWeek >= 2 ? 's' : ''} par semaine en moyenne sur 28 jours (objectif choisi : ${c.sportTarget}).`, evidence: [`${recent.length} séances en 28 jours`], reliability: rel(recent.length, 4, 10), samples: recent.length, signature: `freq:${Math.round(perWeek)}`, route: '/sport/progression' })
  }
  // Récupération : jours de vigilance / d'alerte et repos choisis
  const checks28 = c.checks.filter((k) => k.day >= dayKey(addDays(now, -28)))
  if (checks28.length >= 5) {
    const care = checks28.filter((k) => k.safety !== 'NORMAL').length, rests = checks28.filter((k) => k.restChosen).length
    if (care >= 3 || rests >= 1) out.push({ id: 'sport-recovery-periods', domain: 'SPORT', window: 'month', nature: 'fact', tone: 'neutral', title: 'Périodes de récupération', detail: 'Se reposer quand c’est nécessaire fait partie de la progression.', evidence: [`${care} questionnaire${care > 1 ? 's' : ''} en vigilance ou alerte sur ${checks28.length}`, `${rests} repos choisi${rests > 1 ? 's' : ''}`], reliability: rel(checks28.length, 5, 14), samples: checks28.length, signature: `rec:${care}:${rests}`, route: '/sport/recuperation' })
  }
  return out
}

// ── Transversal ───────────────────────────────────────────────────────
function crossObs(c: InsightCtx): Observation[] {
  const { now, prefs, commitments } = c.plan
  const out: Observation[] = []
  const today = dayKey(now), to = dayKey(addDays(now, 6))
  const plan = buildPlan(c.plan, today, to)
  const conflicts = detectConflicts(c.plan, plan, today, to)
  const overloaded = new Set(conflicts.filter((x) => x.type === 'overload').map((x) => x.date))
  if (overloaded.size >= 2) out.push({ id: 'cross-overload', domain: 'MIXED', window: 'week', nature: 'fact', tone: 'attention', certainty: 'certain', title: 'Plusieurs journées surchargées cette semaine', detail: 'La charge prévue dépasse la capacité sur plusieurs jours : c’est une question d’organisation, pas de discipline.', evidence: [...overloaded].sort().map((d) => `${d} : au-delà de la capacité`), reliability: 'high', samples: overloaded.size, signature: `overload:${[...overloaded].sort().join(',')}`, route: '/planning' })
  // Échéances rapprochées (quêtes, projets, objectifs, engagements) sur 5 jours
  const dueDates: string[] = []
  for (const q of c.plan.quests) if (!q.archived && q.dueDate && q.type !== 'daily' && q.type !== 'weekly') dueDates.push(q.dueDate)
  for (const p of c.plan.life?.projects ?? []) if ((p.status === 'prepare' || p.status === 'active') && p.dueDate) dueDates.push(p.dueDate)
  for (const g of c.plan.life?.goals ?? []) if ((g.status === 'active' || g.status === 'todo') && g.dueDate) dueDates.push(g.dueDate)
  for (const m of commitments) dueDates.push(m.date)
  const win = dueDates.filter((d) => d >= today && daysBetweenKeys(today, d) < INSIGHT_CONFIG.clusterDays).sort()
  if (win.length >= INSIGHT_CONFIG.clusterCount) out.push({ id: 'cross-deadline-cluster', domain: 'MIXED', window: 'week', nature: 'fact', tone: 'attention', certainty: 'certain', title: 'Échéances très rapprochées', detail: `${win.length} échéances ou engagements dans les ${INSIGHT_CONFIG.clusterDays} prochains jours.`, evidence: win.map((d) => `échéance le ${d}`), reliability: 'high', samples: win.length, signature: `cluster:${win.join(',')}`, route: '/planning' })
  // Charge prévue vs capacité utilisable (7 jours)
  const usable = Array.from({ length: 7 }, (_, i) => usableOn(prefs, dayKey(addDays(now, i)))).reduce((n, v) => n + v, 0)
  const load = plan.items.reduce((n, i) => n + i.minutes, 0)
  if (usable > 0 && load > usable * 0.9) out.push({ id: 'cross-capacity', domain: 'MIXED', window: 'week', nature: 'estimate', tone: 'attention', certainty: 'estimate', title: 'Engagements proches de la capacité', detail: 'La charge prévue sur 7 jours approche, voire dépasse, la capacité recommandée (marge comprise).', evidence: [`${Math.round(load)} min prévues pour ${usable} min recommandées`], reliability: 'medium', samples: plan.items.length, signature: `cap:${Math.round((load / usable) * 10)}`, route: '/planning' })
  const active = (c.plan.life?.projects ?? []).filter((p) => p.status === 'active')
  if (active.length > INSIGHT_CONFIG.maxActiveProjects) out.push({ id: 'cross-projects', domain: 'LIFE', window: 'month', nature: 'fact', tone: 'neutral', title: `${active.length} projets en cours en même temps`, detail: 'Beaucoup de projets ouverts dispersent l’attention. En mettre un en pause ne l’abandonne pas.', evidence: active.slice(0, 5).map((p) => p.title), reliability: 'high', samples: active.length, signature: `projects:${active.length}`, route: '/life/projets' })
  // Baisse durable de réalisation (14 derniers jours vs 28 jours précédents)
  const a = lifeExecution(c.plan.quests, c.plan.events, dayKey(addDays(now, -13)), today, now)
  const b = lifeExecution(c.plan.quests, c.plan.events, dayKey(addDays(now, -41)), dayKey(addDays(now, -14)), now)
  if (a.planned >= 6 && b.planned >= 6) {
    const ra = a.done / a.planned, rb = b.done / b.planned
    if ((rb - ra) * 100 >= INSIGHT_CONFIG.declinePoints) out.push({ id: 'cross-decline', domain: 'MIXED', window: 'long', nature: 'interpretation', tone: 'neutral', title: 'Moins de quêtes réalisées qu’avant', detail: 'La réalisation du planning est plus basse depuis deux semaines. Charge de travail, repos ou planning trop ambitieux sont des pistes ; Level ne tire aucune conclusion sur vous.', evidence: [`14 derniers jours : ${a.done}/${a.planned} (${pct(ra)})`, `28 jours précédents : ${b.done}/${b.planned} (${pct(rb)})`], reliability: rel(a.planned + b.planned, 12, 30), samples: a.planned + b.planned, signature: `decline:${Math.round(ra * 10)}`, route: '/planning' })
  }
  return out
}

/** Toutes les observations actuelles, de la plus utile à la moins utile ; aucune tendance sans échantillon suffisant. */
export function analyse(c: InsightCtx, recovery: RecoveryState): Observation[] {
  const all = [...regularity(c), ...lifeObs(c), ...sportObs(c, recovery), ...crossObs(c), ...(c.strategy ? strategicObservations(c.strategy) : [])]
  const weight = { attention: 0, positive: 1, neutral: 2 } as const
  const relw = { high: 0, medium: 1, low: 2 } as const
  return all.sort((a, b) => weight[a.tone] - weight[b.tone] || relw[a.reliability] - relw[b.reliability] || a.id.localeCompare(b.id))
}
