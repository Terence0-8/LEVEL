import { auditLedger, normalizeEvent, totalXp, type XpEvent } from './ledger'

/**
 * Format des sauvegardes Level. Pur : aucune E/S ni cryptographie ici.
 * Une sauvegarde = une ENVELOPPE chiffrée (en-tête en clair authentifié + charge utile chiffrée).
 * La charge utile contient TOUTES les tables de la base : une restauration intégrale est possible.
 */

export const BACKUP_FORMAT = 'level-backup'
/** Version du format de fichier. Incrémenter si la structure de l'enveloppe ou de la charge utile change. */
export const BACKUP_FORMAT_VERSION = 1
/** Version du schéma Dexie couverte par ce code (doit égaler `db.verno` : vérifié par test). */
export const DB_SCHEMA_VERSION = 5
export const APP_VERSION = '0.6.0'

/** Toutes les tables de `LevelDB` et leur clé primaire. Toute nouvelle table DOIT être ajoutée ici. */
export const TABLE_KEYS = {
  profile: 'id',
  settings: 'key',
  demoQuestState: 'questId',
  categories: 'id',
  quests: 'id',
  xpEvents: 'id',
  analyses: 'id',
  revisions: 'id',
  sportProfile: 'id',
  exercisePrefs: 'exerciseId',
  customExercises: 'id',
  sportSessions: 'id',
  recoveryChecks: 'id',
  exerciseStates: 'exerciseId',
  progressionLog: 'id',
  bodyMeasures: 'id',
  commitments: 'id',
  planningMoves: 'id',
  notificationLog: 'id',
} as const

export type BackupTableName = keyof typeof TABLE_KEYS
export const TABLE_NAMES = Object.keys(TABLE_KEYS) as BackupTableName[]
export type BackupTables = Record<BackupTableName, Array<Record<string, unknown>>>

export type BackupReason =
  | 'auto-periodic' | 'auto-change' | 'auto-critical'
  | 'manual-snapshot' | 'manual-export' | 'setup' | 'pre-restore' | 'post-restore'

/** Sauvegardes jamais supprimées automatiquement par la rétention. */
export const PROTECTED_REASONS: BackupReason[] = ['manual-snapshot', 'manual-export', 'setup']
export const isAutoReason = (r: BackupReason) => r === 'auto-periodic' || r === 'auto-change' || r === 'auto-critical'

export interface BackupPayload {
  createdAt: string
  reason: BackupReason
  schemaVersion: number
  appVersion: string
  counts: Record<string, number>
  /** SHA-256 (hex) de `canonicalStringify(tables)` */
  checksum: string
  tables: Partial<BackupTables>
}

/** Sérialisation canonique (clés triées) : même contenu ⇒ même chaîne, quel que soit l'ordre des propriétés. */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']'
  const o = value as Record<string, unknown>
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonicalStringify(o[k])).join(',') + '}'
}

export function countTables(tables: Partial<BackupTables>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of TABLE_NAMES) out[n] = tables[n]?.length ?? 0
  return out
}

export type Compat = { ok: true } | { ok: false; code: 'unknown_format' | 'format_too_new' | 'schema_too_new' | 'invalid_payload'; message: string }

export function checkEnvelopeCompat(env: { format: unknown; formatVersion: unknown }): Compat {
  if (env.format !== BACKUP_FORMAT) return { ok: false, code: 'unknown_format', message: 'Ce fichier n’est pas une sauvegarde Level.' }
  if (typeof env.formatVersion !== 'number' || !Number.isInteger(env.formatVersion) || env.formatVersion < 1)
    return { ok: false, code: 'invalid_payload', message: 'Version de format illisible.' }
  if (env.formatVersion > BACKUP_FORMAT_VERSION)
    return { ok: false, code: 'format_too_new', message: `Sauvegarde créée par une version plus récente de Level (format ${env.formatVersion}, cette version lit jusqu’au format ${BACKUP_FORMAT_VERSION}). Mettez Level à jour.` }
  return { ok: true }
}

export function checkSchemaCompat(schemaVersion: unknown): Compat {
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1)
    return { ok: false, code: 'invalid_payload', message: 'Version de schéma illisible.' }
  if (schemaVersion > DB_SCHEMA_VERSION)
    return { ok: false, code: 'schema_too_new', message: `Cette sauvegarde utilise un schéma de données plus récent (v${schemaVersion}) que cette version de Level (v${DB_SCHEMA_VERSION}). Mettez Level à jour avant de restaurer.` }
  return { ok: true }
}

/** Valide la forme d'une charge utile déchiffrée. Retourne la liste des problèmes (vide = conforme). */
export function validatePayloadShape(raw: unknown): { payload: BackupPayload | null; problems: string[] } {
  const problems: string[] = []
  if (!raw || typeof raw !== 'object') return { payload: null, problems: ['charge utile illisible'] }
  const p = raw as Partial<BackupPayload>
  if (typeof p.createdAt !== 'string' || Number.isNaN(Date.parse(p.createdAt))) problems.push('date de création invalide')
  if (typeof p.checksum !== 'string' || !/^[0-9a-f]{64}$/.test(p.checksum)) problems.push('somme de contrôle absente ou invalide')
  if (!p.tables || typeof p.tables !== 'object') problems.push('tables absentes')
  else for (const [k, v] of Object.entries(p.tables)) {
    if (!(k in TABLE_KEYS)) problems.push(`table inconnue : ${k}`)
    else if (!Array.isArray(v)) problems.push(`table mal formée : ${k}`)
    else {
      const key = TABLE_KEYS[k as BackupTableName]
      const bad = (v as unknown[]).filter((r) => !r || typeof r !== 'object' || (r as Record<string, unknown>)[key] === undefined).length
      if (bad) problems.push(`${bad} ligne(s) sans clé dans ${k}`)
    }
  }
  return { payload: problems.length ? null : (p as BackupPayload), problems }
}

/**
 * Amène les tables d'une sauvegarde plus ancienne au schéma courant : tables absentes → vides,
 * champs d'événements ajoutés depuis → complétés. Jamais destructif.
 */
export function migrateTables(tables: Partial<BackupTables>, fromSchema: number): BackupTables {
  const out = {} as BackupTables
  for (const n of TABLE_NAMES) out[n] = (tables[n] ?? []).map((r) => ({ ...r }))
  void fromSchema // chaque version ajoute des tables ou des champs optionnels : le remplissage ci-dessus suffit jusqu'à la v3
  out.xpEvents = out.xpEvents.map((e) => normalizeEvent(e as unknown as Partial<XpEvent> & Pick<XpEvent, 'id' | 'at'>) as unknown as Record<string, unknown>)
  return out
}

/** Cohérence LOGIQUE des données : journal d'XP sain. Les anomalies ne bloquent pas, elles sont signalées. */
export function auditTables(tables: Partial<BackupTables>): string[] {
  const events = (tables.xpEvents ?? []).map((e) => normalizeEvent(e as unknown as Partial<XpEvent> & Pick<XpEvent, 'id' | 'at'>))
  return auditLedger(events)
}

export function xpOfTables(tables: Partial<BackupTables>): number {
  return totalXp((tables.xpEvents ?? []).map((e) => normalizeEvent(e as unknown as Partial<XpEvent> & Pick<XpEvent, 'id' | 'at'>)))
}

// ─── Enveloppe chiffrée ─────────────────────────────────────────

/** Une clé de données (DEK) encapsulée par un secret. */
export interface WrappedKey {
  iv: string
  wrapped: string
}
export interface KeyWraps {
  pass: WrappedKey & { kdf: 'PBKDF2-SHA256'; iterations: number; salt: string }
  recovery: WrappedKey & { kdf: 'HKDF-SHA256'; salt: string }
}

export interface Envelope {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  id: string
  createdAt: string
  reason: BackupReason
  appVersion: string
  schemaVersion: number
  cipher: 'AES-256-GCM'
  iv: string
  ciphertext: string
  /** null tant qu'aucune phrase secrète n'est définie : la sauvegarde n'est alors lisible que sur cet appareil */
  keyWraps: KeyWraps | null
}

/** Données authentifiées (AAD) : toute modification de l'en-tête est détectée au déchiffrement. */
export const aadFor = (e: Pick<Envelope, 'format' | 'formatVersion' | 'id' | 'createdAt' | 'schemaVersion' | 'reason'>) =>
  canonicalStringify({ format: e.format, formatVersion: e.formatVersion, id: e.id, createdAt: e.createdAt, schemaVersion: e.schemaVersion, reason: e.reason })

export type VerificationStatus = 'ok' | 'warning' | 'corrupt' | 'incompatible'
export type VerificationMethod = 'device' | 'passphrase' | 'recovery'

export interface Verification {
  checkedAt: string
  status: VerificationStatus
  /** Comment le déchiffrement a été réellement testé */
  method: VerificationMethod
  counts?: Record<string, number>
  totalXp?: number
  issues: string[]
}
