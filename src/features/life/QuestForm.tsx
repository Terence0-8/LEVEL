import { useMemo, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Field, Segmented, inputClass, textareaClass, smallBtn, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { computeQuestReward } from '@/core/rewards'
import { findSimilarQuest, type Difficulty, type Priority, type Quest, type QuestType } from '@/core/quest'
import { QuestError, questService, type QuestInput } from '@/data/questService'
import { DIFFICULTY_OPTIONS, EFFORT_OPTIONS, PRIORITY_OPTIONS, TYPE_HINT, TYPE_OPTIONS } from './labels'
import s from './life.module.css'

const ERRORS: Record<string, string> = {
  invalid_title: 'Donnez un titre de 80 caractères maximum.',
  invalid_effort: "L'effort estimé doit être compris entre 1 min et 24 h.",
  unknown_category: 'Choisissez une catégorie existante.',
  invalid_step: 'Une étape doit avoir un titre de 80 caractères maximum (20 étapes max).',
}

/** Création et modification d'une quête (feuille modale). Remonte à zéro à chaque ouverture. */
export function QuestFormSheet({ open, quest, onClose }: { open: boolean; quest?: Quest; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={quest ? 'Modifier la quête' : 'Nouvelle quête'}>
      {open ? <QuestForm quest={quest} onDone={onClose} /> : null}
    </Sheet>
  )
}

function QuestForm({ quest, onDone }: { quest?: Quest; onDone: () => void }) {
  const { categories, quests } = useAppState()
  const active = categories.filter((c) => !c.archived || c.id === quest?.categoryId)
  const [type, setType] = useState<QuestType>(quest?.type ?? 'personal')
  const [title, setTitle] = useState(quest?.title ?? '')
  const [description, setDescription] = useState(quest?.description ?? '')
  const [categoryId, setCategoryId] = useState(quest?.categoryId ?? active[0]?.id ?? '')
  const [priority, setPriority] = useState<Priority>(quest?.priority ?? 'normal')
  const [difficulty, setDifficulty] = useState<Difficulty>(quest?.difficulty ?? 'normal')
  const [effort, setEffort] = useState(String(quest?.effortMinutes ?? 30))
  const [dueDate, setDueDate] = useState(quest?.dueDate ?? '')
  const [steps, setSteps] = useState<Array<{ id?: string; title: string }>>(quest?.steps.map((s) => ({ ...s })) ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const effortNum = Number(effort)
  const reward = useMemo(() => (effortNum >= 1 ? computeQuestReward({ difficulty, effortMinutes: effortNum }) : 0), [difficulty, effortNum])
  const similar = findSimilarQuest(quests, title, quest?.id)
  const hasEdits = quest ? (quest.steps.length > 0 || steps.some((s) => s.title.trim())) : false

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const input: QuestInput = { type, title, description, categoryId, priority, difficulty, effortMinutes: effortNum, dueDate: dueDate || null, steps }
    try {
      if (quest) await questService.updateQuest(quest.id, input)
      else await questService.createQuest(input)
      onDone()
    } catch (err) {
      setError(err instanceof QuestError ? (ERRORS[err.code] ?? 'Enregistrement impossible.') : 'Enregistrement impossible.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} id="quest-form">
      <Field label="Type" hint={TYPE_HINT[type]}><Segmented label="Type de quête" value={type} options={TYPE_OPTIONS} onChange={setType} /></Field>
      <Field label="Titre" htmlFor="q-title" hint={similar ? 'Une quête active porte déjà ce titre : évitez les doublons, ils ne rapportent pas plus.' : undefined}>
        <input id="q-title" className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Terminer le dossier client" autoFocus={!quest} required />
      </Field>
      <Field label="Description (facultative)" htmlFor="q-desc">
        <textarea id="q-desc" className={textareaClass} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Catégorie" htmlFor="q-cat">
        <select id="q-cat" className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Priorité" hint="Organise la liste ; n'augmente pas l'XP."><Segmented label="Priorité" value={priority} options={PRIORITY_OPTIONS} onChange={setPriority} /></Field>
      <Field label="Difficulté"><Segmented label="Difficulté" value={difficulty} options={DIFFICULTY_OPTIONS} onChange={setDifficulty} /></Field>
      <Field label="Effort estimé">
        <Segmented label="Effort estimé" value={EFFORT_OPTIONS.some((o) => o.value === effort) ? effort : ''} options={EFFORT_OPTIONS} onChange={setEffort} />
        <input className={inputClass} type="number" min={1} max={1440} inputMode="numeric" value={effort} onChange={(e) => setEffort(e.target.value)} aria-label="Effort estimé en minutes" style={{ marginTop: 6 }} />
      </Field>
      {type !== 'daily' && type !== 'weekly' ? (
        <Field label="Échéance (facultative)" htmlFor="q-due" hint="Une échéance dépassée ne fait jamais perdre d'XP.">
          <input id="q-due" className={inputClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      ) : null}
      <Field label="Étapes (facultatives)" hint="Chaque étape validée débloque sa part de la récompense. Découper n'augmente pas l'XP totale.">
        <div className={s.stepsEdit}>
          {steps.map((st, i) => (
            <div key={st.id ?? i} className={s.stepEdit}>
              <input className={inputClass} value={st.title} maxLength={80} aria-label={`Étape ${i + 1}`} placeholder={`Étape ${i + 1}`}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setSteps([...steps, { title: '' }]) } }} />
              <button type="button" className={smallBtn} onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label={`Retirer l'étape ${i + 1}`}>Retirer</button>
            </div>
          ))}
          <button type="button" className={smallBtn} onClick={() => setSteps([...steps, { title: '' }])} disabled={steps.length >= 20}>+ Ajouter une étape</button>
        </div>
        {hasEdits && quest ? <p style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Retirer une étape déjà validée annule l'XP qu'elle avait rapportée.</p> : null}
      </Field>
      <div className={s.reward} aria-live="polite">
        <span>Récompense</span><b className="num">+{reward} XP</b>
        <small>Calculée selon la difficulté et l'effort (barème provisoire).</small>
      </div>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.formActions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary} disabled={busy}>{quest ? 'Enregistrer' : 'Créer la quête'}</button>
      </div>
    </form>
  )
}
