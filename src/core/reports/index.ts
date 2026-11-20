import { ATTRIBUTE_LABELS } from '../attributes'
import { addDays, dayKey, daysBetweenKeys, fromDayKey, mondayOf, weekKey } from '../dates'
import type { XpEvent } from '../ledger'
import { totalXp, xpByAttribute, xpByDomain } from '../ledger'
import type { MissedAnalysis, MissedCause } from '../missed'
import { causeStats } from '../missed'
import type { Commitment, PlanMove } from '../planning'
import { postponements } from '../planning'
import type { Category, Quest } from '../quest'
import { cycleKeyFor, isRecurring } from '../quest'
import { isCycleCompleted } from '../questState'
import { levelFromXp } from '../xp'
import type { RecoveryState } from '../sport/recovery'
import type { RecoveryCheck, SportSession } from '../sport/session'
import { muscleSplit, periodReview, personalRecords, regularity, volume } from '../sport/stats'
import { MUSCLE_LABEL, type MuscleGroup } from '../sport/types'
import { isFinished } from '../sport/xp'
import type { AttributeId } from '../types'
import { analyseLife, goalProgress, GOAL_STATUS_LABEL, formatValue, isOpenGoal, isOpenProject, projectProgress, readingsOf, type LifeData } from '../goals'
import type { PlanningPrefs } from '../prefs'

/**
 * Bilans quotidien, hebdomadaire et mensuel. Pur : tout est recalculé depuis le journal XP, les quêtes et les séances.
 * Le résultat (`ReportDoc`) est une structure neutre rendue à l'écran ET par l'export PDF — jamais confondue avec une sauvegarde.
 *
 * Ton : les pourcentages mesurent la PLANIFICATION (ce qui était prévu et ce qui a été fait), jamais la valeur de la personne.
 */

export type ReportKind = 'day' | 'week' | 'month'
export const REPORT_LABEL: Record<ReportKind, string> = { day: 'Bilan du jour', week: 'Bilan de la semaine', month: 'Bilan du mois' }
export const PLANNING_NOTE = 'Les pourcentages décrivent l’exécution du planning (prévu et réalisé). Ils ne mesurent ni votre valeur ni vos efforts réels : une journée adaptée à un imprévu reste une journée bien gérée.'

export interface ReportStat { label: string; value: string; hint?: string }
export interface ReportTable { head: string[]; rows: string[][] }
export interface ReportSection {
  id: string
  title: string
  /** Chiffres clés */
  stats?: ReportStat[]
  table?: ReportTable
  /** Puces ou phrases */
  lines?: string[]
  /** Section sans contenu : affichée avec ce message au lieu d'être masquée */
  empty?: string
}
export interface ReportDoc {
  kind: ReportKind
  title: string
  subtitle: string
  from: string
  to: string
  generatedAt: string
  sections: ReportSection[]
  note: string
}

export interface ReportInput {
  kind: ReportKind
  /** Jour de référence (le jour, la semaine ou le mois qui le contient) */
  anchor: Date
  now: Date
  events: XpEvent[]
  quests: Quest[]
  categories: Category[]
  sessions: SportSession[]
  checks: RecoveryCheck[]
  analyses: MissedAnalysis[]
  moves: PlanMove[]
  commitments: Commitment[]
  /** État de récupération courant (pertinent pour le bilan du jour s'il porte sur aujourd'hui) */
  recovery: RecoveryState | null
  sportTarget: number
  /** Objectifs, projets et indicateurs (facultatif) : ajoute leurs sections aux bilans */
  life?: LifeData & { prefs: PlanningPrefs }
  /** Nom d'affichage facultatif (jamais envoyé nulle part) */
  name?: string
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
export const frDate = (key: string) => { const d = fromDayKey(key); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` }
const frShort = (key: string) => { const d = fromDayKey(key); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 4)}.` }
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : '—')
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`)
const sign = (n: number) => (n > 0 ? `+${n}` : String(n))

export const CAUSE_LABEL: Record<MissedCause, string> = {
  forgot: 'Oubli', no_time: 'Manque de temps', difficulty: 'Difficulté', motivation: 'Motivation', unforeseen: 'Imprévu', rest: 'Repos nécessaire',
}

/** Bornes de la période (clés de jour incluses). */
export function periodOf(kind: ReportKind, anchor: Date): { from: string; to: string; prevFrom: string; prevTo: string } {
  if (kind === 'day') {
    const d = dayKey(anchor); const p = dayKey(addDays(anchor, -1))
    return { from: d, to: d, prevFrom: p, prevTo: p }
  }
  if (kind === 'week') {
    const mon = mondayOf(anchor)
    return { from: dayKey(mon), to: dayKey(addDays(mon, 6)), prevFrom: dayKey(addDays(mon, -7)), prevTo: dayKey(addDays(mon, -1)) }
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12)
  const pFirst = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1, 12)
  const pLast = new Date(anchor.getFullYear(), anchor.getMonth(), 0, 12)
  return { from: dayKey(first), to: dayKey(last), prevFrom: dayKey(pFirst), prevTo: dayKey(pLast) }
}

/** Décale le jour de référence d'une période. */
export function shiftAnchor(kind: ReportKind, anchor: Date, dir: -1 | 1): Date {
  if (kind === 'day') return addDays(anchor, dir)
  if (kind === 'week') return addDays(anchor, 7 * dir)
  return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1, 12)
}

const dayOf = (iso: string) => dayKey(new Date(iso))
const inP = (key: string, from: string, to: string) => key >= from && key <= to
export const daysOf = (from: string, to: string): string[] => { const n = daysBetweenKeys(from, to); return Array.from({ length: n + 1 }, (_, i) => dayKey(addDays(fromDayKey(from), i))) }

/** XP nette gagnée (corrections incluses) sur la période, par domaine. */
export function xpInPeriod(events: XpEvent[], from: string, to: string) {
  const sel = events.filter((e) => inP(dayOf(e.at), from, to))
  const dom = xpByDomain(sel)
  return { life: dom.LIFE, sport: dom.SPORT, total: totalXp(sel), events: sel }
}

/**
 * Exécution du planning LIFE : cycles attendus (quêtes récurrentes actives, quêtes datées dont l'échéance tombe dans la période)
 * et cycles accomplis. Jamais au-delà d'aujourd'hui ; une quête n'est attendue qu'à partir de sa création.
 */
export function lifeExecution(quests: Quest[], events: XpEvent[], from: string, to: string, now: Date) {
  const today = dayKey(now)
  const end = to < today ? to : today
  let planned = 0; let done = 0
  const missed: Array<{ title: string; when: string; questId: string }> = []
  const doneList: Array<{ title: string; when: string }> = []
  for (const q of quests) {
    if (q.archived) continue
    const created = dayKey(new Date(q.createdAt))
    if (q.type === 'daily') {
      for (const day of daysOf(from < created ? created : from, end)) {
        if (day > end) break
        planned++
        const ok = isCycleCompleted(q, events, day)
        if (ok) { done++; doneList.push({ title: q.title, when: day }) } else if (day < today) missed.push({ title: q.title, when: day, questId: q.id })
      }
    } else if (q.type === 'weekly') {
      const seen = new Set<string>()
      for (const day of daysOf(from, end)) {
        const wk = weekKey(fromDayKey(day))
        if (seen.has(wk)) continue
        seen.add(wk)
        const weekEnd = dayKey(addDays(mondayOf(fromDayKey(day)), 6))
        if (weekEnd < created) continue
        // La semaine en cours n'est ni réussie ni manquée : elle compte seulement si elle est accomplie
        const ok = isCycleCompleted(q, events, wk)
        const finished = weekEnd < today
        if (ok) { planned++; done++; doneList.push({ title: q.title, when: wk }) } else if (finished) { planned++; missed.push({ title: q.title, when: wk, questId: q.id }) }
      }
    } else if (q.dueDate && inP(q.dueDate, from, to) && q.dueDate <= today) {
      planned++
      const ok = isCycleCompleted(q, events, cycleKeyFor(q.type, now))
      if (ok) { done++; doneList.push({ title: q.title, when: q.dueDate }) } else if (q.dueDate < today) missed.push({ title: q.title, when: q.dueDate, questId: q.id })
    }
  }
  return { planned, done, missed, doneList }
}

/** Séances SPORT prévues dans la période (jusqu'à aujourd'hui) et réalisées. */
export function sportExecution(sessions: SportSession[], from: string, to: string, now: Date) {
  const today = dayKey(now)
  const inRange = sessions.filter((s) => inP(s.date, from, to) && s.kind !== 'other' && s.origin !== 'unplanned')
  const finished = inRange.filter(isFinished)
  const notDone = inRange.filter((s) => !isFinished(s) && s.date < today && (s.status === 'planned' || s.status === 'abandoned'))
  return { planned: finished.length + notDone.length, done: finished.length, notDone }
}

const attrDelta = (events: XpEvent[], from: string, to: string) => {
  const sel = events.filter((e) => inP(dayOf(e.at), from, to))
  const m = xpByAttribute(sel)
  return (Object.entries(m) as Array<[AttributeId, number]>).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1])
}

function tomorrowPriorities(i: ReportInput, tomorrow: string): string[] {
  const out: string[] = []
  const dated = i.quests.filter((q) => !q.archived && q.dueDate && q.dueDate <= tomorrow && !isRecurring(q.type) && !isCycleCompleted(q, i.events, cycleKeyFor(q.type, i.now)))
  for (const q of dated.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 3)) out.push(`${q.title} — échéance ${q.dueDate! < tomorrow ? 'dépassée' : 'demain'}`)
  for (const c of i.commitments.filter((c) => c.date === tomorrow).slice(0, 2)) out.push(`${c.title}${c.start ? ` à ${c.start}` : ''}${c.important ? ' (important)' : ''}`)
  const sess = i.sessions.find((s) => s.date === tomorrow && (s.status === 'planned' || s.status === 'active'))
  if (sess) out.push(`Séance de sport : ${sess.title}`)
  const dailies = i.quests.filter((q) => !q.archived && q.type === 'daily').length
  if (dailies) out.push(`${dailies} quête${dailies > 1 ? 's' : ''} du jour à reprendre`)
  return out.slice(0, 5)
}

/** Sections objectifs / projets / indicateurs. Aucune XP : ces éléments mesurent, ils ne récompensent pas. */
function lifeSections(i: ReportInput, from: string, to: string, kind: ReportKind): { sections: ReportSection[]; advice: string[] } {
  const L = i.life!
  const today = dayKey(i.now)
  const sections: ReportSection[] = []
  const stepsDone: Array<{ title: string; project: string }> = []
  for (const p of L.projects) for (const s of p.steps) if (s.done && s.doneAt && inP(dayOf(s.doneAt), from, to)) stepsDone.push({ title: s.title, project: p.title })
  const analysis = analyseLife({ ...L, quests: i.quests, events: i.events, now: i.now })
  if (kind === 'day') {
    if (stepsDone.length) sections.push({ id: 'steps', title: 'Étapes de projets validées', lines: stepsDone.map((s) => `${s.title} (${s.project})`) })
    return { sections, advice: [] }
  }
  const goals = L.goals.filter((g) => isOpenGoal(g) || g.status === 'paused' || (g.status === 'achieved' && g.statusAt && inP(dayOf(g.statusAt), from, to)))
  sections.push({
    id: 'goals', title: 'Progression des objectifs',
    table: goals.length ? { head: ['Objectif', 'Statut', 'Avancement'], rows: goals.slice(0, 8).map((g) => [g.title, GOAL_STATUS_LABEL[g.status], `${Math.round(goalProgress(g, L, i.quests, i.events, i.now).value * 100)} %`]) } : undefined,
    empty: 'Aucun objectif suivi pour l’instant.',
  })
  const projects = L.projects.filter((p) => isOpenProject(p) || p.status === 'paused')
  const blocked = projects.flatMap((p) => p.steps.filter((s) => !s.done && s.blocked).map((s) => `${p.title} — ${s.title} : ${s.blocked}`))
  sections.push({
    id: 'projects', title: 'Avancement des projets',
    table: projects.length ? { head: ['Projet', 'Étapes', 'Avancement'], rows: projects.slice(0, 8).map((p) => { const pr = projectProgress(p, i.quests, i.events, i.now); return [p.title, `${pr.doneSteps} / ${pr.totalSteps}`, `${Math.round(pr.value * 100)} %`] }) } : undefined,
    lines: [...(stepsDone.length ? [`${stepsDone.length} étape${stepsDone.length > 1 ? 's' : ''} accomplie${stepsDone.length > 1 ? 's' : ''} : ${stepsDone.slice(0, 4).map((s) => s.title).join(', ')}`] : []), ...blocked.map((b) => `Bloquée : ${b}`)],
    empty: 'Aucun projet en cours.',
  })
  const indRows: string[][] = []
  for (const ind of L.indicators.filter((x) => !x.archived)) {
    const inRange = readingsOf(L.readings, ind.id).filter((r) => inP(r.at, from, to))
    if (!inRange.length) continue
    const a = inRange[0], b = inRange[inRange.length - 1]
    indRows.push([ind.name, inRange.length > 1 ? `${formatValue(ind.kind, ind.unit, a.value)} → ${formatValue(ind.kind, ind.unit, b.value)}` : formatValue(ind.kind, ind.unit, b.value), inRange.length > 1 ? sign(Math.round((b.value - a.value) * 100) / 100) : '—'])
  }
  sections.push({ id: 'indicators', title: 'Indicateurs en évolution', table: indRows.length ? { head: ['Indicateur', 'Mesures', 'Évolution'], rows: indRows.slice(0, 8) } : undefined, empty: 'Aucune mesure saisie sur la période.' })
  // Écarts entre prévu et réalisé
  const gap: string[] = []
  for (const p of L.projects.filter((x) => x.status !== 'abandoned')) for (const s of p.steps) if (s.dueDate && inP(s.dueDate, from, to) && s.dueDate <= today) gap.push(`${s.done ? 'Prévue et faite' : 'Prévue, non faite'} : ${s.title} (${p.title}, ${s.dueDate})`)
  for (const p of L.projects) if (p.dueDate && inP(p.dueDate, from, to) && p.dueDate <= today) gap.push(`Projet « ${p.title} » prévu le ${p.dueDate} : ${p.status === 'done' ? 'terminé' : 'pas encore terminé'}`)
  for (const g of L.goals) if (g.dueDate && inP(g.dueDate, from, to) && g.dueDate <= today) gap.push(`Objectif « ${g.title} » prévu le ${g.dueDate} : ${g.status === 'achieved' ? 'atteint' : 'pas encore atteint'}`)
  sections.push({ id: 'gap', title: 'Prévu et réalisé', lines: gap, empty: 'Aucune échéance de la période à comparer.' })
  const advice = analysis.filter((f) => f.severity === 'warn').slice(0, 3).map((f) => `${f.title}. Une adaptation est proposée dans le planning, à confirmer par vous.`)
  return { sections, advice }
}

export function buildReport(i: ReportInput): ReportDoc {
  const { from, to, prevFrom, prevTo } = periodOf(i.kind, i.anchor)
  const today = dayKey(i.now)
  const xp = xpInPeriod(i.events, from, to)
  const prev = xpInPeriod(i.events, prevFrom, prevTo)
  const life = lifeExecution(i.quests, i.events, from, to, i.now)
  const sp = sportExecution(i.sessions, from, to, i.now)
  const sessionsIn = i.sessions.filter((s) => isFinished(s) && inP(s.date, from, to))
  const customless = periodReview(i.sessions, from, to)
  const vol = volume(sessionsIn)
  const catName = (id: string) => i.categories.find((c) => c.id === id)?.name ?? 'Catégorie'
  const sections: ReportSection[] = []
  const rangeLabel = i.kind === 'day' ? frDate(from) : i.kind === 'week' ? `du ${frShort(from)} au ${frShort(to)}` : `${MONTHS[fromDayKey(from).getMonth()]} ${fromDayKey(from).getFullYear()}`
  const isCurrent = today >= from && today <= to

  const xpStats: ReportStat[] = [
    { label: 'Total net', value: sign(xp.total), hint: `LIFE ${sign(xp.life)} · SPORT ${sign(xp.sport)}` },
  ]
  if (i.kind !== 'day') xpStats.push({ label: 'Période précédente', value: sign(prev.total), hint: xp.total >= prev.total ? 'Même rythme ou mieux' : 'Rythme plus calme' })

  if (i.kind === 'day') {
    sections.push({ id: 'xp', title: 'XP gagnée', stats: xpStats })
    sections.push({
      id: 'achievements', title: 'Accomplissements',
      lines: xp.events.filter((e) => e.kind === 'award' && e.status === 'valid').map((e) => `${e.label} (+${e.amount} XP ${e.domain === 'SPORT' ? 'SPORT' : 'LIFE'})`).slice(0, 12),
      empty: 'Aucune validation enregistrée ce jour-là. Un jour de repos ou d’imprévu fait partie du rythme.',
    })
    sections.push({
      id: 'undone', title: 'Quêtes non réalisées',
      lines: life.missed.filter((m) => m.when === from).map((m) => m.title),
      empty: isCurrent ? 'Rien n’est en retard pour l’instant.' : 'Tout ce qui était prévu a été traité.',
    })
    const day = sessionsIn
    sections.push({
      id: 'sport', title: 'Activité sportive',
      lines: day.map((s) => `${s.title} — ${dur(Math.max(0, Math.round(((s.endedAt && s.startedAt ? Date.parse(s.endedAt) - Date.parse(s.startedAt) : 0) - s.pausedMs) / 60000)) || s.plannedMinutes)}`),
      empty: sp.notDone.length ? `Séance prévue non réalisée : ${sp.notDone.map((s) => s.title).join(', ')}.` : 'Pas de séance ce jour-là.',
    })
    const check = i.checks.filter((c) => c.day === from).sort((a, b) => b.at.localeCompare(a.at))[0]
    sections.push({
      id: 'recovery', title: 'État de récupération',
      lines: i.recovery && isCurrent ? [`Niveau ${i.recovery.level === 'NORMAL' ? 'normal' : i.recovery.level === 'VIGILANCE' ? 'de vigilance' : 'd’alerte'} · indice ${i.recovery.index}/100`, ...i.recovery.messages.slice(0, 2)] : check ? [`Questionnaire du jour : niveau ${check.safety === 'NORMAL' ? 'normal' : check.safety === 'VIGILANCE' ? 'de vigilance' : 'd’alerte'} · indice ${check.index}/100`] : undefined,
      empty: 'Aucun questionnaire de récupération ce jour-là.',
    })
    sections.push({ id: 'tomorrow', title: 'Priorités de demain', lines: tomorrowPriorities(i, dayKey(addDays(fromDayKey(from), 1))), empty: 'Rien d’urgent : demain reste léger.' })
  } else {
    const execLife = pct(life.done, life.planned)
    const execSport = pct(sp.done, sp.planned)
    sections.push({ id: 'xp', title: 'XP gagnée', stats: xpStats })
    sections.push({
      id: 'regularity', title: 'Régularité',
      stats: [
        { label: 'Quêtes LIFE réalisées', value: `${life.done} / ${life.planned}`, hint: `Exécution du planning : ${execLife}` },
        { label: 'Séances SPORT réalisées', value: `${sp.done} / ${sp.planned}`, hint: `Exécution du planning : ${execSport}` },
        { label: 'Jours avec activité', value: `${new Set(xp.events.filter((e) => e.amount > 0).map((e) => dayOf(e.at))).size} / ${Math.min(daysBetweenKeys(from, to < today ? to : today) + 1, daysOf(from, to).length)}` },
      ],
    })
    const byCat = new Map<string, number>()
    for (const e of xp.events) if (e.domain === 'LIFE' && e.categoryId) byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount)
    const catRows = [...byCat.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => [catName(id), sign(v)])
    sections.push({
      id: 'progress', title: 'Progression LIFE et SPORT',
      stats: [
        { label: 'LIFE', value: `niveau ${levelFromXp(xpByDomain(i.events.filter((e) => dayOf(e.at) <= to)).LIFE).level}`, hint: `${sign(xp.life)} XP sur la période` },
        { label: 'SPORT', value: `niveau ${levelFromXp(xpByDomain(i.events.filter((e) => dayOf(e.at) <= to)).SPORT).level}`, hint: `${sign(xp.sport)} XP sur la période` },
      ],
      table: catRows.length ? { head: ['Catégorie LIFE', 'XP'], rows: catRows } : undefined,
    })
    const doneQuestMin = i.quests.filter((q) => life.doneList.some((d) => d.title === q.title)).reduce((n, q) => n + q.effortMinutes * life.doneList.filter((d) => d.title === q.title).length, 0)
    const sportMin = vol.minutes
    sections.push({
      id: 'time', title: 'Répartition du temps',
      stats: [
        { label: 'LIFE (estimé)', value: dur(doneQuestMin), hint: 'Selon l’effort prévu des quêtes accomplies' },
        { label: 'SPORT', value: dur(sportMin), hint: 'Durée des séances terminées' },
      ],
    })
    const split = muscleSplit(sessionsIn)
    const top = (Object.entries(split) as Array<[MuscleGroup, number]>).sort((a, b) => b[1] - a[1])
    sections.push({
      id: 'sport', title: 'Volume sportif et équilibre musculaire',
      stats: [
        { label: 'Séances', value: String(vol.count) }, { label: 'Séries', value: String(vol.sets) },
        { label: 'Course', value: customless.km ? `${customless.km} km` : '—' },
      ],
      table: vol.sets ? { head: ['Groupe', 'Séries'], rows: top.filter(([, n]) => n > 0).map(([g, n]) => [MUSCLE_LABEL[g], String(n)]) } : undefined,
      lines: customless.neglected.length && vol.sets ? [`Peu ou pas sollicités : ${customless.neglected.slice(0, 5).map((g) => MUSCLE_LABEL[g]).join(', ')}.`] : undefined,
      empty: 'Pas de séance terminée sur la période.',
    })
    if (i.kind === 'week') {
      const ad = attrDelta(i.events, from, to)
      sections.push({
        id: 'attributes', title: 'Évolution des attributs',
        table: ad.length ? { head: ['Attribut', 'XP'], rows: ad.map(([id, v]) => [ATTRIBUTE_LABELS[id], sign(v)]) } : undefined,
        empty: 'Aucun attribut n’a bougé sur la période.',
      })
    }
  }

  if (i.kind === 'week') {
    const difficulties: string[] = []
    const causes = causeStats(i.analyses.filter((a) => inP(a.createdAt.slice(0, 10), from, to)))
    for (const [c, n] of Object.entries(causes) as Array<[MissedCause, number]>) difficulties.push(`${CAUSE_LABEL[c]} : ${n} fois`)
    const repeated = i.quests.filter((q) => postponements(i.moves, q.id, i.now, 30) >= 3)
    for (const q of repeated.slice(0, 3)) difficulties.push(`« ${q.title} » a été reportée plusieurs fois : à simplifier ou à replanifier.`)
    if (life.missed.length && !difficulties.length) difficulties.push(`${life.missed.length} élément${life.missed.length > 1 ? 's' : ''} non réalisé${life.missed.length > 1 ? 's' : ''} sans analyse enregistrée.`)
    sections.push({ id: 'difficulties', title: 'Difficultés rencontrées', lines: difficulties, empty: 'Aucune difficulté signalée sur la semaine.' })
    const reco: string[] = []
    if (sp.planned && sp.done < sp.planned) reco.push('Une séance prévue n’a pas eu lieu : replanifiez-la ou allégez la semaine prochaine.')
    if (life.planned && life.done / life.planned < 0.5) reco.push('Moins de la moitié du planning LIFE a été exécutée : réduire le nombre de quêtes quotidiennes aide souvent à retrouver du rythme.')
    if (customless.neglected.length >= 6 && vol.sets > 0) reco.push('Votre semaine sportive est concentrée sur peu de groupes musculaires : variez le prochain programme.')
    if (!reco.length) reco.push('Rythme tenable : gardez la même organisation pour la semaine prochaine.')
    sections.push({ id: 'reco', title: 'Recommandations', lines: reco })
  }

  if (i.kind === 'month') {
    const exec = pct(life.done + sp.done, life.planned + sp.planned)
    sections.push({
      id: 'general', title: 'Progression générale',
      stats: [
        { label: 'Exécution du planning', value: exec, hint: `${life.done + sp.done} réalisés sur ${life.planned + sp.planned} prévus` },
        { label: 'Niveau global', value: String(levelFromXp(totalXp(i.events.filter((e) => dayOf(e.at) <= to))).level) },
      ],
    })
    const startLevel = levelFromXp(totalXp(i.events.filter((e) => dayOf(e.at) < from)))
    const endLevel = levelFromXp(totalXp(i.events.filter((e) => dayOf(e.at) <= to)))
    sections.push({ id: 'levels', title: 'Évolution des niveaux', lines: [`Niveau global : ${startLevel.level} → ${endLevel.level}`, `LIFE : ${levelFromXp(xpByDomain(i.events.filter((e) => dayOf(e.at) < from)).LIFE).level} → ${levelFromXp(xpByDomain(i.events.filter((e) => dayOf(e.at) <= to)).LIFE).level}`, `SPORT : ${levelFromXp(xpByDomain(i.events.filter((e) => dayOf(e.at) < from)).SPORT).level} → ${levelFromXp(xpByDomain(i.events.filter((e) => dayOf(e.at) <= to)).SPORT).level}`] })
    const ad = attrDelta(i.events, from, to)
    sections.push({ id: 'attributes', title: 'Évolution des attributs', table: ad.length ? { head: ['Attribut', 'XP'], rows: ad.map(([id, v]) => [ATTRIBUTE_LABELS[id], sign(v)]) } : undefined, empty: 'Aucun attribut n’a bougé ce mois-ci.' })
    const adv = i.quests.filter((q) => !q.archived && (q.type === 'personal' || q.type === 'exceptional') && q.steps.length > 0)
    const advLines = adv.map((q) => { const n = q.steps.filter((s) => i.events.some((e) => e.stepId === s.id && e.status === 'valid' && e.kind === 'award' && inP(dayOf(e.at), from, to))).length; return n ? `${q.title} : ${n} étape${n > 1 ? 's' : ''} validée${n > 1 ? 's' : ''} ce mois-ci` : '' }).filter(Boolean)
    sections.push({ id: 'objectives', title: 'Objectifs avancés', lines: advLines, empty: 'Aucune étape d’objectif validée ce mois-ci.' })
    const trendRows: string[][] = [
      ['XP totale', sign(prev.total), sign(xp.total)],
      ['Séances SPORT', String(sportExecution(i.sessions, prevFrom, prevTo, i.now).done), String(sp.done)],
      ['Quêtes LIFE réalisées', String(lifeExecution(i.quests, i.events, prevFrom, prevTo, i.now).done), String(life.done)],
    ]
    sections.push({ id: 'trends', title: 'Tendances', table: { head: ['Indicateur', 'Mois précédent', 'Ce mois-ci'], rows: trendRows } })
    const recs = personalRecords(i.sessions).filter((r) => inP(r.date, from, to))
    sections.push({ id: 'records', title: 'Records sportifs', table: recs.length ? { head: ['Record', 'Valeur', 'Date'], rows: recs.slice(0, 8).map((r) => [r.label, r.value, frShort(r.date)]) } : undefined, empty: 'Pas de nouveau record ce mois-ci.' })
    const reg = regularity(i.sessions, i.sportTarget, i.now)
    const wins: string[] = []
    if (sp.done) wins.push(`${sp.done} séance${sp.done > 1 ? 's' : ''} terminée${sp.done > 1 ? 's' : ''}`)
    if (life.done) wins.push(`${life.done} quête${life.done > 1 ? 's' : ''} accomplie${life.done > 1 ? 's' : ''}`)
    if (reg.streakWeeks >= 2) wins.push(`${reg.streakWeeks} semaines consécutives avec l’objectif sportif atteint`)
    const causes = causeStats(i.analyses.filter((a) => inP(a.createdAt.slice(0, 10), from, to)))
    const hard = (Object.entries(causes) as Array<[MissedCause, number]>).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${CAUSE_LABEL[c]} : ${n}`)
    sections.push({ id: 'wins', title: 'Réussites', lines: wins, empty: 'Rien à signaler pour l’instant — le mois suivant repart d’une page propre.' })
    sections.push({ id: 'difficulties', title: 'Difficultés', lines: hard.length ? [`Causes d’éléments manqués : ${hard.join(' · ')}`] : [], empty: 'Aucune difficulté analysée ce mois-ci.' })
    const reco: string[] = []
    if (life.planned && life.done / life.planned < 0.6) reco.push('Allégez le nombre de quêtes récurrentes : mieux vaut peu de routines tenues que beaucoup abandonnées.')
    if (sp.planned && sp.done / sp.planned < 0.6) reco.push('Réduisez le nombre de séances visées par semaine, puis réaugmentez progressivement.')
    if (xp.total > prev.total && prev.total > 0) reco.push('La dynamique progresse : conservez ce rythme sans l’augmenter tout de suite.')
    reco.push('Fixez un objectif principal pour le mois prochain et laissez le reste en second plan.')
    sections.push({ id: 'reco', title: 'Recommandations à moyen terme', lines: reco })
  }

  if (i.life && (i.life.goals.length || i.life.projects.length || i.life.indicators.length)) {
    const ls = lifeSections(i, from, to, i.kind)
    const at = sections.findIndex((s) => s.id === 'difficulties' || s.id === 'trends')
    sections.splice(at >= 0 ? at : sections.length, 0, ...ls.sections)
    const reco = sections.find((s) => s.id === 'reco')
    if (reco && ls.advice.length) reco.lines = [...ls.advice, ...(reco.lines ?? [])]
  }
  return {
    kind: i.kind, title: REPORT_LABEL[i.kind], subtitle: rangeLabel, from, to, generatedAt: i.now.toISOString(),
    sections, note: PLANNING_NOTE,
  }
}

/** Nom de fichier du PDF : distinct de ceux des sauvegardes (`level-sauvegarde-…`). */
export const reportFileName = (r: Pick<ReportDoc, 'kind' | 'from'>) => `level-bilan-${r.kind === 'day' ? 'jour' : r.kind === 'week' ? 'semaine' : 'mois'}-${r.from}.pdf`
