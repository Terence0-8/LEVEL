import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '@/data/questService'
import { computeQuestReward } from '../rewards'
import type { Quest } from '../quest'
import { packLoad, PACK_LIMITS, packTemplates, searchTemplates, templateStatus, hasUpdate, xpHint, normTitle, templateToQuestInput, allTemplates } from './catalog'
import { QUEST_PACKS, QUEST_TEMPLATES } from './lifeCatalog'
import { EMPTY_CATALOG, type CatalogState } from './types'

const quest = (o: Partial<Quest>): Quest => ({ id: 'q', type: 'personal', title: 'x', description: '', categoryId: 'cat-pro', priority: 'normal', dueDate: null, difficulty: 'normal', effortMinutes: 30, steps: [], rewardXp: 10, archived: false, createdAt: 0, updatedAt: 0, ...o })

describe('Catalogue LIFE : intégrité des modèles', () => {
  it('identifiants uniques, stables et versionnés', () => {
    const ids = QUEST_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of QUEST_TEMPLATES) { expect(t.id).toMatch(/^life\.[a-z]{3}\.[a-z0-9-]+$/); expect(t.v).toBeGreaterThanOrEqual(1) }
    expect(new Set(QUEST_PACKS.map((p) => p.id)).size).toBe(QUEST_PACKS.length)
  })
  it('chaque modèle est complet et rattaché à une catégorie existante', () => {
    const cats = new Set(DEFAULT_CATEGORIES.map((c) => c.id))
    for (const t of QUEST_TEMPLATES) {
      expect(cats.has(t.categoryId), t.id).toBe(true)
      expect(t.name.length, t.id).toBeGreaterThan(5); expect(t.description.length, t.id).toBeGreaterThan(15); expect(t.tags.length, t.id).toBeGreaterThan(0)
      expect(t.minutes, t.id).toBeGreaterThanOrEqual(5); expect(t.minutes, t.id).toBeLessThanOrEqual(240)
      expect(['daily', 'weekly', 'personal', 'exceptional']).toContain(t.type)
      expect(t.name.length, t.id).toBeLessThanOrEqual(80) // limite du titre d'une quête
    }
  })
  it('les sept catégories sont couvertes (au moins six modèles chacune) et tous les types existent', () => {
    for (const c of DEFAULT_CATEGORIES) expect(QUEST_TEMPLATES.filter((t) => t.categoryId === c.id).length, c.id).toBeGreaterThanOrEqual(6)
    for (const type of ['daily', 'weekly', 'personal', 'exceptional'] as const) expect(QUEST_TEMPLATES.some((t) => t.type === type), type).toBe(true)
    expect(QUEST_TEMPLATES.some((t) => (t.steps?.length ?? 0) >= 2), 'quêtes de progression à étapes').toBe(true)
    expect(QUEST_TEMPLATES.length).toBeGreaterThanOrEqual(50)
  })
  it('aucun titre en double (évite les doublons à l’ajout)', () => {
    const titles = QUEST_TEMPLATES.map((t) => normTitle(t.name)); expect(new Set(titles).size).toBe(titles.length)
  })
  it('l’XP affichée est calculée par le moteur existant (core/rewards), jamais décidée par le modèle', () => {
    for (const t of QUEST_TEMPLATES) { expect(xpHint(t)).toBe(computeQuestReward({ difficulty: t.difficulty, effortMinutes: t.minutes })); expect(xpHint(t)).toBeGreaterThan(0) }
    expect(Object.keys(QUEST_TEMPLATES[0])).not.toContain('xp'); expect(Object.keys(QUEST_TEMPLATES[0])).not.toContain('rewardXp')
  })
  it('les exemples du cahier des charges sont présents', () => {
    const names = QUEST_TEMPLATES.map((t) => t.name).join(' | ')
    for (const wanted of ['Lire pendant 20 minutes', 'Mettre à jour son budget', 'Prendre des nouvelles d’un proche', 'Avancer sur un projet personnel', 'Marcher quotidiennement', 'Effectuer une veille professionnelle']) expect(names).toContain(wanted)
  })
})

describe('Packs de démarrage : légers, cohérents, facultatifs', () => {
  it('les six packs attendus existent et ne référencent que des modèles existants', () => {
    expect(QUEST_PACKS.length).toBeGreaterThanOrEqual(6)
    for (const p of QUEST_PACKS) { expect(packTemplates(p, EMPTY_CATALOG).length, p.id).toBe(p.templateIds.length); expect(p.forWho.length).toBeGreaterThan(10) }
  })
  it('aucune charge excessive : au plus trois quêtes quotidiennes et six éléments par pack', () => {
    for (const p of QUEST_PACKS) { const l = packLoad(p, EMPTY_CATALOG); expect(l.daily, p.id).toBeLessThanOrEqual(PACK_LIMITS.maxDaily); expect(l.items, p.id).toBeLessThanOrEqual(PACK_LIMITS.maxItems); expect(l.dailyMinutes, p.id).toBeLessThanOrEqual(75) }
  })
})

describe('Recherche, filtres et détection des doublons', () => {
  const all = allTemplates(EMPTY_CATALOG)
  it('recherche insensible aux accents et à la casse, sur le nom, la description et les tags', () => {
    expect(searchTemplates(all, { query: 'LECTURE' }, []).length).toBeGreaterThan(1)
    expect(searchTemplates(all, { query: 'epargne' }, []).some((t) => t.id === 'life.fin.epargne')).toBe(true)
    expect(searchTemplates(all, { query: 'zzzzqqq' }, [])).toEqual([])
  })
  it('filtres : catégorie, type, durée, favoris', () => {
    expect(searchTemplates(all, { categoryId: 'cat-fin' }, [])).toEqual([])
    expect(searchTemplates(all, { categoryId: 'cat-finances' }, []).every((t) => t.categoryId === 'cat-finances')).toBe(true)
    expect(searchTemplates(all, { type: 'daily' }, []).every((t) => t.type === 'daily')).toBe(true)
    expect(searchTemplates(all, { duration: 'short' }, []).every((t) => t.minutes <= 20)).toBe(true)
    expect(searchTemplates(all, { favoritesOnly: true }, ['life.cul.lecture']).map((t) => t.id)).toEqual(['life.cul.lecture'])
  })
  it('« déjà ajouté » (quête issue du modèle encore active), « proche » (même titre), sinon « nouveau » ; une quête archivée ou supprimée ne compte plus', () => {
    const t = QUEST_TEMPLATES.find((x) => x.id === 'life.cul.lecture')!
    const st: CatalogState = { ...EMPTY_CATALOG, installed: { [t.id]: [{ questId: 'q1', v: 1, at: '2026-01-01' }] } }
    expect(templateStatus(t, [quest({ id: 'q1', title: 'Ma lecture' })], st)).toBe('added')
    expect(templateStatus(t, [quest({ id: 'q1', title: 'Ma lecture', archived: true })], st)).toBe('new')
    expect(templateStatus(t, [], st)).toBe('new')
    expect(templateStatus(t, [quest({ id: 'q2', title: 'lire pendant 20 minutes !' })], EMPTY_CATALOG)).toBe('similar')
  })
  it('une version plus récente du modèle est signalée sans rien écraser', () => {
    const t = { ...QUEST_TEMPLATES[0], v: 2 }
    expect(hasUpdate(t, { ...EMPTY_CATALOG, installed: { [t.id]: [{ questId: 'q', v: 1, at: 'x' }] } })).toBe(true)
    expect(hasUpdate(t, { ...EMPTY_CATALOG, installed: { [t.id]: [{ questId: 'q', v: 2, at: 'x' }] } })).toBe(false)
  })
  it('un modèle devient une entrée de quête valide, personnalisable (fréquence, durée)', () => {
    const t = QUEST_TEMPLATES.find((x) => x.id === 'life.pro.presentation')!
    const i = templateToQuestInput(t, { type: 'weekly', minutes: 30 })
    expect(i).toMatchObject({ type: 'weekly', effortMinutes: 30, categoryId: 'cat-pro', title: t.name }); expect(i.steps).toHaveLength(3)
  })
})
