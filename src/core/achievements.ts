import { dayKey, daysBetweenKeys, mondayOf, addDays } from './dates'
import type { Goal, Indicator, Project, Reading } from './goals'
import type { XpEvent } from './ledger'
import type { PrestigeRecord, CycleState } from './prestige'
import { REWARD_BY_ID, type Rarity, type RewardRow } from './prestigeRewards'
import { rankOn, DOMAIN_LADDER, RANK_ORDER } from './progressionConfig'
import type { RecoveryCheck, SportSession } from './sport/session'
import { isFinished } from './sport/xp'
import { levelFromXp } from './xp'
import { totalXp } from './ledger'
import type { Domain } from './types'

/**
 * Succès (distinctions). Chaque succès est une règle PURE sur des données vérifiables (journal d'XP, séances, objectifs, prestiges).
 * Une fois débloqué, il est conservé avec sa date d'obtention (table `achievements`, clé = identifiant : jamais deux fois).
 * Aucun succès ne récompense la suractivité : pas de série quotidienne infinie, pas de volume brut, pas de micro-tâches.
 * Pour en ajouter un : ajouter une entrée à `ACHIEVEMENTS`.
 */
export interface AchievementCtx {
  events: XpEvent[]
  sessions: SportSession[]
  checks: RecoveryCheck[]
  goals: Goal[]
  projects: Project[]
  indicators: Indicator[]
  readings: Reading[]
  prestiges: PrestigeRecord[]
  cycles: Record<Domain, CycleState>
  now: Date
}

export interface AchievementDef {
  id: string
  title: string
  description: string
  rarity: Rarity
  domain: Domain | 'RPG'
  /** Titre à afficher sur le profil une fois le succès obtenu */
  grantsTitle?: string
  test: (c: AchievementCtx) => boolean
}

const gains = (c: AchievementCtx, d: Domain) => c.events.filter((e) => e.domain === d && e.kind === 'award' && e.amount > 0)
/** Semaines (lundi) pendant lesquelles au moins `min` jours distincts comptent une validation : régularité modérée, jamais maximale. */
function activeWeeks(events: XpEvent[], minDays: number): string[] {
  const days = new Map<string, Set<string>>()
  for (const e of events) if (e.kind === 'award' && e.amount > 0) { const k = dayKey(new Date(e.at)); const w = dayKey(mondayOf(new Date(k + 'T12:00:00'))); days.set(w, (days.get(w) ?? new Set()).add(k)) }
  return [...days].filter(([, s]) => s.size >= minDays).map(([w]) => w).sort()
}
function consecutiveWeeks(weeks: string[]): number {
  let best = 0, run = 0, prev: string | null = null
  for (const w of weeks) { run = prev && dayKey(addDays(new Date(prev + 'T12:00:00'), 7)) === w ? run + 1 : 1; best = Math.max(best, run); prev = w }
  return best
}
const firstEventAt = (c: AchievementCtx) => c.events.filter((e) => e.kind === 'award').map((e) => e.at).sort()[0] ?? null
const finished = (c: AchievementCtx) => c.sessions.filter(isFinished)
const rankIdx = (level: number) => RANK_ORDER.indexOf(rankOn(level, DOMAIN_LADDER).rank)

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-step', title: 'Premier pas', description: 'Valider votre première quête LIFE.', rarity: 'common', domain: 'LIFE', test: (c) => gains(c, 'LIFE').length >= 1 },
  { id: 'first-session', title: 'Première séance', description: 'Terminer votre première séance SPORT récompensée.', rarity: 'common', domain: 'SPORT', test: (c) => gains(c, 'SPORT').length >= 1 },
  { id: 'life-level-5', title: 'Quotidien maîtrisé', description: 'Atteindre le niveau 5 LIFE.', rarity: 'common', domain: 'LIFE', test: (c) => c.cycles.LIFE.prestigeCount > 0 || c.cycles.LIFE.level.level >= 5 },
  { id: 'sport-level-5', title: 'Souffle gagné', description: 'Atteindre le niveau 5 SPORT.', rarity: 'common', domain: 'SPORT', test: (c) => c.cycles.SPORT.prestigeCount > 0 || c.cycles.SPORT.level.level >= 5 },
  { id: 'first-rank-up', title: 'Un cap franchi', description: 'Débloquer un rang supérieur à E dans LIFE ou SPORT.', rarity: 'rare', domain: 'RPG', test: (c) => (['LIFE', 'SPORT'] as const).some((d) => c.cycles[d].prestigeCount > 0 || rankIdx(c.cycles[d].level.level) >= 1) },
  { id: 'rank-a', title: 'Élite', description: 'Atteindre le rang A dans un domaine.', rarity: 'epic', domain: 'RPG', test: (c) => (['LIFE', 'SPORT'] as const).some((d) => c.cycles[d].prestigeCount > 0 || rankIdx(c.cycles[d].level.level) >= 4) },
  { id: 'global-level-10', title: 'Dix niveaux ensemble', description: 'Atteindre le niveau global 10.', rarity: 'rare', domain: 'RPG', test: (c) => levelFromXp(totalXp(c.events)).level >= 10 },
  { id: 'prestige-first', title: 'Renaissance', description: 'Réaliser votre premier prestige.', rarity: 'epic', domain: 'RPG', grantsTitle: 'Renaissant', test: (c) => c.prestiges.length >= 1 },
  { id: 'prestige-3', title: 'Cycles et sagesse', description: 'Réaliser trois prestiges (tous domaines confondus).', rarity: 'legendary', domain: 'RPG', test: (c) => c.prestiges.length >= 3 },
  { id: 'prestige-both', title: 'Deux voies, une volonté', description: 'Réaliser un prestige LIFE et un prestige SPORT.', rarity: 'legendary', domain: 'RPG', grantsTitle: 'Double ascension', test: (c) => c.prestiges.some((p) => p.domain === 'LIFE') && c.prestiges.some((p) => p.domain === 'SPORT') },
  { id: 'regular-4w', title: 'Rythme tenu', description: 'Quatre semaines de suite avec au moins trois jours actifs.', rarity: 'rare', domain: 'RPG', grantsTitle: 'Régulier', test: (c) => consecutiveWeeks(activeWeeks(c.events, 3)) >= 4 },
  { id: 'regular-12w', title: 'Constance', description: 'Douze semaines de suite avec au moins trois jours actifs.', rarity: 'epic', domain: 'RPG', test: (c) => consecutiveWeeks(activeWeeks(c.events, 3)) >= 12 },
  { id: 'veteran-30', title: 'Un mois à bord', description: 'Utiliser Level depuis au moins 30 jours (avec une activité enregistrée).', rarity: 'common', domain: 'RPG', test: (c) => { const f = firstEventAt(c); return !!f && daysBetweenKeys(dayKey(new Date(f)), dayKey(c.now)) >= 30 } },
  { id: 'veteran-365', title: 'Une année', description: 'Utiliser Level depuis au moins un an (avec une activité enregistrée).', rarity: 'epic', domain: 'RPG', grantsTitle: 'Vétéran de l’année', test: (c) => { const f = firstEventAt(c); return !!f && daysBetweenKeys(dayKey(new Date(f)), dayKey(c.now)) >= 365 } },
  { id: 'sessions-25', title: 'Vingt-cinq séances', description: 'Terminer 25 séances SPORT.', rarity: 'rare', domain: 'SPORT', test: (c) => finished(c).length >= 25 },
  { id: 'sessions-100', title: 'Cent séances', description: 'Terminer 100 séances SPORT.', rarity: 'epic', domain: 'SPORT', test: (c) => finished(c).length >= 100 },
  { id: 'run-10k', title: 'Dix kilomètres', description: 'Courir 10 km d’une traite.', rarity: 'rare', domain: 'SPORT', test: (c) => finished(c).some((s) => (s.run?.distanceKm ?? 0) >= 10) },
  { id: 'rest-respected', title: 'Sagesse du repos', description: 'Choisir de se reposer quand Level le recommandait.', rarity: 'rare', domain: 'SPORT', grantsTitle: 'Sage du repos', test: (c) => c.checks.some((k) => k.restChosen) },
  { id: 'goal-achieved', title: 'Ambition atteinte', description: 'Marquer un objectif LIFE comme atteint.', rarity: 'rare', domain: 'LIFE', test: (c) => c.goals.some((g) => g.status === 'achieved') },
  { id: 'goals-3', title: 'Trois ambitions', description: 'Atteindre trois objectifs LIFE.', rarity: 'epic', domain: 'LIFE', grantsTitle: 'Bâtisseur', test: (c) => c.goals.filter((g) => g.status === 'achieved').length >= 3 },
  { id: 'project-done', title: 'Projet mené à terme', description: 'Terminer un projet LIFE (au moins deux étapes validées).', rarity: 'rare', domain: 'LIFE', test: (c) => c.projects.some((p) => p.status === 'done' && p.steps.filter((s) => s.done).length >= 2) },
  { id: 'indicator-10', title: 'Mesurer pour comprendre', description: 'Saisir dix mesures sur un même indicateur.', rarity: 'common', domain: 'LIFE', test: (c) => c.indicators.some((i) => c.readings.filter((r) => r.indicatorId === i.id).length >= 10) },
]
export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]))

/** Succès dont la condition est vérifiée. */
export const evaluateAchievements = (c: AchievementCtx): string[] => ACHIEVEMENTS.filter((a) => { try { return a.test(c) } catch { return false } }).map((a) => a.id)

export interface AchievementRow { id: string; unlockedAt: string }

/** Titres que l'utilisateur peut afficher : succès obtenus + récompenses « titre ». */
export function availableTitles(unlocked: AchievementRow[], rewards: RewardRow[]): Array<{ id: string; title: string; source: string }> {
  const out: Array<{ id: string; title: string; source: string }> = []
  for (const u of unlocked) { const a = ACHIEVEMENT_BY_ID[u.id]; if (a?.grantsTitle) out.push({ id: `ach:${a.id}`, title: a.grantsTitle, source: `Succès « ${a.title} »` }) }
  for (const r of rewards) { const d = REWARD_BY_ID[r.id]; if (d?.effect.type === 'title') out.push({ id: `rw:${d.id}`, title: d.effect.title, source: 'Récompense de prestige' }) }
  return out
}
