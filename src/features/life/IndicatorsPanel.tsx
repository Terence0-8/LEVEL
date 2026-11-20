import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, ProgressBar, SectionTitle } from '@/design/components'
import { LineChart, Sparkline } from '@/design/charts'
import { Field, Segmented, errorClass, inputClass, smallBtn } from '@/design/Form'
import { ConfirmDialog, Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { dayKey } from '@/core/dates'
import { DEFAULT_UNIT, FREQ_LABEL, formatValue, indicatorOverdue, indicatorState, INDICATOR_KIND_LABEL, type Frequency, type Indicator, type IndicatorKind } from '@/core/goals'
import { goalService } from '@/data/goalService'
import { formatDue } from './labels'
import { catName, pct, useRunner } from './lifeShared'
import s from './life.module.css'

const KINDS = Object.keys(INDICATOR_KIND_LABEL) as IndicatorKind[]

export function IndicatorsPanel() {
  const { indicators, readings, categories, now } = useAppState()
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState<{ ind?: Indicator } | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const list = indicators.filter((i) => showArchived || !i.archived).sort((a, b) => Number(b.important) - Number(a.important) || a.name.localeCompare(b.name))
  return (
    <div className={s.stack}>
      <div className={s.head2}>
        <SectionTitle title="Indicateurs" aside={`${indicators.filter((i) => !i.archived).length}`} />
        <button className={sheet.btnPrimary} onClick={() => setForm({})}>+ Nouvel indicateur</button>
      </div>
      <p className={s.note}>Un indicateur mesure une progression sans créer de quête. Il ne rapporte aucune XP : il sert à comprendre.</p>
      {indicators.length === 0 ? (
        <Card variant="flat"><div className={s.empty}>
          <h3>Aucun indicateur pour l’instant</h3>
          <p>Épargne disponible, livres lus, heures de formation, poids… Saisissez une valeur de temps en temps : Level conserve l’historique et trace l’évolution.</p>
          <button className={sheet.btnPrimary} onClick={() => setForm({})}>Créer mon premier indicateur</button>
        </div></Card>
      ) : (
        <>
          <div className={s.cards}>
            {list.map((i) => {
              const st = indicatorState(i, readings)
              const late = indicatorOverdue(i, readings, now)
              return (
                <button key={i.id} className={s.itemCard} onClick={() => setOpen(i.id)} aria-label={`Ouvrir l’indicateur ${i.name}`} style={i.archived ? { opacity: 0.6 } : undefined}>
                  <div className={s.itemTop}>
                    <span className={s.itemTitle}>{i.name}{i.important ? ' ★' : ''}</span>
                    <Sparkline values={st.list.slice(-12).map((r) => r.value)} />
                  </div>
                  <div className={s.itemTop}>
                    <span className={s.bigValue} style={{ fontSize: 24 }}>{st.current !== null ? formatValue(i.kind, i.unit, st.current) : '—'}</span>
                    {i.target !== null ? <span className={s.metaRow}>cible {formatValue(i.kind, i.unit, i.target)}</span> : null}
                  </div>
                  {st.progress !== null ? <ProgressBar value={st.progress} thin tone="success" label={`Progression vers la cible de ${i.name}`} /> : null}
                  <div className={s.metaRow}>
                    <span>{catName(categories, i.categoryId)}</span>
                    <span>{st.last ? `mesuré le ${formatDue(st.last.at)}` : 'aucune mesure'}</span>
                    {st.delta !== null ? <span>{st.delta > 0 ? '+' : ''}{formatValue(i.kind, i.unit, st.delta)} depuis le début</span> : null}
                    {late ? <span className={s.warnText}>mesure à saisir</span> : null}
                    {i.archived ? <span>archivé</span> : null}
                  </div>
                </button>
              )
            })}
          </div>
          {indicators.some((i) => i.archived) ? <button className={smallBtn} onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Masquer les archivés' : 'Afficher les archivés'}</button> : null}
        </>
      )}
      <IndicatorDetail id={open} onClose={() => setOpen(null)} onEdit={(i) => { setOpen(null); setForm({ ind: i }) }} />
      <Sheet open={form !== null} onClose={() => setForm(null)} title={form?.ind ? 'Modifier l’indicateur' : 'Nouvel indicateur'}>{form !== null ? <IndicatorForm ind={form.ind} onDone={() => setForm(null)} /> : null}</Sheet>
    </div>
  )
}

function IndicatorDetail({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (i: Indicator) => void }) {
  const { indicators, readings, categories, goals, now } = useAppState()
  const { error, run } = useRunner()
  const [value, setValue] = useState('')
  const [at, setAt] = useState(dayKey(now))
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const ind = indicators.find((x) => x.id === id)
  if (!ind) return <Sheet open={false} onClose={onClose} title=""><></></Sheet>
  const st = indicatorState(ind, readings)
  const fmt = (v: number) => formatValue(ind.kind, ind.unit, v)
  const linked = goals.filter((g) => g.indicatorIds.includes(ind.id))
  const unitHint = ind.kind === 'duration' ? 'en minutes' : ind.kind === 'percent' ? 'en %' : ind.unit ? `en ${ind.unit}` : ''
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = Number(value.replace(',', '.'))
    const ok = editing ? await run(() => goalService.updateReading(editing, { value: v, at, note })) : await run(() => goalService.addReading(ind.id, { value: v, at, note }))
    if (ok) { setValue(''); setNote(''); setEditing(null); setAt(dayKey(now)) }
  }
  return (
    <Sheet open onClose={onClose} title={ind.name}>
      <div className={s.detail}>
        <div>
          <div className={s.itemTop}><span className={s.bigValue}>{st.current !== null ? fmt(st.current) : '—'}</span>{ind.target !== null ? <Badge tone="success">cible {fmt(ind.target)}</Badge> : null}</div>
          {st.progress !== null ? <ProgressBar value={st.progress} tone="success" label={`Progression vers la cible de ${ind.name}`} /> : null}
          <p className={s.metaRow} style={{ marginTop: 6 }}>
            <span>{INDICATOR_KIND_LABEL[ind.kind]}</span><span>{catName(categories, ind.categoryId)}</span>
            {ind.frequency ? <span>{FREQ_LABEL[ind.frequency].toLowerCase()}</span> : null}
            {st.progress !== null ? <span>{pct(st.progress)} du chemin vers la cible</span> : null}
            {st.delta !== null ? <span>{st.delta > 0 ? '+' : ''}{fmt(st.delta)} depuis la première mesure</span> : null}
          </p>
        </div>
        {st.list.length >= 1 ? (
          <div className={s.chartBox}><LineChart label={`Évolution de ${ind.name}`} points={st.list.map((r) => ({ label: formatDue(r.at), value: r.value }))} target={ind.target} format={fmt} /></div>
        ) : <p className={s.note}>Aucune mesure : saisissez la première valeur ci-dessous.</p>}
        <section>
          <h3>{editing ? 'Corriger la mesure' : 'Nouvelle mesure'}</h3>
          <form onSubmit={submit}>
            <div className={s.cols2}>
              <Field label={`Valeur ${unitHint}`} htmlFor="r-val"><input id="r-val" className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required /></Field>
              <Field label="Date" htmlFor="r-at"><input id="r-at" className={inputClass} type="date" max={dayKey(now)} value={at} onChange={(e) => setAt(e.target.value)} /></Field>
            </div>
            <Field label="Note (facultative)" htmlFor="r-note"><input id="r-note" className={inputClass} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            {error ? <p className={errorClass} role="alert">{error}</p> : null}
            <div className={s.inlineAdd}>
              <button type="submit" className={sheet.btnPrimary}>{editing ? 'Enregistrer la correction' : 'Enregistrer la mesure'}</button>
              {editing ? <button type="button" className={sheet.btnGhost} onClick={() => { setEditing(null); setValue(''); setNote('') }}>Annuler</button> : null}
            </div>
          </form>
        </section>
        {st.list.length ? (
          <section><h3>Historique</h3>
            <ul className={s.checkList}>
              {[...st.list].reverse().slice(0, 15).map((r) => (
                <li key={r.id} className={s.checkRow}>
                  <span className={s.body}><b className="num">{fmt(r.value)}</b><small>{formatDue(r.at)}{r.note ? ` · ${r.note}` : ''}</small></span>
                  <button className={s.mini} aria-label={`Corriger la mesure du ${r.at}`} onClick={() => { setEditing(r.id); setValue(String(r.value)); setAt(r.at); setNote(r.note) }}>Corriger</button>
                  <button className={s.mini} aria-label={`Supprimer la mesure du ${r.at}`} onClick={() => void run(() => goalService.deleteReading(r.id))}>×</button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {linked.length ? <p className={s.note}>Suit les objectifs : {linked.map((g) => g.title).join(', ')}.</p> : null}
        <div className={s.formActions} style={{ position: 'static' }}>
          <button className={sheet.btnDanger} onClick={() => setConfirm(true)}>Supprimer</button>
          <button className={sheet.btnGhost} onClick={() => void run(() => goalService.updateIndicator(ind.id, { ...ind, archived: !ind.archived }))}>{ind.archived ? 'Désarchiver' : 'Archiver'}</button>
          <button className={sheet.btnPrimary} onClick={() => onEdit(ind)}>Modifier</button>
        </div>
      </div>
      <ConfirmDialog open={confirm} title="Supprimer cet indicateur ?" confirmLabel="Supprimer l’indicateur" danger onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void run(() => goalService.deleteIndicator(ind.id)).then(onClose) }}>
        <p><strong>{ind.name}</strong> et ses <strong>{st.list.length} mesure{st.list.length > 1 ? 's' : ''}</strong> seront supprimés définitivement.</p>
        <p>Aucune XP n’est concernée. Pour garder l’historique sans l’afficher, préférez « Archiver ».</p>
      </ConfirmDialog>
    </Sheet>
  )
}

function IndicatorForm({ ind, onDone }: { ind?: Indicator; onDone: () => void }) {
  const { categories } = useAppState()
  const cats = categories.filter((c) => !c.archived || c.id === ind?.categoryId)
  const [name, setName] = useState(ind?.name ?? '')
  const [categoryId, setCategoryId] = useState(ind?.categoryId ?? cats[0]?.id ?? '')
  const [kind, setKind] = useState<IndicatorKind>(ind?.kind ?? 'number')
  const [unit, setUnit] = useState(ind?.unit ?? '')
  const [target, setTarget] = useState(ind?.target != null ? String(ind.target) : '')
  const [frequency, setFrequency] = useState<Frequency | ''>(ind?.frequency ?? '')
  const [important, setImportant] = useState(ind?.important ?? false)
  const { error, run } = useRunner()
  const changeKind = (k: IndicatorKind) => { if (!unit || unit === DEFAULT_UNIT[kind]) setUnit(DEFAULT_UNIT[k]); setKind(k) }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const input = { name, categoryId, kind, unit, target: target.trim() === '' ? null : Number(target.replace(',', '.')), frequency: frequency || null, important }
    if (await run(() => (ind ? goalService.updateIndicator(ind.id, input) : goalService.createIndicator(input)))) onDone()
  }
  return (
    <form onSubmit={submit} id="indicator-form">
      <Field label="Nom" htmlFor="i-name"><input id="i-name" className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex. Épargne disponible" autoFocus={!ind} required /></Field>
      <Field label="Catégorie" htmlFor="i-cat"><select id="i-cat" className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Type"><Segmented<IndicatorKind> label="Type d’indicateur" value={kind} options={KINDS.map((k) => ({ value: k, label: INDICATOR_KIND_LABEL[k] }))} onChange={changeKind} /></Field>
      {kind === 'custom' || kind === 'number' || kind === 'money' ? <Field label="Unité" htmlFor="i-unit" hint={kind === 'custom' ? 'Ex. pages, km, articles' : 'Facultative'}><input id="i-unit" className={inputClass} value={unit} maxLength={12} onChange={(e) => setUnit(e.target.value)} /></Field> : null}
      <Field label="Valeur cible (facultative)" htmlFor="i-target" hint={kind === 'duration' ? 'En minutes.' : undefined}><input id="i-target" className={inputClass} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      <Field label="Fréquence de saisie (facultative)" htmlFor="i-freq" hint="Level vous rappelle la mesure si elle tarde. Aucun effet sur l’XP."><select id="i-freq" className={inputClass} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency | '')}><option value="">Au fil de l’eau</option>{(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}</select></Field>
      <label className={s.optList} style={{ marginBottom: 14 }}><span style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40 }}><input type="checkbox" style={{ width: 20, height: 20, accentColor: 'var(--c-gold)' }} checked={important} onChange={(e) => setImportant(e.target.checked)} /> Indicateur important (affiché en vue d’ensemble)</span></label>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.formActions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary}>{ind ? 'Enregistrer' : 'Créer l’indicateur'}</button>
      </div>
    </form>
  )
}
