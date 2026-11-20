import { useMemo, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Sheet } from '@/design/Sheet'
import { Field, inputClass, Segmented } from '@/design/Form'
import sheet from '@/design/sheet.module.css'
import { allTemplates, DIFFICULTY_LABEL, DURATION_FILTERS, frequencyLabel, hasUpdate, packLoad, packTemplates, QUEST_PACKS, searchTemplates, templateStatus, TYPE_FILTERS, xpHint, type TemplateFilter } from '@/core/catalog/catalog'
import type { QuestPack, QuestTemplate } from '@/core/catalog/types'
import type { QuestType } from '@/core/quest'
import { catalogService, CatalogError } from '@/data/catalogService'
import { Icon } from '@/design/Icon'
import s from './library.module.css'

const msg = (e: unknown) => (e instanceof CatalogError ? e.message : 'Action impossible pour le moment.')

/**
 * Bibliothèque de quêtes : choisir plutôt que créer. Un modèle ajouté devient une vraie quête (XP calculée par le moteur à la validation).
 * Parcours : catégorie → quêtes proposées → Ajouter (ou Personnaliser) → la quête est déjà dans « Quêtes ».
 */
export function LibraryPanel({ openQuests }: { openQuests: () => void }) {
  const { categories, quests, catalog } = useAppState()
  const [category, setCategory] = useState<string>('')
  const [special, setSpecial] = useState<'' | 'fav' | 'custom'>('')
  const [type, setType] = useState<QuestType | 'all'>('all')
  const [duration, setDuration] = useState<'all' | 'short' | 'medium' | 'long'>('all')
  const [query, setQuery] = useState('')
  const [pack, setPack] = useState<QuestPack | null>(null)
  const [custom, setCustom] = useState<QuestTemplate | null>(null)
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null)

  const all = useMemo(() => allTemplates(catalog), [catalog])
  const filter: TemplateFilter = { categoryId: category || undefined, type, duration, query, favoritesOnly: special === 'fav', customOnly: special === 'custom' }
  const list = useMemo(() => searchTemplates(all, filter, catalog.favorites), [all, category, special, type, duration, query, catalog.favorites]) // eslint-disable-line react-hooks/exhaustive-deps
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Catégorie'
  const hasCustom = catalog.custom.length > 0
  const browsing = !query && !category && !special && type === 'all' && duration === 'all'

  const add = async (t: QuestTemplate, allowDuplicate = false) => {
    setFlash(null)
    try { await catalogService.addTemplate(t.id, { allowDuplicate }); setFlash({ text: `« ${t.name} » est dans vos quêtes.` }) } catch (e) { setFlash({ text: msg(e), error: true }) }
  }

  return (
    <div className={s.stack}>
      <div className={s.search}>
        <Icon name="book" size={18} />
        <input className={inputClass} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une quête (lecture, budget, marche…)" aria-label="Rechercher une quête" />
      </div>

      <div className={s.chips} role="group" aria-label="Catégories">
        <button aria-pressed={!category && !special} onClick={() => { setCategory(''); setSpecial('') }}>Découvrir</button>
        {categories.filter((c) => !c.archived).map((c) => <button key={c.id} aria-pressed={category === c.id && !special} onClick={() => { setCategory(c.id); setSpecial('') }}>{c.name}</button>)}
        <button aria-pressed={special === 'fav'} onClick={() => { setSpecial('fav'); setCategory('') }}>★ Favoris{catalog.favorites.length ? ` (${catalog.favorites.length})` : ''}</button>
        {hasCustom ? <button aria-pressed={special === 'custom'} onClick={() => { setSpecial('custom'); setCategory('') }}>Mes modèles ({catalog.custom.length})</button> : null}
      </div>

      <details className={s.filters}>
        <summary>Filtrer par rythme et durée</summary>
        <div className={s.filterRow}>
          <Field label="Rythme"><Segmented<QuestType | 'all'> label="Rythme" value={type} options={TYPE_FILTERS.map((f) => ({ value: f.id, label: f.label }))} onChange={setType} /></Field>
          <Field label="Durée"><Segmented label="Durée" value={duration} options={DURATION_FILTERS.map((d) => ({ value: d.id, label: d.label }))} onChange={setDuration} /></Field>
        </div>
      </details>

      {flash ? <p className={flash.error ? s.flashErr : s.flash} role="status">{flash.text} {!flash.error ? <button className={s.link} onClick={openQuests}>Voir mes quêtes</button> : null}</p> : null}

      {browsing ? (
        <section aria-label="Packs de démarrage">
          <h2 className={s.h2}>Packs de démarrage</h2>
          <p className={s.sub}>Une petite sélection cohérente, que vous pouvez ajuster avant de l’ajouter.</p>
          <div className={s.packs}>
            {QUEST_PACKS.map((p) => { const l = packLoad(p, catalog); return (
              <button key={p.id} className={s.pack} onClick={() => setPack(p)} aria-label={`Voir le pack ${p.name}`}>
                <b>{p.name}</b><span>{p.forWho}</span>
                <small>{l.items} quêtes{l.daily ? ` · ${l.daily} par jour (≈ ${l.dailyMinutes} min)` : ''}</small>
              </button>) })}
          </div>
        </section>
      ) : null}

      {browsing ? (
        <section aria-label="Parcourir par catégorie">
          <h2 className={s.h2}>Parcourir par catégorie</h2>
          <div className={s.cats}>
            {categories.filter((c) => !c.archived).map((c) => { const n = all.filter((t) => t.categoryId === c.id).length; return n ? (
              <button key={c.id} className={s.cat} onClick={() => setCategory(c.id)} aria-label={`${c.name}, ${n} quêtes`}><b>{c.name}</b><span>{n} quêtes</span></button>
            ) : null })}
          </div>
        </section>
      ) : (
      <section aria-label="Quêtes proposées">
        <h2 className={s.h2}>{special === 'fav' ? 'Vos favoris' : special === 'custom' ? 'Mes modèles' : category ? catName(category) : 'Résultats'} <span className={s.count}>{list.length}</span></h2>
        {list.length === 0 ? (
          <div className={s.empty}>
            <p><b>Aucune quête ne correspond.</b></p>
            <p>{special === 'fav' ? 'Touchez ★ sur une quête pour la retrouver ici.' : special === 'custom' ? 'Dans une quête, « Enregistrer comme modèle » la garde ici pour la réutiliser.' : 'Essayez un autre mot ou retirez un filtre.'}</p>
          </div>
        ) : (
          <ul className={s.list}>
            {list.map((t) => {
              const st = templateStatus(t, quests, catalog)
              const fav = catalog.favorites.includes(t.id)
              return (
                <li key={t.id} className={s.item} data-status={st}>
                  <div className={s.itemTop}>
                    <div>
                      <h3>{t.name}</h3>
                      <p>{t.description}</p>
                    </div>
                    <button className={s.star} aria-pressed={fav} aria-label={fav ? `Retirer ${t.name} des favoris` : `Ajouter ${t.name} aux favoris`} onClick={() => void catalogService.toggleFavorite(t.id)}>{fav ? '★' : '☆'}</button>
                  </div>
                  <p className={s.meta}>
                    <span>{frequencyLabel(t)}</span><span>{t.minutes} min</span><span>{DIFFICULTY_LABEL[t.difficulty]}</span>
                    <span title="Indicatif : l’XP réelle est calculée par Level à la validation">≈ {xpHint(t)} XP</span>
                    {category ? null : <span>{catName(t.categoryId)}</span>}
                  </p>
                  {t.steps?.length ? <p className={s.steps}>Étapes : {t.steps.join(' · ')}</p> : null}
                  {t.goalHint ? <p className={s.steps}>Objectif suggéré : « {t.goalHint} » (à créer dans Objectifs si vous le souhaitez)</p> : null}
                  {hasUpdate(t, catalog) ? <p className={s.steps}>Une version plus récente de ce modèle existe ; vos quêtes ne changent pas.</p> : null}
                  <div className={s.actions}>
                    {st === 'added' ? <span className={s.done}><Icon name="check" size={16} /> Dans vos quêtes</span>
                      : st === 'similar' ? <><span className={s.note}>Une quête semblable existe déjà.</span><button className={s.secondary} onClick={() => void add(t, true)}>Ajouter quand même</button></>
                      : <button className={s.primary} onClick={() => void add(t)}>Ajouter</button>}
                    <button className={s.secondary} onClick={() => setCustom(t)}>Personnaliser</button>
                    {t.custom ? <button className={s.secondary} onClick={() => void catalogService.deleteCustomTemplate(t.id)}>Supprimer le modèle</button> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      )}

      <Sheet open={!!pack} onClose={() => setPack(null)} title={pack?.name ?? ''}>{pack ? <PackSheet pack={pack} onDone={(text) => { setPack(null); setFlash({ text }) }} /> : null}</Sheet>
      <Sheet open={!!custom} onClose={() => setCustom(null)} title="Personnaliser avant d’ajouter">{custom ? <CustomizeSheet t={custom} onDone={(text) => { setCustom(null); setFlash(text.startsWith('!') ? { text: text.slice(1), error: true } : { text }) }} /> : null}</Sheet>
    </div>
  )
}

function CustomizeSheet({ t, onDone }: { t: QuestTemplate; onDone: (text: string) => void }) {
  const [type, setType] = useState<QuestType>(t.type)
  const [minutes, setMinutes] = useState(String(t.minutes))
  const [dup, setDup] = useState(false)
  const m = Math.max(5, Math.min(480, Math.round(Number(minutes) || t.minutes)))
  return (
    <form onSubmit={async (e) => { e.preventDefault(); try { await catalogService.addTemplate(t.id, { type, minutes: m, allowDuplicate: true }); onDone(`« ${t.name} » est dans vos quêtes.`) } catch (er) { onDone(`!${msg(er)}`) } }}>
      <p className={s.sub}>{t.description}</p>
      <Field label="Rythme"><Segmented<QuestType> label="Rythme" value={type} options={TYPE_FILTERS.filter((f) => f.id !== 'all').map((f) => ({ value: f.id as QuestType, label: f.label }))} onChange={setType} /></Field>
      <Field label="Durée estimée (minutes)" htmlFor="cz-min" hint="L’XP dépend de la durée et de la difficulté ; Level la calcule à la validation."><input id="cz-min" className={inputClass} type="number" min={5} max={480} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
      <p className={s.sub}>≈ {xpHint({ difficulty: t.difficulty, minutes: m })} XP à la validation. Vous pourrez encore tout modifier dans la quête.</p>
      <label className={s.check}><input type="checkbox" checked={dup} onChange={(e) => setDup(e.target.checked)} /> Ajouter même si une quête semblable existe</label>
      <div className={s.sheetActions}><button type="submit" className={sheet.btnPrimary} disabled={!dup && false}>Ajouter à mes quêtes</button></div>
    </form>
  )
}

function PackSheet({ pack, onDone }: { pack: QuestPack; onDone: (text: string) => void }) {
  const { quests, catalog } = useAppState()
  const items = packTemplates(pack, catalog)
  const status = (t: QuestTemplate) => templateStatus(t, quests, catalog)
  const [on, setOn] = useState<Set<string>>(() => new Set(items.filter((t) => status(t) === 'new').map((t) => t.id)))
  const [types, setTypes] = useState<Record<string, QuestType>>({})
  const [error, setError] = useState<string | null>(null)
  const chosen = items.filter((t) => on.has(t.id))
  const daily = chosen.filter((t) => (types[t.id] ?? t.type) === 'daily')
  return (
    <div>
      <p className={s.sub}>{pack.description}</p>
      <ul className={s.packList}>
        {items.map((t) => {
          const st = status(t)
          return (
            <li key={t.id}>
              <label className={s.packRow}>
                <input type="checkbox" checked={on.has(t.id)} disabled={st !== 'new'} onChange={() => setOn((o) => { const n = new Set(o); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n })} aria-label={t.name} />
                <span><b>{t.name}</b><small>{st === 'new' ? `${frequencyLabel({ type: types[t.id] ?? t.type, steps: t.steps })} · ${t.minutes} min` : 'Déjà dans vos quêtes'}</small></span>
              </label>
              {st === 'new' && on.has(t.id) ? (
                <select className={s.freq} aria-label={`Rythme de ${t.name}`} value={types[t.id] ?? t.type} onChange={(e) => setTypes({ ...types, [t.id]: e.target.value as QuestType })}>
                  {TYPE_FILTERS.filter((f) => f.id !== 'all').map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className={s.sub}>{chosen.length === 0 ? 'Aucune quête sélectionnée.' : `${chosen.length} quête${chosen.length > 1 ? 's' : ''}${daily.length ? ` dont ${daily.length} par jour (≈ ${daily.reduce((n, t) => n + t.minutes, 0)} min/jour)` : ''}. Rien n’est imposé : tout reste modifiable ensuite.`}</p>
      {error ? <p className={s.flashErr} role="alert">{error}</p> : null}
      <div className={s.sheetActions}>
        <button className={sheet.btnPrimary} disabled={chosen.length === 0} onClick={async () => { try { const r = await catalogService.addPack(pack.id, chosen.map((t) => ({ templateId: t.id, type: types[t.id] }))); onDone(`${r.created.length} quête${r.created.length > 1 ? 's ajoutées' : ' ajoutée'} depuis « ${pack.name} ».`) } catch (e) { setError(msg(e)) } }}>Ajouter {chosen.length || ''} quête{chosen.length > 1 ? 's' : ''}</button>
      </div>
    </div>
  )
}
