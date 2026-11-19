import { useState } from 'react'
import { Field, inputClass, textareaClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { dayKey } from '@/core/dates'
import { isRecurring } from '@/core/quest'
import { simplifiedValues, type MissedAction, type MissedCause, type MissedItem } from '@/core/missed'
import { QuestError, questService } from '@/data/questService'
import { useAppState } from '@/app/AppState'
import { ACTION_HINT, ACTION_LABEL, CAUSE_LABEL, CAUSES, DIFFICULTY_LABEL, ERROR_MESSAGES, formatCycle } from './labels'
import s from './life.module.css'

const ACTIONS: MissedAction[] = ['none', 'postpone', 'simplify', 'replace', 'suspend']

export function AnalysisSheet({ item, onClose, onCatchUp }: { item: MissedItem | null; onClose: () => void; onCatchUp: (item: MissedItem) => void }) {
  return (
    <Sheet open={item !== null} onClose={onClose} title="Analyser une quête manquée">
      {item ? <AnalysisForm item={item} onDone={onClose} onCatchUp={onCatchUp} /> : null}
    </Sheet>
  )
}

function AnalysisForm({ item, onDone, onCatchUp }: { item: MissedItem; onDone: () => void; onCatchUp: (item: MissedItem) => void }) {
  const { quest } = item
  const { now } = useAppState()
  const [cause, setCause] = useState<MissedCause | null>(null)
  const [action, setAction] = useState<MissedAction>('none')
  const [dueDate, setDueDate] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const recurring = isRecurring(quest.type)
  const simple = simplifiedValues(quest)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const row = await questService.recordMissedAnalysis({ questId: quest.id, cycleKey: item.cycleKey, cause, action, note, dueDate: dueDate || undefined, newTitle })
      setSaved(row.actionDetail)
    } catch (err) {
      setError(err instanceof QuestError ? (ERROR_MESSAGES[err.code] ?? 'Enregistrement impossible.') : 'Enregistrement impossible.')
    }
  }

  if (saved) {
    return (
      <div className={s.saved} role="status">
        <div className={s.savedMark} aria-hidden="true">✓</div>
        <h3>Analyse enregistrée</h3>
        <p>{saved}</p>
        <p className={s.hintLine}>Aucune XP n’a été retirée. L’analyse reste consultable dans le bilan.</p>
        <div className={s.formActions}><button className={sheet.btnPrimary} onClick={onDone} autoFocus>Terminé</button></div>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <p className={s.workTitle}>« {quest.title} » · {formatCycle(item.cycleKey)}</p>
      <p className={s.hintLine}>Pas de jugement ni de pénalité : comprendre ce qui s’est passé aide à ajuster la quête.</p>
      <Field label="Cause principale">
        <div className={s.chipGrid} role="radiogroup" aria-label="Cause principale">
          {CAUSES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cause === c} className={s.causeBtn} onClick={() => setCause(c)}>{CAUSE_LABEL[c]}</button>
          ))}
        </div>
      </Field>
      <Field label="Que faire ?">
        <div className={s.situations} role="radiogroup" aria-label="Décision">
          {ACTIONS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={action === a} className={s.situation} onClick={() => setAction(a)}>
              <b>{ACTION_LABEL[a]}</b><small>{ACTION_HINT[a]}</small>
            </button>
          ))}
        </div>
      </Field>

      {action === 'postpone' && !recurring ? (
        <Field label="Nouvelle échéance" htmlFor="a-due"><input id="a-due" className={inputClass} type="date" min={dayKey(now)} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required /></Field>
      ) : null}
      {action === 'postpone' && recurring ? (
        <div className={s.note}>
          Cette quête revient à chaque cycle. Pour rattraper celui-ci, <button type="button" className={s.linkBtn} onClick={() => { onDone(); onCatchUp(item) }}>enregistrez le travail à sa vraie date</button>.
        </div>
      ) : null}
      {action === 'simplify' ? (
        <p className={s.note}>Difficulté {DIFFICULTY_LABEL[quest.difficulty]} → {DIFFICULTY_LABEL[simple.difficulty]}, effort {quest.effortMinutes} → {simple.effortMinutes} min. Les XP déjà acquises sont conservées.</p>
      ) : null}
      {action === 'replace' ? (
        <Field label="Titre de la quête de remplacement" htmlFor="a-title" hint="Même catégorie, type, difficulté et effort. L’ancienne quête est archivée.">
          <input id="a-title" className={inputClass} value={newTitle} maxLength={80} onChange={(e) => setNewTitle(e.target.value)} required />
        </Field>
      ) : null}

      <Field label="Commentaire (facultatif)" htmlFor="a-note"><textarea id="a-note" className={textareaClass} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.formActions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary} disabled={!cause}>Enregistrer l’analyse</button>
      </div>
    </form>
  )
}
