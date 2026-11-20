import { useState } from 'react'
import { Card, EmptyState, SectionTitle } from '@/design/components'
import { ConfirmDialog, Sheet } from '@/design/Sheet'
import { Field, inputClass, textareaClass } from '@/design/Form'
import { useAppState } from '@/app/AppState'
import { HORIZON_HINT, HORIZON_LABEL, type Horizon, type Vision } from '@/core/pilotage'
import { pilotageService, type VisionInput } from '@/data/pilotageService'
import sh from '@/design/sheet.module.css'
import { frDay, HORIZONS, useRun } from './shared'
import s from './pilotage.module.css'

const FIELDS: Array<{ key: 'description' | 'desiredSituation' | 'ambitions' | 'aspirations' | 'preserve' | 'changes'; label: string; hint: string }> = [
  { key: 'description', label: 'Description', hint: 'Dans vos mots, ce que cette vision raconte.' },
  { key: 'desiredSituation', label: 'Situation souhaitée', hint: 'Où aimeriez-vous en être, concrètement ?' },
  { key: 'ambitions', label: 'Ambitions', hint: 'Ce que vous voulez réaliser.' },
  { key: 'aspirations', label: 'Aspirations', hint: 'Ce qui vous attire, sans obligation de résultat.' },
  { key: 'preserve', label: 'À préserver', hint: 'Ce qui compte et ne doit pas être sacrifié.' },
  { key: 'changes', label: 'À changer', hint: 'Ce que vous souhaitez voir évoluer.' },
]

/** La vision est un texte libre, jamais un objectif mesurable. Chaque révision conserve la version précédente (historique). */
export function VisionPanel() {
  const { strategy } = useAppState()
  const vision = strategy.visions.find((v) => v.status === 'active') ?? null
  const archived = strategy.visions.filter((v) => v.status === 'archived').sort((a, b) => b.revisedAt.localeCompare(a.revisedAt))
  const revisions = strategy.log.filter((l) => l.kind === 'vision').sort((a, b) => b.at.localeCompare(a.at))
  const [edit, setEdit] = useState<'new' | 'edit' | 'replace' | null>(null)

  return (
    <div className={s.stack}>
      {vision ? (
        <section className={s.visionCard} aria-label="Vision actuelle">
          <h2>{vision.title}</h2>
          {FIELDS.filter((f) => vision[f.key]).map((f) => <div key={f.key} style={{ marginTop: 12 }}><small className={s.sub}>{f.label}</small><p>{vision[f.key]}</p></div>)}
          {HORIZONS.some((h) => vision.horizons[h]) ? (
            <div className={s.horizonGrid}>{HORIZONS.filter((h) => vision.horizons[h]).map((h) => <div key={h}><small>{HORIZON_LABEL[h]} · {HORIZON_HINT[h]}</small><span>{vision.horizons[h]}</span></div>)}</div>
          ) : null}
          <p className={s.visionMeta}>Créée le {frDay(vision.createdAt)} · révisée le {frDay(vision.revisedAt)}</p>
          <div className={s.actions} style={{ marginTop: 12 }}>
            <button className={s.mini} onClick={() => setEdit('edit')}>Réviser la vision</button>
            <button className={s.mini} onClick={() => setEdit('replace')}>Écrire une nouvelle vision</button>
          </div>
        </section>
      ) : (
        <Card variant="flat"><EmptyState title="Votre vision, en quelques lignes">
          <p>Un texte libre : où voulez-vous aller, qu’est-ce qui compte pour vous. Ce n’est pas un objectif chiffré et rien n’est obligatoire — chaque champ et chaque horizon peuvent rester vides.</p>
          <div className={s.actions} style={{ justifyContent: 'center', marginTop: 10 }}><button className={sh.btnPrimary} onClick={() => setEdit('new')}>Écrire ma vision</button></div>
        </EmptyState></Card>
      )}

      {archived.length ? (
        <Card>
          <SectionTitle title="Visions précédentes" aside={`${archived.length}`} />
          <div className={s.list}>{archived.map((v) => <details key={v.id} className={s.item}><summary>{v.title} <small className={s.sub}>· archivée, créée le {frDay(v.createdAt)}</small></summary><PastVision v={v} /></details>)}</div>
        </Card>
      ) : null}

      {revisions.length ? (
        <Card>
          <SectionTitle title="Révisions" aside={`${revisions.length}`} />
          <div className={s.timeline}>{revisions.slice(0, 12).map((l) => (
            <div key={l.id} className={s.event}><b>{l.summary}</b><small>{frDay(l.at)}</small>
              {l.before ? <details><summary className={s.sub}>Voir la version précédente</summary><p>{Object.entries(l.before).map(([k, v]) => `${FIELDS.find((f) => f.key === k)?.label ?? k} : ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' — ')}</p></details> : null}
            </div>))}</div>
        </Card>
      ) : null}

      <Sheet open={edit !== null} onClose={() => setEdit(null)} title={edit === 'replace' ? 'Nouvelle vision' : edit === 'edit' ? 'Réviser la vision' : 'Ma vision'}>
        {edit ? <VisionForm base={edit === 'edit' ? vision : null} replace={edit === 'replace'} onDone={() => setEdit(null)} /> : null}
      </Sheet>
    </div>
  )
}

function PastVision({ v }: { v: Vision }) {
  return <div>{FIELDS.filter((f) => v[f.key]).map((f) => <p key={f.key} className={s.muted}><b>{f.label} :</b> {v[f.key]}</p>)}</div>
}

function VisionForm({ base, replace, onDone }: { base: Vision | null; replace: boolean; onDone: () => void }) {
  const [title, setTitle] = useState(base?.title ?? '')
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, base?.[f.key] ?? ''])))
  const [hz, setHz] = useState<Partial<Record<Horizon, string>>>(base?.horizons ?? {})
  const [confirm, setConfirm] = useState<VisionInput | null>(null)
  const { error, run } = useRun()
  const build = (): VisionInput => ({ title, ...vals, horizons: hz })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (replace) { setConfirm(build()); return }
    const ok = await run(() => pilotageService.saveVision(build()))
    if (ok) onDone()
  }
  return (
    <form onSubmit={submit} id="vision-form">
      <Field label="Titre" htmlFor="v-title" hint="Une phrase qui résume le cap."><input id="v-title" className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Vivre de mes projets, près de la mer" required autoFocus /></Field>
      {FIELDS.map((f) => <Field key={f.key} label={`${f.label} (facultatif)`} htmlFor={`v-${f.key}`} hint={f.hint}><textarea id={`v-${f.key}`} className={textareaClass} value={vals[f.key]} maxLength={1500} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} /></Field>)}
      {HORIZONS.map((h) => <Field key={h} label={`${HORIZON_LABEL[h]} — ${HORIZON_HINT[h]} (facultatif)`} htmlFor={`v-h-${h}`}><textarea id={`v-h-${h}`} className={textareaClass} value={hz[h] ?? ''} maxLength={800} onChange={(e) => setHz({ ...hz, [h]: e.target.value })} /></Field>)}
      {error ? <p className={s.err} role="alert">{error}</p> : null}
      <div className={s.actions}><button type="submit" className={sh.btnPrimary}>{replace ? 'Créer la nouvelle vision' : 'Enregistrer'}</button></div>
      <ConfirmDialog open={!!confirm} title="Remplacer la vision ?" confirmLabel="Remplacer" onCancel={() => setConfirm(null)} onConfirm={() => { const c = confirm!; setConfirm(null); void run(() => pilotageService.replaceVision(c)).then((ok) => { if (ok) onDone() }) }}>
        <p>L’ancienne vision est archivée et reste consultable dans « Visions précédentes ». Rien n’est supprimé.</p>
      </ConfirmDialog>
    </form>
  )
}
