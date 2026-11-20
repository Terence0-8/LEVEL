import { useState } from 'react'
import { Badge, Card, EmptyState, SectionTitle } from '@/design/components'
import { ConfirmDialog, Sheet } from '@/design/Sheet'
import { Field, inputClass, Segmented, textareaClass } from '@/design/Form'
import { useAppState } from '@/app/AppState'
import { activeFundamental, HORIZON_LABEL, PRIORITY_LEVEL_LABEL, PRIORITY_STATUS_LABEL, priorityProgress, type Priority, type PriorityLevel, type PriorityStatus } from '@/core/pilotage'
import { pilotageService, type PriorityInput } from '@/data/pilotageService'
import sh from '@/design/sheet.module.css'
import { Bar, horizonOptions, LinkPicker, pct, useRun } from './shared'
import s from './pilotage.module.css'

const LEVELS: PriorityLevel[] = ['fundamental', 'important', 'secondary']
const STATUSES: PriorityStatus[] = ['active', 'paused', 'done', 'dropped']

export function PrioritiesPanel() {
  const { strategy, prefs, lifeCtx } = useAppState()
  const max = prefs.pilotage.maxFundamental
  const nFund = activeFundamental(strategy.priorities).length
  const [form, setForm] = useState<{ p?: Priority } | null>(null)
  const [pending, setPending] = useState<{ title: string; go: () => Promise<unknown> } | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const { error, setError, run } = useRun()
  const sorted = [...strategy.priorities].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.title.localeCompare(b.title))
  const list = sorted.filter((p) => showClosed || p.status === 'active' || p.status === 'paused')

  /** Une commande refusée pour dépassement de la limite souple propose une confirmation explicite plutôt qu'un blocage. */
  const withLimit = async (title: string, fn: (allow: boolean) => Promise<unknown>): Promise<boolean> => {
    setError(null)
    try { await fn(false); return true } catch (e) {
      if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'over_limit') { setPending({ title, go: () => fn(true) }); return false }
      return (await run(() => fn(false))) !== undefined
    }
  }

  return (
    <div className={s.stack}>
      <Card>
        <SectionTitle title="Priorités fondamentales" aside={<span className="num">{nFund} / {max}</span>} />
        <div className={s.meter} data-over={nFund > max} role="img" aria-label={`${nFund} priorité${nFund > 1 ? 's' : ''} fondamentale${nFund > 1 ? 's' : ''} active${nFund > 1 ? 's' : ''} sur ${max} conseillée${max > 1 ? 's' : ''}`}>
          {Array.from({ length: Math.max(max, nFund) }, (_, i) => <i key={i} data-on={i < nFund} />)}
        </div>
        <p className={s.note} style={{ marginTop: 8 }}>La limite est un repère souple (réglable dans Profil et réglages) : trop de priorités fondamentales dilue l’attention. Vous pouvez la dépasser en connaissance de cause.</p>
      </Card>

      <div className={s.actions}>
        <button className={sh.btnPrimary} onClick={() => setForm({})}>+ Nouvelle priorité</button>
        {strategy.priorities.some((p) => p.status === 'done' || p.status === 'dropped') ? <button className={s.mini} aria-pressed={showClosed} onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Masquer les closes' : 'Afficher les closes'}</button> : null}
      </div>
      {error ? <p className={s.err} role="alert">{error}</p> : null}

      {list.length === 0 ? <Card variant="flat"><EmptyState title="Aucune priorité">Une priorité dit ce qui compte le plus en ce moment. Elle peut être temporaire et se rattacher à une orientation et à des objectifs LIFE.</EmptyState></Card> : (
        <div className={s.list}>
          {list.map((p) => {
            const pr = priorityProgress(p, lifeCtx)
            const o = strategy.orientations.find((x) => x.id === p.orientationId)
            return (
              <article key={p.id} className={s.item} aria-label={p.title}>
                <div className={s.itemHead}><h3>{p.title}</h3><div className={s.badges}><Badge tone={p.level === 'fundamental' ? 'gold' : 'neutral'}>{PRIORITY_LEVEL_LABEL[p.level]}</Badge><Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{PRIORITY_STATUS_LABEL[p.status]}</Badge></div></div>
                <div className={s.badges}><Badge tone="info">{HORIZON_LABEL[p.horizon]}</Badge>{p.temporary ? <Badge tone="neutral">Temporaire</Badge> : null}{o ? <Badge tone="neutral">{o.name}</Badge> : null}{p.dueDate ? <Badge tone="neutral">pour le {new Date(p.dueDate + 'T12:00:00').toLocaleDateString('fr-FR')}</Badge> : null}</div>
                {p.description ? <p className={s.muted}>{p.description}</p> : null}
                {p.constraints ? <p className={s.sub}>Contraintes : {p.constraints}</p> : null}
                <Bar value={pr.value} label={`Avancement de ${p.title}`} />
                <p className={s.sub}>{pr.value !== null ? `${pct(pr.value)} · ` : ''}{pr.goals} objectif{pr.goals > 1 ? 's' : ''} rattaché{pr.goals > 1 ? 's' : ''}</p>
                <div className={s.actions}>
                  <label className={s.sub} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Statut
                    <select className={inputClass} style={{ minHeight: 36, width: 'auto' }} value={p.status} aria-label={`Statut de ${p.title}`} onChange={(e) => void withLimit(p.title, (allow) => pilotageService.setPriorityStatus(p.id, e.target.value as PriorityStatus, '', { allowOverLimit: allow }))}>
                      {STATUSES.map((st) => <option key={st} value={st}>{PRIORITY_STATUS_LABEL[st]}</option>)}
                    </select></label>
                  <button className={s.mini} onClick={() => setForm({ p })}>Modifier</button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Sheet open={form !== null} onClose={() => setForm(null)} title={form?.p ? 'Modifier la priorité' : 'Nouvelle priorité'}>{form ? <PriorityForm p={form.p} onDone={() => setForm(null)} withLimit={withLimit} /> : null}</Sheet>
      <ConfirmDialog open={!!pending} title="Dépasser la limite souple ?" confirmLabel="Dépasser quand même" onCancel={() => setPending(null)} onConfirm={() => { const c = pending!; setPending(null); void run(c.go).then(() => setForm(null)) }}>
        <p>« {pending?.title} » porterait vos priorités fondamentales actives au-delà de {max}. C’est possible, mais Level vous le signalera dans ses observations. Souhaitez-vous continuer ?</p>
      </ConfirmDialog>
    </div>
  )
}

function PriorityForm({ p, onDone, withLimit }: { p?: Priority; onDone: () => void; withLimit: (title: string, fn: (allow: boolean) => Promise<unknown>) => Promise<boolean> }) {
  const { strategy, goals } = useAppState()
  const [title, setTitle] = useState(p?.title ?? '')
  const [description, setDescription] = useState(p?.description ?? '')
  const [level, setLevel] = useState<PriorityLevel>(p?.level ?? 'important')
  const [horizon, setHorizon] = useState(p?.horizon ?? 'short')
  const [orientationId, setOrientation] = useState(p?.orientationId ?? '')
  const [dueDate, setDue] = useState(p?.dueDate ?? '')
  const [temporary, setTemporary] = useState(p?.temporary ?? false)
  const [constraints, setConstraints] = useState(p?.constraints ?? '')
  const [goalIds, setGoalIds] = useState(p?.goalIds ?? [])
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const input: PriorityInput = { title, description, level, horizon, orientationId: orientationId || null, dueDate: dueDate || null, temporary, constraints, goalIds }
    const ok = await withLimit(title, (allow) => (p ? pilotageService.updatePriority(p.id, input, { allowOverLimit: allow }) : pilotageService.createPriority(input, { allowOverLimit: allow })))
    setBusy(false)
    // La feuille reste ouverte si une confirmation de dépassement est demandée : la saisie n'est pas perdue
    if (ok) onDone()
  }
  return (
    <form onSubmit={submit}>
      <Field label="Intitulé" htmlFor="p-title"><input id="p-title" className={inputClass} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Lancer la bêta" required autoFocus={!p} /></Field>
      <Field label="Description (facultative)" htmlFor="p-desc"><textarea id="p-desc" className={textareaClass} value={description} maxLength={800} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Niveau"><Segmented<PriorityLevel> label="Niveau" value={level} options={LEVELS.map((v) => ({ value: v, label: PRIORITY_LEVEL_LABEL[v] }))} onChange={setLevel} /></Field>
      <Field label="Horizon"><Segmented label="Horizon" value={horizon} options={horizonOptions} onChange={setHorizon} /></Field>
      {strategy.orientations.filter((o) => !o.archived).length ? <Field label="Orientation (facultative)" htmlFor="p-or"><select id="p-or" className={inputClass} value={orientationId} onChange={(e) => setOrientation(e.target.value)}><option value="">Aucune</option>{strategy.orientations.filter((o) => !o.archived).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field> : null}
      <Field label="Échéance (facultative)" htmlFor="p-due" hint="Level ne la modifie jamais sans votre confirmation."><input id="p-due" className={inputClass} type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
      <Field label="Contraintes connues (facultatif)" htmlFor="p-con" hint="Ex. disponibilité réduite, récupération sportive, budget."><textarea id="p-con" className={textareaClass} value={constraints} maxLength={500} onChange={(e) => setConstraints(e.target.value)} /></Field>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40 }}><input type="checkbox" checked={temporary} onChange={(e) => setTemporary(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--c-gold)' }} /> Priorité temporaire</label>
      <LinkPicker legend="Objectifs LIFE rattachés" value={goalIds} onChange={setGoalIds} options={goals.filter((g) => g.status !== 'abandoned' || goalIds.includes(g.id)).map((g) => ({ id: g.id, label: g.title }))} empty="Aucun objectif LIFE pour l’instant." />
      <div className={s.actions} style={{ marginTop: 14 }}><button type="submit" className={sh.btnPrimary} disabled={busy}>{p ? 'Enregistrer' : 'Créer la priorité'}</button></div>
    </form>
  )
}
