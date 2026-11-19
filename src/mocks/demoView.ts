import { rankForLevel } from '@/core/rank'
import { levelFromXp } from '@/core/xp'
import type { Activity, Quest } from '@/core/types'
import { arrangeHome } from '@/core/homeLayout'
import {
  DEMO_ACTIVITIES, DEMO_ATTRIBUTES, DEMO_BASE_XP, DEMO_LIFE_CATEGORIES, DEMO_QUESTS, DEMO_SPORT,
} from './demoData'

export type DemoQuest = Quest & { done: boolean }

/** Projette les données fictives + l'état persisté en un modèle prêt pour l'UI. */
export function buildDemoView(doneQuests: Map<string, number>, now = new Date()) {
  const quests: DemoQuest[] = DEMO_QUESTS.map((q) => ({ ...q, done: doneQuests.has(q.id) }))
  const earned = (d: Quest['domain']) => quests.filter((q) => q.done && q.domain === d).reduce((n, q) => n + q.xp, 0)

  const lifeXp = DEMO_BASE_XP.life + earned('LIFE')
  const sportXp = DEMO_BASE_XP.sport + earned('SPORT')
  const global = levelFromXp(lifeXp + sportXp)

  const fromQuests: Activity[] = quests
    .filter((q) => q.done)
    .map((q) => ({ id: 'done-' + q.id, at: new Date(doneQuests.get(q.id)!).toISOString(), label: `Quête : ${q.title}`, domain: q.domain, xp: q.xp }))
  const activities = [...fromQuests, ...DEMO_ACTIVITIES].sort((a, b) => b.at.localeCompare(a.at))

  const pending = quests.filter((q) => !q.done)
  const layout = arrangeHome({
    now,
    pendingQuests: pending.length,
    nearestDeadlineHours: pending.length ? Math.min(...pending.map((q) => q.dueInHours ?? Infinity)) : null,
    sportPlannedToday: DEMO_SPORT.sportPlannedToday,
    recovery: DEMO_SPORT.recovery,
  })

  return {
    totalXp: lifeXp + sportXp,
    global,
    rank: rankForLevel(global.level),
    life: { xp: lifeXp, ...levelFromXp(lifeXp) },
    sportLevel: { xp: sportXp, ...levelFromXp(sportXp) },
    attributes: DEMO_ATTRIBUTES,
    quests,
    pendingCount: pending.length,
    activities,
    lifeCategories: DEMO_LIFE_CATEGORIES,
    sport: DEMO_SPORT,
    layout,
  }
}

export type DemoView = ReturnType<typeof buildDemoView>
