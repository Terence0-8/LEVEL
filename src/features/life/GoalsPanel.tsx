import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, ProgressBar, SectionTitle } from '@/design/components'
import { Field, Segmented, errorClass, inputClass, smallBtn, textareaClass } from '@/design/Form'
import { ConfirmDialog, Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { dayKey } from '@/core/dates'
import { deletionImpact, formatValue, GOAL_STATUS_LABEL, GOAL_STATUSES, IMPORTANCE_LABEL, indicatorState, questsOfGoal, type Goal, type GoalStatus } from '@/core/goals'
import { cycleProgress } from '@/core/questState'
import type { Priority } from '@/core/quest'
import { goalService } from '@/data/goalService'
import { GoalPilotage, StrategyDeleteNote } from '@/features/pilotage/LinksSection'
import { PRIORITY_OPTIONS, formatDue } from './labels'
import { Box, catName, pct, useLifeMaps, useRunner } from './lifeShared'
import s from './life.module.css'

const TONE: Record<GoalStatus, 'neutral' | 'gold' | 'info' | 'success' | 'danger'> = { todo: 'neutral', active: 'gold', paused: 'info', achieved: 'success', abandoned: 'danger' }

export function GoalsPanel() {
  const { goals, categories, now } = useAppState()
  const { goalP } = useLifeMaps()
  const [status, setStatus] = useState<'all' | GoalStatus>('all')
  const [cat, setCat] = useState('all')
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState<{ goal?: Goal } | null>(null)
  const today = dayKey(now)
  const list = goals.filter((g) => (status === 'all' || g.status === status) && (cat === 'all' || g.categoryId === cat))
    .sort((a, b) => GOAL_STATUSES.indexOf(a.status) - GOAL_STATUSES.indexOf(b.status) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  return (
    <div className={s.stack}>
      <div className={s.head2}>
        <SectionTitle title="Objectifs" aside={`${goals.filter((g) => g.status === 'active').length} en cours`} />
        <button className={sheet.btnPrimary} onClick={() => setForm({})}>+ Nouvel objectif</button>
      </div>
      {goals.length === 0 ? (
        <Card variant="flat"><div className={s.empty}>
          <h3>Aucun objectif pour l’instant</h3>
          <p>Un objectif est une ambition à plusieurs semaines ou mois : « Lancer mon activité », « Constituer 5 000 € d’épargne ». Il peut s’appuyer sur des projets et des quêtes.</p>
          <button className={sheet.btnPrimary} onClick={() => setForm({})}>Créer mon premier objectif</button>
        </div></Card>
      ) : (
        <>
          <div className={s.filters}>
            <div className={s.chips} role="group" aria-label="Filtrer par statut">
              {(['all', ...GOAL_STATUSES] as const).map((f) => <button key={f} aria-pressed={status === f} onClick={() => setStatus(f)}>{f === 'all' ? 'Tous' : GOAL_STATUS_LABEL[f]}</button>)}
            </div>
            <select className={s.sel} aria-label="Filtrer par catégorie" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">Toutes les catégories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className={s.cards}>
            {list.length === 0 ? <p style={{ color: 'var(--c-text-dim)' }}>Aucun objectif avec ces filtres.</p> : null}
            {list.map((g) => {
              const p = goalP.get(g.id)!
              const late = g.dueDate && g.dueDate < today && (g.status === 'active' || g.status === 'todo')
              return (
                <button key={g.id} className={s.itemCard} onClick={() => setOpen(g.id)} aria-label={`Ouvrir l’objectif ${g.title}`}>
                  <div className={s.itemTop}><span className={s.itemTitle}>{g.title}</span><span className={`${s.pct} num`}>{pct(p.value)}</span></div>
                  <ProgressBar value={p.value} thin label={`Avancement de ${g.title}`} />
                  <div className={s.metaRow}>
                    <span><Badge tone={TONE[g.status]}>{GOAL_STATUS_LABEL[g.status]}</Badge></span>
                    <span>{catName(categories, g.categoryId)}</span>
                    <span>{IMPORTANCE_LABEL[g.importance]}</span>
                    {g.dueDate ? <span className={late ? s.warnText : undefined}>{late ? 'échéance dépassée ' : 'échéance '}{formatDue(g.dueDate)}</span> : <span>sans échéance</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
      <GoalDetail id={open} onClose={() => setOpen(null)} onEdit={(g) => { setOpen(null); setForm({ goal: g }) }} />
      <GoalFormSheet open={form !== null} goal={form?.goal} onClose={() => setForm(null)} />
    </div>
  )
}

function GoalDetail({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (g: Goal) => void }) {
  const { goals, projects, quests, events, categories, indicators, readings, lifeFindings, now } = useAppState()
  const { goalP, projectP } = useLifeMaps()
  const { error, run } = useRunner()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const g = goals.find((x) => x.id === id)
  if (!g) return <Sheet open={false} onClose={onClose} title=""><></></Sheet>
  const p = goalP.get(g.id)!
  const myProjects = projects.filter((x) => x.goalId === g.id)
  const direct = questsOfGoal(quests, g.id)
  const inds = indicators.filter((i) => g.indicatorIds.includes(i.id))
  const tensions = goals.filter((o) => g.conflictsWith.includes(o.id) || o.conflictsWith.includes(g.id))
  const findings = lifeFindings.filter((f) => f.refType === 'goal' && f.refId === g.id)
  const impact = deletionImpact('goal', g.id, { goals, projects, indicators, readings }, quests, events, now)
  return (
    <Sheet open onClose={onClose} title={g.title}>
      <div className={s.detail}>
        <div>
          <div className={s.itemTop}><span className={s.bigValue}>{pct(p.value)}</span><Badge tone={TONE[g.status]}>{GOAL_STATUS_LABEL[g.status]}</Badge></div>
          <ProgressBar value={p.value} label={`Avancement de ${g.title}`} />
          <p className={s.metaRow} style={{ marginTop: 6 }}>
            <span>{catName(categories, g.categoryId)}</span><span>{IMPORTANCE_LABEL[g.importance]}</span><span>créé le {formatDue(g.createdAt.slice(0, 10))}</span>
            {g.dueDate ? <span>échéance {formatDue(g.dueDate)}</span> : null}
          </p>
          {p.parts.length ? <p className={s.metaRow} style={{ marginTop: 4 }}>{p.parts.map((x) => <span key={x.label}>{x.label} {pct(x.value)}</span>)}</p> : <p className={s.note} style={{ marginTop: 8 }}>Pas encore de projet, de critère ni de quête : l’avancement se calcule à partir de ce que vous y rattachez.</p>}
        </div>
        {g.description ? <p style={{ color: 'var(--c-text-dim)', overflowWrap: 'anywhere' }}>{g.description}</p> : null}
        <Field label="Statut"><Segmented<GoalStatus> label="Statut de l’objectif" value={g.status} options={GOAL_STATUSES.map((v) => ({ value: v, label: GOAL_STATUS_LABEL[v] }))} onChange={(v) => void run(() => goalService.setGoalStatus(g.id, v))} /></Field>
        {findings.map((f) => <div key={f.id} className={`${s.finding} ${f.severity === 'warn' ? s.warn : ''}`}><div><b>{f.title}</b><small>{f.detail}</small></div></div>)}
        {tensions.length ? <div className={s.finding}><div><b>En tension avec</b><small>{tensions.map((t) => t.title).join(', ')}</small></div></div> : null}
        {g.criteria.length ? (
          <section><h3>Critères de réussite</h3>
            <ul className={s.checkList}>{g.criteria.map((c) => (
              <li key={c.id} className={s.checkRow}><Box checked={c.done} label={`Critère : ${c.title}`} onToggle={() => void run(() => goalService.toggleCriterion(g.id, c.id))} /><span className={`${s.body} ${c.done ? s.doneText : ''}`}>{c.title}</span></li>
            ))}</ul>
          </section>
        ) : null}
        {g.milestones.length ? (
          <section><h3>Étapes intermédiaires</h3>
            <ul className={s.checkList}>{g.milestones.map((m) => (
              <li key={m.id} className={s.checkRow}><Box checked={m.done} label={`Étape : ${m.title}`} onToggle={() => void run(() => goalService.toggleMilestone(g.id, m.id))} /><span className={s.body}><span className={m.done ? s.doneText : ''}>{m.title}</span>{m.dueDate ? <small>pour le {formatDue(m.dueDate)}</small> : null}</span></li>
            ))}</ul>
          </section>
        ) : null}
        <section><h3>Projets ({myProjects.length})</h3>
          {myProjects.length === 0 ? <p style={{ color: 'var(--c-text-faint)', fontSize: 14 }}>Aucun projet. L’objectif peut aussi avancer directement par des quêtes (rattachez-les depuis la quête).</p> : (
            <ul className={s.checkList}>{myProjects.map((pr) => <li key={pr.id} className={s.checkRow}><span className={s.body}>{pr.title}<small>{pct(projectP.get(pr.id)!.value)} · {pr.steps.filter((x) => x.done).length}/{pr.steps.length} étapes</small></span></li>)}</ul>
          )}
        </section>
        {direct.length ? (
          <section><h3>Quêtes directes ({direct.length})</h3>
            <ul className={s.checkList}>{direct.map((q) => <li key={q.id} className={s.checkRow}><span className={s.body}><span className={cycleProgress(q, events, now).completed ? s.doneText : ''}>{q.title}</span><small>{cycleProgress(q, events, now).completed ? 'accomplie · XP déjà gagnée par la quête' : `+${q.rewardXp} XP à la validation de la quête`}</small></span></li>)}</ul>
          </section>
        ) : null}
        {inds.length ? (
          <section><h3>Indicateurs associés</h3>
            <ul className={s.checkList}>{inds.map((i) => { const st = indicatorState(i, readings); return <li key={i.id} className={s.checkRow}><span className={s.body}>{i.name}<small>{st.current !== null ? formatValue(i.kind, i.unit, st.current) : 'pas de mesure'}{i.target !== null ? ` / cible ${formatValue(i.kind, i.unit, i.target)}` : ''}</small></span></li> })}</ul>
          </section>
        ) : null}
        <GoalPilotage goalId={g.id} />
        <p className={s.note}>Valider un objectif ne rapporte pas d’XP : seules les quêtes rattachées récompensent.</p>
        {error ? <p className={errorClass} role="alert">{error}</p> : null}
        <div className={s.formActions} style={{ position: 'static' }}>
          <button className={sheet.btnDanger} onClick={() => setConfirmDelete(true)}>Supprimer</button>
          <button className={sheet.btnPrimary} onClick={() => onEdit(g)}>Modifier</button>
        </div>
      </div>
      <ConfirmDialog open={confirmDelete} title="Supprimer cet objectif ?" confirmLabel="Supprimer l’objectif" danger onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); void run(() => goalService.deleteGoal(g.id)).then(onClose) }}>
        <p><strong>{g.title}</strong> sera supprimé.</p>
        <p>{impact.projects} projet{impact.projects > 1 ? 's' : ''} ({impact.steps} étape{impact.steps > 1 ? 's' : ''}) et {impact.openQuests + impact.doneQuests} quête{impact.openQuests + impact.doneQuests > 1 ? 's' : ''} lié{impact.openQuests + impact.doneQuests > 1 ? 's' : ''} sont <strong>conservés</strong> : ils deviennent indépendants.</p>
        <p>Les quêtes déjà réalisées ({impact.doneQuests}) et toute l’XP gagnée restent intactes.</p>
        <StrategyDeleteNote goalId={g.id} />
      </ConfirmDialog>
    </Sheet>
  )
}

function GoalFormSheet({ open, goal, onClose }: { open: boolean; goal?: Goal; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title={goal ? 'Modifier l’objectif' : 'Nouvel objectif'}>{open ? <GoalForm goal={goal} onDone={onClose} /> : null}</Sheet>
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const { categories, indicators, goals } = useAppState()
  const cats = categories.filter((c) => !c.archived || c.id === goal?.categoryId)
  const [title, setTitle] = useState(goal?.title ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [categoryId, setCategoryId] = useState(goal?.categoryId ?? cats[0]?.id ?? '')
  const [priority, setPriority] = useState<Priority>(goal?.priority ?? 'normal')
  const [importance, setImportance] = useState<'1' | '2' | '3'>(String(goal?.importance ?? 2) as '1' | '2' | '3')
  const [dueDate, setDueDate] = useState(goal?.dueDate ?? '')
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'todo')
  const [criteria, setCriteria] = useState(goal?.criteria.map((c) => ({ ...c })) ?? [])
  const [milestones, setMilestones] = useState(goal?.milestones.map((m) => ({ ...m })) ?? [])
  const [indicatorIds, setIndicatorIds] = useState<string[]>(goal?.indicatorIds ?? [])
  const [conflictsWith, setConflicts] = useState<string[]>(goal?.conflictsWith ?? [])
  const { error, run } = useRunner()
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const others = goals.filter((g) => g.id !== goal?.id && (g.status === 'active' || g.status === 'todo' || g.status === 'paused'))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const input = { title, description, categoryId, dueDate: dueDate || null, priority, importance: Number(importance) as 1 | 2 | 3, status, criteria, milestones: milestones.map((m) => ({ ...m, dueDate: m.dueDate || null })), indicatorIds, conflictsWith }
    const ok = await run(() => (goal ? goalService.updateGoal(goal.id, input) : goalService.createGoal(input)))
    if (ok) onDone()
  }
  return (
    <form onSubmit={submit} id="goal-form">
      <Field label="Titre" htmlFor="g-title"><input id="g-title" className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Lancer mon activité" autoFocus={!goal} required /></Field>
      <Field label="Description (facultative)" htmlFor="g-desc"><textarea id="g-desc" className={textareaClass} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Catégorie" htmlFor="g-cat"><select id="g-cat" className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Statut"><Segmented<GoalStatus> label="Statut" value={status} options={GOAL_STATUSES.map((v) => ({ value: v, label: GOAL_STATUS_LABEL[v] }))} onChange={setStatus} /></Field>
      <Field label="Priorité" hint="Organise l’affichage ; ne rapporte aucune XP."><Segmented<Priority> label="Priorité" value={priority} options={PRIORITY_OPTIONS} onChange={setPriority} /></Field>
      <Field label="Importance"><Segmented<'1' | '2' | '3'> label="Importance" value={importance} options={([1, 2, 3] as const).map((v) => ({ value: String(v) as '1' | '2' | '3', label: IMPORTANCE_LABEL[v] }))} onChange={setImportance} /></Field>
      <Field label="Échéance (facultative)" htmlFor="g-due" hint="Level ne la modifie jamais sans votre confirmation."><input id="g-due" className={inputClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      <Field label="Critères de réussite" hint="Ce qui prouvera que l’objectif est atteint. Vous les validez vous-même.">
        <div className={s.stepsEdit}>
          {criteria.map((c, i) => (
            <div key={c.id} className={s.stepEdit}>
              <input className={inputClass} value={c.title} maxLength={120} aria-label={`Critère ${i + 1}`} onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <button type="button" className={smallBtn} aria-label={`Retirer le critère ${i + 1}`} onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}>Retirer</button>
            </div>
          ))}
          <button type="button" className={smallBtn} onClick={() => setCriteria([...criteria, { id: crypto.randomUUID(), title: '', done: false, doneAt: null }])}>+ Ajouter un critère</button>
        </div>
      </Field>
      <Field label="Étapes intermédiaires">
        <div className={s.stepsEdit}>
          {milestones.map((m, i) => (
            <div key={m.id} className={s.rowEdit}>
              <input className={inputClass} value={m.title} maxLength={120} aria-label={`Étape intermédiaire ${i + 1}`} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <input className={inputClass} type="date" aria-label={`Échéance de l’étape ${i + 1}`} value={m.dueDate ?? ''} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, dueDate: e.target.value || null } : x)))} />
              <button type="button" className={smallBtn} aria-label={`Retirer l’étape intermédiaire ${i + 1}`} onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}>Retirer</button>
            </div>
          ))}
          <button type="button" className={smallBtn} onClick={() => setMilestones([...milestones, { id: crypto.randomUUID(), title: '', dueDate: null, done: false, doneAt: null }])}>+ Ajouter une étape</button>
        </div>
      </Field>
      {indicators.length ? (
        <Field label="Indicateurs associés"><div className={s.optList}>{indicators.filter((i) => !i.archived || indicatorIds.includes(i.id)).map((i) => <label key={i.id}><input type="checkbox" checked={indicatorIds.includes(i.id)} onChange={() => toggle(indicatorIds, setIndicatorIds, i.id)} />{i.name}</label>)}</div></Field>
      ) : null}
      {others.length ? (
        <Field label="En tension avec" hint="Cochez les objectifs qui se contrarient : Level vous le signalera, sans rien modifier."><div className={s.optList}>{others.map((o) => <label key={o.id}><input type="checkbox" checked={conflictsWith.includes(o.id)} onChange={() => toggle(conflictsWith, setConflicts, o.id)} />{o.title}</label>)}</div></Field>
      ) : null}
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.formActions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary}>{goal ? 'Enregistrer' : 'Créer l’objectif'}</button>
      </div>
    </form>
  )
}
