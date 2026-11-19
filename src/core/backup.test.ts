import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT, BACKUP_FORMAT_VERSION, canonicalStringify, checkEnvelopeCompat, checkSchemaCompat, countTables, DB_SCHEMA_VERSION,
  migrateTables, TABLE_NAMES, validatePayloadShape, xpOfTables,
} from './backupFormat'
import { backupHealth, BACKUP_POLICY, selectBackupsToDelete, type BackupListItem } from './backupPolicy'
import type { Verification } from './backupFormat'

const ok: Verification = { checkedAt: '', status: 'ok', method: 'device', issues: [] }
const bad: Verification = { checkedAt: '', status: 'corrupt', method: 'device', issues: ['x'] }
const item = (id: string, createdAt: string, reason: BackupListItem['reason'] = 'auto-change', verification: Verification | null = ok): BackupListItem => ({ id, createdAt, reason, verification })
const NOW = new Date('2026-11-19T12:00:00')

describe('format de sauvegarde', () => {
  it('sérialise de façon canonique (ordre des clés sans effet)', () => {
    expect(canonicalStringify({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonicalStringify({ a: [{ c: 2, d: 1 }], b: 1 }))
    expect(canonicalStringify({ a: undefined, b: 1 })).toBe('{"b":1}')
  })
  it('refuse un format inconnu ou plus récent, accepte le format courant', () => {
    expect(checkEnvelopeCompat({ format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION })).toEqual({ ok: true })
    expect(checkEnvelopeCompat({ format: 'autre', formatVersion: 1 })).toMatchObject({ ok: false, code: 'unknown_format' })
    expect(checkEnvelopeCompat({ format: BACKUP_FORMAT, formatVersion: 99 })).toMatchObject({ ok: false, code: 'format_too_new' })
    expect(checkEnvelopeCompat({ format: BACKUP_FORMAT, formatVersion: 'x' })).toMatchObject({ ok: false })
  })
  it('refuse un schéma plus récent, accepte les schémas courants et plus anciens', () => {
    expect(checkSchemaCompat(DB_SCHEMA_VERSION).ok).toBe(true)
    expect(checkSchemaCompat(1).ok).toBe(true)
    expect(checkSchemaCompat(DB_SCHEMA_VERSION + 1)).toMatchObject({ ok: false, code: 'schema_too_new' })
    expect(checkSchemaCompat(0).ok).toBe(false)
  })
  it('valide la forme de la charge utile', () => {
    const good = { createdAt: '2026-01-01T00:00:00Z', checksum: 'a'.repeat(64), tables: { quests: [{ id: 'q' }] } }
    expect(validatePayloadShape(good).payload).not.toBeNull()
    expect(validatePayloadShape({ ...good, checksum: 'zz' }).problems).toContain('somme de contrôle absente ou invalide')
    expect(validatePayloadShape({ ...good, tables: { inconnue: [] } }).problems.join()).toMatch(/table inconnue/)
    expect(validatePayloadShape({ ...good, tables: { quests: [{ titre: 'sans id' }] } }).problems.join()).toMatch(/sans clé/)
    expect(validatePayloadShape(null).payload).toBeNull()
  })
  it('migre un ancien schéma sans rien perdre', () => {
    const old = { quests: [{ id: 'q1' }], xpEvents: [{ id: 'e1', at: '2026-01-01T00:00:00Z', amount: 10, kind: 'award' }] }
    const t = migrateTables(old, 1)
    expect(TABLE_NAMES.every((n) => Array.isArray(t[n]))).toBe(true)
    expect(t.analyses).toEqual([])
    expect(t.revisions).toEqual([])
    expect(t.quests).toEqual([{ id: 'q1' }])
    expect(t.xpEvents[0]).toMatchObject({ id: 'e1', amount: 10, retroactive: false, credit: null, note: '' })
    expect(countTables(t).xpEvents).toBe(1)
    expect(xpOfTables(old)).toBe(10)
  })
})

describe('rétention des sauvegardes', () => {
  const many = (n: number, hoursApart: number) =>
    Array.from({ length: n }, (_, i) => item(`a${i}`, new Date(NOW.getTime() - i * hoursApart * 3_600_000).toISOString()))

  it('conserve les récentes, une par jour puis une par semaine, supprime le reste', () => {
    const list = many(120, 6)
    const doomed = new Set(selectBackupsToDelete(list, NOW))
    const kept = list.filter((i) => !doomed.has(i.id))
    expect(kept.length).toBeLessThan(list.length)
    expect(kept.length).toBeLessThanOrEqual(BACKUP_POLICY.keepRecent + BACKUP_POLICY.keepDaily + BACKUP_POLICY.keepWeekly + 1)
    for (const i of list.slice(0, BACKUP_POLICY.keepRecent)) expect(doomed.has(i.id)).toBe(false)
  })
  it('ne supprime jamais les sauvegardes manuelles, d’export ou d’initialisation', () => {
    const list = [...many(40, 24), item('m1', '2025-01-01T00:00:00Z', 'manual-snapshot'), item('m2', '2025-01-02T00:00:00Z', 'manual-export'), item('m3', '2025-01-03T00:00:00Z', 'setup')]
    const doomed = selectBackupsToDelete(list, NOW)
    expect(doomed).not.toContain('m1'); expect(doomed).not.toContain('m2'); expect(doomed).not.toContain('m3')
  })
  it('limite les sauvegardes de sécurité avant restauration', () => {
    const list = Array.from({ length: 9 }, (_, i) => item(`p${i}`, new Date(NOW.getTime() - i * 3_600_000).toISOString(), 'pre-restore'))
    expect(selectBackupsToDelete(list, NOW)).toHaveLength(9 - BACKUP_POLICY.keepPreRestore)
  })
  it('conserve toujours la plus récente sauvegarde vérifiée, même ancienne', () => {
    const list = [
      ...Array.from({ length: 12 }, (_, i) => item(`c${i}`, new Date(NOW.getTime() - i * 3_600_000).toISOString(), 'auto-change', bad)),
      item('old-ok', '2026-01-01T00:00:00Z', 'auto-change', ok),
    ]
    expect(selectBackupsToDelete(list, NOW)).not.toContain('old-ok')
  })
})

describe('état de santé', () => {
  const recent = item('r', new Date(NOW.getTime() - 3_600_000).toISOString())
  it('critique sans sauvegarde ou si la dernière est illisible', () => {
    expect(backupHealth([], { configured: true, testedAt: 'x' }, NOW).level).toBe('critical')
    expect(backupHealth([item('x', NOW.toISOString(), 'auto-change', bad)], { configured: true, testedAt: 'x' }, NOW).level).toBe('critical')
  })
  it('attention sans phrase secrète, sans test de récupération ou si trop ancienne', () => {
    expect(backupHealth([recent], { configured: false }, NOW).level).toBe('attention')
    expect(backupHealth([recent], { configured: true, testedAt: null }, NOW).messages.join()).toMatch(/pas encore été testée/)
    expect(backupHealth([item('o', '2026-11-10T00:00:00Z')], { configured: true, testedAt: 'x' }, NOW).level).toBe('attention')
  })
  it('ok seulement avec sauvegarde récente vérifiée ET récupération testée', () => {
    expect(backupHealth([recent], { configured: true, testedAt: '2026-11-19T00:00:00Z' }, NOW)).toEqual({ level: 'ok', messages: [] })
  })
})
