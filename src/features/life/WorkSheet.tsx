import { useMemo, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Field, Segmented, inputClass, textareaClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { planCredit, previewCompletion, type AwardContext } from '@/core/awards'
import { dayKey, addDays, fromDayKey } from '@/core/dates'
import type { XpEvent } from '@/core/ledger'
import { isMicroTask, REWARD_CONFIG } from '@/core/rewards'
import { QuestError, questService } from '@/data/questService'
import { ERROR_MESSAGES } from './labels'
import type { QuestView } from './useQuestViews'
import s from './life.module.css'

type Situation = 'full' | 'partial' | 'effort'

const SITUATIONS: Array<{ id: Situation; title: string; hint: string }> = [
  { id: 'full', title: 'Réussite complète', hint: 'Récompense normale.' },
  { id: 'partial', title: 'Progression partielle', hint: 'Proportionnelle au travail accompli.' },
  { id: 'effort', title: 'Effort sans objectif atteint', hint: 'Récompense réduite, mais valorisée.' },
]

/**
 * Enregistrer son travail : réussite, progression partielle ou effort sans résultat,
 * à la date d'aujourd'hui ou à une date antérieure (validation rétroactive).
 */
export function WorkSheet({ open, view, initialDoneOn, onClose }: { open: boolean; view: QuestView; initialDoneOn?: string; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Enregistrer mon travail">
      {open ? <WorkForm view={view} initialDoneOn={initialDoneOn} onDone={onClose} /> : null}
    </Sheet>
  )
}

function WorkForm({ view, initialDoneOn, onDone }: { view: QuestView; initialDoneOn?: string; onDone: () => void }) {
  const { quest, category } = view
  const { events, now } = useAppState()
  const today = dayKey(now)
  const micro = isMicroTask(quest.effortMinutes)
  const [situation, setSituation] = useState<Situation>('full')
  const [percent, setPercent] = useState('50')
  const [doneOn, setDoneOn] = useState(initialDoneOn ?? today)
  const [duration, setDuration] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<XpEvent[] | null>(null)

  const minDate = dayKey(addDays(now, -REWARD_CONFIG.retroactiveMaxDays))
  const retro = doneOn < today

  const preview = useMemo(() => {
    const doneAt = doneOn === today ? now : fromDayKey(doneOn)
    const ctx: AwardContext = {
      quest, category, now, doneAt, eventId: 'preview',
      questEvents: events.filter((e) => e.questId === quest.id),
      todayEvents: events.filter((e) => dayKey(new Date(e.at)) === doneOn),
    }
    if (situation === 'full') {
      const p = previewCompletion(ctx)
      return p.ok ? { amount: p.value } : { error: ERROR_MESSAGES[p.error] ?? 'Impossible.' }
    }
    const p = planCredit(ctx, { kind: situation, percent: Number(percent), durationMinutes: duration ? Number(duration) : null })
    return p.ok ? { amount: p.value.amount, reason: p.value.reason } : { error: ERROR_MESSAGES[p.error] ?? 'Impossible.' }
  }, [situation, percent, duration, doneOn, today, now, quest, category, events])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const opts = { doneOn }
      if (situation === 'full') setSaved(await questService.completeQuest(quest.id, opts))
      else setSaved([await questService.declareWork(quest.id, { kind: situation, percent: Number(percent), durationMinutes: duration ? Number(duration) : null, note, ...opts })])
    } catch (err) {
      setError(err instanceof QuestError ? (ERROR_MESSAGES[err.code] ?? 'Enregistrement impossible.') : 'Enregistrement impossible.')
    }
    setBusy(false)
  }

  if (saved) {
    const total = saved.reduce((n, ev) => n + ev.amount, 0)
    return (
      <div className={s.saved} role="status">
        <div className={s.savedMark} aria-hidden="true">✓</div>
        <h3>Enregistré</h3>
        <p className={s.savedXp}>+{total} XP</p>
        <p>{saved.length === 1 ? saved[0].reason : `${saved.length} étapes validées pour « ${quest.title} ».`}</p>
        {saved[0]?.retroactive ? <p className={s.note}>Validation rétroactive : accomplissement déclaré le {doneOn}, enregistré aujourd’hui. Séries et statistiques sont recalculées.</p> : null}
        <p className={s.hintLine}>Vous pouvez corriger ce gain à tout moment depuis l’onglet Récompenses.</p>
        <div className={s.formActions}><button className={sheet.btnPrimary} onClick={onDone} autoFocus>Terminé</button></div>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <p className={s.workTitle}>« {quest.title} »</p>
      <Field label="Situation">
        <div className={s.situations} role="radiogroup" aria-label="Situation">
          {SITUATIONS.map((x) => {
            const disabled = micro && x.id !== 'full'
            return (
              <button key={x.id} type="button" role="radio" aria-checked={situation === x.id} disabled={disabled} className={s.situation} onClick={() => setSituation(x.id)}>
                <b>{x.title}</b><small>{disabled ? 'Indisponible pour une micro-tâche.' : x.hint}</small>
              </button>
            )
          })}
        </div>
      </Field>

      {situation === 'partial' ? (
        <Field label="Part du travail accomplie" hint={`Entre ${REWARD_CONFIG.partialMinPercent} % et ${REWARD_CONFIG.partialMaxPercent} %, cumulative : seule la progression nouvelle est récompensée.`}>
          <Segmented label="Part du travail" value={['25', '50', '75'].includes(percent) ? percent : ''} options={[{ value: '25', label: '25 %' }, { value: '50', label: '50 %' }, { value: '75', label: '75 %' }]} onChange={setPercent} />
          <input className={inputClass} type="number" min={REWARD_CONFIG.partialMinPercent} max={REWARD_CONFIG.partialMaxPercent} inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} aria-label="Part du travail en pourcentage" style={{ marginTop: 6 }} />
        </Field>
      ) : null}

      <Field label="Date de réalisation" htmlFor="w-date" hint={retro ? 'Validation rétroactive : la date réelle et la date d’enregistrement sont toutes deux conservées.' : 'Aujourd’hui. Choisissez une date antérieure pour une validation rétroactive (14 jours maximum).'}>
        <input id="w-date" className={inputClass} type="date" min={minDate} max={today} value={doneOn} onChange={(e) => setDoneOn(e.target.value || today)} />
      </Field>

      {situation !== 'full' ? (
        <>
          <Field label="Durée travaillée (facultative)" htmlFor="w-dur" hint={situation === 'effort' ? 'Une durée proche de l’estimation valorise davantage l’effort.' : undefined}>
            <input id="w-dur" className={inputClass} type="number" min={1} max={1440} inputMode="numeric" placeholder="minutes" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
          <Field label="Commentaire (facultatif)" htmlFor="w-note">
            <textarea id="w-note" className={textareaClass} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ce qui a été fait, ce qui a bloqué…" />
          </Field>
        </>
      ) : null}

      <div className={s.reward} aria-live="polite">
        <span>Récompense</span>
        <b className="num">{'amount' in preview ? `+${preview.amount} XP` : '—'}</b>
        <small>{'amount' in preview ? 'Barème provisoire. Une validation finale ultérieure complète la récompense sans la dépasser.' : preview.error}</small>
      </div>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.formActions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary} disabled={busy || 'error' in preview}>Enregistrer</button>
      </div>
    </form>
  )
}
