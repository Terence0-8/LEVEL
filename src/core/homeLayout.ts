/**
 * Organisation adaptative de l'accueil.
 * L'utilisateur ne réorganise pas les widgets : Level décide selon le contexte.
 * Fonction pure → testable, sans dépendance à l'UI.
 */

export type WidgetId = 'hero' | 'domains' | 'quests' | 'sport' | 'attributes' | 'activity'

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

  const p: Record<WidgetId, WidgetPlacement> = {
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
