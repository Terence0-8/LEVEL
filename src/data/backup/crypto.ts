/**
 * Cryptographie des sauvegardes — WebCrypto uniquement (aucune dépendance, aucun serveur).
 *
 *  - Données : AES-256-GCM (chiffrement authentifié : toute altération est détectée).
 *  - Clé de données (DEK) : aléatoire, 256 bits. Jamais dérivée directement d'un mot de passe.
 *  - La DEK est encapsulée DEUX fois (chiffrement à enveloppe) :
 *      · par une clé dérivée de la PHRASE SECRÈTE (PBKDF2-SHA-256, 600 000 itérations, sel aléatoire) ;
 *      · par une clé dérivée de la CLÉ DE SECOURS (160 bits aléatoires, HKDF-SHA-256).
 *    Perdre l'un des deux secrets n'empêche donc pas de récupérer les données.
 */

type Bytes = Uint8Array<ArrayBuffer>
const enc = new TextEncoder()
const dec = new TextDecoder()

export type BackupCryptoErrorCode = 'wrong_secret' | 'corrupt' | 'invalid_secret'
export class BackupCryptoError extends Error {
  constructor(public code: BackupCryptoErrorCode, message: string) {
    super(message)
  }
}

export const PBKDF2_ITERATIONS = 600_000
export const MIN_PASSPHRASE_LENGTH = 10
const MAX_ITERATIONS = 10_000_000
const MIN_ITERATIONS = 1_000

// ── Encodage ──────────────────────────────────────────────────────
export function toB64(bytes: Uint8Array): string {
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(s)
}

export function fromB64(b64: string): Bytes {
  try {
    const s = atob(b64)
    const out = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
    return out
  } catch {
    throw new BackupCryptoError('corrupt', 'Encodage base64 invalide.')
  }
}

export const randomBytes = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n))

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Clé de secours (160 bits, Base32 Crockford, groupes de 4) ──────────
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function generateRecoveryKey(): string {
  const bytes = randomBytes(20)
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  return out.match(/.{4}/g)!.join('-')
}

/** Normalise une saisie (casse, tirets, espaces, I/L→1, O→0) et retourne les octets, ou null si invalide. */
export function parseRecoveryKey(input: string): Bytes | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
  if (clean.length !== 32 || [...clean].some((c) => !B32.includes(c))) return null
  const out: number[] = []
  let bits = 0, value = 0
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c)
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return new Uint8Array(out)
}

// ── Dérivation des clés d'encapsulation ─────────────────────────────
export const normalizePassphrase = (p: string) => p.normalize('NFKC')

export async function kekFromPassphrase(passphrase: string, salt: Bytes, iterations: number): Promise<CryptoKey> {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS)
    throw new BackupCryptoError('corrupt', 'Paramètres de dérivation invalides.')
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function kekFromRecoveryKey(recoveryKey: string, salt: Bytes): Promise<CryptoKey> {
  const raw = parseRecoveryKey(recoveryKey)
  if (!raw) throw new BackupCryptoError('invalid_secret', 'Clé de secours invalide : 32 caractères attendus (lettres et chiffres).')
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('level-backup-recovery-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

// ── Clé de données ───────────────────────────────────────────────
export const generateDek = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
export const dekFromRaw = (raw: Bytes) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
export async function dekToRaw(dek: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', dek))
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<{ iv: string; wrapped: string }> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, await dekToRaw(dek))
  return { iv: toB64(iv), wrapped: toB64(new Uint8Array(ct)) }
}

/** Échoue avec `wrong_secret` si le secret est incorrect (l'authentification GCM échoue). */
export async function unwrapDek(w: { iv: string; wrapped: string }, kek: CryptoKey): Promise<CryptoKey> {
  try {
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(w.iv) }, kek, fromB64(w.wrapped))
    return await dekFromRaw(new Uint8Array(raw))
  } catch (e) {
    if (e instanceof BackupCryptoError) throw e
    throw new BackupCryptoError('wrong_secret', 'Secret incorrect.')
  }
}

// ── Chiffrement de la charge utile ─────────────────────────────────
export async function encryptJson(dek: CryptoKey, value: unknown, aad: string) {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, dek, enc.encode(JSON.stringify(value)))
  return { iv: toB64(iv), ciphertext: toB64(new Uint8Array(ct)) }
}

export async function decryptJson(dek: CryptoKey, iv: string, ciphertext: string, aad: string): Promise<unknown> {
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: enc.encode(aad) }, dek, fromB64(ciphertext))
  } catch (e) {
    if (e instanceof BackupCryptoError) throw e
    throw new BackupCryptoError('corrupt', 'Déchiffrement impossible : données altérées ou clé incorrecte.')
  }
  try {
    return JSON.parse(dec.decode(plain))
  } catch {
    throw new BackupCryptoError('corrupt', 'Contenu déchiffré illisible.')
  }
}
