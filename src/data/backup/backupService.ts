import {
  aadFor, APP_VERSION, auditTables, BACKUP_FORMAT, BACKUP_FORMAT_VERSION, canonicalStringify, checkEnvelopeCompat, checkSchemaCompat,
  countTables, DB_SCHEMA_VERSION, isAutoReason, migrateTables, TABLE_NAMES, validatePayloadShape, xpOfTables,
  type BackupPayload, type BackupReason, type BackupTables, type Envelope, type KeyWraps, type Verification, type VerificationMethod,
} from '@/core/backupFormat'
import { BACKUP_POLICY, selectBackupsToDelete } from '@/core/backupPolicy'
import { levelFromXp } from '@/core/xp'
import type { LevelDB } from '../db'
import type { BackupDB, BackupMeta, KeystoreRow, ProtectionInfo } from './backupDb'
import {
  BackupCryptoError, decryptJson, dekToRaw, encryptJson, fromB64, generateDek, generateRecoveryKey, kekFromPassphrase, kekFromRecoveryKey,
  MIN_PASSPHRASE_LENGTH, PBKDF2_ITERATIONS, randomBytes, sha256Hex, toB64, unwrapDek, wrapDek,
} from './crypto'
import { readTables, writeTables } from './snapshot'

export type BackupErrorCode =
  | 'wrong_secret' | 'invalid_secret' | 'corrupt' | 'incompatible' | 'invalid_file' | 'not_found'
  | 'no_protection' | 'weak_passphrase' | 'already_configured' | 'not_configured' | 'verification_failed' | 'restore_failed' | 'storage_full'

export class BackupError extends Error {
  constructor(public code: BackupErrorCode, message: string) {
    super(message)
  }
}

export type Secret = { passphrase: string } | { recoveryKey: string }

export interface TablesSummary {
  counts: Record<string, number>
  totalXp: number
  level: number
}

export interface RestorePlan {
  source: 'local' | 'file'
  sourceId: string | null
  createdAt: string
  reason: BackupReason
  schemaVersion: number
  /** Tables migrées au schéma courant, prêtes à être écrites */
  tables: BackupTables
  checksum: string
  summary: TablesSummary
  current: TablesSummary
  warnings: string[]
  verification: Verification
}

export interface RestoreCheck { id: string; label: string; ok: boolean; detail?: string }
export interface RestoreReport {
  ok: boolean
  rolledBack: boolean
  checks: RestoreCheck[]
  safetyBackupId: string | null
  totalXp: number
  level: number
}

export interface ServiceOptions {
  now?: () => Date
  id?: () => string
  /** Itérations PBKDF2 (réduire UNIQUEMENT pour des tests) */
  iterations?: number
}

const summarize = (tables: Partial<BackupTables>): TablesSummary => {
  const totalXp = xpOfTables(tables)
  return { counts: countTables(tables), totalXp, level: levelFromXp(totalXp).level }
}
const hasData = (t: BackupTables) => TABLE_NAMES.some((n) => t[n].length > 0 && n !== 'settings')
const isGood = (v: Verification | null) => !!v && (v.status === 'ok' || v.status === 'warning')

function parseWraps(raw: unknown): KeyWraps | null {
  if (raw === null) return null
  const w = raw as KeyWraps
  const okStr = (...v: unknown[]) => v.every((x) => typeof x === 'string' && x.length > 0)
  if (!w || typeof w !== 'object' || !w.pass || !w.recovery) throw new BackupError('invalid_file', 'Clés d’enveloppe absentes ou illisibles.')
  if (w.pass.kdf !== 'PBKDF2-SHA256' || typeof w.pass.iterations !== 'number' || !okStr(w.pass.salt, w.pass.iv, w.pass.wrapped)
    || w.recovery.kdf !== 'HKDF-SHA256' || !okStr(w.recovery.salt, w.recovery.iv, w.recovery.wrapped))
    throw new BackupError('invalid_file', 'Clés d’enveloppe mal formées.')
  return w
}

/** Analyse un fichier de sauvegarde (texte) en enveloppe : forme + compatibilité, sans déchiffrer. */
export function parseEnvelopeText(text: string): Envelope {
  if (text.length > 300_000_000) throw new BackupError('invalid_file', 'Fichier trop volumineux.')
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new BackupError('invalid_file', 'Ce fichier n’est pas une sauvegarde Level lisible (JSON invalide ou tronqué).') }
  if (!raw || typeof raw !== 'object') throw new BackupError('invalid_file', 'Fichier de sauvegarde illisible.')
  const e = raw as Record<string, unknown>
  const compat = checkEnvelopeCompat({ format: e.format, formatVersion: e.formatVersion })
  if (!compat.ok) throw new BackupError(compat.code === 'invalid_payload' ? 'invalid_file' : 'incompatible', compat.message)
  for (const k of ['id', 'createdAt', 'reason', 'appVersion', 'iv', 'ciphertext'] as const)
    if (typeof e[k] !== 'string' || !(e[k] as string).length) throw new BackupError('invalid_file', `Champ « ${k} » manquant : fichier endommagé.`)
  if (typeof e.schemaVersion !== 'number' || e.cipher !== 'AES-256-GCM') throw new BackupError('invalid_file', 'En-tête de sauvegarde incomplet.')
  return { ...(e as unknown as Envelope), keyWraps: parseWraps((e.keyWraps ?? null) as unknown) }
}

export function createBackupService(main: LevelDB, store: BackupDB, opts: ServiceOptions = {}) {
  const now = opts.now ?? (() => new Date())
  const newId = opts.id ?? (() => crypto.randomUUID())
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS
  let busy = false

  // Les opérations d'écriture sont sérialisées : jamais deux sauvegardes/restaurations entrelacées.
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  // ── Clés ──────────────────────────────────────────────────────────
  async function keyBundle(): Promise<KeystoreRow> {
    const existing = await store.keystore.get('main')
    if (existing) return existing
    const dek = await generateDek() // hors transaction : WebCrypto n'est pas IndexedDB
    const row: KeystoreRow = { id: 'main', dek, protection: null, createdAt: now().toISOString() }
    return store.transaction('rw', store.keystore, async () => (await store.keystore.get('main')) ?? (await store.keystore.put(row), row))
  }

  async function makeWraps(dek: CryptoKey, passphrase: string): Promise<{ wraps: KeyWraps; recoveryKey: string }> {
    if (passphrase.normalize('NFKC').length < MIN_PASSPHRASE_LENGTH)
      throw new BackupError('weak_passphrase', `La phrase secrète doit comporter au moins ${MIN_PASSPHRASE_LENGTH} caractères.`)
    const salt = randomBytes(16)
    const pass = await wrapDek(dek, await kekFromPassphrase(passphrase, salt, iterations))
    const recoveryKey = generateRecoveryKey()
    const rSalt = randomBytes(16)
    const recovery = await wrapDek(dek, await kekFromRecoveryKey(recoveryKey, rSalt))
    return {
      recoveryKey,
      wraps: {
        pass: { kdf: 'PBKDF2-SHA256', iterations, salt: toB64(salt), ...pass },
        recovery: { kdf: 'HKDF-SHA256', salt: toB64(rSalt), ...recovery },
      },
    }
  }

  async function dekForSecret(wraps: KeyWraps | null, secret: Secret): Promise<{ dek: CryptoKey; method: VerificationMethod }> {
    if (!wraps) throw new BackupError('no_protection', 'Cette sauvegarde n’est pas protégée par une phrase secrète : elle n’est lisible que sur l’appareil où elle a été créée.')
    try {
      if ('passphrase' in secret) {
        if (!secret.passphrase) throw new BackupError('invalid_secret', 'Saisissez votre phrase secrète.')
        const kek = await kekFromPassphrase(secret.passphrase, fromB64(wraps.pass.salt), wraps.pass.iterations)
        return { dek: await unwrapDek(wraps.pass, kek), method: 'passphrase' }
      }
      const kek = await kekFromRecoveryKey(secret.recoveryKey, fromB64(wraps.recovery.salt))
      return { dek: await unwrapDek(wraps.recovery, kek), method: 'recovery' }
    } catch (e) {
      if (e instanceof BackupError) throw e
      if (e instanceof BackupCryptoError) {
        if (e.code === 'wrong_secret') throw new BackupError('wrong_secret', 'passphrase' in secret ? 'Phrase secrète incorrecte.' : 'Clé de secours incorrecte.')
        throw new BackupError(e.code === 'invalid_secret' ? 'invalid_secret' : 'corrupt', e.message)
      }
      throw e
    }
  }

  // ── Ouverture et contrôle d'une enveloppe ───────────────────────────
  async function openEnvelope(env: Envelope, dek: CryptoKey) {
    const compat = checkEnvelopeCompat(env)
    if (!compat.ok) throw new BackupError('incompatible', compat.message)
    let raw: unknown
    try { raw = await decryptJson(dek, env.iv, env.ciphertext, aadFor(env)) } catch (e) {
      throw new BackupError('corrupt', e instanceof BackupCryptoError ? e.message : 'Sauvegarde illisible.')
    }
    const { payload, problems } = validatePayloadShape(raw)
    if (!payload) throw new BackupError('corrupt', `Contenu invalide : ${problems.join(' ; ')}.`)
    if (payload.schemaVersion !== env.schemaVersion) throw new BackupError('corrupt', 'En-tête et contenu incohérents (version de schéma).')
    const sc = checkSchemaCompat(payload.schemaVersion)
    if (!sc.ok) throw new BackupError('incompatible', sc.message)
    const checksum = await sha256Hex(canonicalStringify(payload.tables))
    if (checksum !== payload.checksum) throw new BackupError('corrupt', 'Somme de contrôle invalide : le contenu a été altéré.')
    const counts = countTables(payload.tables)
    const mismatch = Object.entries(counts).filter(([k, n]) => (payload.counts[k] ?? 0) !== n)
    if (mismatch.length) throw new BackupError('corrupt', `Comptages incohérents : ${mismatch.map(([k]) => k).join(', ')}.`)
    const tables = migrateTables(payload.tables, payload.schemaVersion)
    return { payload: payload as BackupPayload, tables, issues: auditTables(tables) }
  }

  const toVerification = (r: Awaited<ReturnType<typeof openEnvelope>>, method: VerificationMethod): Verification => ({
    checkedAt: now().toISOString(), status: r.issues.length ? 'warning' : 'ok', method,
    counts: countTables(r.payload.tables), totalXp: xpOfTables(r.tables), issues: r.issues,
  })

  async function toEnvelope(meta: BackupMeta): Promise<Envelope> {
    const blob = await store.blobs.get(meta.id)
    if (!blob) throw new BackupError('corrupt', 'Contenu de la sauvegarde introuvable.')
    return {
      format: BACKUP_FORMAT, formatVersion: meta.formatVersion, id: meta.id, createdAt: meta.createdAt, reason: meta.reason, appVersion: meta.appVersion,
      schemaVersion: meta.schemaVersion, cipher: 'AES-256-GCM', iv: blob.iv, ciphertext: blob.ciphertext, keyWraps: meta.keyWraps,
    }
  }

  // ── Création ──────────────────────────────────────────────────────
  async function createBackupUnsafe(reason: BackupReason, force = false): Promise<BackupMeta | null> {
    const bundle = await keyBundle()
    const tables = await readTables(main)
    const contentHash = await sha256Hex(canonicalStringify(tables))
    if (isAutoReason(reason) && !force) {
      const [last] = await store.backups.orderBy('createdAt').reverse().limit(1).toArray()
      if (last && last.contentHash === contentHash && isGood(last.verification)) return null // rien de nouveau à protéger
    }
    const createdAt = now().toISOString()
    const id = newId()
    const payload: BackupPayload = { createdAt, reason, schemaVersion: DB_SCHEMA_VERSION, appVersion: APP_VERSION, counts: countTables(tables), checksum: contentHash, tables }
    const header = { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, id, createdAt, schemaVersion: DB_SCHEMA_VERSION, reason } as const
    const sealed = await encryptJson(bundle.dek, payload, aadFor(header))
    const meta: BackupMeta = {
      id, createdAt, reason, schemaVersion: DB_SCHEMA_VERSION, formatVersion: BACKUP_FORMAT_VERSION, appVersion: APP_VERSION,
      size: Math.floor((sealed.ciphertext.length * 3) / 4), contentHash, keyWraps: bundle.protection?.keyWraps ?? null, verification: null,
    }
    try {
      await store.transaction('rw', [store.backups, store.blobs], async () => {
        await store.backups.add(meta)
        await store.blobs.add({ id, iv: sealed.iv, ciphertext: sealed.ciphertext })
      })
    } catch (e) {
      // Stockage du navigateur plein ou indisponible : la transaction est annulée, les sauvegardes existantes ne sont JAMAIS touchées (la rétention n'a pas lieu).
      const name = (e as { name?: string })?.name
      if (name === 'QuotaExceededError' || (e as { inner?: { name?: string } })?.inner?.name === 'QuotaExceededError') throw new BackupError('storage_full', 'Le stockage du navigateur est plein : aucune nouvelle sauvegarde n’a été créée et vos sauvegardes existantes sont intactes. Exportez un fichier chiffré vers un autre support, puis libérez de l’espace.')
      throw e
    }
    await verifyStoredUnsafe(id, null) // relecture + déchiffrement réels
    await applyRetentionUnsafe()
    return (await store.backups.get(id)) ?? null
  }

  async function verifyStoredUnsafe(id: string, secret: Secret | null): Promise<Verification> {
    const meta = await store.backups.get(id)
    if (!meta) throw new BackupError('not_found', 'Sauvegarde introuvable.')
    let dek: CryptoKey
    let method: VerificationMethod
    if (secret) ({ dek, method } = await dekForSecret(meta.keyWraps, secret))
    else { dek = (await keyBundle()).dek; method = 'device' }
    let v: Verification
    try {
      v = toVerification(await openEnvelope(await toEnvelope(meta), dek), method)
    } catch (e) {
      if (!(e instanceof BackupError) || (e.code !== 'corrupt' && e.code !== 'incompatible')) throw e
      v = { checkedAt: now().toISOString(), status: e.code === 'corrupt' ? 'corrupt' : 'incompatible', method, issues: [e.message] }
    }
    await store.backups.update(id, { verification: v })
    if (secret && isGood(v) && method !== 'device') await markTested(method)
    return v
  }

  async function markTested(method: 'passphrase' | 'recovery') {
    const b = await keyBundle()
    if (!b.protection) return
    const prev = b.protection.testedWith
    const testedWith: ProtectionInfo['testedWith'] = prev && prev !== method ? 'both' : method
    await store.keystore.put({ ...b, protection: { ...b.protection, testedAt: now().toISOString(), testedWith } })
  }

  async function reseal(wraps: KeyWraps | null) {
    await store.backups.toCollection().modify((m) => { m.keyWraps = wraps })
  }

  async function applyRetentionUnsafe() {
    const metas = await store.backups.toArray()
    const doomed = selectBackupsToDelete(metas.map((m) => ({ id: m.id, createdAt: m.createdAt, reason: m.reason, verification: m.verification })), now(), BACKUP_POLICY)
    if (!doomed.length) return 0
    await store.transaction('rw', [store.backups, store.blobs], async () => {
      await store.backups.bulkDelete(doomed)
      await store.blobs.bulkDelete(doomed)
    })
    return doomed.length
  }

  // ── Plan de restauration ───────────────────────────────────────────
  async function buildPlan(env: Envelope, dek: CryptoKey, source: 'local' | 'file', sourceId: string | null, method: VerificationMethod): Promise<RestorePlan> {
    const r = await openEnvelope(env, dek)
    const current = summarize(await readTables(main))
    const summary = summarize(r.tables)
    const warnings: string[] = []
    if (summary.counts.xpEvents < current.counts.xpEvents)
      warnings.push(`Cette sauvegarde contient moins d’événements XP (${summary.counts.xpEvents}) que vos données actuelles (${current.counts.xpEvents}) : ce qui a été enregistré depuis sera perdu.`)
    if (summary.totalXp < current.totalXp) warnings.push(`XP totale plus basse dans la sauvegarde (${summary.totalXp} contre ${current.totalXp} actuellement).`)
    if (r.issues.length) warnings.push(`Le journal d’XP de cette sauvegarde présente ${r.issues.length} anomalie(s) : ${r.issues.slice(0, 2).join(' ; ')}.`)
    if (env.schemaVersion < DB_SCHEMA_VERSION) warnings.push(`Sauvegarde d’un schéma plus ancien (v${env.schemaVersion}) : elle sera migrée vers la v${DB_SCHEMA_VERSION} sans perte.`)
    return {
      source, sourceId, createdAt: env.createdAt, reason: env.reason, schemaVersion: env.schemaVersion, tables: r.tables,
      checksum: await sha256Hex(canonicalStringify(r.tables)), summary, current, warnings, verification: toVerification(r, method),
    }
  }

  const api = {
    /** Vrai pendant une restauration : le planificateur ignore alors les changements. */
    isBusy: () => busy,

    async init() { await keyBundle() },

    async protectionStatus() {
      const p = (await keyBundle()).protection
      return { configured: !!p, createdAt: p?.createdAt ?? null, changedAt: p?.changedAt ?? null, testedAt: p?.testedAt ?? null, testedWith: p?.testedWith ?? null }
    },

    list: () => store.backups.orderBy('createdAt').reverse().toArray(),

    async lastBackupAt(): Promise<Date | null> {
      const [last] = await store.backups.orderBy('createdAt').reverse().limit(1).toArray()
      return last ? new Date(last.createdAt) : null
    },

    /** Crée une sauvegarde chiffrée locale et la vérifie par relecture. Retourne null si rien n'a changé (auto). */
    createBackup: (reason: BackupReason, o: { force?: boolean } = {}) => serial(() => createBackupUnsafe(reason, o.force ?? false)),

    /**
     * Définit la phrase secrète et génère la clé de secours (affichée UNE fois à l'appelant).
     * Teste réellement le déchiffrement avec les DEUX secrets avant de conclure.
     */
    setupProtection: (passphrase: string) => serial(async () => {
      const bundle = await keyBundle()
      if (bundle.protection) throw new BackupError('already_configured', 'Une phrase secrète est déjà définie.')
      const { wraps, recoveryKey } = await makeWraps(bundle.dek, passphrase)
      const protection: ProtectionInfo = { keyWraps: wraps, createdAt: now().toISOString(), changedAt: null, testedAt: null, testedWith: null }
      await store.keystore.put({ ...bundle, protection })
      await reseal(wraps)
      try {
        const meta = await createBackupUnsafe('setup', true)
        if (!meta) throw new BackupError('verification_failed', 'Sauvegarde de test non créée.')
        const a = await verifyStoredUnsafe(meta.id, { passphrase })
        const b = await verifyStoredUnsafe(meta.id, { recoveryKey })
        if (!isGood(a) || !isGood(b)) throw new BackupError('verification_failed', 'Le test de déchiffrement a échoué.')
        return { recoveryKey, backupId: meta.id, test: { passphrase: true, recovery: true } }
      } catch (e) {
        await store.keystore.put({ ...bundle, protection: null })
        await reseal(null)
        throw e instanceof BackupError ? e : new BackupError('verification_failed', 'Le test de déchiffrement a échoué.')
      }
    }),

    /** Teste réellement la récupération d'une sauvegarde avec un secret ; enregistre le résultat. */
    verifyBackup: (id: string, secret?: Secret) => serial(() => verifyStoredUnsafe(id, secret ?? null)),

    /** Re-vérifie (par déchiffrement avec la clé de l'appareil) toutes les sauvegardes. */
    verifyAll: () => serial(async () => {
      const out: Record<string, Verification> = {}
      for (const m of await store.backups.toArray()) out[m.id] = await verifyStoredUnsafe(m.id, null)
      return out
    }),

    /** Change la phrase secrète (la clé de secours reste valable). Exige l'ancien secret. */
    changePassphrase: (current: Secret, next: string) => serial(async () => {
      const bundle = await keyBundle()
      if (!bundle.protection) throw new BackupError('not_configured', 'Aucune phrase secrète n’est définie.')
      const { dek } = await dekForSecret(bundle.protection.keyWraps, current)
      const same = toB64(await dekToRaw(dek)) === toB64(await dekToRaw(bundle.dek))
      if (!same) throw new BackupError('corrupt', 'Le secret ne correspond pas à la clé de cet appareil.')
      const { wraps } = await makeWraps(bundle.dek, next)
      const merged: KeyWraps = { pass: wraps.pass, recovery: bundle.protection.keyWraps.recovery }
      await store.keystore.put({ ...bundle, protection: { ...bundle.protection, keyWraps: merged, changedAt: now().toISOString(), testedAt: null, testedWith: null } })
      await reseal(merged)
      const [latest] = await store.backups.orderBy('createdAt').reverse().limit(1).toArray()
      const v = latest ? await verifyStoredUnsafe(latest.id, { passphrase: next }) : null
      if (!v || !isGood(v)) throw new BackupError('verification_failed', 'Le test avec la nouvelle phrase a échoué.')
      return { tested: true }
    }),

    /**
     * Dernier recours si la phrase ET la clé de secours sont perdues mais que l'appareil fonctionne :
     * nouvelle phrase + nouvelle clé de secours à partir de la clé de l'appareil. Les anciens FICHIERS
     * exportés restent protégés par leurs anciens secrets uniquement.
     */
    resetFromDevice: (newPassphrase: string) => serial(async () => {
      const bundle = await keyBundle()
      const { wraps, recoveryKey } = await makeWraps(bundle.dek, newPassphrase)
      await store.keystore.put({ ...bundle, protection: { keyWraps: wraps, createdAt: bundle.protection?.createdAt ?? now().toISOString(), changedAt: now().toISOString(), testedAt: null, testedWith: null } })
      await reseal(wraps)
      const meta = await createBackupUnsafe('manual-snapshot', true)
      if (!meta) throw new BackupError('verification_failed', 'Sauvegarde de test non créée.')
      const a = await verifyStoredUnsafe(meta.id, { passphrase: newPassphrase })
      const b = await verifyStoredUnsafe(meta.id, { recoveryKey })
      if (!isGood(a) || !isGood(b)) throw new BackupError('verification_failed', 'Le test de déchiffrement a échoué.')
      return { recoveryKey }
    }),

    /**
     * Export manuel : fichier chiffré autonome, lisible sur n'importe quel appareil avec la phrase secrète
     * OU la clé de secours. Le fichier produit est relu et déchiffré avec la phrase fournie avant d'être remis.
     */
    exportFile: (passphrase: string) => serial(async () => {
      const bundle = await keyBundle()
      if (!bundle.protection) throw new BackupError('not_configured', 'Définissez d’abord une phrase secrète : un fichier d’export doit pouvoir être ouvert hors de cet appareil.')
      await dekForSecret(bundle.protection.keyWraps, { passphrase }) // refuse tôt une phrase incorrecte
      const meta = await createBackupUnsafe('manual-export', true)
      if (!meta) throw new BackupError('verification_failed', 'Sauvegarde non créée.')
      const content = JSON.stringify(await toEnvelope(meta))
      const { dek, method } = await dekForSecret(parseEnvelopeText(content).keyWraps, { passphrase })
      const r = await openEnvelope(parseEnvelopeText(content), dek)
      if (r.payload.checksum !== meta.contentHash) throw new BackupError('verification_failed', 'Le fichier relu ne correspond pas aux données.')
      const verification = toVerification(r, method)
      await store.backups.update(meta.id, { verification })
      await markTested('passphrase')
      const d = now()
      const pad = (n: number) => String(n).padStart(2, '0')
      const filename = `level-sauvegarde-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.levelbackup`
      return { filename, content, meta, verification }
    }),

    // ── Restauration ─────────────────────────────────────────────────
    /** Prépare la restauration d'un point local (clé de l'appareil, ou secret pour un test indépendant). Ne modifie rien. */
    prepareRestoreFromBackup: async (id: string, secret?: Secret): Promise<RestorePlan> => {
      const meta = await store.backups.get(id)
      if (!meta) throw new BackupError('not_found', 'Sauvegarde introuvable.')
      const { dek, method } = secret ? await dekForSecret(meta.keyWraps, secret) : { dek: (await keyBundle()).dek, method: 'device' as const }
      return buildPlan(await toEnvelope(meta), dek, 'local', id, method)
    },

    /** Prépare la restauration d'un fichier exporté. Ne modifie rien. */
    prepareRestoreFromFile: async (text: string, secret: Secret): Promise<RestorePlan> => {
      const env = parseEnvelopeText(text)
      const { dek, method } = await dekForSecret(env.keyWraps, secret)
      return buildPlan(env, dek, 'file', null, method)
    },

    /**
     * Applique un plan : sauvegarde de sécurité des données actuelles, remplacement atomique, vérification
     * (contenu, comptages, journal, XP) et retour arrière automatique si la vérification échoue.
     */
    applyRestore: (plan: RestorePlan) => serial(async (): Promise<RestoreReport> => {
      busy = true
      try {
        const before = await readTables(main)
        let safetyBackupId: string | null = null
        if (hasData(before)) {
          const safety = await createBackupUnsafe('pre-restore', true)
          if (!safety || !isGood(safety.verification)) throw new BackupError('restore_failed', 'La sauvegarde de sécurité de vos données actuelles a échoué : restauration annulée, rien n’a été modifié.')
          safetyBackupId = safety.id
        }
        try {
          await writeTables(main, plan.tables)
        } catch {
          throw new BackupError('restore_failed', 'Écriture impossible : vos données actuelles sont intactes.')
        }
        const after = await readTables(main)
        const afterCounts = countTables(after)
        const wantedCounts = countTables(plan.tables)
        const issues = auditTables(after)
        const checks: RestoreCheck[] = [
          { id: 'content', label: 'Contenu identique à la sauvegarde', ok: (await sha256Hex(canonicalStringify(after))) === plan.checksum },
          { id: 'counts', label: 'Nombre d’éléments par table', ok: TABLE_NAMES.every((n) => afterCounts[n] === wantedCounts[n]), detail: TABLE_NAMES.map((n) => `${n} ${afterCounts[n]}`).join(', ') },
          { id: 'xp', label: 'XP totale recalculée', ok: xpOfTables(after) === plan.summary.totalXp, detail: `${xpOfTables(after)} XP` },
          { id: 'ledger', label: 'Journal d’XP cohérent', ok: issues.length === 0, detail: issues.slice(0, 2).join(' ; ') || undefined },
        ]
        const integrity = checks.slice(0, 3).every((c) => c.ok)
        if (!integrity) {
          await writeTables(main, before) // retour arrière
          return { ok: false, rolledBack: true, checks, safetyBackupId, totalXp: xpOfTables(before), level: summarize(before).level }
        }
        busy = false
        await createBackupUnsafe('post-restore', true)
        const s = summarize(after)
        return { ok: true, rolledBack: false, checks, safetyBackupId, totalXp: s.totalXp, level: s.level }
      } finally {
        busy = false
      }
    }),

    deleteBackup: (id: string) => serial(async () => {
      await store.transaction('rw', [store.backups, store.blobs], async () => {
        await store.backups.delete(id)
        await store.blobs.delete(id)
      })
    }),

    applyRetention: () => serial(applyRetentionUnsafe),
  }
  return api
}

export type BackupService = ReturnType<typeof createBackupService>
