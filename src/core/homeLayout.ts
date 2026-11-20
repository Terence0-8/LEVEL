/**
 * Organisation adaptative de l'accueil.
 * L'utilisateur ne réorganise pas les widgets : Level décide selon le contexte.
 * Fonction pure → testable, sans dépendance à l'UI.
 */

type ClassicWidgetId = 'hero' | 'domains' | 'quests' | 'sport' | 'attributes' | 'activity'
export type WidgetId = ClassicWidgetId | 'alerts' | 'recovery' | 'deadlines' | 'week'

export interface HomeContext {
  now: Date
  pendingQuests: number
  /** Échéance la plus proche parmi les quêtes en attente, en heures */
  nearestDeadlineHours: number | null
  sportPlannedToday: boolean
  /** 0 – 100 */
  recovery: number
}

export interface WidgetPlacement {
  id: WidgetId
  /** Plus haut = affiché plus tôt */
  priority: number
  /** Raison lisible, utile pour le debug et l'UI ("Pourquoi ici ?") */
  reason: string
}

export function arrangeHome(ctx: HomeContext): WidgetPlacement[] {
  const hour = ctx.now.getHours()
  const urgent = ctx.nearestDeadlineHours !== null && ctx.nearestDeadlineHours <= 24

  const p: Record<ClassicWidgetId, WidgetPlacement> = {
    hero: { id: 'hero', priority: 100, reason: 'Toujours en tête' },
    domains: { id: 'domains', priority: 50, reason: 'Vue d\'ensemble' },
    quests: { id: 'quests', priority: 60, reason: 'Quêtes du jour' },
    sport: { id: 'sport', priority: 55, reason: 'Aperçu sportif' },
    attributes: { id: 'attributes', priority: 40, reason: 'Attributs' },
    activity: { id: 'activity', priority: 30, reason: 'Activité récente' },
  }

  if (ctx.pendingQuests === 0) {
    p.quests.priority = 35
    p.quests.reason = 'Toutes les quêtes sont accomplies'
  } else if (urgent) {
    p.quests.priority = 90
    p.quests.reason = 'Échéance dans moins de 24 h'
  } else if (hour >= 17) {
    p.quests.priority = 80
    p.quests.reason = 'Fin de journée : il reste des quêtes'
  }

  if (ctx.sportPlannedToday) {
    p.sport.priority = hour < 12 ? 85 : 70
    p.sport.reason = 'Séance prévue aujourd\'hui'
  }
  if (ctx.recovery < 40) {
    p.sport.priority = Math.max(p.sport.priority, 75)
    p.sport.reason = 'Récupération basse : à surveiller'
  }

  return Object.values(p).sort((a, b) => b.priority - a.priority)
}

/**
 * Accueil GLOBAL (LIFE + SPORT + RPG). Même principe : Level classe les blocs selon les priorités du moment, sans réorganisation manuelle.
 * Les blocs sans contenu utile (aucune alerte, aucune échéance) ne sont pas affichés plutôt que de rester vides.
 */
export interface GlobalHomeContext {
  now: Date
  pendingQuests: number
  nearestDeadlineHours: number | null
  sportPlannedToday: boolean
  /** 0 – 100 */
  recovery: number
  recoveryLevel: 'NORMAL' | 'VIGILANCE' | 'ALERTE'
  hasCheckToday: boolean
  /** Alertes à signaler (une alerte critique remonte tout en haut, sous l'en-tête) */
  alerts: number
  criticalAlert: boolean
  overloadedToday: boolean
  deadlinesSoon: number
  /** Éléments d'échéances affichables */
  deadlines: number
}

export function arrangeGlobalHome(ctx: GlobalHomeContext): WidgetPlacement[] {
  const hour = ctx.now.getHours()
  const p: Partial<Record<WidgetId, WidgetPlacement>> = {
    hero: { id: 'hero', priority: 100, reason: 'Toujours en tête' },
    domains: { id: 'domains', priority: 52, reason: 'Vue d’ensemble LIFE et SPORT' },
    quests: { id: 'quests', priority: 66, reason: 'Quêtes prioritaires' },
    sport: { id: 'sport', priority: 54, reason: 'Prochaine séance' },
    week: { id: 'week', priority: 44, reason: 'Progression de la semaine' },
    attributes: { id: 'attributes', priority: 36, reason: 'Attributs' },
    activity: { id: 'activity', priority: 26, reason: 'Activité récente' },
  }
  if (ctx.alerts > 0) p.alerts = { id: 'alerts', priority: ctx.criticalAlert ? 99 : 72, reason: ctx.criticalAlert ? 'Alerte à traiter en premier' : 'Recommandations du moment' }
  if (ctx.deadlines > 0) p.deadlines = { id: 'deadlines', priority: ctx.deadlinesSoon > 0 ? 88 : 48, reason: ctx.deadlinesSoon > 0 ? 'Échéance dans moins de 48 h' : 'Échéances à venir' }
  p.recovery = { id: 'recovery', priority: 40, reason: 'État de récupération' }

  if (ctx.pendingQuests === 0) { p.quests!.priority = 34; p.quests!.reason = 'Toutes les quêtes sont accomplies' }
  else if (ctx.nearestDeadlineHours !== null && ctx.nearestDeadlineHours <= 24) { p.quests!.priority = 90; p.quests!.reason = 'Échéance dans moins de 24 h' }
  else if (hour >= 17) { p.quests!.priority = 80; p.quests!.reason = 'Fin de journée : il reste des quêtes' }
  if (ctx.overloadedToday) { p.quests!.priority = Math.max(p.quests!.priority, 82); p.quests!.reason = 'Journée chargée : priorités à clarifier' }

  if (ctx.sportPlannedToday) { p.sport!.priority = hour < 12 ? 85 : 70; p.sport!.reason = 'Séance prévue aujourd’hui' }
  if (ctx.recoveryLevel !== 'NORMAL' || ctx.recovery < 40) {
    p.recovery!.priority = ctx.recoveryLevel === 'ALERTE' ? 97 : 78
    p.recovery!.reason = ctx.recoveryLevel === 'ALERTE' ? 'Alerte de récupération' : 'Récupération à surveiller'
    p.sport!.priority = Math.max(p.sport!.priority, 75)
  } else if (ctx.sportPlannedToday && !ctx.hasCheckToday) { p.recovery!.priority = 76; p.recovery!.reason = 'Questionnaire du jour avant la séance' }
  if (hour >= 20) { p.week!.priority = 62; p.week!.reason = 'Fin de journée : où en est la semaine ?' }

  return (Object.values(p) as WidgetPlacement[]).sort((a, b) => b.priority - a.priority)
}
