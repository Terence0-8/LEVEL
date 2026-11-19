import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aadFor, BACKUP_FORMAT, BACKUP_FORMAT_VERSION, canonicalStringify, countTables, DB_SCHEMA_VERSION, TABLE_NAMES, type Envelope,
} from '@/core/backupFormat'
import { auditLedger } from '@/core/ledger'
import { computeProgression } from '@/core/progression'
import { LevelDB } from '../db'
import { createQuestService } from '../questService'
import { BackupDB } from './backupDb'
import { BackupError, createBackupService, parseEnvelopeText, type BackupService } from './backupService'
import { createBackupScheduler } from './scheduler'
import { encryptJson, fromB64, sha256Hex, toB64, unwrapDek, kekFromPassphrase } from './crypto'
import { readTables } from './snapshot'

const PASS = 'ma phrase secrète 2026'
const ITER = 2000

let main: LevelDB
let store: BackupDB
let clock: Date
let n: number
let svc: BackupService
let quests: ReturnType<typeof createQuestService>

const at = (d: number, h = 10) => new Date(2026, 10, d, h, 0, 0)
const deps = () => ({ now: () => clock, id: () => `id-${++n}` })
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e instanceof BackupError ? e.code : `other:${(e as Error).message}`))
const snap = async (db = main) => canonicalStringify(await readTables(db))

/** Jeu de données varié : tous les types de tables, corrections, rétroactif, crédits, analyses, révisions. */
async function seed() {
  await quests.seedCategories()
  const a = await quests.createQuest({ type: 'daily', title: 'Écrire le rapport confidentiel', categoryId: 'cat-pro', priority: 'high', difficulty: 'hard', effortMinutes: 60, steps: [{ title: 'Plan' }, { title: 'Rédaction' }] })
  await quests.completeStep(a.id, a.steps[0].id)
  await quests.undoValidation(a.id, a.steps[0].id, 'Erreur de clic')
  await quests.completeQuest(a.id)
  await quests.completeQuest(a.id, { doneOn: '2026-11-17' })
  const b = await quests.createQuest({ type: 'personal', title: 'Préparer la présentation', categoryId: 'cat-culture', priority: 'normal', difficulty: 'normal', effortMinutes: 60 })
  await quests.declareWork(b.id, { kind: 'partial', percent: 50, durationMinutes: 40, note: 'Moitié faite' })
  await quests.updateQuest(b.id, { type: 'personal', title: 'Préparer la présentation', categoryId: 'cat-culture', priority: 'normal', difficulty: 'epic', effortMinutes: 60 })
  const d = await quests.createQuest({ type: 'personal', title: 'Envoyer la facture', categoryId: 'cat-finances', priority: 'low', difficulty: 'easy', effortMinutes: 15, dueDate: '2026-11-10' })
  await quests.recordMissedAnalysis({ questId: d.id, cycleKey: 'due:2026-11-10', cause: 'no_time', action: 'none', note: 'Semaine chargée' })
  await main.profile.put({ id: 'me', displayName: 'Aria', createdAt: 1 })
  await main.settings.put({ key: 'showDemoData', value: true })
  await main.demoQuestState.put({ questId: 'dq-1', doneAt: 123 })
  return { a, b, d }
}

beforeEach(async () => {
  main = new LevelDB('main-' + Math.random())
  store = new BackupDB('bk-' + Math.random())
  clock = at(19)
  n = 0
  svc = createBackupService(main, store, { ...deps(), iterations: ITER })
  quests = createQuestService(main, { now: () => clock, id: () => `q-${++n}` })
})

afterEach(() => { vi.restoreAllMocks() })

describe('couverture du schéma', () => {
  it('la sauvegarde couvre TOUTES les tables Dexie et la version de schéma courante', () => {
    expect(main.tables.map((t) => t.name).sort()).toEqual([...TABLE_NAMES].sort())
    expect(main.verno).toBe(DB_SCHEMA_VERSION)
  })
})

describe('création d’une sauvegarde chiffrée', () => {
  it('crée une sauvegarde vérifiée dont le contenu est illisible sans clé', async () => {
    await seed()
    const meta = (await svc.createBackup('manual-snapshot'))!
    expect(meta.verification).toMatchObject({ status: 'ok', method: 'device', issues: [] })
    expect(meta.verification!.counts).toMatchObject({ quests: 3, categories: 7 })
    expect(meta.keyWraps).toBeNull() // pas encore de phrase secrète : lisible sur cet appareil seulement
    const blob = (await store.blobs.get(meta.id))!
    const raw = new TextDecoder('latin1').decode(fromB64(blob.ciphertext))
    for (const secret of ['rapport confidentiel', 'Aria', 'Semaine chargée', 'Moitié faite']) expect(raw).not.toContain(secret)
    expect(blob.ciphertext).not.toContain('rapport')
  })
  it('ne duplique pas une sauvegarde automatique identique à la précédente, sauf si forcée', async () => {
    await seed()
    expect(await svc.createBackup('auto-periodic')).not.toBeNull()
    expect(await svc.createBackup('auto-periodic')).toBeNull()
    expect(await store.backups.count()).toBe(1)
    await quests.createQuest({ type: 'personal', title: 'Nouvelle', categoryId: 'cat-pro', priority: 'normal', difficulty: 'easy', effortMinutes: 15 })
    expect(await svc.createBackup('auto-change')).not.toBeNull()
    expect(await svc.createBackup('auto-change', { force: true })).not.toBeNull()
    expect(await store.backups.count()).toBe(3)
  })
  it('conserve plusieurs points de restauration et applique la rétention', async () => {
    await seed()
    for (let i = 0; i < 40; i++) {
      clock = new Date(clock.getTime() + 6 * 3_600_000)
      await main.settings.put({ key: 'tick', value: i })
      await svc.createBackup('auto-change')
    }
    await svc.createBackup('manual-snapshot', { force: true })
    const list = await svc.list()
    expect(list.length).toBeGreaterThan(8) // plusieurs points conservés
    expect(list.length).toBeLessThan(41) // anciennes éclaircies
    expect(list.filter((m) => m.reason === 'manual-snapshot')).toHaveLength(1)
    expect(list.every((m) => m.verification?.status === 'ok')).toBe(true)
    expect(await store.blobs.count()).toBe(list.length) // aucun blob orphelin
  })
})

describe('phrase secrète, clé de secours et test réel de récupération', () => {
  it('définit la protection, teste réellement les DEUX secrets et re-scelle les sauvegardes existantes', async () => {
    await seed()
    const early = (await svc.createBackup('manual-snapshot'))!
    expect(early.keyWraps).toBeNull()
    const r = await svc.setupProtection(PASS)
    expect(r.test).toEqual({ passphrase: true, recovery: true })
    expect(r.recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/)
    const st = await svc.protectionStatus()
    expect(st).toMatchObject({ configured: true, testedWith: 'both' })
    expect(st.testedAt).not.toBeNull()
    expect((await store.backups.get(early.id))!.keyWraps).not.toBeNull() // l’ancienne sauvegarde devient récupérable
    expect(await svc.verifyBackup(early.id, { passphrase: PASS })).toMatchObject({ status: 'ok', method: 'passphrase' })
    expect(await svc.verifyBackup(early.id, { recoveryKey: r.recoveryKey.toLowerCase() })).toMatchObject({ status: 'ok', method: 'recovery' })
  })
  it('refuse une phrase trop courte et une seconde configuration', async () => {
    expect(await code(svc.setupProtection('court'))).toBe('weak_passphrase')
    expect((await svc.protectionStatus()).configured).toBe(false)
    await svc.setupProtection(PASS)
    expect(await code(svc.setupProtection(PASS + '!'))).toBe('already_configured')
  })
  it('un mauvais secret échoue sans rien enregistrer comme « testé »', async () => {
    await seed()
    const { backupId } = await svc.setupProtection(PASS)
    const before = (await store.backups.get(backupId))!.verification
    expect(await code(svc.verifyBackup(backupId, { passphrase: 'mauvaise phrase secrète' }))).toBe('wrong_secret')
    expect(await code(svc.verifyBackup(backupId, { recoveryKey: 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA' }))).toBe('wrong_secret')
    expect(await code(svc.verifyBackup(backupId, { recoveryKey: 'invalide' }))).toBe('invalid_secret')
    expect((await store.backups.get(backupId))!.verification).toEqual(before)
  })
  it('fonctionne avec le nombre d’itérations PBKDF2 de production (600 000)', async () => {
    const prod = createBackupService(main, store, { ...deps() })
    await seed()
    const r = await prod.setupProtection(PASS)
    expect(r.test.passphrase).toBe(true)
    expect((await store.backups.toArray())[0].keyWraps!.pass.iterations).toBe(600_000)
  })
  it('changer la phrase : la nouvelle fonctionne, l’ancienne non, la clé de secours reste valable', async () => {
    await seed()
    const { recoveryKey, backupId } = await svc.setupProtection(PASS)
    expect(await code(svc.changePassphrase({ passphrase: 'pas la bonne phrase' }, 'nouvelle phrase 2027!'))).toBe('wrong_secret')
    await svc.changePassphrase({ passphrase: PASS }, 'nouvelle phrase 2027!')
    expect(await svc.verifyBackup(backupId, { passphrase: 'nouvelle phrase 2027!' })).toMatchObject({ status: 'ok' })
    expect(await code(svc.verifyBackup(backupId, { passphrase: PASS }))).toBe('wrong_secret')
    expect(await svc.verifyBackup(backupId, { recoveryKey })).toMatchObject({ status: 'ok', method: 'recovery' })
    // phrase oubliée : la clé de secours permet de définir une nouvelle phrase
    await svc.changePassphrase({ recoveryKey }, 'troisième phrase 2028!')
    expect(await svc.verifyBackup(backupId, { passphrase: 'troisième phrase 2028!' })).toMatchObject({ status: 'ok' })
  })
  it('dernier recours (appareil intact, secrets perdus) : nouveaux secrets ; anciens fichiers exportés inchangés', async () => {
    await seed()
    await svc.setupProtection(PASS)
    const oldFile = (await svc.exportFile(PASS)).content
    const r = await svc.resetFromDevice('phrase de remplacement 99')
    const latest = (await svc.list())[0]
    expect(await svc.verifyBackup(latest.id, { passphrase: 'phrase de remplacement 99' })).toMatchObject({ status: 'ok' })
    expect(await svc.verifyBackup(latest.id, { recoveryKey: r.recoveryKey })).toMatchObject({ status: 'ok' })
    expect(await code(svc.verifyBackup(latest.id, { passphrase: PASS }))).toBe('wrong_secret')
    // le fichier exporté avant la réinitialisation ne s’ouvre qu’avec ses anciens secrets (limite documentée)
    expect(await svc.prepareRestoreFromFile(oldFile, { passphrase: PASS })).toMatchObject({ source: 'file' })
    expect(await code(svc.prepareRestoreFromFile(oldFile, { passphrase: 'phrase de remplacement 99' }))).toBe('wrong_secret')
  })
})

describe('export manuel d’un fichier chiffré', () => {
  it('exige une phrase secrète et refuse une phrase incorrecte avant de créer quoi que ce soit', async () => {
    await seed()
    expect(await code(svc.exportFile(PASS))).toBe('not_configured')
    await svc.setupProtection(PASS)
    const count = await store.backups.count()
    expect(await code(svc.exportFile('phrase incorrecte !!'))).toBe('wrong_secret')
    expect(await store.backups.count()).toBe(count)
  })
  it('produit un fichier autonome, relu et déchiffré avec la phrase, sans donnée en clair', async () => {
    await seed()
    await svc.setupProtection(PASS)
    const out = await svc.exportFile(PASS)
    expect(out.filename).toMatch(/^level-sauvegarde-2026-11-19-1000\.levelbackup$/)
    expect(out.verification).toMatchObject({ status: 'ok', method: 'passphrase' })
    const env = parseEnvelopeText(out.content)
    expect(env).toMatchObject({ format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, cipher: 'AES-256-GCM', schemaVersion: DB_SCHEMA_VERSION })
    expect(out.content).not.toMatch(/rapport|Aria|Semaine/)
    expect(JSON.stringify(Object.keys(env).sort())).toContain('keyWraps')
  })
  it('se restaure sur un APPAREIL NEUF (bases vierges) avec la phrase, ou avec la clé de secours', async () => {
    await seed()
    const { recoveryKey } = await svc.setupProtection(PASS)
    const { content } = await svc.exportFile(PASS)
    const original = await snap()

    for (const secret of [{ passphrase: PASS }, { recoveryKey }] as const) {
      const freshMain = new LevelDB('fresh-' + Math.random())
      const freshStore = new BackupDB('fresh-bk-' + Math.random())
      const fresh = createBackupService(freshMain, freshStore, { now: () => clock, id: () => `n-${++n}`, iterations: ITER })
      const plan = await fresh.prepareRestoreFromFile(content, secret)
      expect(plan.summary.counts.quests).toBe(3)
      const report = await fresh.applyRestore(plan)
      expect(report.ok).toBe(true)
      expect(await snap(freshMain)).toBe(original) // contenu strictement identique
      expect(report.safetyBackupId).toBeNull() // appareil vide : rien à protéger
    }
  })
})

describe('restauration complète sans perte', () => {
  it('restaure tout, conserve historiques XP, révisions et analyses, crée une sauvegarde de sécurité', async () => {
    const { a } = await seed()
    const backup = (await svc.createBackup('manual-snapshot'))!
    const atBackup = await snap()
    const xpAtBackup = computeProgression(await main.xpEvents.toArray()).totalXp

    // l'utilisateur continue puis commet une erreur : suppression + nouveaux gains
    await quests.deleteQuest(a.id)
    const extra = await quests.createQuest({ type: 'personal', title: 'Après la sauvegarde', categoryId: 'cat-pro', priority: 'normal', difficulty: 'epic', effortMinutes: 120 })
    await quests.completeQuest(extra.id)
    const mutated = await snap()
    expect(mutated).not.toBe(atBackup)

    const plan = await svc.prepareRestoreFromBackup(backup.id)
    expect(plan.summary.totalXp).toBe(xpAtBackup)
    expect(plan.current.totalXp).not.toBe(xpAtBackup)
    expect(plan.warnings.join(' ')).toMatch(/XP/)
    expect(await snap()).toBe(mutated) // préparer ne modifie rien

    const report = await svc.applyRestore(plan)
    expect(report.ok).toBe(true)
    expect(report.rolledBack).toBe(false)
    expect(report.checks.every((c) => c.ok)).toBe(true)
    expect(report.safetyBackupId).not.toBeNull()
    expect(await snap()).toBe(atBackup)

    const events = await main.xpEvents.toArray()
    expect(events.some((e) => e.kind === 'reversal' && e.reason === 'Erreur de clic')).toBe(true) // correction conservée
    expect(events.some((e) => e.retroactive && e.cycleKey === '2026-11-17')).toBe(true) // rétroactif conservé
    expect(events.some((e) => e.credit === 'partial' && e.note === 'Moitié faite')).toBe(true)
    expect(auditLedger(events)).toEqual([])
    expect(await main.revisions.count()).toBeGreaterThan(0)
    expect((await main.analyses.toArray())[0]).toMatchObject({ cause: 'no_time', note: 'Semaine chargée' })
    expect((await main.profile.get('me'))!.displayName).toBe('Aria')
    expect(await main.demoQuestState.count()).toBe(1)
    expect(countTables(await readTables(main))).toEqual(countTables(JSON.parse(JSON.stringify(plan.tables))))
  })
  it('la sauvegarde de sécurité permet d’annuler la restauration (aucune perte possible)', async () => {
    const { a } = await seed()
    const backup = (await svc.createBackup('manual-snapshot'))!
    await quests.deleteQuest(a.id)
    const beforeRestore = await snap()
    const report = await svc.applyRestore(await svc.prepareRestoreFromBackup(backup.id))
    expect(await snap()).not.toBe(beforeRestore)
    const safety = (await svc.list()).find((m) => m.id === report.safetyBackupId)!
    expect(safety.reason).toBe('pre-restore')
    await svc.applyRestore(await svc.prepareRestoreFromBackup(safety.id))
    expect(await snap()).toBe(beforeRestore) // on est revenu exactement à l'état d'avant
  })
  it('crée aussi une sauvegarde « après restauration »', async () => {
    await seed()
    const b = (await svc.createBackup('manual-snapshot'))!
    await svc.applyRestore(await svc.prepareRestoreFromBackup(b.id))
    expect((await svc.list()).some((m) => m.reason === 'post-restore')).toBe(true)
  })
  it('retour arrière automatique si la vérification après restauration échoue', async () => {
    await seed()
    const b = (await svc.createBackup('manual-snapshot'))!
    await quests.createQuest({ type: 'personal', title: 'À ne pas perdre', categoryId: 'cat-pro', priority: 'normal', difficulty: 'easy', effortMinutes: 15 })
    const before = await snap()
    const plan = await svc.prepareRestoreFromBackup(b.id)
    const report = await svc.applyRestore({ ...plan, checksum: 'f'.repeat(64) }) // vérification forcée en échec
    expect(report).toMatchObject({ ok: false, rolledBack: true })
    expect(report.checks.find((c) => c.id === 'content')!.ok).toBe(false)
    expect(await snap()).toBe(before)
  })
  it('écriture impossible : transaction annulée, données actuelles intactes', async () => {
    await seed()
    const b = (await svc.createBackup('manual-snapshot'))!
    const before = await snap()
    const plan = await svc.prepareRestoreFromBackup(b.id)
    const broken = { ...plan, tables: { ...plan.tables, quests: [...plan.tables.quests, plan.tables.quests[0]] } } // clé en double
    expect(await code(svc.applyRestore(broken))).toBe('restore_failed')
    expect(await snap()).toBe(before)
  })
})

describe('sauvegardes corrompues ou incompatibles', () => {
  it('détecte un octet altéré dans une sauvegarde locale et refuse de la restaurer', async () => {
    await seed()
    const good = (await svc.createBackup('manual-snapshot'))!
    await quests.createQuest({ type: 'personal', title: 'Autre', categoryId: 'cat-pro', priority: 'normal', difficulty: 'easy', effortMinutes: 15 })
    const bad = (await svc.createBackup('manual-snapshot'))!
    const blob = (await store.blobs.get(bad.id))!
    const bytes = fromB64(blob.ciphertext); bytes[Math.floor(bytes.length / 2)] ^= 0x01
    await store.blobs.put({ ...blob, ciphertext: toB64(bytes) })

    expect(await svc.verifyBackup(bad.id)).toMatchObject({ status: 'corrupt' })
    expect(await svc.verifyBackup(good.id)).toMatchObject({ status: 'ok' })
    const before = await snap()
    expect(await code(svc.prepareRestoreFromBackup(bad.id))).toBe('corrupt')
    expect(await snap()).toBe(before)
    const all = await svc.verifyAll()
    expect(all[bad.id].status).toBe('corrupt')
    expect(all[good.id].status).toBe('ok')
  })
  it('une altération de l’en-tête (date) est détectée grâce aux données authentifiées', async () => {
    await seed()
    const m = (await svc.createBackup('manual-snapshot'))!
    await store.backups.update(m.id, { createdAt: '2020-01-01T00:00:00.000Z' })
    expect(await svc.verifyBackup(m.id)).toMatchObject({ status: 'corrupt' })
  })
  it('rejette un fichier tronqué, non-JSON, d’un autre format, ou aux champs manquants', async () => {
    await seed()
    await svc.setupProtection(PASS)
    const { content } = await svc.exportFile(PASS)
    expect(await code(svc.prepareRestoreFromFile(content.slice(0, content.length / 2), { passphrase: PASS }))).toBe('invalid_file')
    expect(await code(svc.prepareRestoreFromFile('pas du json', { passphrase: PASS }))).toBe('invalid_file')
    expect(await code(svc.prepareRestoreFromFile('[]', { passphrase: PASS }))).toMatch(/incompatible|invalid_file/)
    expect(await code(svc.prepareRestoreFromFile(JSON.stringify({ ...JSON.parse(content), format: 'autre' }), { passphrase: PASS }))).toBe('incompatible')
    const { ciphertext: _c, ...noCipher } = JSON.parse(content)
    expect(await code(svc.prepareRestoreFromFile(JSON.stringify(noCipher), { passphrase: PASS }))).toBe('invalid_file')
    expect(await code(svc.prepareRestoreFromFile(JSON.stringify({ ...JSON.parse(content), keyWraps: { pass: {} } }), { passphrase: PASS }))).toBe('invalid_file')
  })
  it('détecte un fichier altéré (chiffré modifié ou en-tête falsifié) après déchiffrement de la clé', async () => {
    await seed()
    await svc.setupProtection(PASS)
    const { content } = await svc.exportFile(PASS)
    const env = JSON.parse(content) as Envelope
    const bytes = fromB64(env.ciphertext); bytes[10] ^= 0xff
    expect(await code(svc.prepareRestoreFromFile(JSON.stringify({ ...env, ciphertext: toB64(bytes) }), { passphrase: PASS }))).toBe('corrupt')
    expect(await code(svc.prepareRestoreFromFile(JSON.stringify({ ...env, createdAt: '2000-01-01T00:00:00.000Z' }), { passphrase: PASS }))).toBe('corrupt')
    expect(await code(svc.prepareRestoreFromFile(JSON.stringify({ ...env, reason: 'auto-change' }), { passphrase: PASS }))).toBe('corrupt')
  })
  it('un fichier sans phrase secrète n’est pas ouvrable hors de l’appareil (message explicite)', async () => {
    await seed()
    const m = (await svc.createBackup('manual-snapshot'))!
    const env = await (async () => ({ ...(await store.blobs.get(m.id))!, ...m }))()
    const text = JSON.stringify({ format: BACKUP_FORMAT, formatVersion: m.formatVersion, id: m.id, createdAt: m.createdAt, reason: m.reason, appVersion: m.appVersion, schemaVersion: m.schemaVersion, cipher: 'AES-256-GCM', iv: env.iv, ciphertext: env.ciphertext, keyWraps: null })
    expect(await code(svc.prepareRestoreFromFile(text, { passphrase: PASS }))).toBe('no_protection')
  })

  /** Fabrique une enveloppe VALIDE (bien chiffrée) mais au contenu/version choisis : seul le contrôle de compatibilité peut la refuser. */
  async function forge(over: { header?: Partial<Envelope>; payload?: (p: Record<string, unknown>) => Record<string, unknown>; tables?: Record<string, unknown[]> }) {
    if (!(await svc.protectionStatus()).configured) { await seed(); await svc.setupProtection(PASS) }
    const { content } = await svc.exportFile(PASS)
    const env = JSON.parse(content) as Envelope
    const dek = await unwrapDek(env.keyWraps!.pass, await kekFromPassphrase(PASS, fromB64(env.keyWraps!.pass.salt), env.keyWraps!.pass.iterations))
    const tables = over.tables ?? JSON.parse(JSON.stringify((await (async () => {
      const t = await readTables(main); return t
    })())))
    const base = { createdAt: env.createdAt, reason: env.reason, schemaVersion: DB_SCHEMA_VERSION, appVersion: 'x', counts: countTables(tables as never), checksum: await sha256Hex(canonicalStringify(tables)), tables }
    const payload = over.payload ? over.payload(base) : base
    const header = { ...env, ...over.header }
    const sealed = await encryptJson(dek, payload, aadFor(header))
    return JSON.stringify({ ...header, iv: sealed.iv, ciphertext: sealed.ciphertext })
  }

  it('refuse une version de FORMAT plus récente, sans toucher aux données', async () => {
    const text = await forge({ header: { formatVersion: BACKUP_FORMAT_VERSION + 1 } })
    const before = await snap()
    expect(await code(svc.prepareRestoreFromFile(text, { passphrase: PASS }))).toBe('incompatible')
    expect(await snap()).toBe(before)
  })
  it('refuse un SCHÉMA de données plus récent que celui de l’application', async () => {
    const text = await forge({ header: { schemaVersion: DB_SCHEMA_VERSION + 1 }, payload: (p) => ({ ...p, schemaVersion: DB_SCHEMA_VERSION + 1 }) })
    const e = await svc.prepareRestoreFromFile(text, { passphrase: PASS }).catch((x) => x as BackupError)
    expect(e).toBeInstanceOf(BackupError)
    expect((e as BackupError).code).toBe('incompatible')
    expect((e as BackupError).message).toMatch(/plus récent/)
  })
  it('refuse une somme de contrôle fausse, des comptages incohérents ou une table inconnue', async () => {
    expect(await code(svc.prepareRestoreFromFile(await forge({ payload: (p) => ({ ...p, checksum: 'a'.repeat(64) }) }), { passphrase: PASS }))).toBe('corrupt')
    expect(await code(svc.prepareRestoreFromFile(await forge({ payload: (p) => ({ ...p, counts: { quests: 99 } }) }), { passphrase: PASS }))).toBe('corrupt')
    const t = { quests: [], xpEvents: [], pirate: [{ id: 'x' }] }
    expect(await code(svc.prepareRestoreFromFile(await forge({ tables: t }), { passphrase: PASS }))).toBe('corrupt')
  })
  it('migre sans perte une sauvegarde d’un ANCIEN schéma (v1 : sans analyses ni révisions)', async () => {
    const tables = {
      profile: [{ id: 'me', displayName: 'Ancien', createdAt: 1 }], settings: [], demoQuestState: [],
      categories: [{ id: 'cat-pro', name: 'Professionnel', attribute: 'discipline', order: 0, archived: false, builtin: true }],
      quests: [{ id: 'q1', title: 'Vieille quête' }],
      xpEvents: [{ id: 'e1', kind: 'award', amount: 40, baseAmount: 40, at: '2025-01-01T10:00:00.000Z', awardKey: 'quest:q1:once', status: 'valid', domain: 'LIFE' }],
    }
    const text = await forge({ header: { schemaVersion: 1 }, payload: (p) => ({ ...p, schemaVersion: 1 }), tables })
    const plan = await svc.prepareRestoreFromFile(text, { passphrase: PASS })
    expect(plan.warnings.join(' ')).toMatch(/schéma plus ancien/)
    const report = await svc.applyRestore(plan)
    expect(report.ok).toBe(true)
    expect(await main.quests.count()).toBe(1)
    expect(await main.analyses.count()).toBe(0)
    const e = (await main.xpEvents.toArray())[0]
    expect(e).toMatchObject({ amount: 40, retroactive: false, credit: null, note: '' })
    expect(e.recordedAt).toBe(e.at)
    expect(report.totalXp).toBe(40)
  })
})

describe('planificateur de sauvegardes automatiques', () => {
  const setup = () => {
    const timers: Array<{ fn: () => void; ms: number }> = []
    const sch = createBackupScheduler(main, svc, { now: () => clock.getTime(), setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: () => undefined })
    return { sch, timers }
  }
  const reasons = async () => (await svc.list()).map((m) => m.reason)

  it('sauvegarde après un changement ordinaire (temporisé), puis ignore les doublons', async () => {
    await seed()
    const { sch, timers } = setup()
    sch.start()
    await new Promise((r) => setTimeout(r, 30)) // contrôle périodique initial
    expect(await reasons()).toEqual(['auto-periodic'])
    await quests.createQuest({ type: 'personal', title: 'Changement', categoryId: 'cat-pro', priority: 'normal', difficulty: 'easy', effortMinutes: 15 })
    expect(sch.hasPending()).toBe(true)
    expect(timers.at(-1)!.ms).toBeGreaterThanOrEqual(60_000)
    await sch.flush()
    expect(await reasons()).toContain('auto-change')
    expect(sch.hasPending()).toBe(false)
    sch.stop()
  })
  it('après une opération importante (suppression, correction d’XP) : sauvegarde critique rapide', async () => {
    const { a } = await seed()
    const { sch, timers } = setup()
    sch.start()
    await new Promise((r) => setTimeout(r, 30))
    await quests.undoQuestValidation(a.id, 'Erreur')
    expect(timers.at(-1)!.ms).toBeLessThanOrEqual(3_000)
    await sch.flush()
    expect(await reasons()).toContain('auto-critical')
    const before = (await svc.list()).length
    await quests.deleteQuest(a.id)
    await sch.flush()
    expect((await svc.list()).length).toBe(before + 1)
    sch.stop()
  })
  it('ignore les changements pendant une restauration', async () => {
    await seed()
    const b = (await svc.createBackup('manual-snapshot'))!
    const { sch } = setup()
    sch.start()
    await new Promise((r) => setTimeout(r, 30))
    await sch.flush()
    const plan = await svc.prepareRestoreFromBackup(b.id)
    const p = svc.applyRestore(plan)
    await p
    expect(sch.hasPending()).toBe(false)
    sch.stop()
  })
  it('sauvegarde périodique seulement si la dernière a plus de 24 h', async () => {
    await seed()
    const { sch } = setup()
    await svc.createBackup('manual-snapshot')
    await sch.checkPeriodic()
    expect((await svc.list()).filter((m) => m.reason === 'auto-periodic')).toHaveLength(0)
    clock = new Date(clock.getTime() + 25 * 3_600_000)
    await main.settings.put({ key: 'tick', value: 1 })
    await sch.checkPeriodic()
    expect((await svc.list()).filter((m) => m.reason === 'auto-periodic')).toHaveLength(1)
  })
})

describe('persistance et fonctionnement hors ligne', () => {
  it('les sauvegardes et la clé survivent à un redémarrage (réouverture des bases)', async () => {
    await seed()
    const { recoveryKey } = await svc.setupProtection(PASS)
    const b = (await svc.createBackup('manual-snapshot', { force: true }))!
    store.close(); main.close()
    await store.open(); await main.open()
    const reopened = createBackupService(main, store, { ...deps(), iterations: ITER })
    expect((await reopened.protectionStatus()).configured).toBe(true)
    expect(await reopened.verifyBackup(b.id)).toMatchObject({ status: 'ok', method: 'device' })
    expect(await reopened.verifyBackup(b.id, { recoveryKey })).toMatchObject({ status: 'ok' })
    expect((await reopened.list()).length).toBeGreaterThanOrEqual(2)
  })
  it('tout le cycle (sauvegarde, export, restauration) fonctionne sans aucun accès réseau', async () => {
    const fetchSpy = vi.fn(() => { throw new Error('réseau interdit') })
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('XMLHttpRequest', undefined)
    vi.stubGlobal('WebSocket', undefined)
    await seed()
    await svc.setupProtection(PASS)
    const file = await svc.exportFile(PASS)
    const b = (await svc.createBackup('manual-snapshot', { force: true }))!
    await svc.applyRestore(await svc.prepareRestoreFromBackup(b.id))
    await svc.applyRestore(await svc.prepareRestoreFromFile(file.content, { passphrase: PASS }))
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('la base de sauvegardes est indépendante de la base applicative', async () => {
    await seed()
    const b = (await svc.createBackup('manual-snapshot'))!
    await main.delete() // perte totale de la base applicative
    main = new LevelDB('replacement-' + Math.random())
    svc = createBackupService(main, store, { ...deps(), iterations: ITER })
    expect(await svc.verifyBackup(b.id)).toMatchObject({ status: 'ok' })
    const report = await svc.applyRestore(await svc.prepareRestoreFromBackup(b.id))
    expect(report.ok).toBe(true)
    expect(await main.quests.count()).toBe(3)
  })
})
