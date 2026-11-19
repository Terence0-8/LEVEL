/**
 * ⚠️ DONNÉES FICTIVES — v0.1 uniquement.
 * Ce module est la SEULE source de données de démonstration. Il ne doit jamais
 * être importé par `core/` ni `data/`. Les écrans y accèdent via `useDemo()`,
 * qui peut les masquer (réglage « Données de démonstration »).
 */
import type { Activity, Attribute, Quest } from '@/core/types'

export const DEMO_BASE_XP = { life: 4120, sport: 2680 }

export const DEMO_ATTRIBUTES: Attribute[] = [
  { id: 'force', label: 'Force', value: 48 },
  { id: 'endurance', label: 'Endurance', value: 62 },
  { id: 'vitalite', label: 'Vitalité', value: 55 },
  { id: 'discipline', label: 'Discipline', value: 71 },
  { id: 'intellect', label: 'Intellect', value: 66 },
  { id: 'prosperite', label: 'Prospérité', value: 39 },
]

export const DEMO_QUESTS: Quest[] = [
  { id: 'dq-1', title: 'Planifier la semaine', domain: 'LIFE', xp: 40, attribute: 'discipline', dueInHours: 30 },
  { id: 'dq-2', title: 'Lire 20 pages', domain: 'LIFE', xp: 30, attribute: 'intellect', dueInHours: 36 },
  { id: 'dq-3', title: 'Séance Haut du corps', domain: 'SPORT', xp: 90, attribute: 'force', dueInHours: 28 },
  { id: 'dq-4', title: 'Pointer les dépenses du jour', domain: 'LIFE', xp: 25, attribute: 'prosperite', dueInHours: 40 },
  { id: 'dq-5', title: 'Étirements 10 min', domain: 'SPORT', xp: 20, attribute: 'vitalite', dueInHours: 40 },
]

const day = (offset: number, hh: number, mm = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  d.setHours(hh, mm, 0, 0)
  return d.toISOString()
}

export const DEMO_ACTIVITIES: Activity[] = [
  { id: 'a1', at: day(0, 7, 40), label: 'Course 5,2 km · 29 min', domain: 'SPORT', xp: 85 },
  { id: 'a2', at: day(0, 9, 5), label: 'Revue des priorités du jour', domain: 'LIFE', xp: 25 },
  { id: 'a3', at: day(1, 18, 30), label: 'Séance Jambes', domain: 'SPORT', xp: 120 },
  { id: 'a4', at: day(1, 21, 10), label: 'Lecture : 32 pages', domain: 'LIFE', xp: 45 },
  { id: 'a5', at: day(2, 8, 0), label: 'Budget du mois mis à jour', domain: 'LIFE', xp: 60 },
  { id: 'a6', at: day(3, 17, 45), label: 'Séance Dos & biceps', domain: 'SPORT', xp: 110 },
  { id: 'a7', at: day(3, 20, 0), label: 'Méditation 10 min', domain: 'LIFE', xp: 20 },
  { id: 'a8', at: day(4, 7, 20), label: 'Course 8 km · 47 min', domain: 'SPORT', xp: 140 },
  { id: 'a9', at: day(5, 19, 0), label: 'Objectif trimestre : jalon atteint', domain: 'LIFE', xp: 150 },
  { id: 'a10', at: day(6, 18, 0), label: 'Séance Pectoraux & triceps', domain: 'SPORT', xp: 115 },
  { id: 'a11', at: day(8, 10, 0), label: 'Rangement du bureau', domain: 'LIFE', xp: 35 },
  { id: 'a12', at: day(9, 18, 15), label: 'Séance Haut du corps', domain: 'SPORT', xp: 95 },
]

export const DEMO_LIFE_CATEGORIES = [
  { id: 'organisation', label: 'Organisation', hint: 'Tâches, agenda, priorités', icon: 'compass' as const, active: 3 },
  { id: 'habitudes', label: 'Habitudes', hint: 'Routines et séries', icon: 'flame' as const, active: 4 },
  { id: 'objectifs', label: 'Objectifs', hint: 'Jalons à moyen terme', icon: 'target' as const, active: 2 },
  { id: 'finances', label: 'Finances', hint: 'Budgets et épargne', icon: 'coin' as const, active: 1 },
  { id: 'savoir', label: 'Savoir', hint: 'Lecture, apprentissage', icon: 'book' as const, active: 2 },
  { id: 'bien-etre', label: 'Bien-être', hint: 'Sommeil, esprit, équilibre', icon: 'moon' as const, active: 1 },
]

export const DEMO_SPORT = {
  recovery: 72,
  sportPlannedToday: true,
  weekGoal: 4,
  weekDone: 3,
  weekKm: 13.2,
  weekKmGoal: 20,
  /** 0 = lundi */
  weekDays: [
    { label: 'L', state: 'done' },
    { label: 'M', state: 'rest' },
    { label: 'M', state: 'done' },
    { label: 'J', state: 'rest' },
    { label: 'V', state: 'done' },
    { label: 'S', state: 'planned' },
    { label: 'D', state: 'rest' },
  ] as const,
  sessions: [
    { id: 's1', name: 'Haut du corps', kind: 'Musculation', when: 'Aujourd\'hui · 18:30', duration: 55, focus: 'Pectoraux, dos, épaules' },
    { id: 's2', name: 'Sortie endurance', kind: 'Course', when: 'Samedi · 08:00', duration: 45, focus: '7 km allure facile' },
    { id: 's3', name: 'Jambes', kind: 'Musculation', when: 'Lundi · 18:30', duration: 60, focus: 'Quadriceps, ischios, mollets' },
  ],
  recoveryFactors: [
    { label: 'Sommeil', value: 78 },
    { label: 'Fatigue musculaire', value: 64 },
    { label: 'Charge récente', value: 70 },
  ],
}

export const DEMO_PRESTIGE = { available: false }
