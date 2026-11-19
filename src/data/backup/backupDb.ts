import Dexie, { type Table } from 'dexie'
import type { BackupReason, KeyWraps, Verification } from '@/core/backupFormat'

/**
 * Base IndexedDB SÉPARÉE de la base applicative (`level`) : un bug, une migration défaillante ou une
 * corruption de `level` n'emporte pas les points de restauration. Même origine toutefois : voir docs
 * (risque résiduel) — seul l'export de fichier protège contre la perte du stockage du navigateur.
 */

export interface BackupMeta {
  id: string
  createdAt: string
  reason: BackupReason
  schemaVersion: number
  formatVersion: number
  appVersion: string
  /** Taille du chiffré en octets */
  size: number
  /** Empreinte du contenu (SHA-256 des tables) : sert à ne pas dupliquer une sauvegarde identique */
  contentHash: string
  keyWraps: KeyWraps | null
  verification: Verification | null
}

export interface BackupBlob {
  id: string
  iv: string
  ciphertext: string
}

export interface ProtectionInfo {
  keyWraps: KeyWraps
  createdAt: string
  changedAt: string | null
  /** Dernier test RÉEL de récupération avec un secret (phrase ou clé de secours) */
  testedAt: string | null
  testedWith: 'passphrase' | 'recovery' | 'both' | null
}

export interface KeystoreRow {
  id: 'main'
  /** Clé de données de cet appareil */
  dek: CryptoKey
  protection: ProtectionInfo | null
  createdAt: string
}

export class BackupDB extends Dexie {
  backups!: Table<BackupMeta, string>
  blobs!: Table<BackupBlob, string>
  keystore!: Table<KeystoreRow, string>

  constructor(name = 'level-backups') {
    super(name)
    this.version(1).stores({ backups: 'id, createdAt', blobs: 'id', keystore: 'id' })
  }
}

export const backupDb = new BackupDB()
