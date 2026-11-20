import { useState } from 'react'
import { Badge, Card, EmptyState, SectionTitle } from '@/design/components'
import { Sheet } from '@/design/Sheet'
import { Field, inputClass, Segmented, textareaClass } from '@/design/Form'
import { useAppState } from '@/app/AppState'
import { HORIZON_LABEL, IMPORTANCE_LABEL, ORIENTATION_STATUSES, ORIENTATION_STATUS_LABEL, orientationProgress, resolveGoals, resolveIndicators, resolveProjects, type Orientation, type OrientationStatus } from '@/core/pilotage'
import { pilotageService } from '@/data/pilotageService'
import sh from '@/design/sheet.module.css'
import { Bar, horizonOptions, LinkPicker, pct, useRun } from './shared'
import s from './pilotage.module.css'

export function OrientationsPanel() {
  const { strategy, lifeCtx } = useAppState()
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState<{ o?: Orientation } | null>(null)
  const [links, setLinks] = useState<Orientation | null>(null)
  const { error, run } = useRun()
  const all = [...strategy.orientations].sort((a, b) => a.order - b.order)
  const list = all.filter((o) => showArchived || !o.archived)
  const visible = list.filter((o) => !o.archived)

  return (
    <div className={s.stack}>
      <div className={s.actions}>
        <button className={sh.btnPrimary} onClick={() => setForm({})}>+ Nouvelle orientation</button>
        {all.some((o) => o.archived) ? <button className={s.mini} aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Masquer les archivées' : 'Afficher les archivées'}</button> : null}
      </div>
      <p className={s.note}>Une orientation est une grande direction de vie (par exemple « Autonomie financière » ou « Santé »). Elle peut exister seule, sans vision écrite, et regrouper des objectifs et projets LIFE existants — un même objectif peut servir plusieurs orientations.</p>
      {error ? <p className={s.err} role="alert">{error}</p> : null}

      {list.length === 0 ? <Card variant="flat"><EmptyState title="Aucune orientation">Créez-en une seule pour commencer ; vous pourrez en ajouter, les mettre en pause ou les archiver quand vous voulez.</EmptyState></Card> : (
        <div className={s.list}>
          {list.map((o) => {
            const p = orientationProgress(o, lifeCtx)
            const goals = resolveGoals(o.goalIds, lifeCtx.life), projects = resolveProjects(o.projectIds, lifeCtx.life), inds = resolveIndicators(o.indicatorIds, lifeCtx.life)
            const idx = visible.findIndex((x) => x.id === o.id)
            return (
              <article key={o.id} className={s.item} data-archived={o.archived} aria-label={o.name}>
                <div className={s.itemHead}>
                  <h3>{o.name}</h3>
                  <div className={s.badges}><Badge tone={o.status === 'active' ? 'gold' : 'neutral'}>{ORIENTATION_STATUS_LABEL[o.status]}</Badge>{o.archived ? <Badge tone="neutral">Archivée</Badge> : null}</div>
                </div>
                <div className={s.badges}><Badge tone="neutral">{IMPORTANCE_LABEL[o.importance]}</Badge><Badge tone="info">{HORIZON_LABEL[o.horizon]}</Badge></div>
                {o.description ? <p className={s.muted}>{o.description}</p> : null}
                {o.currentState || o.desiredState ? <p className={s.muted}>{o.currentState ? <>Aujourd’hui : {o.currentState}. </> : null}{o.desiredState ? <>Souhaité : {o.desiredState}.</> : null}</p> : null}
                <Bar value={p.value} label={`Avancement de ${o.name}`} />
                <p className={s.sub}>{p.value !== null ? `${pct(p.value)} · ` : ''}{goals.length} objectif{goals.length > 1 ? 's' : ''} · {projects.length} projet{projects.length > 1 ? 's' : ''} · {inds.length} indicateur{inds.length > 1 ? 's' : ''} — avancement calculé depuis LIFE</p>
                {goals.length || projects.length ? <div className={s.pills}>{goals.map((g) => <span key={g.id} className={s.pill}>{g.title}</span>)}{projects.map((pr) => <span key={pr.id} className={s.pill}>{pr.title}</span>)}</div> : null}
                <div className={s.actions}>
                  <label className={s.sub} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Statut
                    <select className={inputClass} style={{ minHeight: 36, width: 'auto' }} value={o.status} aria-label={`Statut de ${o.name}`} onChange={(e) => void run(() => pilotageService.setOrientationStatus(o.id, e.target.value as OrientationStatus))}>
                      {ORIENTATION_STATUSES.map((st) => <option key={st} value={st}>{ORIENTATION_STATUS_LABEL[st]}</option>)}
                    </select></label>
                  <button className={s.mini} onClick={() => setForm({ o })}>Modifier</button>
                  <button className={s.mini} onClick={() => setLinks(o)}>Liens LIFE</button>
                  {!o.archived ? <><button className={s.mini} disabled={idx <= 0} aria-label={`Monter ${o.name}`} onClick={() => void run(() => pilotageService.moveOrientation(o.id, -1))}>↑</button>
                    <button className={s.mini} disabled={idx < 0 || idx >= visible.length - 1} aria-label={`Descendre ${o.name}`} onClick={() => void run(() => pilotageService.moveOrientation(o.id, 1))}>↓</button></> : null}
                  <button className={s.mini} onClick={() => void run(() => pilotageService.archiveOrientation(o.id, !o.archived))}>{o.archived ? 'Restaurer' : 'Archiver'}</button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Card>
        <SectionTitle title="Gérer sans rien perdre" />
        <p className={s.note}>Archiver ou détacher une orientation ne supprime jamais vos objectifs, projets, quêtes ni votre XP : seul le lien disparaît, et la décision reste dans l’historique.</p>
      </Card>

      <Sheet open={form !== null} onClose={() => setForm(null)} title={form?.o ? 'Modifier l’orientation' : 'Nouvelle orientation'}>{form ? <OrientationForm o={form.o} onDone={() => setForm(null)} /> : null}</Sheet>
      <Sheet open={links !== null} onClose={() => setLinks(null)} title={links ? `Liens LIFE — ${links.name}` : ''}>{links ? <LinksForm key={links.id} o={strategy.orientations.find((x) => x.id === links.id) ?? links} onDone={() => setLinks(null)} /> : null}</Sheet>
    </div>
  )
}

function OrientationForm({ o, onDone }: { o?: Orientation; onDone: () => void }) {
  const { strategy } = useAppState()
  const [name, setName] = useState(o?.name ?? '')
  const [description, setDescription] = useState(o?.description ?? '')
  const [importance, setImportance] = useState<'1' | '2' | '3'>(String(o?.importance ?? 2) as '1' | '2' | '3')
  const [horizon, setHorizon] = useState(o?.horizon ?? 'mid')
  const [visionId, setVisionId] = useState(o?.visionId ?? '')
  const [currentState, setCurrent] = useState(o?.currentState ?? '')
  const [desiredState, setDesired] = useState(o?.desiredState ?? '')
  const { error, run } = useRun()
  const visions = strategy.visions.filter((v) => v.status === 'active' || v.id === o?.visionId)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const input = { name, description, importance: Number(importance) as 1 | 2 | 3, horizon, visionId: visionId || null, currentState, desiredState }
    const ok = await run(() => (o ? pilotageService.updateOrientation(o.id, input) : pilotageService.createOrientation(input)))
    if (ok) onDone()
  }
  return (
    <form onSubmit={submit}>
      <Field label="Nom" htmlFor="o-name"><input id="o-name" className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ex. Autonomie financière" required autoFocus={!o} /></Field>
      <Field label="Description (facultative)" htmlFor="o-desc"><textarea id="o-desc" className={textareaClass} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Importance stratégique"><Segmented<'1' | '2' | '3'> label="Importance stratégique" value={importance} options={([1, 2, 3] as const).map((v) => ({ value: String(v) as '1' | '2' | '3', label: IMPORTANCE_LABEL[v] }))} onChange={setImportance} /></Field>
      <Field label="Horizon"><Segmented label="Horizon" value={horizon} options={horizonOptions} onChange={setHorizon} /></Field>
      {visions.length ? <Field label="Vision associée (facultative)" htmlFor="o-vision"><select id="o-vision" className={inputClass} value={visionId} onChange={(e) => setVisionId(e.target.value)}><option value="">Aucune</option>{visions.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}</select></Field> : null}
      <Field label="Situation actuelle (facultative)" htmlFor="o-cur"><textarea id="o-cur" className={textareaClass} value={currentState} maxLength={500} onChange={(e) => setCurrent(e.target.value)} /></Field>
      <Field label="Situation souhaitée (facultative)" htmlFor="o-des"><textarea id="o-des" className={textareaClass} value={desiredState} maxLength={500} onChange={(e) => setDesired(e.target.value)} /></Field>
      {error ? <p className={s.err} role="alert">{error}</p> : null}
      <div className={s.actions}><button type="submit" className={sh.btnPrimary}>{o ? 'Enregistrer' : 'Créer l’orientation'}</button></div>
    </form>
  )
}

function LinksForm({ o, onDone }: { o: Orientation; onDone: () => void }) {
  const { goals, projects, indicators } = useAppState()
  const [goalIds, setGoalIds] = useState(o.goalIds)
  const [projectIds, setProjectIds] = useState(o.projectIds)
  const [indicatorIds, setIndicatorIds] = useState(o.indicatorIds)
  const { error, run } = useRun()
  const open = (st: string) => st !== 'abandoned'
  return (
    <div>
      <p className={s.note}>Vous rattachez des éléments qui existent déjà dans LIFE : rien n’est copié ni créé. Détacher n’en supprime aucun.</p>
      <LinkPicker legend="Objectifs" value={goalIds} onChange={setGoalIds} options={goals.filter((g) => open(g.status) || goalIds.includes(g.id)).map((g) => ({ id: g.id, label: g.title }))} empty="Aucun objectif LIFE pour l’instant. Créez-en depuis LIFE → Objectifs." />
      <div style={{ height: 12 }} />
      <LinkPicker legend="Projets" value={projectIds} onChange={setProjectIds} options={projects.filter((p) => open(p.status) || projectIds.includes(p.id)).map((p) => ({ id: p.id, label: p.title }))} empty="Aucun projet LIFE pour l’instant." />
      <div style={{ height: 12 }} />
      <LinkPicker legend="Indicateurs" value={indicatorIds} onChange={setIndicatorIds} options={indicators.filter((i) => !i.archived || indicatorIds.includes(i.id)).map((i) => ({ id: i.id, label: i.name }))} empty="Aucun indicateur LIFE pour l’instant." />
      {error ? <p className={s.err} role="alert">{error}</p> : null}
      <div className={s.actions} style={{ marginTop: 14 }}><button className={sh.btnPrimary} onClick={() => void run(() => pilotageService.setOrientationLinks(o.id, { goalIds, projectIds, indicatorIds })).then((ok) => { if (ok) onDone() })}>Enregistrer les liens</button></div>
    </div>
  )
}
