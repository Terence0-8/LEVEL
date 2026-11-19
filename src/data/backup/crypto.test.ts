import { describe, expect, it } from 'vitest'
import {
  BackupCryptoError, decryptJson, dekToRaw, encryptJson, fromB64, generateDek, generateRecoveryKey, kekFromPassphrase, kekFromRecoveryKey,
  parseRecoveryKey, randomBytes, sha256Hex, toB64, unwrapDek, wrapDek,
} from './crypto'

const ITER = 2000
const fails = async (p: Promise<unknown>) => p.then(() => null, (e) => (e instanceof BackupCryptoError ? e.code : 'other'))

describe('encodage et clé de secours', () => {
  it('base64 aller-retour, y compris gros volumes', () => {
    const b = new Uint8Array(200_000)
    for (let i = 0; i < b.length; i += 60_000) b.set(randomBytes(Math.min(60_000, b.length - i)), i)
    expect([...fromB64(toB64(b))].slice(0, 50)).toEqual([...b].slice(0, 50))
    expect(fromB64(toB64(b)).length).toBe(200_000)
  })
  it('génère des clés de secours 160 bits au format lisible, uniques', () => {
    const k = generateRecoveryKey()
    expect(k).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(parseRecoveryKey(k)).toHaveLength(20)
    expect(generateRecoveryKey()).not.toBe(k)
  })
  it('accepte minuscules, espaces et confusions I/L/O, refuse les saisies invalides', () => {
    const k = generateRecoveryKey()
    const noisy = k.toLowerCase().replace(/-/g, '  ')
    expect([...parseRecoveryKey(noisy)!]).toEqual([...parseRecoveryKey(k)!])
    expect(parseRecoveryKey('ABCD')).toBeNull()
    expect(parseRecoveryKey('U'.repeat(32))).toBeNull()
  })
  it('sha256 connu', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('chiffrement authentifié', () => {
  it('chiffre puis déchiffre à l’identique, avec un IV différent à chaque fois', async () => {
    const dek = await generateDek()
    const data = { titre: 'Écrire le rapport secret', n: [1, 2, 3] }
    const a = await encryptJson(dek, data, 'aad')
    const b = await encryptJson(dek, data, 'aad')
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(await decryptJson(dek, a.iv, a.ciphertext, 'aad')).toEqual(data)
    expect(new TextDecoder().decode(fromB64(a.ciphertext))).not.toContain('rapport')
  })
  it('détecte une clé incorrecte, des données altérées et un en-tête modifié', async () => {
    const dek = await generateDek()
    const s = await encryptJson(dek, { a: 1 }, 'aad')
    expect(await fails(decryptJson(await generateDek(), s.iv, s.ciphertext, 'aad'))).toBe('corrupt')
    expect(await fails(decryptJson(dek, s.iv, s.ciphertext, 'autre-aad'))).toBe('corrupt')
    const bytes = fromB64(s.ciphertext); bytes[3] ^= 1
    expect(await fails(decryptJson(dek, s.iv, toB64(bytes), 'aad'))).toBe('corrupt')
    expect(await fails(decryptJson(dek, s.iv, toB64(fromB64(s.ciphertext).slice(0, 5)), 'aad'))).toBe('corrupt')
    expect(await fails(decryptJson(dek, s.iv, '%%%pas-du-base64', 'aad'))).toBe('corrupt')
  })
})

describe('chiffrement à enveloppe : phrase secrète ET clé de secours', () => {
  it('chaque secret ouvre la même clé de données ; un mauvais secret échoue', async () => {
    const dek = await generateDek()
    const salt = randomBytes(16), rsalt = randomBytes(16)
    const recovery = generateRecoveryKey()
    const wp = await wrapDek(dek, await kekFromPassphrase('phrase très secrète 42', salt, ITER))
    const wr = await wrapDek(dek, await kekFromRecoveryKey(recovery, rsalt))
    const viaPass = await unwrapDek(wp, await kekFromPassphrase('phrase très secrète 42', salt, ITER))
    const viaRec = await unwrapDek(wr, await kekFromRecoveryKey(recovery.toLowerCase(), rsalt))
    expect(toB64(await dekToRaw(viaPass))).toBe(toB64(await dekToRaw(dek)))
    expect(toB64(await dekToRaw(viaRec))).toBe(toB64(await dekToRaw(dek)))
    expect(await fails(unwrapDek(wp, await kekFromPassphrase('mauvaise phrase!!', salt, ITER)))).toBe('wrong_secret')
    expect(await fails(unwrapDek(wr, await kekFromRecoveryKey(generateRecoveryKey(), rsalt)))).toBe('wrong_secret')
    expect(await fails(kekFromRecoveryKey('trop-court', rsalt))).toBe('invalid_secret')
  })
  it('normalise l’Unicode de la phrase (é composé = é décomposé)', async () => {
    const salt = randomBytes(16)
    const dek = await generateDek()
    const w = await wrapDek(dek, await kekFromPassphrase('café du matin !!', salt, ITER))
    expect(await unwrapDek(w, await kekFromPassphrase('café du matin !!', salt, ITER))).toBeTruthy()
  })
  it('refuse des paramètres de dérivation hors bornes (fichier hostile)', async () => {
    expect(await fails(kekFromPassphrase('x'.repeat(12), randomBytes(16), 10))).toBe('corrupt')
    expect(await fails(kekFromPassphrase('x'.repeat(12), randomBytes(16), 2_000_000_000))).toBe('corrupt')
  })
})
