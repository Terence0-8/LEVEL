import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, ProgressBar, SectionTitle } from '@/design/components'
import { Field, Segmented, errorClass, inputClass, smallBtn, textareaClass } from '@/design/Form'
import { Icon } from '@/design/Icon'
import { ConfirmDialog, Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { dayKey } from '@/core/dates'
import { deletionImpact, PROJECT_STATUS_LABEL, PROJECT_STATUSES, projectLastActivity, questsOfProject, questsOfStep, stepProgress, type Project, type ProjectStatus, type Step } from '@/core/goals'
import { isRecurring, type Priority, type Quest } from '@/core/quest'
import { cycleProgress } from '@/core/questState'
import { goalService } from '@/data/goalService'
import { ProjectPilotage, StrategyDeleteNote } from '@/features/pilotage/LinksSection'
import { questService } from '@/data/questService'
import { QuestFormSheet } from './QuestForm'
import { PRIORITY_LABEL, PRIORITY_OPTIONS, formatDue } from './labels'
import { Box, catName, pct, useLifeMaps, useRunner } from './lifeShared'
import s from './life.module.css'

const TONE: Record<ProjectStatus, 'neutral' | 'gold' | 'info' | 'success' | 'danger'> = { prepare: 'neutral', active: 'gold', paused: 'info', done: 'success', abandoned: 'danger' }

export function ProjectsPanel() {
  const { projects, categories, goals, now } = useAppState()
  const { projectP } = useLifeMaps()
  const [status, setStatus] = useState<'all' | ProjectStatus>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState<{ project?: Project } | null>(null)
  const today = dayKey(now)
  const list = projects.filter((p) => status === 'all' || p.status === status)
    .sort((a, b) => PROJECT_STATUSES.indexOf(a.status) - PROJECT_STATUSES.indexOf(b.status) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  return (
    <div className={s.stack}>
      <div className={s.head2}>
        <SectionTitle title="Projets" aside={`${projects.filter((p) => p.status === 'active').length} en cours`} />
        <button className={sheet.btnPrimary} onClick={() => setForm({})}>+ Nouveau projet</button>
      </div>
      {projects.length === 0 ? (
        <Card variant="flat"><div className={s.empty}>
          <h3>Aucun projet pour l’instant</h3>
          <p>Un projet organise des actions autour d’un but : « Préparer un voyage », « Organiser un événement ». Découpez-le en étapes, rattachez-y des quêtes, ou gardez-le simple.</p>
          <button className={sheet.btnPrimary} onClick={() => setForm({})}>Créer mon premier projet</button>
        </div></Card>
      ) : (
        <>
          <div className={s.chips} role="group" aria-label="Filtrer par statut">
            {(['all', ...PROJECT_STATUSES] as const).map((f) => <button key={f} aria-pressed={status === f} onClick={() => setStatus(f)}>{f === 'all' ? 'Tous' : PROJECT_STATUS_LABEL[f]}</button>)}
          </div>
          <div className={s.cards}>
            {list.length === 0 ? <p style={{ color: 'var(--c-text-dim)' }}>Aucun projet avec ce statut.</p> : null}
            {list.map((p) => {
              const pr = projectP.get(p.id)!
              const late = p.dueDate && p.dueDate < today && (p.status === 'active' || p.status === 'prepare')
              const blocked = p.steps.some((x) => !x.done && x.blocked)
              const goal = goals.find((g) => g.id === p.goalId)
              return (
                <button key={p.id} className={s.itemCard} onClick={() => setOpen(p.id)} aria-label={`Ouvrir le projet ${p.title}`}>
                  <div className={s.itemTop}><span className={s.itemTitle}>{p.title}</span><span className={`${s.pct} num`}>{pct(pr.value)}</span></div>
                  <ProgressBar value={pr.value} thin label={`Avancement de ${p.title}`} />
                  <div className={s.metaRow}>
                    <span><Badge tone={TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge></span>
                    <span>{catName(categories, p.categoryId)}</span>
                    <span>{pr.doneSteps}/{pr.totalSteps} étapes</span>
                    {goal ? <span>↳ {goal.title}</span> : null}
                    {p.dueDate ? <span className={late ? s.warnText : undefined}>{late ? 'en retard · ' : ''}{formatDue(p.dueDate)}</span> : null}
                    {blocked ? <span className={s.dangerText}>étape bloquée</span> : null}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
      <ProjectDetail id={open} onClose={() => setOpen(null)} onEdit={(p) => { setOpen(null); setForm({ project: p }) }} />
      <Sheet open={form !== null} onClose={() => setForm(null)} title={form?.project ? 'Modifier le projet' : 'Nouveau projet'}>{form !== null ? <ProjectForm project={form.project} onDone={() => setForm(null)} /> : null}</Sheet>
    </div>
  )
}

function ProjectDetail({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (p: Project) => void }) {
  const { projects, goals, quests, events, categories, lifeFindings, moves, now, indicators, readings } = useAppState()
  const { projectP } = useLifeMaps()
  const { error, run } = useRunner()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [stepTitle, setStepTitle] = useState('')
  const [stepDue, setStepDue] = useState('')
  const [editStep, setEditStep] = useState<Step | null>(null)
  const [newQuest, setNewQuest] = useState<{ stepId: string | null } | null>(null)
  const p = projects.find((x) => x.id === id)
  if (!p) return <Sheet open={false} onClose={onClose} title=""><></></Sheet>
  const pr = projectP.get(p.id)!
  const goal = goals.find((g) => g.id === p.goalId)
  const mine = questsOfProject(quests, p.id)
  const loose = mine.filter((q) => !q.stepId || !p.steps.some((x) => x.id === q.stepId))
  const attachable = quests.filter((q) => !q.archived && !isRecurring(q.type) && !q.projectId && !cycleProgress(q, events, now).completed)
  const findings = lifeFindings.filter((f) => f.refType === 'project' && f.refId === p.id)
  const impact = deletionImpact('project', p.id, { goals, projects, indicators, readings }, quests, events, now)
  const done = (q: Quest) => cycleProgress(q, events, now).completed
  const history = [
    ...p.steps.filter((x) => x.doneAt).map((x) => ({ at: x.doneAt!, text: `Étape validée : ${x.title}` })),
    ...events.filter((e) => e.kind === 'award' && e.status === 'valid' && mine.some((q) => q.id === e.questId)).map((e) => ({ at: e.at, text: `Quête accomplie : ${e.label} (+${e.amount} XP)` })),
    ...moves.filter((m) => m.kind === 'project' && m.refId === p.id).map((m) => ({ at: m.at, text: m.reason })),
    { at: p.createdAt, text: 'Projet créé' },
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
  const lastAct = projectLastActivity(p, quests, events).slice(0, 10)

  const questRow = (q: Quest) => (
    <li key={q.id} className={s.checkRow}>
      <span className={s.body}><span className={done(q) ? s.doneText : ''}>{q.title}</span><small>{done(q) ? 'accomplie — XP déjà gagnée par la quête' : `+${q.rewardXp} XP à la validation`}</small></span>
      {!done(q) && q.steps.length === 0 ? <button className={s.mini} onClick={() => void run(() => questService.completeQuest(q.id))} aria-label={`Valider la quête ${q.title}`}>Valider</button> : null}
      <button className={s.mini} onClick={() => void run(() => goalService.linkQuest(q.id, {}))} aria-label={`Détacher la quête ${q.title}`}>Détacher</button>
    </li>
  )

  return (
    <Sheet open onClose={onClose} title={p.title}>
      <div className={s.detail}>
        <div>
          <div className={s.itemTop}><span className={s.bigValue}>{pct(pr.value)}</span><Badge tone={TONE[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge></div>
          <ProgressBar value={pr.value} label={`Avancement de ${p.title}`} />
          <p className={s.metaRow} style={{ marginTop: 6 }}>
            <span>{catName(categories, p.categoryId)}</span><span>Priorité {PRIORITY_LABEL[p.priority].toLowerCase()}</span>
            {goal ? <span>objectif : {goal.title}</span> : <span>projet indépendant</span>}
            {p.startDate ? <span>début {formatDue(p.startDate)}</span> : null}{p.dueDate ? <span>échéance {formatDue(p.dueDate)}</span> : null}
            <span>dernière activité {formatDue(lastAct)}</span>
          </p>
          <p className={s.metaRow} style={{ marginTop: 4 }}><span>{pr.doneSteps}/{pr.totalSteps} étapes validées</span><span>{pr.doneQuests} quête{pr.doneQuests > 1 ? 's' : ''} accomplie{pr.doneQuests > 1 ? 's' : ''} sur {pr.doneQuests + pr.openQuests}</span></p>
        </div>
        {p.description ? <p style={{ color: 'var(--c-text-dim)', overflowWrap: 'anywhere' }}>{p.description}</p> : null}
        <Field label="Statut"><Segmented<ProjectStatus> label="Statut du projet" value={p.status} options={PROJECT_STATUSES.map((v) => ({ value: v, label: PROJECT_STATUS_LABEL[v] }))} onChange={(v) => void run(() => goalService.setProjectStatus(p.id, v))} /></Field>
        {findings.map((f) => <div key={f.id} className={`${s.finding} ${f.severity === 'warn' ? s.warn : ''}`}><div><b>{f.title}</b><small>{f.detail}</small></div></div>)}

        <ProjectPilotage projectId={p.id} />

        <section>
          <h3>Étapes</h3>
          {p.steps.length === 0 ? <p style={{ color: 'var(--c-text-faint)', fontSize: 14, marginBottom: 8 }}>Aucune étape : le projet reste simple et avance avec ses quêtes. Ajoutez des étapes si cela vous aide.</p> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {p.steps.map((st, i) => {
              const sp = stepProgress(st, quests, events, now)
              const sq = questsOfStep(quests, st.id)
              const allReady = !st.done && sp >= 0.9 && (st.subtasks.length > 0 || sq.length > 0)
              return (
                <div key={st.id} className={`${s.stepBox} ${st.blocked && !st.done ? s.blocked : ''}`}>
                  <div className={s.stepHead}>
                    <Box checked={st.done} label={st.done ? `Réouvrir l’étape ${st.title}` : `Valider l’étape ${st.title}`} onToggle={() => void run(() => goalService.toggleStep(p.id, st.id))} />
                    <span className={s.body}><span className={st.done ? s.doneText : ''} style={{ fontWeight: 600 }}>{st.title}</span><small>{st.done ? 'validée' : `${pct(sp)} accompli`}{st.dueDate ? ` · pour le ${formatDue(st.dueDate)}` : ''}</small></span>
                    <button className={s.mini} disabled={i === 0} onClick={() => void run(() => goalService.moveStep(p.id, st.id, -1))} aria-label={`Monter l’étape ${st.title}`}>↑</button>
                    <button className={s.mini} disabled={i === p.steps.length - 1} onClick={() => void run(() => goalService.moveStep(p.id, st.id, 1))} aria-label={`Descendre l’étape ${st.title}`}>↓</button>
                    <button className={s.mini} onClick={() => setEditStep(st)} aria-label={`Modifier l’étape ${st.title}`}>Modifier</button>
                  </div>
                  {st.blocked && !st.done ? <p className={s.dangerText} style={{ fontSize: 13 }}>Bloquée : {st.blocked}</p> : null}
                  {allReady ? <p className={s.note}>Tout semble fait : validez l’étape quand vous l’estimez terminée.</p> : null}
                  {st.subtasks.length ? (
                    <ul className={s.sub}>{st.subtasks.map((t) => (
                      <li key={t.id}><Box checked={t.done} label={`Sous-tâche : ${t.title}`} onToggle={() => void run(() => goalService.toggleSubtask(p.id, st.id, t.id))} /><span className={t.done ? s.doneText : ''} style={{ flex: 1 }}>{t.title}</span><button className={s.mini} aria-label={`Retirer la sous-tâche ${t.title}`} onClick={() => void run(() => goalService.removeSubtask(p.id, st.id, t.id))}>×</button></li>
                    ))}</ul>
                  ) : null}
                  {sq.length ? <ul className={s.checkList} style={{ marginLeft: 38 }}>{sq.map(questRow)}</ul> : null}
                  <SubAdd onAdd={(text) => run(() => goalService.addSubtask(p.id, st.id, text))} />
                  <div className={s.inlineAdd} style={{ marginLeft: 38 }}>
                    <button className={s.mini} onClick={() => setNewQuest({ stepId: st.id })}>+ Nouvelle quête dans cette étape</button>
                  </div>
                </div>
              )
            })}
          </div>
          <form className={s.inlineAdd} style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (!stepTitle.trim()) return; void run(() => goalService.addStep(p.id, { title: stepTitle, dueDate: stepDue || null })).then((ok) => { if (ok) { setStepTitle(''); setStepDue('') } }) }}>
            <input className={inputClass} value={stepTitle} maxLength={120} onChange={(e) => setStepTitle(e.target.value)} placeholder="Nouvelle étape" aria-label="Titre de la nouvelle étape" />
            <input className={inputClass} type="date" value={stepDue} onChange={(e) => setStepDue(e.target.value)} aria-label="Échéance de la nouvelle étape" style={{ maxWidth: 170 }} />
            <button className={smallBtn} type="submit">Ajouter l’étape</button>
          </form>
        </section>

        <section>
          <h3>Quêtes du projet{p.steps.length ? ' (hors étape)' : ''}</h3>
          {loose.length ? <ul className={s.checkList}>{loose.map(questRow)}</ul> : <p style={{ color: 'var(--c-text-faint)', fontSize: 14 }}>Aucune quête rattachée directement au projet.</p>}
          <div className={s.inlineAdd} style={{ marginTop: 8 }}>
            <button className={s.mini} onClick={() => setNewQuest({ stepId: null })}>+ Nouvelle quête</button>
            {attachable.length ? (
              <select className={s.sel} aria-label="Rattacher une quête existante" value="" onChange={(e) => e.target.value && void run(() => goalService.linkQuest(e.target.value, { projectId: p.id }))}>
                <option value="">Rattacher une quête existante…</option>
                {attachable.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
            ) : null}
          </div>
          <p className={s.note} style={{ marginTop: 8 }}>Ces quêtes restent de vraies quêtes LIFE : seule leur validation rapporte de l’XP. Valider une étape ou le projet n’en rapporte pas.</p>
        </section>

        <section><h3>Historique</h3><ul className={s.checkList}>{history.map((h, i) => <li key={i} className={s.checkRow}><span className={s.body}>{h.text}<small>{formatDue(h.at.slice(0, 10))}</small></span></li>)}</ul></section>
        {error ? <p className={errorClass} role="alert">{error}</p> : null}
        <div className={s.formActions} style={{ position: 'static' }}>
          <button className={sheet.btnDanger} onClick={() => setConfirmDelete(true)}>Supprimer</button>
          <button className={sheet.btnPrimary} onClick={() => onEdit(p)}>Modifier</button>
        </div>
      </div>
      <ConfirmDialog open={confirmDelete} title="Supprimer ce projet ?" confirmLabel="Supprimer le projet" danger onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); void run(() => goalService.deleteProject(p.id)).then(onClose) }}>
        <p><strong>{p.title}</strong> et ses {impact.steps} étape{impact.steps > 1 ? 's' : ''} seront supprimés.</p>
        <p>Les {impact.openQuests + impact.doneQuests} quête{impact.openQuests + impact.doneQuests > 1 ? 's' : ''} rattachée{impact.openQuests + impact.doneQuests > 1 ? 's' : ''} sont <strong>conservée{impact.openQuests + impact.doneQuests > 1 ? 's' : ''}</strong> et deviennent indépendantes. Les quêtes déjà réalisées ({impact.doneQuests}) et l’XP gagnée restent intactes.</p>
        <StrategyDeleteNote projectId={p.id} />
      </ConfirmDialog>
      <StepEditSheet project={p} step={editStep} onClose={() => setEditStep(null)} />
      <QuestFormSheet open={newQuest !== null} onClose={() => setNewQuest(null)} preset={{ projectId: p.id, stepId: newQuest?.stepId ?? null }} />
    </Sheet>
  )
}

function SubAdd({ onAdd }: { onAdd: (t: string) => Promise<unknown> }) {
  const [t, setT] = useState('')
  return (
    <form className={s.inlineAdd} style={{ marginLeft: 38 }} onSubmit={(e) => { e.preventDefault(); if (!t.trim()) return; void onAdd(t).then((ok) => ok && setT('')) }}>
      <input className={inputClass} style={{ minHeight: 36 }} value={t} maxLength={120} onChange={(e) => setT(e.target.value)} placeholder="Ajouter une sous-tâche" aria-label="Nouvelle sous-tâche" />
      <button className={s.mini} type="submit"><Icon name="check" size={12} /> Ajouter</button>
    </form>
  )
}

function StepEditSheet({ project, step, onClose }: { project: Project; step: Step | null; onClose: () => void }) {
  const { error, run } = useRunner()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [blocked, setBlocked] = useState('')
  const [loaded, setLoaded] = useState<string | null>(null)
  if ((step?.id ?? null) !== loaded) { setLoaded(step?.id ?? null); if (step) { setTitle(step.title); setDue(step.dueDate ?? ''); setBlocked(step.blocked ?? '') } }
  const [confirm, setConfirm] = useState(false)
  if (!step) return <Sheet open={false} onClose={onClose} title=""><></></Sheet>
  return (
    <Sheet open onClose={onClose} title="Modifier l’étape" footer={<>
      <button className={sheet.btnDanger} onClick={() => setConfirm(true)}>Supprimer</button>
      <button className={sheet.btnPrimary} onClick={() => void run(() => goalService.updateStep(project.id, step.id, { title, dueDate: due || null, blocked: blocked || null })).then((ok) => ok && onClose())}>Enregistrer</button>
    </>}>
      <Field label="Titre" htmlFor="st-title"><input id="st-title" className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Échéance (facultative)" htmlFor="st-due"><input id="st-due" type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      <Field label="Étape bloquée ?" htmlFor="st-block" hint="Indiquez ce qui bloque ; Level la signale. Laissez vide si l’étape n’est pas bloquée."><textarea id="st-block" className={textareaClass} maxLength={200} value={blocked} onChange={(e) => setBlocked(e.target.value)} /></Field>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <ConfirmDialog open={confirm} title="Supprimer cette étape ?" confirmLabel="Supprimer l’étape" danger onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void run(() => goalService.removeStep(project.id, step.id)).then(onClose) }}>
        <p>Ses sous-tâches seront supprimées. Les quêtes rattachées à l’étape sont conservées (elles restent dans le projet), avec leur XP.</p>
      </ConfirmDialog>
    </Sheet>
  )
}

function ProjectForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const { categories, goals } = useAppState()
  const cats = categories.filter((c) => !c.archived || c.id === project?.categoryId)
  const [title, setTitle] = useState(project?.title ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [categoryId, setCategoryId] = useState(project?.categoryId ?? cats[0]?.id ?? '')
  const [goalId, setGoalId] = useState(project?.goalId ?? '')
  const [priority, setPriority] = useState<Priority>(project?.priority ?? 'normal')
  const [startDate, setStart] = useState(project?.startDate ?? '')
  const [dueDate, setDue] = useState(project?.dueDate ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'prepare')
  const { error, run } = useRunner()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const input = { title, description, categoryId, goalId: goalId || null, priority, startDate: startDate || null, dueDate: dueDate || null, status }
    if (await run(() => (project ? goalService.updateProject(project.id, input) : goalService.createProject(input)))) onDone()
  }
  return (
    <form onSubmit={submit} id="project-form">
      <Field label="Titre" htmlFor="p-title"><input id="p-title" className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Développer Solitiquo" autoFocus={!project} required /></Field>
      <Field label="Description (facultative)" htmlFor="p-desc"><textarea id="p-desc" className={textareaClass} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Catégorie" htmlFor="p-cat"><select id="p-cat" className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Objectif parent (facultatif)" htmlFor="p-goal" hint="Un projet peut rester indépendant."><select id="p-goal" className={inputClass} value={goalId} onChange={(e) => setGoalId(e.target.value)}><option value="">Aucun — projet indépendant</option>{goals.filter((g) => g.status !== 'abandoned' || g.id === project?.goalId).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></Field>
      <Field label="Statut"><Segmented<ProjectStatus> label="Statut" value={status} options={PROJECT_STATUSES.map((v) => ({ value: v, label: PROJECT_STATUS_LABEL[v] }))} onChange={setStatus} /></Field>
      <Field label="Priorité"><Segmented<Priority> label="Priorité" value={priority} options={PRIORITY_OPTIONS} onChange={setPriority} /></Field>
      <div className={s.cols2}>
        <Field label="Début (facultatif)" htmlFor="p-start"><input id="p-start" className={inputClass} type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Échéance (facultative)" htmlFor="p-due"><input id="p-due" className={inputClass} type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.formActions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary}>{project ? 'Enregistrer' : 'Créer le projet'}</button>
      </div>
    </form>
  )
}
