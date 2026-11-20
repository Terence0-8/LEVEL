import { describe, expect, it } from 'vitest'
import { dayKey } from '../dates'
import { cycleInfo } from './cycle'
import { EXERCISE_BY_ID } from './exercises'
import { generateStrengthSession } from './generator'
import { defaultProfile } from './profile'
import { evaluateRecovery, type RecoveryState } from './recovery'
import type { SportSession } from './session'
import {
  instanceFrom, nextProgramSession, PROGRAMS, profilePatchFor, programById, programWeek, recommendPrograms, runMinutes, sanitizeProgramState, weeklyRunMinutes, type ProgramAnswers,
} from './programs'
import { MUSCLE_GROUPS, type EquipmentProfile, type Experience } from './types'

const NOW = new Date(2026, 10, 18, 10) // mercredi
const normal = evaluateRecovery({ checks: [], sessions: [], now: NOW, today: dayKey(NOW) })
const asLevel = (level: RecoveryState['level']): RecoveryState => ({ ...normal, level })
const done = (date: string, tag: NonNullable<SportSession['programTag']>, status: SportSession['status'] = 'completed'): SportSession =>
  ({ id: `s-${date}-${tag.index}`, kind: 'strength', origin: 'generated', date, status, title: 't', plannedMinutes: 40, variant: 'bodyweight', slots: [], startedAt: null, endedAt: null, pausedMs: 0, pausedAt: null, restEndsAt: null, notes: '', createdAt: '', updatedAt: '', programTag: tag })
const answers = (o: Partial<ProgramAnswers> = {}): ProgramAnswers => ({ goal: 'muscle', level: 'beginner', perWeek: 3, days: [0, 2, 4], minutes: 40, equipment: 'home', ...o })

describe('Catalogue SPORT : intégrité', () => {
  it('identifiants uniques et versionnés ; les trois familles existent ; couverture demandée', () => {
    expect(new Set(PROGRAMS.map((p) => p.id)).size).toBe(PROGRAMS.length)
    for (const c of ['strength', 'run', 'mixed'] as const) expect(PROGRAMS.some((p) => p.category === c), c).toBe(true)
    for (const id of ['debutant', 'masse', 'force', 'haut', 'bas', 'bras', 'reprise', 'intermediaire']) expect(programById(`prog.muscu.${id}`), id).toBeTruthy()
    for (const id of ['debuter', 'endurance', 'allure', '5km', '10km', 'longues', 'reprise']) expect(programById(`prog.course.${id}`), id).toBeTruthy()
    for (const id of ['muscu-course', 'condition', 'muscle-endurance', 'equilibre']) expect(programById(`prog.mixte.${id}`), id).toBeTruthy()
  })
  it('chaque programme comporte tous les éléments attendus', () => {
    for (const p of PROGRAMS) {
      expect(p.description.length, p.id).toBeGreaterThan(20); expect(p.why.length, p.id).toBeGreaterThan(20); expect(p.progression.length, p.id).toBeGreaterThan(20); expect(p.recovery.length, p.id).toBeGreaterThan(20)
      expect(p.levels.length, p.id).toBeGreaterThan(0); expect(p.equipment.length, p.id).toBeGreaterThan(0); expect(p.weeks).toBeGreaterThanOrEqual(4); expect(p.perWeek).toBeGreaterThanOrEqual(2); expect(p.perWeek).toBeLessThanOrEqual(5)
      expect(p.split.length, p.id).toBeGreaterThanOrEqual(2)
      expect(new Set(p.split.map((s) => s.id)).size, p.id).toBe(p.split.length)
      for (const s of p.split) {
        expect(s.cues.length, `${p.id}/${s.id}`).toBeGreaterThan(0)
        if (s.kind === 'strength') { expect(s.focus!.length).toBeGreaterThan(0); for (const m of s.focus!) expect(MUSCLE_GROUPS).toContain(m); expect(s.scheme).toMatch(/séries/); expect(s.scheme).toMatch(/répétitions/); expect(s.scheme).toMatch(/repos/) }
        if (s.kind === 'run') { expect(s.runFamily).toBeTruthy(); expect(p.run?.minutes[s.runFamily!], `${p.id}/${s.id}`).toBeTruthy() }
      }
    }
  })
  it('RÈGLE ABSOLUE : aucune variante de pompes dans un programme ordinaire (texte ni groupes), circuits HIIT seulement via le moteur', () => {
    for (const p of PROGRAMS) {
      const text = JSON.stringify(p).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      expect(text, p.id).not.toMatch(/pompe|push-?up/)
      for (const s of p.split) if (s.kind === 'hiit') expect(s.focus).toBeUndefined() // le circuit est composé par `generateHiit`, qui respecte l'autorisation du profil
    }
  })
  it('les séances de musculation générées pour chaque programme, niveau et matériel n’ont aucune variante de pompes', () => {
    const levels: Experience[] = ['beginner', 'intermediate', 'advanced']
    for (const p of PROGRAMS) for (const equipment of p.equipment) for (const level of levels) for (const s of p.split.filter((x) => x.kind === 'strength')) {
      const profile = { ...defaultProfile(), experience: level, equipmentProfile: equipment as EquipmentProfile, sessionMinutes: 45 }
      const r = generateStrengthSession({ profile, prefs: [], custom: [], recovery: normal, sessions: [], states: [], now: NOW, cycle: cycleInfo(null, NOW), focus: s.focus })
      for (const slot of r.slots) for (const ex of [slot.equipment, slot.bodyweight]) if (ex) expect(EXERCISE_BY_ID[ex.exerciseId]?.pushup ?? false, `${p.id}/${s.id}/${equipment}/${level}`).toBeFalsy()
    }
  })
  it('chaque programme de musculation produit une vraie séance avec le matériel qu’il annonce (domicile, salle)', () => {
    for (const p of PROGRAMS) for (const equipment of p.equipment.filter((e) => e !== 'none')) for (const s of p.split.filter((x) => x.kind === 'strength')) {
      const profile = { ...defaultProfile(), experience: p.levels[0], equipmentProfile: equipment, sessionMinutes: 45 }
      const r = generateStrengthSession({ profile, prefs: [], custom: [], recovery: normal, sessions: [], states: [], now: NOW, cycle: cycleInfo(null, NOW), focus: s.focus })
      expect(r.slots.length, `${p.id}/${s.id}/${equipment}`).toBeGreaterThan(0)
    }
  })
})

describe('Programmes de course : progression prudente', () => {
  const runs = PROGRAMS.filter((p) => p.run)
  it('la charge hebdomadaire ne dépasse jamais +15 % d’une semaine à l’autre, et une semaine allégée tombe toutes les quatre semaines', () => {
    for (const p of runs) {
      for (let w = 2; w <= p.weeks; w++) {
        const prev = weeklyRunMinutes(p, w - 1), cur = weeklyRunMinutes(p, w)
        if (w % 4 === 0 && w < p.weeks) expect(cur, `${p.id} S${w} allégée`).toBeLessThan(prev)
        else if (w % 4 !== 1) expect(cur / prev, `${p.id} S${w}`).toBeLessThanOrEqual(1.15)
      }
    }
  })
  it('la durée de la dernière semaine reste raisonnable (≤ 100 min par sortie) et jamais nulle', () => {
    for (const p of runs) for (const s of p.split.filter((x) => x.kind === 'run')) for (let w = 1; w <= p.weeks; w++) { const m = runMinutes(p, s.runFamily!, w)!; expect(m).toBeGreaterThan(5); expect(m).toBeLessThanOrEqual(100) }
  })
  it('« Débuter la course » est précis semaine par semaine', () => {
    const p = programById('prog.course.debuter')!
    expect(p.run!.weekText).toHaveLength(p.weeks)
    expect(p.levels).toEqual(['beginner'])
  })
})

describe('Recommandation', () => {
  it('un débutant qui veut du muscle à domicile obtient d’abord le programme débutant ; jamais un programme avancé', () => {
    const r = recommendPrograms(answers())
    expect(r[0].template.id).toBe('prog.muscu.debutant'); expect(r[0].fit).toBe('ideal'); expect(r[0].reasons.length).toBeGreaterThan(1)
    for (const x of r) expect(x.template.levels.includes('beginner'), x.template.id).toBe(true)
  })
  it('l’objectif, le niveau, le matériel et la fréquence orientent le résultat', () => {
    expect(recommendPrograms(answers({ goal: 'strength', level: 'intermediate', perWeek: 3, equipment: 'gym' }))[0].template.id).toBe('prog.muscu.force')
    expect(recommendPrograms(answers({ goal: 'muscle', level: 'intermediate', perWeek: 4, equipment: 'gym' }))[0].template.category).toBe('strength')
    expect(recommendPrograms(answers({ goal: 'run', level: 'beginner', perWeek: 3, equipment: 'none', minutes: 30 }))[0].template.id).toBe('prog.course.debuter')
    expect(recommendPrograms(answers({ goal: 'restart', level: 'intermediate', perWeek: 2, equipment: 'none' }))[0].template.id).toBe('prog.muscu.reprise')
    expect(recommendPrograms(answers({ equipment: 'none', goal: 'strength', level: 'advanced' })).every((x) => x.template.equipment.includes('none'))).toBe(true)
  })
  it('déterministe, trié, et signale ce qui s’écarte des réponses', () => {
    const a = recommendPrograms(answers({ goal: 'muscle', level: 'intermediate', perWeek: 2, equipment: 'gym' }))
    expect(JSON.stringify(a)).toBe(JSON.stringify(recommendPrograms(answers({ goal: 'muscle', level: 'intermediate', perWeek: 2, equipment: 'gym' }))))
    for (let i = 1; i < a.length; i++) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score)
    expect(a.some((x) => x.cautions.length > 0)).toBe(true)
  })
})

describe('Instance : le modèle du catalogue reste intact', () => {
  const t = programById('prog.muscu.general')!
  it('l’instance est une copie : la modifier ne change jamais le catalogue', () => {
    const before = JSON.stringify(t)
    const inst = instanceFrom(t, { level: 'beginner', perWeek: 3, days: [4, 0, 2], minutes: 30, equipment: 'home' }, NOW)
    inst.split[0].label = 'Modifié'; inst.split[0].focus!.push('mollets'); inst.name = 'Autre'
    expect(JSON.stringify(t)).toBe(before)
    expect(inst.days).toEqual([0, 2, 4]); expect(inst.minutes).toBe(30)
    expect(instanceFrom(t, { level: 'beginner', perWeek: 3, days: [], minutes: t.minutesPerSession, equipment: 'home' }, NOW).minutes).toBeNull()
  })
  it('l’activation annonce l’adaptation du profil (niveau, matériel, disponibilités) sans toucher aux contraintes physiques', () => {
    const inst = instanceFrom(t, { level: 'intermediate', perWeek: 3, days: [0, 2, 4], minutes: 45, equipment: 'gym' }, NOW)
    const current = { ...defaultProfile(), constraints: [{ id: 'c', area: 'knee' as const, note: 'genou', since: '2026-01-01' }], allowPushupsInHiit: false }
    const patch = profilePatchFor(inst, current)
    expect(patch).toMatchObject({ experience: 'intermediate', equipmentProfile: 'gym', sessionMinutes: 45 }); expect(patch.availability!.strengthPerWeek).toBe(3)
    expect(patch.constraints).toBeUndefined(); expect(patch.allowPushupsInHiit).toBeUndefined()
  })
  it('un état corrompu ou absent est assaini (jamais d’erreur)', () => {
    for (const bad of [null, undefined, 3, {}, { active: { templateId: 1 } }, { active: { templateId: 'x', startedAt: 'y', split: [] } }]) expect(sanitizeProgramState(bad).active).toBeNull()
  })
})

describe('Prochaine séance : récupération prioritaire, rotation sur les séances terminées, jamais d’empilement', () => {
  const t = programById('prog.muscu.masse')! // 4 séances, 4 par semaine
  const inst = instanceFrom(t, { level: 'intermediate', perWeek: 3, days: [], minutes: 55, equipment: 'gym' }, new Date(2026, 10, 9, 10)) // lundi 9 → semaine 2
  const tag = (index: number) => ({ templateId: t.id, startedAt: inst.startedAt, index })
  it('la semaine n’est jamais inférieure à 1, même si l’horloge de l’interface retarde sur l’activation', () => {
    expect(programWeek(inst, new Date(2026, 10, 9, 9, 59))).toBe(1)
  })
  it('au début : première séance de la rotation, semaine correcte', () => {
    const n = nextProgramSession(inst, [], normal, NOW)
    expect(n).toMatchObject({ state: 'ready', index: 0, week: 2 }); expect(programWeek(inst, NOW)).toBe(2)
  })
  it('la rotation avance seulement avec les séances TERMINÉES de CE programme (ni les abandonnées, ni les séances libres, ni un autre programme)', () => {
    const s = [done('2026-11-09', tag(0)), done('2026-11-10', tag(1), 'abandoned'), { ...done('2026-11-11', tag(2)), programTag: undefined }, done('2026-11-11', { ...tag(2), startedAt: 'autre' })]
    expect(nextProgramSession(inst, s, normal, NOW).index).toBe(1)
    expect(nextProgramSession(inst, [done('2026-11-09', tag(0)), done('2026-11-10', tag(1))], normal, NOW).index).toBe(2)
  })
  it('une séance manquée ne s’empile jamais : après un trou, une seule séance est proposée, la suivante dans la rotation', () => {
    const n = nextProgramSession(inst, [done('2026-10-30', tag(0))].map((x) => x), normal, NOW) // aucune séance depuis 3 semaines
    expect(n.index).toBe(1); expect(n.state).toBe('ready')
  })
  it('alerte : aucune séance ; vigilance : séance allégée ; objectif hebdomadaire atteint : repos ; séance du jour faite : demain', () => {
    expect(nextProgramSession(inst, [], asLevel('ALERTE'), NOW).state).toBe('blocked')
    expect(nextProgramSession(inst, [], asLevel('VIGILANCE'), NOW).state).toBe('lighter')
    const week = [done('2026-11-16', tag(0)), done('2026-11-17', tag(1)), done('2026-11-14', tag(2))]
    expect(nextProgramSession(inst, week.slice(0, 2).concat(done('2026-11-16', tag(2))), normal, NOW).state).toBe('week-done')
    expect(nextProgramSession(inst, [done('2026-11-18', tag(0))], normal, NOW).state).toBe('done-today')
    expect(nextProgramSession(inst, [done('2026-11-18', tag(0))], asLevel('ALERTE'), NOW).state).toBe('done-today')
  })
  it('hors des jours habituels : proposé sans blocage', () => {
    const wk = instanceFrom(t, { level: 'intermediate', perWeek: 3, days: [0], minutes: 55, equipment: 'gym' }, new Date(2026, 10, 9, 10))
    expect(nextProgramSession(wk, [], normal, NOW)).toMatchObject({ state: 'ready' })
  })
  it('programme terminé : proposé de recommencer ou changer', () => {
    const quick = { ...inst, weeks: 1, startedAt: new Date(2026, 9, 1).toISOString() }
    const many = Array.from({ length: 4 }, (_, i) => done(`2026-10-0${i + 1}`, { templateId: t.id, startedAt: quick.startedAt, index: i }))
    expect(nextProgramSession(quick, many, normal, NOW).state).toBe('finished')
  })
})
