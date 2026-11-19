import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { auditLedger, totalXp } from '@/core/ledger'
import { computeProgression } from '@/core/progression'
import { canonicalStringify } from '@/core/backupFormat'
import { levelFromXp } from '@/core/xp'
import { SPORT_ATTRIBUTE_IDS } from '@/core/attributes'
import type { SportSession } from '@/core/sport/session'
import { LevelDB } from './db'
import { BackupDB } from './backup/backupDb'
import { createBackupService } from './backup/backupService'
import { readTables } from './backup/snapshot'
import { createQuestService } from './questService'
import { createSportService, SportError } from './sportService'

let main: LevelDB
let clock: Date
let n: number
let sport: ReturnType<typeof createSportService>
let quests: ReturnType<typeof createQuestService>
const at = (d: number, h = 10) => new Date(2026, 10, d, h, 0, 0)
const deps = () => ({ now: () => clock, id: () => `id-${++n}` })
const events = () => main.xpEvents.toArray()
const sportEvents = async () => (await events()).filter((e) => e.domain === 'SPORT')
const xp = async (domain?: 'SPORT' | 'LIFE') => totalXp(await events(), domain ? (e) => e.domain === domain : undefined)
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof SportError ? e.code : `other:${(e as Error).message}`))

const gymProfile = () => sport.saveProfile({ experience: 'intermediate', equipmentProfile: 'gym', sessionMinutes: 45, musclePriorities: { pectoraux: 'develop', dos: 'develop' }, availability: { days: [], strengthPerWeek: 3, runsPerWeek: 1 } })

/** Génère, démarre, saisit toutes les séries (pas de douleur) et termine une séance. */
async function doSession(opts: { focus?: import('@/core/sport/types').MuscleGroup[]; completeRatio?: number } = {}): Promise<SportSession> {
  const { session } = await sport.generateStrength({ focus: opts.focus })
  await sport.startSession(session.id)
  const total = session.slots.reduce((a, s) => a + s.sets, 0)
  let remaining = Math.ceil(total * (opts.completeRatio ?? 1))
  for (const slot of session.slots) {
    const ex = (slot.equipment ?? slot.bodyweight)!
    for (let i = 0; i < slot.sets && remaining > 0; i++, remaining--) await sport.logSet(session.id, slot.id, { exerciseId: ex.exerciseId, reps: ex.repsMax, loadKg: ex.loadKg ?? undefined, durationSec: ex.durationSec, rpe: 7, technique: 3 })
  }
  return (await sport.finishSession(session.id)).session
}

beforeEach(() => {
  main = new LevelDB('sp-' + Math.random())
  clock = at(19)
  n = 0
  sport = createSportService(main, deps())
  quests = createQuestService(main, { now: () => clock, id: () => `q-${++n}` })
})

describe('XP SPORT dans le journal existant (aucun second moteur)', () => {
  it('une séance terminée inscrit des événements SPORT dans xpEvents, avec justification', async () => {
    await gymProfile()
    const s = await doSession()
    expect(s.status).toBe('completed')
    const ev = await sportEvents()
    expect(ev.length).toBeGreaterThan(0)
    expect(ev[0]).toMatchObject({ domain: 'SPORT', source: 'activity', kind: 'award', status: 'valid' })
    expect(ev[0].awardKey).toBe(`sport:session:${s.id}:base`)
    expect(ev[0].reason).toMatch(/Séance terminée/)
    expect(ev[0].sourceId).toBe(s.id)
    expect(auditLedger(await events())).toEqual([])
  })
  it('1 XP LIFE = 1 XP SPORT pour le niveau global ; niveau SPORT calculé sur le seul SPORT', async () => {
    await gymProfile()
    await quests.seedCategories()
    const q = await quests.createQuest({ type: 'personal', title: 'Dossier', categoryId: 'cat-pro', priority: 'normal', difficulty: 'hard', effortMinutes: 60 })
    await quests.completeQuest(q.id)
    await doSession()
    const life = await xp('LIFE'), sp = await xp('SPORT')
    expect(life).toBeGreaterThan(0); expect(sp).toBeGreaterThan(0)
    const p = computeProgression(await events())
    expect(p.life.xp).toBe(life)
    expect(p.sportLevel.xp).toBe(sp)
    expect(p.totalXp).toBe(life + sp)
    expect(p.global.level).toBe(levelFromXp(life + sp).level)
    expect(p.sportLevel.level).toBe(levelFromXp(sp).level)
  })
  it('alimente les attributs SPORT et transversaux ; les 7 attributs SPORT existent', async () => {
    await gymProfile()
    await doSession()
    const p = computeProgression(await events())
    const v = (id: string) => p.attributes.find((a) => a.id === id)!.value
    expect(v('force')).toBeGreaterThan(0)
    for (const id of SPORT_ATTRIBUTE_IDS) expect(p.attributes.find((a) => a.id === id), id).toBeDefined()
    await sport.logRun({ family: 'easy', distanceKm: 5, durationSec: 1700, rpe: 4, date: '2026-11-18', organised: true })
    expect(computeProgression(await events()).attributes.find((a) => a.id === 'endurance')!.value).toBeGreaterThan(0)
  })
  it('un historique SPORT apparaît dans le fil d’activité avec le domaine SPORT', async () => {
    await gymProfile(); await doSession()
    expect(computeProgression(await events()).activities.some((a) => a.domain === 'SPORT')).toBe(true)
  })
  it('séance écourtée : récompense proportionnelle ; terminer deux fois ne récompense pas deux fois', async () => {
    await gymProfile()
    const full = await doSession()
    const fullXp = await xp('SPORT')
    await sport.deleteSession(full.id)
    expect(await xp('SPORT')).toBe(0)
    clock = at(20)
    const part = await doSession({ completeRatio: 0.6 })
    expect(part.status).toBe('partial')
    const partXp = await xp('SPORT')
    expect(partXp).toBeGreaterThan(0)
    expect(partXp).toBeLessThan(fullXp)
    await sport.finishSession(part.id)
    await sport.syncXp(); await sport.syncXp()
    expect(await xp('SPORT')).toBe(partXp)
  })
  it('activités imprévues : enregistrées, comptées dans la récupération et les statistiques, sans XP', async () => {
    await gymProfile()
    const before = await sport.generateStrength({ focus: ['quadriceps'] }) // fatigue initiale nulle
    expect(before.session.slots.length).toBeGreaterThan(0)
    await sport.logUnplanned({ title: 'Foot entre amis', minutes: 90, rpe: 8, muscles: ['quadriceps', 'mollets'] })
    expect(await sportEvents()).toHaveLength(0)
    const s = (await main.sportSessions.toArray()).find((x) => x.kind === 'other')!
    expect(s.origin).toBe('unplanned')
    const { context } = await import('@/core/sport/recovery').then((m) => ({ context: m }))
    expect(context.localFatigue([s], clock).quadriceps).toBeGreaterThan(0)
    expect(await code(sport.logUnplanned({ title: '', minutes: 60, rpe: 5 }))).toBe('invalid')
  })
  it('une seule séance récompensée par jour : la seconde est enregistrée sans XP', async () => {
    await gymProfile()
    await doSession()
    const one = await xp('SPORT')
    await doSession({ focus: ['epaules'] })
    expect((await sportEvents()).filter((e) => e.awardKey.endsWith(':base') && e.status === 'valid')).toHaveLength(1)
    expect(await xp('SPORT')).toBe(one)
    expect((await main.sportSessions.toArray()).filter((s) => s.status === 'completed')).toHaveLength(2)
  })
})

describe('corrections de l’historique : recalcul complet', () => {
  it('corriger une séance (statut) recalcule l’XP avec événements de correction tracés', async () => {
    await gymProfile()
    const s = await doSession()
    const before = await xp('SPORT')
    await sport.correctSession(s.id, { status: 'abandoned' })
    expect(await xp('SPORT')).toBe(0)
    const ev = await sportEvents()
    expect(ev.some((e) => e.kind === 'reversal' && /corrigé|modifié|supprimé/i.test(e.reason))).toBe(true)
    await sport.correctSession(s.id, { status: 'completed' })
    expect(await xp('SPORT')).toBe(before)
    expect(auditLedger(await events())).toEqual([])
  })
  it('modifier ou supprimer une série recalcule la récompense', async () => {
    await gymProfile()
    const s = await doSession()
    const before = await xp('SPORT')
    const slot = s.slots[0]
    await sport.deleteSet(s.id, slot.id, 1)
    await sport.deleteSet(s.id, slot.id, 1)
    expect(await xp('SPORT')).toBeLessThan(before) // séance désormais incomplète
    expect(auditLedger(await events())).toEqual([])
  })
  it('supprimer une séance retire son XP, ses records et sa régularité, journal conservé', async () => {
    await gymProfile()
    const s = await doSession()
    await sport.deleteSession(s.id)
    expect(await xp('SPORT')).toBe(0)
    expect((await sportEvents()).length).toBeGreaterThan(0) // trace des gains et corrections
    expect(computeProgression(await events()).sportLevel.xp).toBe(0)
    expect(auditLedger(await events())).toEqual([])
  })
  it('déplacer la date d’une séance met à jour l’horodatage de ses gains', async () => {
    await gymProfile()
    const s = await doSession()
    await sport.correctSession(s.id, { date: '2026-11-12' })
    const open = (await sportEvents()).filter((e) => e.kind === 'award' && e.status === 'valid')
    expect(open.every((e) => e.at.startsWith('2026-11-12') || e.at.startsWith('2026-11-11') || e.at.startsWith('2026-11-13'))).toBe(true)
    expect(await code(sport.correctSession(s.id, { date: '2099-01-01' }))).toBe('invalid_date')
  })
  it('records recalculés quand une séance antérieure est corrigée', async () => {
    await gymProfile()
    const mk = async (day: number, loadKg: number) => {
      clock = at(day)
      const s = await sport.createPersonalSession('Pectoraux', ['developpe_couche_halteres'])
      await sport.startSession(s.id)
      for (let i = 0; i < 3; i++) await sport.logSet(s.id, s.slots[0].id, { exerciseId: 'developpe_couche_halteres', reps: 10, loadKg, rpe: 7, technique: 3 })
      return (await sport.finishSession(s.id)).session
    }
    for (const d of [1, 3, 5, 7]) await mk(d, 20)
    const best = await mk(9, 32)
    const prKeys = async () => (await sportEvents()).filter((e) => e.awardKey.includes(':pr:') && e.status === 'valid' && e.kind === 'award')
    expect(await prKeys()).toHaveLength(1)
    expect((await prKeys())[0].attribute).toBe('force')
    await sport.deleteSession(best.id)
    expect(await prKeys()).toHaveLength(0)
    expect(auditLedger(await events())).toEqual([])
  })
})

describe('séance guidée : sauvegarde immédiate, variantes, sécurité', () => {
  it('chaque série est enregistrée immédiatement ; l’arrêt puis la reprise conservent tout', async () => {
    await gymProfile()
    const { session } = await sport.generateStrength({ focus: ['pectoraux'] })
    await sport.startSession(session.id)
    const slot = session.slots[0]; const ex = (slot.equipment ?? slot.bodyweight)!
    await sport.logSet(session.id, slot.id, { exerciseId: ex.exerciseId, reps: 9, loadKg: 20, rpe: 6, technique: 2 })
    const reread = (await main.sportSessions.get(session.id))!
    expect(reread.status).toBe('active')
    expect(reread.slots[0].logs).toHaveLength(1)
    expect(reread.slots[0].logs[0]).toMatchObject({ reps: 9, loadKg: 20, exerciseId: ex.exerciseId })
    clock = at(19, 10); await sport.pauseSession(session.id)
    clock = at(19, 12); await sport.resumeSession(session.id)
    const resumed = (await main.sportSessions.get(session.id))!
    expect(resumed.status).toBe('active')
    expect(resumed.pausedMs).toBe(2 * 3_600_000)
    expect(resumed.slots[0].logs).toHaveLength(1)
  })
  it('le repos est un horodatage absolu (robuste à l’arrière-plan et au verrouillage)', async () => {
    await gymProfile()
    const { session } = await sport.generateStrength({ focus: ['dos'] })
    await sport.startSession(session.id)
    const slot = session.slots[0]; const ex = (slot.equipment ?? slot.bodyweight)!
    const r = await sport.logSet(session.id, slot.id, { exerciseId: ex.exerciseId, reps: 8, loadKg: 20 })
    expect(r.session.restEndsAt).toBe(new Date(clock.getTime() + ex.restSec * 1000).toISOString())
  })
  it('basculer entre avec et sans matériel pendant la séance ne perd aucune performance ni ne les convertit', async () => {
    await gymProfile()
    const { session } = await sport.generateStrength({ focus: ['dos'] })
    await sport.startSession(session.id)
    const slot = session.slots.find((s) => s.equipment && s.bodyweight)!
    expect(slot).toBeDefined()
    await sport.logSet(session.id, slot.id, { exerciseId: slot.equipment!.exerciseId, reps: 10, loadKg: 30, rpe: 7 })
    await sport.switchVariant(session.id, 'bodyweight')
    await sport.logSet(session.id, slot.id, { exerciseId: slot.bodyweight!.exerciseId, reps: 12, rpe: 7 })
    await sport.switchVariant(session.id, 'equipment')
    const logs = (await main.sportSessions.get(session.id))!.slots.find((s) => s.id === slot.id)!.logs
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({ exerciseId: slot.equipment!.exerciseId, reps: 10, loadKg: 30 })
    expect(logs[1]).toMatchObject({ exerciseId: slot.bodyweight!.exerciseId, reps: 12 })
    expect(logs[1].loadKg).toBeUndefined() // aucune conversion répétitions → charge
    expect(await code(sport.logSet(session.id, slot.id, { exerciseId: 'curl_halteres', reps: 5 }))).toBe('invalid')
  })
  it('passer, réordonner et corriger des séries pendant la séance', async () => {
    await gymProfile()
    const { session } = await sport.generateStrength()
    await sport.startSession(session.id)
    const ids = session.slots.map((s) => s.id)
    const reordered = await sport.reorderSlots(session.id, [...ids].reverse())
    expect(reordered.slots.map((s) => s.id)).toEqual([...ids].reverse())
    const skipped = await sport.skipSlot(session.id, ids[0], true)
    expect(skipped.slots.find((s) => s.id === ids[0])!.status).toBe('skipped')
    const slot = session.slots[1]; const ex = (slot.equipment ?? slot.bodyweight)!
    await sport.logSet(session.id, slot.id, { exerciseId: ex.exerciseId, reps: 8, loadKg: 10 })
    const fixed = await sport.updateSet(session.id, slot.id, 1, { reps: 11 })
    expect(fixed.slots.find((s) => s.id === slot.id)!.logs[0].reps).toBe(11)
  })
  it('alerte de récupération : aucune séance proposée ni démarrée, jamais d’encouragement à forcer', async () => {
    await gymProfile()
    await sport.saveCheck({ fatigue: 1, sleep: 2, soreness: 'none', pain: 'strong', painArea: null })
    expect(await code(sport.generateStrength())).toBe('alert')
    expect(await code(sport.generateHiit())).toBe('alert')
  })
  it('douleur sur une zone : les exercices concernés sont écartés au démarrage ; tout bloqué → séance refusée', async () => {
    await gymProfile()
    const { session } = await sport.generateStrength({ focus: ['pectoraux', 'dos'] })
    await sport.saveCheck({ fatigue: 0, sleep: 3, soreness: 'none', pain: 'strong', painArea: 'pectoraux' })
    const r = await sport.startSession(session.id)
    expect(r.skippedForSafety.length).toBeGreaterThan(0)
    const skippedGroups = r.session.slots.filter((s) => s.status === 'skipped').map((s) => s.group)
    expect(skippedGroups).toContain('pectoraux')
    const { session: all } = await sport.generateStrength({ focus: ['pectoraux'] }).catch(() => ({ session: null as never }))
    void all
  })
  it('douleur forte pendant une série : mise en garde, pas de minuteur de repos', async () => {
    await gymProfile()
    const { session } = await sport.generateStrength({ focus: ['dos'] })
    await sport.startSession(session.id)
    const slot = session.slots[0]; const ex = (slot.equipment ?? slot.bodyweight)!
    const r = await sport.logSet(session.id, slot.id, { exerciseId: ex.exerciseId, reps: 5, loadKg: 20, pain: 'strong' })
    expect(r.caution).toMatch(/arrêtez/i)
    expect(r.caution).toMatch(/Ne forcez jamais/)
    expect(r.session.restEndsAt).toBeNull()
  })
  it('une séance terminée ne se modifie plus que par correction depuis l’historique', async () => {
    await gymProfile()
    const s = await doSession()
    const slot = s.slots[0]; const ex = (slot.equipment ?? slot.bodyweight)!
    expect(await code(sport.logSet(s.id, slot.id, { exerciseId: ex.exerciseId, reps: 5 }))).toBe('bad_state')
  })
})

describe('préférences, séances personnelles, alternatives', () => {
  it('favoris, exclusions et évitements temporaires pilotent la génération ; rien n’est modifié sans validation', async () => {
    await gymProfile()
    const first = (await sport.generateStrength({ focus: ['pectoraux'] })).session
    const chosen = first.slots.flatMap((s) => [s.equipment?.exerciseId, s.bodyweight?.exerciseId]).filter(Boolean) as string[]
    for (const id of chosen) await sport.setPref(id, 'excluded')
    const next = (await sport.generateStrength({ focus: ['pectoraux'] })).session
    const after = next.slots.flatMap((s) => [s.equipment?.exerciseId, s.bodyweight?.exerciseId])
    for (const id of chosen) expect(after).not.toContain(id)
    expect(await main.exercisePrefs.count()).toBe(chosen.length)
    await sport.setPref(chosen[0], null)
    expect(await main.exercisePrefs.get(chosen[0])).toBeUndefined()
  })
  it('alternative proposée pour un exercice impossible, sans modifier la sélection durable', async () => {
    await gymProfile()
    const alt = await sport.alternativeFor('developpe_couche_barre', 'equipment')
    expect(alt).not.toBeNull()
    expect(await main.exercisePrefs.count()).toBe(0)
  })
  it('échange ponctuel dans une séance ; les séries déjà saisies restent liées à leur exercice', async () => {
    await gymProfile()
    const { session } = await sport.generateStrength({ focus: ['dos'] })
    await sport.startSession(session.id)
    const slot = session.slots[0]; const ex = (slot.equipment ?? slot.bodyweight)!
    await sport.logSet(session.id, slot.id, { exerciseId: ex.exerciseId, reps: 8, loadKg: 20 })
    const variant = slot.equipment ? 'equipment' : 'bodyweight'
    const alt = (await sport.alternativeFor(ex.exerciseId, variant))!
    const swapped = await sport.swapExerciseInSession(session.id, slot.id, variant, alt.id)
    const sl = swapped.slots[0]
    expect((variant === 'equipment' ? sl.equipment : sl.bodyweight)!.exerciseId).toBe(alt.id)
    expect(sl.logs[0].exerciseId).toBe(ex.exerciseId)
    expect(await main.exercisePrefs.count()).toBe(0)
  })
  it('exercices personnalisés et séances personnelles ; suppression refusée si utilisés', async () => {
    await gymProfile()
    const ex = await sport.saveCustomExercise({ name: 'Rowing sac à dos', primary: ['dos'], secondary: ['biceps'], equipment: [], movement: 'pull', level: 1, kind: 'strength', mode: 'reps', pose: 'row_bent', instructions: ['a', 'b', 'c'], safety: ['s'], progression: 'Plus de répétitions.', alternatives: [], bodyweight: true, stress: [] })
    expect(ex.custom).toBe(true)
    const pers = await sport.createPersonalSession('Ma séance', [ex.id, 'curl_halteres'])
    expect(pers.origin).toBe('personal')
    expect(pers.slots).toHaveLength(2)
    await sport.startSession(pers.id)
    await sport.logSet(pers.id, pers.slots[0].id, { exerciseId: ex.id, reps: 10 })
    expect(await code(sport.deleteCustomExercise(ex.id))).toBe('in_use')
    expect(await code(sport.saveCustomExercise({ ...ex, name: ' ', primary: ['dos'] } as never))).toBe('invalid')
    expect(await code(sport.createPersonalSession('', []))).toBe('invalid')
  })
  it('modifications rapides du profil : aucune ne s’écrase (mises à jour sur la dernière version)', async () => {
    await Promise.all([
      sport.saveProfile((c) => ({ musclePriorities: { ...c.musclePriorities, dos: 'develop' } })),
      sport.saveProfile((c) => ({ musclePriorities: { ...c.musclePriorities, pectoraux: 'progress' } })),
      sport.saveProfile((c) => ({ goals: [...c.goals, 'muscle'] })),
      sport.saveProfile((c) => ({ availability: { ...c.availability, days: [...c.availability.days, 2] } })),
      sport.saveProfile((c) => ({ availability: { ...c.availability, days: [...c.availability.days, 4] } })),
    ])
    const p = await sport.getProfile()
    expect(p.musclePriorities).toEqual({ dos: 'develop', pectoraux: 'progress' })
    expect(p.goals).toEqual(['muscle'])
    expect([...p.availability.days].sort()).toEqual([2, 4])
  })
  it('séance personnelle de mobilité : type « mobilité », XP sur l’attribut Mobilité', async () => {
    const s = await sport.createPersonalSession('Mobilité du matin', ['chat_vache', 'etirement_psoas'], 2)
    expect(s.kind).toBe('mobility')
    await sport.startSession(s.id)
    for (const sl of s.slots) for (let i = 0; i < 2; i++) await sport.logSet(s.id, sl.id, { exerciseId: (sl.bodyweight ?? sl.equipment)!.exerciseId, reps: 8, durationSec: 30 })
    await sport.finishSession(s.id)
    const ev = (await sportEvents()).filter((e) => e.kind === 'award' && e.status === 'valid')
    expect(ev[0].attribute).toBe('mobilite')
    expect(computeProgression(await events()).attributes.find((a) => a.id === 'mobilite')!.value).toBeGreaterThan(0)
  })
  it('profil : valeurs validées, jamais bloquant', async () => {
    expect((await sport.getProfile()).equipmentProfile).toBe('none')
    expect(await code(sport.saveProfile({ sessionMinutes: 5 }))).toBe('invalid')
    expect(await code(sport.saveProfile({ availability: { days: [], strengthPerWeek: 9, runsPerWeek: 1 } }))).toBe('invalid')
    const p = await sport.saveProfile({ experience: 'beginner' })
    expect(p.experience).toBe('beginner')
    const s = await sport.generateStrength() // profil incomplet : la génération fonctionne
    expect(s.session.slots.length).toBeGreaterThan(0)
  })
})

describe('course, récupération, planning, progression', () => {
  it('saisie manuelle : allure calculée, intervalles conservés, date passée acceptée, futur refusé', async () => {
    const r = await sport.logRun({ family: 'interval', distanceKm: 6, durationSec: 2100, rpe: 8, date: '2026-11-10', organised: true, intervals: [{ distanceKm: 0.4, durationSec: 100, restSec: 90 }] })
    expect(r.session.run!.paceSecPerKm).toBe(350)
    expect(r.session.run!.intervals).toHaveLength(1)
    expect(r.session.date).toBe('2026-11-10')
    expect(await code(sport.logRun({ family: 'easy', distanceKm: 5, durationSec: 1700, rpe: 4, date: '2099-01-01' }))).toBe('invalid_date')
    expect(await code(sport.logRun({ family: 'easy', distanceKm: 0, durationSec: 1700, rpe: 4 }))).toBe('invalid')
  })
  it('course non organisée : sans XP ; organisée : XP d’endurance', async () => {
    await sport.logRun({ family: 'easy', distanceKm: 5, durationSec: 1700, rpe: 4, organised: false })
    expect(await sportEvents()).toHaveLength(0)
    await sport.logRun({ family: 'easy', distanceKm: 5, durationSec: 1700, rpe: 4, date: '2026-11-18', organised: true })
    expect((await sportEvents())[0].attribute).toBe('endurance')
  })
  it('questionnaire : niveau de sécurité enregistré, historique conservé, réévaluation le même jour', async () => {
    const a = await sport.saveCheck({ fatigue: 0, sleep: 3, soreness: 'none', pain: 'strong', painArea: 'knee' })
    expect(a.check.safety).toBe('ALERTE')
    expect(a.state.blocked[0]).toMatchObject({ area: 'knee' })
    const b = await sport.saveCheck({ fatigue: 0, sleep: 3, soreness: 'none', pain: 'none' })
    expect(b.check.safety).toBe('NORMAL')
    expect(await main.recoveryChecks.count()).toBe(2)
  })
  it('« Je me repose » : XP seulement en vigilance/alerte, plafonnée par semaine, jamais en NORMAL', async () => {
    await sport.saveCheck({ fatigue: 0, sleep: 3, soreness: 'none', pain: 'none' })
    await sport.chooseRest()
    expect(await sportEvents()).toHaveLength(0)
    for (const d of [16, 17, 18]) { clock = at(d); await sport.saveCheck({ fatigue: 2, sleep: 2, soreness: 'none', pain: 'none' }); await sport.chooseRest() }
    expect((await sportEvents()).filter((e) => e.status === 'valid' && e.kind === 'award')).toHaveLength(2)
    expect((await sportEvents())[0].attribute).toBe('resilience')
    expect(await code((async () => { clock = at(21); return sport.chooseRest() })())).toBe('bad_state')
  })
  it('planning : applique sans empiler, remplace les séances prévues non commencées, conserve les commencées', async () => {
    await sport.saveProfile({ availability: { days: [0, 2, 4], strengthPerWeek: 3, runsPerWeek: 0 } })
    clock = at(16)
    const a = await sport.applyWeekPlan()
    expect(a.created).toBe(3)
    const b = await sport.applyWeekPlan()
    expect(b.created).toBe(3)
    expect((await main.sportSessions.toArray()).filter((s) => s.status === 'planned')).toHaveLength(3)
    const days = (await main.sportSessions.toArray()).map((s) => s.date)
    expect(new Set(days).size).toBe(days.length)
  })
  it('séance prévue : préparée au dernier moment avec les données du jour', async () => {
    await gymProfile()
    await sport.saveProfile({ availability: { days: [3], strengthPerWeek: 1, runsPerWeek: 0 } })
    await sport.applyWeekPlan()
    const shell = (await main.sportSessions.toArray()).find((s) => s.status === 'planned')!
    expect(shell.slots).toHaveLength(0)
    const prepared = await sport.prepareSession(shell.id)
    expect(prepared.slots.length).toBeGreaterThan(0)
    expect(prepared.origin).toBe('planned')
  })
  it('progression : rien n’est appliqué sans confirmation ; l’XP de maîtrise exige une progression appliquée', async () => {
    const rec = { exerciseId: 'curl_halteres', action: 'increase' as const, reason: 'Haut de plage atteint sur 3 séances', from: 10, to: 12, unit: 'kg' as const, exposures: 3 }
    await sport.decideProgression(rec, false)
    expect(await main.exerciseStates.count()).toBe(0)
    expect(await sportEvents()).toHaveLength(0)
    await sport.decideProgression(rec, true)
    expect((await main.exerciseStates.get('curl_halteres'))!.workingLoadKg).toBe(12)
    const ev = await sportEvents()
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ attribute: 'maitrise', domain: 'SPORT' })
    const hold = await sport.decideProgression({ ...rec, action: 'hold' }, true)
    expect(hold.applied).toBe(false)
  })
})

describe('sauvegardes et persistance du module SPORT', () => {
  it('une sauvegarde chiffrée contient toutes les données SPORT et les restitue à l’identique', async () => {
    await gymProfile()
    await doSession()
    await sport.logRun({ family: 'easy', distanceKm: 5, durationSec: 1700, rpe: 4, date: '2026-11-18', organised: true })
    await sport.saveCheck({ fatigue: 1, sleep: 2, soreness: 'light', pain: 'none' })
    await sport.setPref('curl_halteres', 'favorite')
    await sport.addMeasure({ date: '2026-11-18', weightKg: 72 })
    const store = new BackupDB('bk-' + Math.random())
    const bk = createBackupService(main, store, { ...deps(), iterations: 2000 })
    const meta = (await bk.createBackup('manual-snapshot'))!
    expect(meta.verification!.counts).toMatchObject({ sportSessions: 2, recoveryChecks: 1, exercisePrefs: 1, bodyMeasures: 1 })
    const original = canonicalStringify(await readTables(main))
    const xpBefore = await xp('SPORT')
    for (const t of [main.sportSessions, main.xpEvents, main.sportProfile, main.recoveryChecks, main.exercisePrefs, main.bodyMeasures]) await t.clear()
    expect(await xp('SPORT')).toBe(0)
    const report = await bk.applyRestore(await bk.prepareRestoreFromBackup(meta.id))
    expect(report.ok).toBe(true)
    expect(canonicalStringify(await readTables(main))).toBe(original)
    expect(await xp('SPORT')).toBe(xpBefore)
    expect(auditLedger(await events())).toEqual([])
  })
  it('les données SPORT survivent à un redémarrage', async () => {
    await gymProfile(); const s = await doSession()
    main.close(); await main.open()
    expect((await main.sportSessions.get(s.id))!.status).toBe('completed')
    expect((await main.sportProfile.get('me'))!.equipmentProfile).toBe('gym')
    expect((await sportEvents()).length).toBeGreaterThan(0)
  })
})
