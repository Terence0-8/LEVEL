import { describe, expect, it } from 'vitest'
import { cycleInfo } from './cycle'
import { EXERCISES, EXERCISE_BY_ID } from './exercises'
import { equipmentFor, generateHiit, generateStrengthSession, usablePool, suggestAlternative, type GenInput } from './generator'
import { defaultProfile, measuredLevel, operationalLevel, profileCompleteness, type SportProfile } from './profile'
import { exposuresOf, recommend } from './progression'
import { evaluateRecovery, localFatigue } from './recovery'
import { buildRun, formatPace, paceOf, suggestRun } from './running'
import type { RecoveryCheck, SessionSlot, SetLog, SportSession } from './session'
import { planWeek } from './planner'
import { personalRecords, regularity, muscleSplit, volume, sessionDebrief } from './stats'
import { MUSCLE_GROUPS, type MuscleGroup } from './types'
import { completion, desiredSportAwards, setMetric } from './xp'
import { SPORT_CONFIG } from './config'
import { dayKey } from '../dates'

const NOW = new Date(2026, 10, 19, 10, 0) // jeudi
const TODAY = dayKey(NOW)
const ago = (d: number) => dayKey(new Date(2026, 10, 19 - d))
let n = 0

const profile = (over: Partial<SportProfile> = {}): SportProfile => ({ ...defaultProfile('2026-01-01T00:00:00Z'), ...over })
const noRecovery = () => evaluateRecovery({ checks: [], sessions: [], now: NOW, today: TODAY })
const check = (over: Partial<RecoveryCheck> = {}, day = TODAY): RecoveryCheck => ({
  id: `c${++n}`, day, fatigue: 0, sleep: 3, soreness: 'none', sorenessAreas: {}, pain: 'none', painArea: null, safety: 'NORMAL', index: 100, restChosen: false, at: `${day}T08:00:00.000Z`, ...over,
})
const log = (exerciseId: string, over: Partial<SetLog> = {}, i = 1): SetLog => ({ n: i, slotId: 's', exerciseId, reps: 10, loadKg: 20, rpe: 7, technique: 3, pain: 'none', at: new Date().toISOString(), ...over })
const slot = (exerciseId: string, logs: SetLog[], sets = 3, group: MuscleGroup = 'pectoraux', range: [number, number] = [8, 12]): SessionSlot => ({
  id: `slot-${++n}`, group, movement: 'push', sets, status: logs.length >= sets ? 'done' : 'pending', logs,
  equipment: { exerciseId, repsMin: range[0], repsMax: range[1], restSec: 90 }, bodyweight: null,
})
const session = (over: Partial<SportSession> & { slots?: SessionSlot[] } = {}): SportSession => ({
  id: `ss${++n}`, kind: 'strength', origin: 'generated', date: TODAY, status: 'completed', title: 'Test', plannedMinutes: 45, variant: 'equipment', slots: [],
  startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: `${over.date ?? TODAY}T09:00:00.000Z`, updatedAt: '', ...over,
})
const cyc = cycleInfo(null, NOW)
const gen = (over: Partial<GenInput> & { p?: Partial<SportProfile> } = {}): ReturnType<typeof generateStrengthSession> => {
  const { p, ...rest } = over
  return generateStrengthSession({ profile: profile(p), prefs: [], custom: [], recovery: noRecovery(), sessions: [], states: [], now: NOW, cycle: cyc, ...rest })
}
const idsOf = (r: ReturnType<typeof gen>) => r.slots.flatMap((s) => [s.equipment?.exerciseId, s.bodyweight?.exerciseId].filter(Boolean) as string[])

describe('bibliothèque d’exercices', () => {
  it('couvre les 11 groupes, chacun avec des exercices ET une option sans matériel', () => {
    for (const g of MUSCLE_GROUPS) {
      const list = EXERCISES.filter((e) => e.kind === 'strength' && e.primary.includes(g))
      expect(list.length, g).toBeGreaterThanOrEqual(3)
      expect(list.some((e) => e.equipment.every((q) => q === 'furniture' || q === 'mat') && !e.hiitOnly), `${g} sans matériel`).toBe(true)
    }
  })
  it('chaque fiche est complète et cohérente', () => {
    const ids = new Set<string>()
    for (const e of EXERCISES) {
      expect(ids.has(e.id), `id en double : ${e.id}`).toBe(false); ids.add(e.id)
      expect(e.name.length).toBeGreaterThan(3)
      expect(e.primary.length + e.secondary.length, e.id).toBeGreaterThan(0)
      expect(e.instructions.length, e.id).toBeGreaterThanOrEqual(3)
      expect(e.safety.length, e.id).toBeGreaterThanOrEqual(1)
      expect(e.progression.length, e.id).toBeGreaterThan(10)
      expect(e.alternatives.length, e.id).toBeGreaterThanOrEqual(1)
      for (const a of e.alternatives) expect(EXERCISE_BY_ID[a], `${e.id} → alternative inconnue ${a}`).toBeDefined()
      expect(e.alternatives).not.toContain(e.id)
    }
  })
  it('classe les mouvements par famille biomécanique (7 familles utilisées)', () => {
    const fams = new Set(EXERCISES.map((e) => e.movement))
    for (const m of ['push', 'pull', 'flexion', 'extension', 'hinge', 'rotation', 'stabilisation']) expect(fams.has(m as never), m).toBe(true)
  })
  it('les pompes classiques sont réservées au HIIT', () => {
    const classic = EXERCISES.filter((e) => e.classicPushup)
    expect(classic.map((e) => e.id)).toEqual(['pompes_classiques'])
    expect(classic[0].hiitOnly).toBe(true)
    for (const prof of ['none', 'home', 'gym'] as const) {
      const pool = usablePool({ profile: profile({ equipmentProfile: prof }), prefs: [], custom: [], recovery: noRecovery(), now: NOW }, prof === 'gym' ? 'equipment' : 'bodyweight')
      expect(pool.some((e) => e.id === 'pompes_classiques')).toBe(false)
    }
  })
  it('place exercices sans matériel et avec matériel dans les bons profils', () => {
    expect(equipmentFor(profile({ equipmentProfile: 'none' }), 'equipment')).toEqual([])
    expect(equipmentFor(profile({ equipmentProfile: 'home', homeEquipment: ['bands'] }), 'equipment')).toEqual(expect.arrayContaining(['bands', 'furniture', 'mat']))
    expect(equipmentFor(profile({ equipmentProfile: 'gym' }), 'equipment')).toContain('barbell')
    expect(equipmentFor(profile({ equipmentProfile: 'gym' }), 'bodyweight')).toEqual(['furniture', 'mat'])
  })
})

describe('niveaux déclaré / mesuré / opérationnel', () => {
  it('profil vide : rien n’est bloquant, niveau opérationnel prudent', () => {
    const p = defaultProfile()
    expect(p.equipmentProfile).toBe('none')
    expect(profileCompleteness(p)).toBeLessThan(1)
    expect(operationalLevel(null, null)).toBe('beginner')
    expect(operationalLevel('advanced', null)).toBe('intermediate')
    expect(operationalLevel('intermediate', null)).toBe('intermediate')
  })
  it('mesure indisponible avant 6 séances ; opérationnel limité à un cran au-dessus du déclaré', () => {
    const few = Array.from({ length: 5 }, (_, i) => session({ date: ago(i * 3) }))
    expect(measuredLevel(few, 0, NOW)).toBeNull()
    const many = Array.from({ length: 45 }, (_, i) => session({ date: ago(i) }))
    expect(measuredLevel(many, 6, NOW)).toBe('advanced')
    expect(operationalLevel('beginner', 'advanced')).toBe('intermediate')
    expect(operationalLevel('advanced', 'beginner')).toBe('beginner')
  })
})

describe('générateur de séances adaptatif', () => {
  it('sans matériel : une seule variante ; avec matériel : deux variantes cohérentes (mêmes groupes et mouvements)', () => {
    const none = gen({ p: { equipmentProfile: 'none' } })
    expect(none.hasEquipmentVariant).toBe(false)
    expect(none.slots.every((s) => s.equipment === null && s.bodyweight)).toBe(true)
    const gym = gen({ p: { equipmentProfile: 'gym', experience: 'intermediate' } })
    expect(gym.hasEquipmentVariant).toBe(true)
    expect(gym.slots.length).toBeGreaterThan(0)
    for (const s of gym.slots) {
      expect(s.equipment).not.toBeNull()
      if (s.bodyweight) {
        const a = EXERCISE_BY_ID[s.equipment!.exerciseId], b = EXERCISE_BY_ID[s.bodyweight.exerciseId]
        expect(b.primary.includes(s.group) && a.primary.includes(s.group)).toBe(true)
        expect(b.equipment.every((q) => q === 'furniture' || q === 'mat')).toBe(true)
        expect(a.id).not.toBe(b.id) // exercices distincts : jamais de conversion de performances
      }
    }
  })
  it('ne propose jamais de pompes classiques dans une séance ordinaire', () => {
    for (const prof of ['none', 'home', 'gym'] as const)
      expect(idsOf(gen({ p: { equipmentProfile: prof, experience: 'advanced', musclePriorities: { pectoraux: 'develop' } }, focus: ['pectoraux'] }))).not.toContain('pompes_classiques')
  })
  it('respecte exclusions, évitements temporaires, contraintes physiques et favoris', () => {
    const base = { equipmentProfile: 'gym' as const, experience: 'intermediate' as const }
    const first = idsOf(gen({ p: base, focus: ['pectoraux'] }))
    const excluded = idsOf(gen({ p: base, focus: ['pectoraux'], prefs: first.map((e) => ({ exerciseId: e, status: 'excluded' as const })) }))
    for (const e of first) expect(excluded).not.toContain(e)
    const until = idsOf(gen({ p: base, focus: ['pectoraux'], prefs: [{ exerciseId: first[0], status: 'avoid_temp', until: '2026-11-25' }] }))
    expect(until).not.toContain(first[0])
    const expired = idsOf(gen({ p: base, focus: ['pectoraux'], prefs: [{ exerciseId: first[0], status: 'avoid_temp', until: '2026-11-01' }] }))
    expect(expired).toContain(first[0])
    const shoulder = gen({ p: { ...base, constraints: [{ id: 'c', area: 'shoulder', note: '', since: '' }] }, focus: ['pectoraux', 'epaules'] })
    for (const e of idsOf(shoulder)) expect(EXERCISE_BY_ID[e].stress).not.toContain('shoulder')
    const fav = idsOf(gen({ p: base, focus: ['dos'], prefs: [{ exerciseId: 'rowing_barre', status: 'favorite' }] }))
    expect(fav).toContain('rowing_barre')
  })
  it('s’adapte aux priorités, à la récupération et à l’historique (pas de split fixe)', () => {
    const p = { equipmentProfile: 'gym' as const, experience: 'intermediate' as const, musclePriorities: { dos: 'develop' as const, pectoraux: 'maintain' as const } }
    const a = gen({ p })
    expect(a.focus).toContain('dos')
    const trained = session({ date: ago(1), endedAt: `${ago(1)}T18:00:00.000Z`, slots: [slot('tirage_vertical', [log('tirage_vertical'), log('tirage_vertical', {}, 2), log('tirage_vertical', {}, 3)], 3, 'dos')] })
    const b = gen({ p, sessions: [trained], recovery: evaluateRecovery({ checks: [], sessions: [trained], now: NOW, today: TODAY }) })
    expect(b.focus[0]).not.toBe('dos') // le dos vient d'être travaillé : il se repose
  })
  it('exclut un groupe bloqué par une douleur et n’en sollicite aucun si tout est bloqué', () => {
    const rec = evaluateRecovery({ checks: [check({ pain: 'strong', painArea: 'epaules' })], sessions: [], now: NOW, today: TODAY })
    const r = gen({ p: { equipmentProfile: 'gym', experience: 'intermediate' }, recovery: rec })
    expect(r.focus).not.toContain('epaules')
    for (const e of idsOf(r)) expect([...EXERCISE_BY_ID[e].primary, ...EXERCISE_BY_ID[e].secondary]).not.toContain('epaules')
    const all = evaluateRecovery({ checks: [check({ pain: 'strong', painArea: null })], sessions: [], now: NOW, today: TODAY })
    expect(gen({ recovery: all }).slots).toHaveLength(0)
  })
  it('réduit le volume en vigilance et en semaine d’allègement', () => {
    const p = { equipmentProfile: 'gym' as const, experience: 'intermediate' as const, sessionMinutes: 60 }
    const normal = gen({ p })
    const vig = gen({ p, recovery: evaluateRecovery({ checks: [check({ fatigue: 2 })], sessions: [], now: NOW, today: TODAY }) })
    const deload = gen({ p, cycle: { ...cyc, phase: 'deload', volumeFactor: 0.6, loadFactor: 0.9, allowIncrease: false } })
    const sets = (r: ReturnType<typeof gen>) => r.slots.reduce((a, s) => a + s.sets, 0)
    expect(sets(vig)).toBeLessThan(sets(normal))
    expect(sets(deload)).toBeLessThan(sets(normal))
  })
  it('première exposition : test prudent non maximal', () => {
    const r = gen({ p: { equipmentProfile: 'gym', experience: 'intermediate' }, focus: ['pectoraux'] })
    const notes = r.slots.flatMap((s) => [s.equipment?.note, s.bodyweight?.note]).filter(Boolean).join(' ')
    expect(notes).toMatch(/Première exposition/)
  })
  it('circuit HIIT : pompes classiques seulement si autorisées', () => {
    const off = generateHiit(profile(), noRecovery())
    expect(off.slots.some((s) => s.bodyweight?.exerciseId === 'pompes_classiques')).toBe(false)
    const on = generateHiit(profile({ allowPushupsInHiit: true }), noRecovery())
    expect(on.slots.some((s) => s.bodyweight?.exerciseId === 'pompes_classiques')).toBe(true)
  })
  it('propose une alternative sans jamais la substituer d’office', () => {
    const alt = suggestAlternative('developpe_couche_barre', { profile: profile({ equipmentProfile: 'gym' }), prefs: [{ exerciseId: 'developpe_couche_halteres', status: 'excluded' }], custom: [], recovery: noRecovery(), now: NOW }, 'equipment')
    expect(alt).not.toBeNull()
    expect(alt!.id).not.toBe('developpe_couche_barre')
    expect(alt!.id).not.toBe('developpe_couche_halteres')
  })
})

describe('récupération et sécurité (estimation non médicale)', () => {
  const rec = (c: Partial<RecoveryCheck>, extra: RecoveryCheck[] = []) => evaluateRecovery({ checks: [check(c), ...extra], sessions: [], now: NOW, today: TODAY })
  it('NORMAL / VIGILANCE / ALERTE selon le questionnaire', () => {
    expect(rec({}).level).toBe('NORMAL')
    expect(rec({ fatigue: 2 }).level).toBe('VIGILANCE')
    expect(rec({ pain: 'light' }).level).toBe('VIGILANCE')
    expect(rec({ soreness: 'high' }).level).toBe('VIGILANCE')
    expect(rec({ pain: 'strong', painArea: 'dos' }).level).toBe('ALERTE')
    expect(rec({ fatigue: 3, sleep: 0 }).level).toBe('ALERTE')
  })
  it('l’indice reste borné et se dégrade avec les réponses ; toujours accompagné d’un avertissement non médical', () => {
    const good = rec({}), bad = rec({ fatigue: 3, sleep: 0, soreness: 'high', pain: 'strong', painArea: 'dos' })
    expect(good.index).toBeGreaterThan(bad.index)
    expect(bad.index).toBeGreaterThanOrEqual(0)
    expect(good.index).toBeLessThanOrEqual(100)
    expect(good.disclaimer).toMatch(/non médicale/)
  })
  it('douleur forte : bloque la zone concernée (muscle ou articulation) jusqu’à réévaluation', () => {
    const m = rec({ pain: 'strong', painArea: 'epaules' })
    expect(m.blocked[0]).toMatchObject({ muscle: 'epaules' })
    const a = rec({ pain: 'strong', painArea: 'knee' })
    expect(a.blocked[0]).toMatchObject({ area: 'knee' })
    expect(rec({ pain: 'strong' }).blocked[0].all).toBe(true)
    const re = evaluateRecovery({ checks: [check({ pain: 'strong', painArea: 'epaules', at: `${TODAY}T08:00:00.000Z` }), check({ pain: 'none', at: `${TODAY}T18:00:00.000Z` })], sessions: [], now: NOW, today: TODAY })
    expect(re.blocked).toHaveLength(0) // réévaluation le même jour : le blocage est levé
    expect(re.level).toBe('NORMAL')
  })
  it('douleur légère répétée 3 jours de suite dans la même zone → alerte', () => {
    const prev = [check({ pain: 'light', painArea: 'knee' }, ago(1)), check({ pain: 'light', painArea: 'knee' }, ago(2))]
    expect(rec({ pain: 'light', painArea: 'knee' }, prev).level).toBe('ALERTE')
    expect(rec({ pain: 'light', painArea: 'knee' }, [prev[0]]).level).toBe('VIGILANCE')
    expect(rec({ pain: 'light', painArea: 'knee' }, [check({ pain: 'light', painArea: 'dos' }, ago(1)), prev[1]]).level).toBe('VIGILANCE')
  })
  it('distingue fatigue générale et fatigue locale, avec décroissance dans le temps', () => {
    const s = (d: number) => session({ date: ago(d), endedAt: new Date(NOW.getTime() - d * 86_400_000).toISOString(), slots: [slot('developpe_couche_halteres', [1, 2, 3, 4, 5, 6].map((i) => log('developpe_couche_halteres', {}, i)), 6)] })
    const fresh = localFatigue([s(0)], NOW), old = localFatigue([s(4)], NOW)
    expect(fresh.pectoraux).toBeGreaterThan(old.pectoraux)
    expect(fresh.pectoraux).toBeGreaterThan(fresh.quadriceps)
    expect(fresh.triceps).toBeGreaterThan(0)
  })
  it('sans questionnaire : invitation à le remplir, pas de blocage', () => {
    const s = noRecovery()
    expect(s.hasCheckToday).toBe(false)
    expect(s.level).toBe('NORMAL')
    expect(s.messages.join(' ')).toMatch(/30 secondes/)
  })
})

describe('progression musculaire', () => {
  const exp = (i: number, over: Partial<SetLog> = {}, range: [number, number] = [8, 12]) =>
    session({ date: ago(20 - i * 4), slots: [slot('developpe_couche_halteres', [1, 2, 3].map((k) => log('developpe_couche_halteres', { reps: 12, loadKg: 20, rpe: 7, ...over }, k)), 3, 'pectoraux', range)] })
  const rc = (sessions: SportSession[], recovery = noRecovery(), decisions: never[] = [], c = cyc) =>
    recommend({ exerciseId: 'developpe_couche_halteres', sessions, recovery, cycle: c, decisions, now: NOW })

  it('plusieurs expositions requises avant toute augmentation', () => {
    expect(rc([exp(0)]).action).toBe('hold')
    expect(rc([exp(0), exp(1)]).reason).toMatch(/2 expositions sur 3/)
    expect(rc([exp(0), exp(1), exp(2)]).action).toBe('increase')
  })
  it('recommande une augmentation chiffrée, jamais appliquée automatiquement (aucun effet de bord)', () => {
    const r = rc([exp(0), exp(1), exp(2)])
    expect(r).toMatchObject({ action: 'increase', from: 20, to: 22, unit: 'kg', exposures: 3 })
  })
  it('pas de progression si effort trop élevé, technique insuffisante ou haut de plage non atteint', () => {
    expect(rc([exp(0, { rpe: 9 }), exp(1, { rpe: 9 }), exp(2, { rpe: 9 })]).action).not.toBe('increase')
    expect(rc([exp(0, { technique: 1 }), exp(1, { technique: 1 }), exp(2, { technique: 1 })]).action).not.toBe('increase')
    expect(rc([exp(0, { reps: 9 }), exp(1, { reps: 9 }), exp(2, { reps: 9 })]).action).toBe('hold')
  })
  it('pas d’augmentation en vigilance, hors phase de développement, ni juste après une augmentation', () => {
    const three = [exp(0), exp(1), exp(2)]
    const vig = evaluateRecovery({ checks: [check({ fatigue: 2 })], sessions: [], now: NOW, today: TODAY })
    expect(rc(three, vig).action).toBe('hold')
    expect(rc(three, noRecovery(), [], { ...cyc, phase: 'consolidation', allowIncrease: false }).action).toBe('hold')
    const recent = { id: 'd', exerciseId: 'developpe_couche_halteres', action: 'increase' as const, from: 18, to: 20, unit: 'kg' as const, reason: '', applied: true, at: new Date(NOW.getTime() - 2 * 86_400_000).toISOString() }
    const r = recommend({ exerciseId: 'developpe_couche_halteres', sessions: three, recovery: noRecovery(), cycle: cyc, decisions: [recent], now: NOW })
    expect(r.action).toBe('hold')
    expect(r.reason).toMatch(/Dernière augmentation/)
  })
  it('réduit si deux séances sous la plage ; la stagnation n’est pas un échec', () => {
    expect(rc([exp(0, { reps: 5 }), exp(1, { reps: 5 }), exp(2, { reps: 5 })]).action).toBe('decrease')
    const flat = rc([exp(0, { reps: 10 }), exp(1, { reps: 10 }), exp(2, { reps: 10 }), exp(3, { reps: 10 })])
    expect(flat.action).toBe('hold')
    expect(flat.reason).toMatch(/pas un échec/)
  })
  it('douleur : prudence prioritaire sur toute récompense ou objectif', () => {
    const r = rc([exp(0), exp(1), exp(2, { pain: 'strong' })])
    expect(r.action).toBe('recover')
    expect(r.caution).toMatch(/professionnel de santé/)
    expect(rc([exp(0), exp(1), exp(2, { pain: 'light' })]).action).toBe('decrease')
    expect(rc([exp(0), exp(1), exp(2)], evaluateRecovery({ checks: [check({ pain: 'strong', painArea: 'dos' })], sessions: [], now: NOW, today: TODAY })).action).toBe('recover')
  })
  it('cycle adaptatif : développement → consolidation → allègement → reprise', () => {
    const start = '2026-W40'
    const at = (w: number) => cycleInfo(start, new Date(2026, 8, 28 + w * 7)).phase // semaine 40 débute le 28 sept. 2026
    expect([0, 1, 2, 3, 4, 5, 6].map(at)).toEqual(['development', 'development', 'development', 'consolidation', 'deload', 'resumption', 'development'])
    expect(cycleInfo(start, new Date(2026, 9, 26)).volumeFactor).toBe(SPORT_CONFIG.cycle.deloadVolumeFactor)
  })
  it('expositions : uniquement séances terminées ou écourtées', () => {
    expect(exposuresOf('developpe_couche_halteres', [exp(0), session({ status: 'planned', slots: exp(1).slots })])).toHaveLength(1)
  })
})

describe('course à pied', () => {
  it('calcule et formate l’allure ; valide les saisies', () => {
    expect(paceOf(5, 1500)).toBe(300)
    expect(formatPace(332)).toBe('5:32 /km')
    expect(buildRun({ family: 'easy', distanceKm: 5, durationSec: 1700, rpe: 4 }).ok).toBe(true)
    expect(buildRun({ family: 'easy', distanceKm: 0, durationSec: 1700, rpe: 4 }).ok).toBe(false)
    expect(buildRun({ family: 'easy', distanceKm: 5, durationSec: 100, rpe: 4 }).ok).toBe(false) // allure impossible
    expect(buildRun({ family: 'easy', distanceKm: 5, durationSec: 1700, rpe: 11 }).ok).toBe(false)
  })
  it('une récupération trop dure est signalée, jamais comptée comme séance exigeante', () => {
    const r = buildRun({ family: 'recovery', distanceKm: 4, durationSec: 1500, rpe: 7 })
    expect(r.ok && r.warnings.join()).toMatch(/récupération doit rester facile/)
  })
  it('conserve les intervalles individuels du fractionné', () => {
    const r = buildRun({ family: 'interval', distanceKm: 6, durationSec: 2100, rpe: 8, intervals: [{ distanceKm: 0.4, durationSec: 100, restSec: 90 }, { durationSec: 0 }] })
    expect(r.ok && r.run.intervals).toHaveLength(1)
  })
  const runS = (d: number, family: 'easy' | 'long' | 'recovery' | 'tempo', km = 5, min = 30, rpe = 4) => session({ kind: 'run', date: ago(d), run: { family, distanceKm: km, durationSec: min * 60, paceSecPerKm: Math.round((min * 60) / km), rpe, intervals: [] } })
  it('premier test prudent ; n’ajoute jamais une famille exclue', () => {
    const first = suggestRun(profile({ runFamilies: ['easy'] }), [], noRecovery(), NOW)!
    expect(first).toMatchObject({ family: 'easy', minutes: SPORT_CONFIG.run.firstTestMinutes })
    expect(first.notes.join()).toMatch(/pas un test maximal/)
    const hist = [runS(3, 'easy'), runS(6, 'easy'), runS(9, 'easy'), runS(12, 'long', 8, 50)]
    for (let i = 0; i < 6; i++) expect(['interval', 'tempo', 'hills']).not.toContain(suggestRun(profile({ runFamilies: ['easy', 'long', 'recovery'] }), hist, noRecovery(), new Date(2026, 10, 14 + i))!.family)
    expect(suggestRun(profile({ runFamilies: [] }), hist, noRecovery(), NOW)).toBeNull()
  })
  it('jour d’alerte : aucune sortie ; vigilance : jamais d’exigeant', () => {
    const hist = [runS(3, 'easy'), runS(6, 'easy')]
    const alert = evaluateRecovery({ checks: [check({ pain: 'strong', painArea: 'knee' })], sessions: [], now: NOW, today: TODAY })
    expect(suggestRun(profile({ runFamilies: ['easy', 'tempo'] }), hist, alert, NOW)).toBeNull()
    const vig = evaluateRecovery({ checks: [check({ fatigue: 2 })], sessions: [], now: NOW, today: TODAY })
    expect(['easy', 'recovery']).toContain(suggestRun(profile({ runFamilies: ['easy', 'tempo', 'recovery'] }), hist, vig, NOW)!.family)
  })
  it('un seul levier de progression par semaine ; volume ≤ +10 %', () => {
    const hist = [runS(8, 'easy', 5, 30), runS(11, 'easy', 5, 30), runS(14, 'easy', 5, 30), runS(15, 'long', 8, 50)]
    const s = suggestRun(profile({ runFamilies: ['easy', 'long'] }), hist, noRecovery(), NOW)!
    expect(s.notes.join()).toMatch(/un seul levier progresse/)
    expect(s.minutes).toBeLessThanOrEqual(55) // ≤ +10 % de la sortie longue ou de la sortie habituelle
  })
})

describe('planning et coordination', () => {
  const pf = (over: Partial<SportProfile['availability']> = {}) => profile({ availability: { days: [0, 1, 2, 3, 4, 5, 6], strengthPerWeek: 3, runsPerWeek: 2, ...over }, runFamilies: ['easy'] })
  it('une seule séance par jour, musculation prioritaire, jamais d’empilement', () => {
    const p = planWeek({ profile: pf(), sessions: [], recovery: noRecovery(), now: new Date(2026, 10, 16, 8) }) // lundi
    const days = p.slots.map((s) => s.date)
    expect(new Set(days).size).toBe(days.length)
    expect(p.slots.filter((s) => s.kind === 'strength')).toHaveLength(3)
    expect(p.slots.filter((s) => s.kind === 'run')).toHaveLength(2)
  })
  it('respecte les jours disponibles', () => {
    const p = planWeek({ profile: pf({ days: [1, 3] }), sessions: [], recovery: noRecovery(), now: new Date(2026, 10, 16, 8) })
    expect(p.slots.map((s) => s.date)).toEqual(['2026-11-17', '2026-11-19'].slice(0, p.slots.length))
    expect(p.slots.length).toBe(2)
    expect(p.dropped.find((d) => d.kind === 'run')).toBeDefined()
    expect(p.dropped[0].reason).toMatch(/non empilées?|rien n’est empilé/)
  })
  it('séance manquée : le reste de la semaine est réorganisé sans empiler', () => {
    const missed = session({ kind: 'strength', status: 'planned', origin: 'planned', date: '2026-11-17' })
    const p = planWeek({ profile: pf({ strengthPerWeek: 3, runsPerWeek: 1 }), sessions: [missed], recovery: noRecovery(), now: new Date(2026, 10, 19, 8) }) // jeudi
    expect(p.notes.join()).toMatch(/manquée/)
    expect(p.slots.every((s) => s.date >= '2026-11-19')).toBe(true)
    expect(new Set(p.slots.map((s) => s.date)).size).toBe(p.slots.length)
    expect(p.slots.length).toBeLessThanOrEqual(4) // jeudi → dimanche : 4 jours, 4 séances au plus, une par jour
  })
  it('les séances déjà faites comptent ; jour d’alerte non planifié', () => {
    const done = [session({ date: '2026-11-16' }), session({ date: '2026-11-17' })]
    const p = planWeek({ profile: pf({ strengthPerWeek: 3, runsPerWeek: 0 }), sessions: done, recovery: noRecovery(), now: new Date(2026, 10, 19, 8) })
    expect(p.slots.filter((s) => s.kind === 'strength')).toHaveLength(1)
    const alert = evaluateRecovery({ checks: [check({ pain: 'strong', painArea: null })], sessions: [], now: new Date(2026, 10, 19, 8), today: '2026-11-19' })
    const q = planWeek({ profile: pf({ strengthPerWeek: 3, runsPerWeek: 0 }), sessions: [], recovery: alert, now: new Date(2026, 10, 19, 8) })
    expect(q.slots.map((s) => s.date)).not.toContain('2026-11-19')
  })
})

describe('XP SPORT (récompenses souhaitées, inscrites dans le journal existant)', () => {
  const X = SPORT_CONFIG.xp
  const prof = profile({ availability: { days: [], strengthPerWeek: 2, runsPerWeek: 0 } })
  const awards = (sessions: SportSession[], checks: RecoveryCheck[] = [], decisions: never[] = []) => desiredSportAwards({ sessions, checks, decisions, profile: prof })
  const full = (date = TODAY, over: Partial<SportSession> = {}) => session({ date, endedAt: `${date}T10:00:00.000Z`, slots: [slot('curl_halteres', [1, 2, 3].map((i) => log('curl_halteres', {}, i)), 3, 'biceps')], ...over })

  it('séance complète : récompense de base ; écourtée : proportionnelle ; trop courte : aucune', () => {
    const [a] = awards([full()])
    expect(a.amount).toBe(Math.round(X.base.strength * 1 * Math.sqrt(45 / X.durationReferenceMin)))
    expect(a.attribute).toBe('force')
    expect(a.key).toMatch(/^sport:session:.*:base$/)
    const half = full(TODAY, { status: 'partial', slots: [slot('curl_halteres', [log('curl_halteres'), log('curl_halteres', {}, 2)], 4, 'biceps')] })
    expect(awards([half])[0].amount).toBeLessThan(a.amount)
    expect(awards([half])[0].reason).toMatch(/écourtée/)
    const tiny = full(TODAY, { status: 'partial', slots: [slot('curl_halteres', [log('curl_halteres')], 8, 'biceps')] })
    expect(awards([tiny])).toHaveLength(0) // 12,5 % < seuil minimal
  })
  it('activité imprévue : enregistrée, sans XP ; séance non terminée ou abandonnée : sans XP', () => {
    expect(awards([session({ kind: 'other', origin: 'unplanned', other: { minutes: 60, rpe: 7, muscles: [] } })])).toHaveLength(0)
    expect(awards([full(TODAY, { origin: 'unplanned' })])).toHaveLength(0)
    expect(awards([full(TODAY, { status: 'abandoned' }), full(TODAY, { status: 'active' })])).toHaveLength(0)
  })
  it('une seule séance récompensée par jour (la seconde est possible mais sans XP)', () => {
    const r = awards([full(TODAY), full(TODAY)])
    expect(r.filter((x) => x.key.endsWith(':base'))).toHaveLength(1)
  })
  it('course : XP selon la durée ; récupération active plafonnée ; trop courte : aucune', () => {
    const run = (family: 'easy' | 'recovery', min: number) => session({ kind: 'run', origin: 'planned', date: TODAY, endedAt: `${TODAY}T10:00:00.000Z`, run: { family, distanceKm: 5, durationSec: min * 60, paceSecPerKm: Math.round((min * 60) / 5), rpe: 3, intervals: [] } })
    const easy = awards([run('easy', 40)])[0], rec = awards([run('recovery', 40)])[0]
    expect(easy.attribute).toBe('endurance')
    expect(rec.amount).toBeLessThan(easy.amount)
    expect(awards([run('easy', 8)])).toHaveLength(0)
  })
  it('records personnels : exposures minimales, amélioration notable, plafond par séance, technique propre', () => {
    const mk = (i: number, kg: number, over: Partial<SetLog> = {}) => full(ago(30 - i * 3), { slots: [slot('curl_halteres', [1, 2, 3].map((k) => log('curl_halteres', { loadKg: kg, reps: 8, ...over }, k)), 3, 'biceps')] })
    const hist = [mk(0, 10), mk(1, 10), mk(2, 10)]
    expect(awards([...hist, mk(3, 14)]).filter((a) => a.key.includes(':pr:'))).toHaveLength(1)
    expect(awards([mk(0, 10), mk(1, 14)]).filter((a) => a.key.includes(':pr:'))).toHaveLength(0) // pas assez d'expositions
    expect(awards([...hist, mk(3, 10.1)]).filter((a) => a.key.includes(':pr:'))).toHaveLength(0) // amélioration < 2 %
    expect(awards([...hist, mk(3, 14, { technique: 1 })]).filter((a) => a.key.includes(':pr:'))).toHaveLength(0) // technique dégradée
    expect(awards([...hist, mk(3, 14, { pain: 'light' })]).filter((a) => a.key.includes(':pr:'))).toHaveLength(0) // jamais de record avec douleur
  })
  it('régularité : un seul bonus par semaine, sur jours distincts', () => {
    const wk = [full('2026-11-16'), full('2026-11-17')]
    expect(awards(wk).filter((a) => a.key.includes('regularity'))).toHaveLength(1)
    expect(awards([full('2026-11-16')]).filter((a) => a.key.includes('regularity'))).toHaveLength(0)
    expect(awards([full('2026-11-16'), full('2026-11-16')]).filter((a) => a.key.includes('regularity'))).toHaveLength(0)
  })
  it('repos respecté : seulement en vigilance/alerte, sans séance ce jour, plafonné par semaine', () => {
    const c = (day: string, safety: 'NORMAL' | 'VIGILANCE', rest = true) => check({ safety, restChosen: rest }, day)
    expect(awards([], [c('2026-11-16', 'VIGILANCE')])).toHaveLength(1)
    expect(awards([], [c('2026-11-16', 'NORMAL')])).toHaveLength(0)
    expect(awards([], [c('2026-11-16', 'VIGILANCE', false)])).toHaveLength(0)
    expect(awards([full('2026-11-16')], [c('2026-11-16', 'VIGILANCE')])).toHaveLength(1) // seule la séance rapporte
    expect(awards([], ['2026-11-16', '2026-11-17', '2026-11-18'].map((d) => c(d, 'VIGILANCE'))).filter((a) => a.key.includes(':rest:'))).toHaveLength(X.restMaxPerWeek)
  })
  it('progression confirmée par l’utilisateur uniquement', () => {
    const dec = (applied: boolean) => ({ id: 'd1', exerciseId: 'curl_halteres', action: 'increase' as const, from: 10, to: 12, unit: 'kg' as const, reason: 'ok', applied, at: new Date(NOW).toISOString() })
    expect(awards([], [], [dec(true)] as never)[0]).toMatchObject({ attribute: 'maitrise', amount: X.progressionConfirmed })
    expect(awards([], [], [dec(false)] as never)).toHaveLength(0)
  })
  it('1 XP SPORT = 1 XP LIFE pour le niveau global : les montants sont des XP ordinaires', () => {
    for (const a of awards([full()])) expect(Number.isInteger(a.amount) && a.amount > 0).toBe(true)
    expect(completion(full()).ratio).toBe(1)
  })
  it('mesure d’un jeu : e1RM, répétitions ou durée, jamais sur technique ou douleur dégradées', () => {
    expect(setMetric(log('curl_halteres', { reps: 10, loadKg: 20 }), EXERCISE_BY_ID.curl_halteres)).toBeCloseTo(20 * (1 + 10 / 30))
    expect(setMetric(log('gainage_planche', { durationSec: 45, reps: undefined }), EXERCISE_BY_ID.gainage_planche)).toBe(45)
    expect(setMetric(log('curl_halteres', { pain: 'strong' }), EXERCISE_BY_ID.curl_halteres)).toBeNull()
  })
})

describe('statistiques', () => {
  const s1 = session({ date: ago(2), slots: [slot('developpe_couche_halteres', [1, 2, 3].map((i) => log('developpe_couche_halteres', { reps: 10, loadKg: 20 }, i)), 3)] })
  const s2 = session({ date: ago(9), slots: [slot('developpe_couche_halteres', [1, 2, 3].map((i) => log('developpe_couche_halteres', { reps: 10, loadKg: 24 }, i)), 3)] })
  it('volume, répartition musculaire et records', () => {
    expect(volume([s1]).sets).toBe(3)
    expect(volume([s1]).tonnageKg).toBe(600)
    const split = muscleSplit([s1])
    expect(split.pectoraux).toBe(3)
    expect(split.triceps).toBe(1.5)
    const pr = personalRecords([s1, s2])
    expect(pr[0].label).toMatch(/Développé couché/)
    expect(pr[0].value).toMatch(/32/) // 24 × (1 + 10/30)
  })
  it('régularité et bilan de séance', () => {
    expect(regularity([s1, s2], 1, NOW).activeWeeks).toBe(2)
    expect(regularity([s1, s2], 1, NOW).streakWeeks).toBeGreaterThanOrEqual(1)
    expect(sessionDebrief(s1, [s1, s2]).join(' ')).toMatch(/3\/3 séries/)
    expect(sessionDebrief(s1, [s1]).join(' ')).toMatch(/Première séance/)
  })
})
