import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Badge, Card, SectionTitle } from '@/design/components'
import { Field, inputClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { EXERCISES, EXERCISE_BY_ID } from '@/core/sport/exercises'
import { recommend, type Recommendation } from '@/core/sport/progression'
import { hasEquipmentVariant } from '@/core/sport/generator'
import { MUSCLE_GROUPS, MUSCLE_LABEL, type MuscleGroup } from '@/core/sport/types'
import { sportService } from '@/data/sportService'
import { useAction } from '../backup/useBackupData'
import s from './sport.module.css'

const ACTION_LABEL = { increase: 'Augmenter', hold: 'Maintenir', decrease: 'Réduire', recover: 'Récupérer' } as const
const ACTION_TONE = { increase: 'success', hold: 'neutral', decrease: 'info', recover: 'danger' } as const

export function StrengthPanel() {
  const { sport } = useAppState()
  const nav = useNavigate()
  const act = useAction()
  const [minutes, setMinutes] = useState(String(sport.profile.sessionMinutes ?? 45))
  const [focus, setFocus] = useState<MuscleGroup | ''>('')
  const [notes, setNotes] = useState<string[]>([])
  const [personal, setPersonal] = useState(false)
  const open = sport.sessions.filter((x) => ['strength', 'hiit'].includes(x.kind) && ['planned', 'active', 'paused'].includes(x.status)).sort((a, b) => a.date.localeCompare(b.date))
  const alert = sport.recovery.level === 'ALERTE'

  const recs = useMemo(() => {
    const ids = [...new Set(sport.sessions.filter((x) => x.status === 'completed' || x.status === 'partial').flatMap((x) => x.slots.flatMap((sl) => sl.logs.map((l) => l.exerciseId))))]
    const now = new Date()
    return ids.map((id) => recommend({ exerciseId: id, sessions: sport.sessions, state: sport.states.find((st) => st.exerciseId === id), recovery: sport.recovery, cycle: sport.cycle, decisions: sport.decisions, now, custom: sport.custom }))
      .filter((r) => {
        const lastExposure = sport.sessions.filter((x) => x.slots.some((sl) => sl.logs.some((l) => l.exerciseId === r.exerciseId))).map((x) => x.date).sort().pop() ?? ''
        const decided = sport.decisions.filter((d) => d.exerciseId === r.exerciseId).map((d) => d.at.slice(0, 10)).sort().pop() ?? ''
        return decided < lastExposure || r.action === 'recover'
      })
  }, [sport])
  const actionable = recs.filter((r) => r.action !== 'hold')

  const generate = async () => {
    const r = await act.run(() => sportService.generateStrength({ minutes: Number(minutes), focus: focus ? [focus] : undefined }))
    if (r) { setNotes(r.notes); nav(`/sport/seance/${r.session.id}`) }
  }
  const name = (id: string) => (EXERCISE_BY_ID[id] ?? sport.custom.find((c) => c.id === id))?.name ?? id

  return (
    <div className={s.stack}>
      <Card>
        <SectionTitle title="Préparer une séance" aside={hasEquipmentVariant(sport.profile) ? 'Avec et sans matériel' : 'Sans matériel'} />
        <p className={s.dim}>Level compose la séance selon vos priorités, vos mouvements à travailler, votre récupération, votre temps et votre historique. Vous pouvez la modifier avant et pendant la séance.</p>
        <div className={s.row2}>
          <Field label="Durée disponible" htmlFor="gs-min"><select id="gs-min" className={inputClass} value={minutes} onChange={(e) => setMinutes(e.target.value)}>{[20, 30, 45, 60, 75, 90].map((m) => <option key={m} value={m}>{m} min</option>)}</select></Field>
          <Field label="Groupe à travailler" htmlFor="gs-focus"><select id="gs-focus" className={inputClass} value={focus} onChange={(e) => setFocus(e.target.value as MuscleGroup | '')}><option value="">Level choisit</option>{MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{MUSCLE_LABEL[g]}</option>)}</select></Field>
        </div>
        {alert ? <p className={s.warn}>Alerte de récupération : aucune séance n’est proposée. Réévaluez-vous dans l’onglet Récupération.</p> : null}
        {act.error ? <p className={errorClass} role="alert">{act.error}</p> : null}
        {notes.map((n) => <p key={n} className={s.note}>{n}</p>)}
        <div className={s.actions}>
          <button className={sheet.btnGhost} onClick={() => setPersonal(true)}>Séance personnelle</button>
          <button className={sheet.btnPrimary} disabled={act.busy || alert} onClick={() => void generate()}>Générer la séance</button>
        </div>
      </Card>

      {open.length ? (
        <Card>
          <SectionTitle title="Séances en attente" />
          <ul className={s.list}>
            {open.map((x) => (
              <li key={x.id} className={s.rowCard}>
                <div><b>{x.title}</b><small>{x.date} · ~{x.plannedMinutes} min · {x.status === 'planned' ? 'prête' : 'en cours'}</small></div>
                <Link className={s.small} to={`/sport/seance/${x.id}`}>{x.status === 'planned' ? 'Ouvrir' : 'Reprendre'}</Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Recommandations de progression" aside={actionable.length ? `${actionable.length}` : undefined} />
        <p className={s.dim}>Level analyse plusieurs séances (répétitions, charges, technique, effort, récupération, douleurs). <b>Rien n’est appliqué sans votre confirmation.</b> La stagnation n’est pas un échec.</p>
        {recs.length === 0 ? <p className={s.dim}>Aucune recommandation pour l’instant. Elles apparaissent après plusieurs séances avec un même exercice.</p> : (
          <ul className={s.list}>
            {recs.map((r) => <RecoRow key={r.exerciseId} rec={r} name={name(r.exerciseId)} />)}
          </ul>
        )}
      </Card>
      <PersonalSheet open={personal} onClose={() => setPersonal(false)} />
    </div>
  )
}

function RecoRow({ rec, name }: { rec: Recommendation; name: string }) {
  const act = useAction()
  const unit = rec.unit === 'kg' ? ' kg' : rec.unit === 's' ? ' s' : ' rép.'
  return (
    <li className={s.reco}>
      <div className={s.recoHead}><b>{name}</b><Badge tone={ACTION_TONE[rec.action]}>{ACTION_LABEL[rec.action]}</Badge></div>
      <p>{rec.reason}</p>
      {rec.from !== null && rec.to !== null && rec.from !== rec.to ? <p className={s.dim}>{rec.from}{unit} → <b>{rec.to}{unit}</b> · {rec.exposures} expositions</p> : <p className={s.dim}>{rec.exposures} exposition{rec.exposures > 1 ? 's' : ''}</p>}
      {rec.caution ? <p className={s.warn}>{rec.caution}</p> : null}
      {rec.action !== 'hold' ? (
        <div className={s.actions}>
          <button className={s.small} disabled={act.busy} onClick={() => void act.run(() => sportService.decideProgression(rec, false))}>Garder tel quel</button>
          <button className={`${s.small} ${s.smallOn}`} disabled={act.busy} onClick={() => void act.run(() => sportService.decideProgression(rec, true))}>{rec.action === 'recover' ? 'J’ai compris' : 'Appliquer'}</button>
        </div>
      ) : null}
      {act.error ? <p className={errorClass}>{act.error}</p> : null}
    </li>
  )
}

function PersonalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="Séance personnelle">{open ? <PersonalForm onDone={onClose} /> : null}</Sheet>
}

function PersonalForm({ onDone }: { onDone: () => void }) {
  const { sport } = useAppState()
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [g, setG] = useState<MuscleGroup | 'all'>('all')
  const [pick, setPick] = useState<string[]>([])
  const { busy, error, run } = useAction()
  const list = [...EXERCISES.filter((e) => (e.kind === 'strength' || e.kind === 'mobility') && !e.hiitOnly && !e.pushup), ...sport.custom].filter((e) => g === 'all' || e.primary.includes(g))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await run(() => sportService.createPersonalSession(title, pick))
    if (r) { onDone(); nav(`/sport/seance/${r.id}`) }
  }
  return (
    <form onSubmit={submit}>
      <p className={s.dim}>Vous choisissez les exercices : Level ne les modifie pas. Une séance composée uniquement d’exercices de mobilité nourrit l’attribut Mobilité.</p>
      <Field label="Titre" htmlFor="ps-title"><input id="ps-title" className={inputClass} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} required /></Field>
      <Field label="Filtrer par groupe" htmlFor="ps-g"><select id="ps-g" className={inputClass} value={g} onChange={(e) => setG(e.target.value as MuscleGroup | 'all')}><option value="all">Tous</option>{MUSCLE_GROUPS.map((x) => <option key={x} value={x}>{MUSCLE_LABEL[x]}</option>)}</select></Field>
      <div className={s.pickList}>
        {list.map((e) => <label key={e.id} className={s.checkLine}><input type="checkbox" checked={pick.includes(e.id)} onChange={() => setPick(pick.includes(e.id) ? pick.filter((x) => x !== e.id) : [...pick, e.id])} /> {e.name}</label>)}
      </div>
      <p className={s.dim}>{pick.length} exercice{pick.length > 1 ? 's' : ''} choisi{pick.length > 1 ? 's' : ''}</p>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.actions}><button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button><button type="submit" className={sheet.btnPrimary} disabled={busy || !pick.length}>Créer et ouvrir</button></div>
    </form>
  )
}
