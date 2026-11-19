import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Field, inputClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { dayKey } from '@/core/dates'
import { MUSCLE_GROUPS, MUSCLE_LABEL, type MuscleGroup } from '@/core/sport/types'
import { sportService } from '@/data/sportService'
import { useAction } from '../backup/useBackupData'
import s from './sport.module.css'

/** Activité sportive imprévue : enregistrée et prise en compte dans la récupération et les statistiques, sans XP. */
export function UnplannedSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="Activité imprévue">{open ? <Form onDone={onClose} /> : null}</Sheet>
}

function Form({ onDone }: { onDone: () => void }) {
  const { now } = useAppState()
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState('60')
  const [rpe, setRpe] = useState(6)
  const [muscles, setMuscles] = useState<MuscleGroup[]>([])
  const [date, setDate] = useState(dayKey(now))
  const [saved, setSaved] = useState(false)
  const { busy, error, run } = useAction()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await run(() => sportService.logUnplanned({ title, minutes: Number(minutes), rpe, muscles, date }))
    if (r) setSaved(true)
  }
  if (saved) return (
    <div className={s.stack} role="status">
      <div className={s.proof}><b>Activité enregistrée</b><p>Elle est prise en compte dans votre récupération et vos statistiques. Les activités imprévues ne rapportent pas d’XP.</p></div>
      <div className={s.actions}><button className={sheet.btnPrimary} onClick={onDone}>Terminé</button></div>
    </div>
  )
  return (
    <form onSubmit={submit}>
      <p className={s.dim}>Un match, une randonnée, une séance improvisée… Level l’enregistre pour mieux estimer votre fatigue, sans XP.</p>
      <Field label="Activité" htmlFor="up-title"><input id="up-title" className={inputClass} value={title} maxLength={60} placeholder="Ex. Football entre amis" onChange={(e) => setTitle(e.target.value)} required autoFocus /></Field>
      <div className={s.row2}>
        <Field label="Durée (min)" htmlFor="up-min"><input id="up-min" className={inputClass} type="number" min={5} max={600} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} required /></Field>
        <Field label="Date" htmlFor="up-date"><input id="up-date" className={inputClass} type="date" max={dayKey(now)} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Effort ressenti (1–10)"><div className={s.chips}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => <button key={v} type="button" className={s.chip} aria-pressed={rpe === v} onClick={() => setRpe(v)}>{v}</button>)}</div></Field>
      <Field label="Muscles sollicités (facultatif)"><div className={s.chips}>{MUSCLE_GROUPS.map((g) => <button key={g} type="button" className={s.chip} aria-pressed={muscles.includes(g)} onClick={() => setMuscles(muscles.includes(g) ? muscles.filter((x) => x !== g) : [...muscles, g])}>{MUSCLE_LABEL[g]}</button>)}</div></Field>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.actions}><button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button><button type="submit" className={sheet.btnPrimary} disabled={busy}>Enregistrer</button></div>
    </form>
  )
}
