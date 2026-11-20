import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { canonicalStringify } from '@/core/backupFormat'
import { QUEST_PACKS, QUEST_TEMPLATES } from '@/core/catalog/lifeCatalog'
import { auditLedger, totalXp } from '@/core/ledger'
import { programById, PROGRAMS } from '@/core/sport/programs'
import { EXERCISE_BY_ID } from '@/core/sport/exercises'
import { LevelDB } from './db'
import { BackupDB } from './backup/backupDb'
import { createBackupService } from './backup/backupService'
import { readTables } from './backup/snapshot'
import { CatalogError, createCatalogService, readCatalog } from './catalogService'
import { createProgramService, ProgramError, readProgramState } from './programService'
import { createQuestService } from './questService'
import { createSportService } from './sportService'

let main: LevelDB
let clock: Date
let n: number
const deps = () => ({ now: () => clock, id: () => `id-${++n}` })
let cat: ReturnType<typeof createCatalogService>
let prog: ReturnType<typeof createProgramService>
let quests: ReturnType<typeof createQuestService>
let sport: ReturnType<typeof createSportService>
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof CatalogError || e instanceof ProgramError ? e.code : `other:${(e as Error).message}`))
const A = { level: 'beginner' as const, perWeek: 3, days: [0, 2, 4], minutes: 40, equipment: 'home' as const }

beforeEach(async () => {
  main = new LevelDB(`v2-${Math.random()}`)
  clock = new Date(2026, 10, 18, 10); n = 0
  await main.open()
  cat = createCatalogService(main, deps()); prog = createProgramService(main, deps()); quests = createQuestService(main, deps()); sport = createSportService(main, deps())
  await quests.seedCategories()
})

describe('Bibliothèque LIFE : un modèle devient une vraie quête, récompensée par le moteur existant', () => {
  it('ajouter un modèle crée UNE quête sans écrire d’XP ; la validation rapporte l’XP du moteur ; correction compensée', async () => {
    const q = await cat.addTemplate('life.cul.lecture')
    expect(q).toMatchObject({ title: 'Lire pendant 20 minutes', type: 'daily', categoryId: 'cat-culture', effortMinutes: 20 })
    expect(await main.xpEvents.count()).toBe(0)
    await quests.completeQuest(q.id)
    const ev = await main.xpEvents.toArray()
    expect(totalXp(ev)).toBe(q.rewardXp); expect(totalXp(ev)).toBeGreaterThan(0)
    await quests.undoQuestValidation(q.id, 'Erreur'); expect(totalXp(await main.xpEvents.toArray())).toBe(0)
    expect(auditLedger(await main.xpEvents.toArray())).toEqual([])
  })
  it('personnalisation à l’ajout (fréquence, durée) et étapes des quêtes de progression', async () => {
    const w = await cat.addTemplate('life.cul.lecture', { type: 'weekly', minutes: 40 })
    expect(w).toMatchObject({ type: 'weekly', effortMinutes: 40 })
    const p = await cat.addTemplate('life.pro.presentation'); expect(p.steps).toHaveLength(3)
  })
  it('doublons : refusés (modèle déjà ajouté ou même titre créé à la main), autorisés sur confirmation, possibles après suppression ou archivage', async () => {
    const q = await cat.addTemplate('life.fin.budget')
    expect(await code(cat.addTemplate('life.fin.budget'))).toBe('already_added')
    await quests.createQuest({ type: 'personal', title: 'Faire le point sur ses dépenses', categoryId: 'cat-finances', priority: 'normal', difficulty: 'easy', effortMinutes: 20 })
    expect(await code(cat.addTemplate('life.fin.depenses'))).toBe('already_added')
    expect(await code(cat.addTemplate('life.fin.budget', { allowDuplicate: true }))).toBe('ok')
    await quests.setArchived(q.id, true)
    for (const x of await main.quests.toArray()) if (x.title === 'Mettre à jour son budget') await main.quests.delete(x.id)
    expect(await code(cat.addTemplate('life.fin.budget'))).toBe('ok')
    expect(await code(cat.addTemplate('life.inconnu.x'))).toBe('not_found')
  })
  it('favoris, modèle personnel (copie), duplication ; tout reste dans settings (donc sauvegardé)', async () => {
    expect(await cat.toggleFavorite('life.cul.lecture')).toBe(true); expect(await cat.toggleFavorite('life.cul.lecture')).toBe(false)
    await cat.toggleFavorite('life.cul.etude')
    const q = await quests.createQuest({ type: 'weekly', title: 'Ma routine perso', categoryId: 'cat-perso', priority: 'high', difficulty: 'hard', effortMinutes: 50, steps: [{ title: 'Étape' }] })
    const t = await cat.saveAsTemplate(q.id)
    expect(t).toMatchObject({ custom: true, name: 'Ma routine perso', type: 'weekly', minutes: 50 })
    expect(await code(cat.saveAsTemplate(q.id))).toBe('already_added')
    await quests.updateQuest(q.id, { type: 'weekly', title: 'Ma routine perso', categoryId: 'cat-perso', priority: 'high', difficulty: 'easy', effortMinutes: 10 })
    expect((await readCatalog(main)).custom[0].difficulty).toBe('hard') // le modèle est une copie
    const d = await cat.duplicateQuest(q.id)
    expect(d.title).toBe('Ma routine perso (copie)'); expect(d.id).not.toBe(q.id); expect(await main.xpEvents.count()).toBe(0)
    expect(await code(cat.addTemplate(t.id, { allowDuplicate: true }))).toBe('ok')
    await cat.deleteCustomTemplate(t.id); expect((await readCatalog(main)).custom).toHaveLength(0)
    expect((await main.settings.get('lifeCatalog'))!.value).toBeTruthy()
  })
})

describe('Packs de démarrage', () => {
  it('prévisualisation → ajout de tout le pack ou d’une sélection ; quêtes déjà présentes ignorées ; rythme modifiable', async () => {
    const pack = QUEST_PACKS[0]
    const r = await cat.addPack(pack.id, pack.templateIds.slice(0, 3).map((id, i) => ({ templateId: id, type: i === 0 ? ('weekly' as const) : undefined })))
    expect(r.created).toHaveLength(3); expect(r.created[0].type).toBe('weekly')
    const again = await cat.addPack(pack.id)
    expect(again.created.length).toBe(pack.templateIds.length - 3); expect(again.skipped).toHaveLength(3)
    expect(await main.quests.count()).toBe(pack.templateIds.length)
    expect(await main.xpEvents.count()).toBe(0)
  })
  it('tout ou rien : une sélection invalide n’ajoute aucune quête', async () => {
    const before = await main.quests.count()
    expect(await code(cat.addPack(QUEST_PACKS[0].id, [{ templateId: QUEST_PACKS[0].templateIds[0] }, { templateId: 'life.pro.bilan-annuel' }]))).toBe('invalid')
    expect(await main.quests.count()).toBe(before); expect((await readCatalog(main)).installed).toEqual({})
    expect(await code(cat.addPack('pack.inconnu'))).toBe('not_found')
  })
  it('chaque modèle du catalogue peut être ajouté et validé (aucune donnée invalide)', async () => {
    for (const t of QUEST_TEMPLATES) { const q = await cat.addTemplate(t.id); expect(q.rewardXp, t.id).toBeGreaterThan(0) }
    expect(await main.quests.count()).toBe(QUEST_TEMPLATES.length)
  })
})

describe('Programmes SPORT : catalogue, instance, historique', () => {
  it('activer crée une instance personnalisée, adapte le profil, laisse le catalogue intact', async () => {
    const before = JSON.stringify(programById('prog.muscu.debutant'))
    const inst = await prog.activate('prog.muscu.debutant', A)
    expect(inst).toMatchObject({ templateId: 'prog.muscu.debutant', perWeek: 3, days: [0, 2, 4] })
    expect(JSON.stringify(programById('prog.muscu.debutant'))).toBe(before)
    const p = (await main.sportProfile.get('me'))!
    expect(p).toMatchObject({ experience: 'beginner', equipmentProfile: 'home' }); expect(p.availability.days).toEqual([0, 2, 4])
    expect(await code(prog.activate('prog.inconnu', A))).toBe('not_found')
    expect(await code(prog.activate('prog.muscu.force', { ...A, equipment: 'none' }))).toBe('invalid')
  })
  it('personnalisation (fréquence, durée) sans modifier le modèle ; contraintes physiques et préférence HIIT jamais touchées', async () => {
    await sport.saveProfile({ constraints: [{ id: 'c1', area: 'knee', note: 'genou', since: '2026-01-01' }], allowPushupsInHiit: true })
    await prog.activate('prog.muscu.debutant', A)
    const c = await prog.customize({ perWeek: 2, minutes: 30 })
    expect(c).toMatchObject({ perWeek: 2, minutes: 30 })
    const p = (await main.sportProfile.get('me'))!
    expect(p.constraints).toHaveLength(1); expect(p.allowPushupsInHiit).toBe(true); expect(p.sessionMinutes).toBe(30)
  })
  it('démarrer la séance : composée par le moteur SPORT, étiquetée, sans XP avant la fin, sans pompes', async () => {
    await prog.activate('prog.muscu.debutant', A)
    const r = await prog.startNext()
    expect(r.kind).toBe('session')
    if (r.kind !== 'session') return
    expect(r.session).toMatchObject({ kind: 'strength', status: 'planned', programTag: { templateId: 'prog.muscu.debutant', index: 0 } })
    expect(r.session.title).toMatch(/^Musculation débutant · Corps entier A/)
    for (const sl of r.session.slots) for (const ex of [sl.equipment, sl.bodyweight]) if (ex) expect(EXERCISE_BY_ID[ex.exerciseId].pushup ?? false).toBe(false)
    expect(await main.xpEvents.count()).toBe(0)
  })
  it('rotation : la séance suivante n’arrive qu’après la fin de la précédente ; l’XP vient du moteur SPORT existant', async () => {
    await prog.activate('prog.muscu.debutant', A)
    const first = await prog.startNext()
    if (first.kind !== 'session') throw new Error('session attendue')
    await sport.startSession(first.session.id)
    for (const slot of first.session.slots) { const ex = (slot.equipment ?? slot.bodyweight)!; for (let i = 0; i < slot.sets; i++) await sport.logSet(first.session.id, slot.id, { exerciseId: ex.exerciseId, reps: ex.repsMax, loadKg: ex.loadKg ?? undefined, durationSec: ex.durationSec } as never) }
    await sport.finishSession(first.session.id)
    expect(totalXp(await main.xpEvents.toArray(), (e) => e.domain === 'SPORT')).toBeGreaterThan(0)
    expect((await prog.next())!.state).toBe('done-today')
    clock = new Date(2026, 10, 19, 10)
    const nx = await prog.next()
    expect(nx).toMatchObject({ state: 'ready', index: 1 })
    expect(auditLedger(await main.xpEvents.toArray())).toEqual([])
  })
  it('alerte de récupération : aucune séance démarrée', async () => {
    await prog.activate('prog.muscu.debutant', A)
    await sport.saveCheck({ fatigue: 0, sleep: 3, soreness: 'none', pain: 'strong', painArea: 'pectoraux' })
    expect((await prog.next())!.state).toBe('blocked')
    expect(await code(prog.startNext())).toBe('not_available')
    expect((await main.sportSessions.toArray()).length).toBe(0)
  })
  it('course : la consigne est fournie pour l’enregistrement de la sortie, sans séance créée', async () => {
    await prog.activate('prog.course.debuter', { ...A, equipment: 'none', minutes: 30 })
    const r = await prog.startNext()
    expect(r.kind).toBe('run')
    if (r.kind === 'run') { expect(r.suggestion.family).toBe('easy'); expect(r.suggestion.effort).toMatch(/Semaine 1/); expect(r.tag.index).toBe(0) }
    expect(await main.sportSessions.count()).toBe(0)
  })
  it('changer de programme : l’ancien rejoint l’historique, séances et XP intacts ; arrêter conserve tout', async () => {
    await prog.activate('prog.muscu.debutant', A)
    const s = await prog.startNext(); if (s.kind !== 'session') throw new Error('x')
    const sessionsBefore = canonicalStringify(await main.sportSessions.toArray()), xpBefore = canonicalStringify(await main.xpEvents.toArray())
    await prog.activate('prog.mixte.equilibre', { ...A, perWeek: 3 })
    const st = await readProgramState(main)
    expect(st.active!.templateId).toBe('prog.mixte.equilibre'); expect(st.history).toHaveLength(1); expect(st.history[0]).toMatchObject({ templateId: 'prog.muscu.debutant', sessionsDone: 0 })
    expect(canonicalStringify(await main.sportSessions.toArray())).toBe(sessionsBefore); expect(canonicalStringify(await main.xpEvents.toArray())).toBe(xpBefore)
    await prog.stop(); expect((await readProgramState(main)).active).toBeNull(); expect((await readProgramState(main)).history).toHaveLength(2)
    expect(await code(prog.stop())).toBe('no_program'); expect(await prog.next()).toBeNull()
  })
  it('chaque programme du catalogue s’active et démarre sa première séance sans erreur', async () => {
    for (const p of PROGRAMS) {
      const equipment = p.equipment.includes('home') ? 'home' : p.equipment[0]
      await prog.activate(p.id, { level: p.levels[0], perWeek: p.perWeek, days: [], minutes: p.minutesPerSession, equipment })
      const r = await prog.startNext()
      expect(['session', 'run'], p.id).toContain(r.kind)
      for (const s of await main.sportSessions.toArray()) await main.sportSessions.delete(s.id)
    }
  })
})

describe('Sauvegardes : catalogue LIFE et programme actif voyagent avec les données', () => {
  it('chiffrés, restaurés à l’identique', async () => {
    await cat.addPack(QUEST_PACKS[1].id); await cat.toggleFavorite('life.cul.lecture'); await prog.activate('prog.muscu.debutant', A)
    const bk = createBackupService(main, new BackupDB(`bk-${Math.random()}`), { ...deps(), iterations: 2000 })
    const meta = (await bk.createBackup('manual-snapshot'))!
    const original = canonicalStringify(await readTables(main))
    await main.settings.clear(); await main.quests.clear()
    const report = await bk.applyRestore(await bk.prepareRestoreFromBackup(meta.id))
    expect(report.ok).toBe(true); expect(canonicalStringify(await readTables(main))).toBe(original)
    expect((await readProgramState(main)).active!.templateId).toBe('prog.muscu.debutant'); expect((await readCatalog(main)).favorites).toEqual(['life.cul.lecture'])
  })
})
