import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, EmptyState, SectionTitle } from '@/design/components'
import { Field, Segmented, inputClass, errorClass } from '@/design/Form'
import { ConfirmDialog, Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { EXERCISE_BY_ID } from '@/core/sport/exercises'
import { formatPace, formatDuration } from '@/core/sport/running'
import type { SetLog, SportSession } from '@/core/sport/session'
import { sessionDebrief } from '@/core/sport/stats'
import { completion } from '@/core/sport/xp'
import { RUN_FAMILY_LABEL, type Exercise, type SessionKind } from '@/core/sport/types'
import { sportService } from '@/data/sportService'
import { formatDayLabel } from '@/lib/format'
import { useAction } from '../backup/useBackupData'
import s from './sport.module.css'

const KIND: Record<SessionKind, string> = { strength: 'Musculation', run: 'Course', hiit: 'HIIT', mobility: 'Mobilité', other: 'Activité imprévue' }
const STATUS = { completed: 'Terminée', partial: 'Écourtée', abandoned: 'Abandonnée', planned: 'Prévue', active: 'En cours', paused: 'Interrompue' } as const

/** Historique sportif : consultation détaillée et correction. Toute correction recalcule XP, niveaux, attributs, records et recommandations. */
export function HistoryPanel() {
  const { sport } = useAppState()
  const [kind, setKind] = useState<'all' | SessionKind>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const list = [...sport.sessions].filter((x) => x.status !== 'planned' && (kind === 'all' || x.kind === kind)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const open = sport.sessions.find((x) => x.id === openId) ?? null
  return (
    <div className={s.stack}>
      <Segmented label="Type" value={kind} options={[{ value: 'all', label: 'Tout' }, { value: 'strength', label: 'Muscu' }, { value: 'run', label: 'Course' }, { value: 'other', label: 'Imprévues' }]} onChange={setKind} />
      <Card>
        <SectionTitle title="Historique sportif" aside={`${list.length}`} />
        {list.length === 0 ? <EmptyState title="Aucune séance enregistrée">Vos séances, courses et activités apparaîtront ici, avec leur détail et la possibilité de les corriger.</EmptyState> : (
          <ul className={s.list}>
            {list.map((x) => {
              const c = completion(x)
              return (
                <li key={x.id}>
                  <button className={`${s.rowCard} ${s.rowBtn}`} onClick={() => setOpenId(x.id)}>
                    <div><b>{x.title || KIND[x.kind]}</b><small>{formatDayLabel(x.date + 'T12:00:00')} · {KIND[x.kind]}{x.kind === 'run' && x.run ? ` · ${x.run.distanceKm} km` : x.kind === 'strength' || x.kind === 'hiit' ? ` · ${c.done}/${c.planned} séries` : ''}</small></div>
                    <span className={s.chips}><Badge tone={x.status === 'completed' ? 'success' : x.status === 'partial' ? 'info' : 'neutral'}>{STATUS[x.status]}</Badge>{x.origin === 'unplanned' ? <Badge>Sans XP</Badge> : null}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <Sheet open={open !== null} onClose={() => setOpenId(null)} title={open?.title || 'Séance'}>{open ? <Detail session={open} onClose={() => setOpenId(null)} /> : null}</Sheet>
    </div>
  )
}

function Detail({ session, onClose }: { session: SportSession; onClose: () => void }) {
  const { sport, events } = useAppState()
  const act = useAction()
  const [title, setTitle] = useState(session.title)
  const [date, setDate] = useState(session.date)
  const [notes, setNotes] = useState(session.notes)
  const [status, setStatus] = useState(session.status)
  const [del, setDel] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ slotId: string; log: SetLog } | null>(null)
  const exOf = (id: string): Exercise | undefined => EXERCISE_BY_ID[id] ?? sport.custom.find((c) => c.id === id)
  const xp = events.filter((e) => e.sourceId === session.id && e.domain === 'SPORT')
  const total = xp.reduce((n, e) => n + e.amount, 0)
  const lines = sessionDebrief(session, sport.sessions, sport.custom)
  const save = async () => {
    const r = await act.run(() => sportService.correctSession(session.id, { title, date, notes, status: status as 'completed' | 'partial' | 'abandoned' }))
    if (r) setMsg(r.xp.awarded || r.xp.reversed ? `Corrigé : ${r.xp.reversed} gain(s) annulé(s), ${r.xp.awarded} recalculé(s). XP, niveaux, attributs, records et recommandations sont à jour.` : 'Corrigé : aucun écart d’XP.')
  }
  return (
    <div className={s.stack}>
      <p className={s.dim}>{formatDayLabel(session.date + 'T12:00:00')} · {KIND[session.kind]} · {STATUS[session.status]}</p>
      <ul className={s.debrief}>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {session.run ? <table className={s.table}><tbody>
        <tr><td>Famille</td><td>{RUN_FAMILY_LABEL[session.run.family]}</td></tr>
        <tr><td>Distance / durée</td><td className="num">{session.run.distanceKm} km · {formatDuration(session.run.durationSec)}</td></tr>
        <tr><td>Allure</td><td className="num">{formatPace(session.run.paceSecPerKm)}</td></tr>
        {session.run.intervals.map((i, n) => <tr key={n}><td>Intervalle {n + 1}</td><td className="num">{i.distanceKm ? `${i.distanceKm} km · ` : ''}{i.durationSec} s{i.restSec ? ` · repos ${i.restSec} s` : ''}</td></tr>)}
      </tbody></table> : null}
      {session.slots.filter((sl) => sl.logs.length || sl.status === 'skipped').map((sl) => (
        <div key={sl.id}>
          <h3 className={s.h3}>{sl.logs[0] ? exOf(sl.logs[0].exerciseId)?.name : exOf((sl.equipment ?? sl.bodyweight)?.exerciseId ?? '')?.name}{sl.status === 'skipped' ? ' (passé)' : ''}</h3>
          {sl.logs.map((l) => {
            const ex = exOf(l.exerciseId)
            return <button key={l.n} className={s.setRow} onClick={() => setEditing({ slotId: sl.id, log: l })}><span>#{l.n}</span><b className="num">{ex?.mode === 'time' ? `${l.durationSec ?? 0} s` : `${l.reps ?? 0} rép.${l.loadKg ? ` × ${l.loadKg} kg` : ''}`}</b><small>effort {l.rpe ?? '—'}{l.pain && l.pain !== 'none' ? ' · douleur' : ''}</small></button>
          })}
        </div>
      ))}
      <section>
        <h3 className={s.h3}>XP de cette séance : {total} XP</h3>
        {xp.length ? <ul className={s.list}>{xp.map((e) => <li key={e.id} className={s.rowCard}><div><b>{e.kind === 'reversal' ? `Correction · ${e.label}` : e.label}</b><small>{e.reason}</small></div><span className="num">{e.amount > 0 ? '+' : ''}{e.amount}</span></li>)}</ul> : <p className={s.dim}>{session.origin === 'unplanned' ? 'Activité imprévue : sans XP, mais comptée dans la récupération et les statistiques.' : 'Aucun gain pour cette séance.'}</p>}
      </section>
      <section>
        <h3 className={s.h3}>Corriger</h3>
        <Field label="Titre" htmlFor="hs-t"><input id="hs-t" className={inputClass} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Date" htmlFor="hs-d"><input id="hs-d" className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {session.status !== 'planned' ? <Field label="Statut"><Segmented label="Statut" value={status} options={[{ value: 'completed', label: 'Terminée' }, { value: 'partial', label: 'Écourtée' }, { value: 'abandoned', label: 'Abandonnée' }]} onChange={(v) => setStatus(v)} /></Field> : null}
        <Field label="Notes" htmlFor="hs-n"><input id="hs-n" className={inputClass} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></Field>
        {act.error ? <p className={errorClass} role="alert">{act.error}</p> : null}
        {msg ? <p className={s.okText} role="status">{msg}</p> : null}
        <div className={s.actions}><button className={sheet.btnDanger} onClick={() => setDel(true)}>Supprimer</button><button className={sheet.btnPrimary} disabled={act.busy} onClick={() => void save()}>Enregistrer la correction</button></div>
      </section>
      <ConfirmDialog open={del} danger title="Supprimer cette séance ?" confirmLabel="Supprimer" onCancel={() => setDel(false)} onConfirm={async () => { setDel(false); await act.run(() => sportService.deleteSession(session.id)); onClose() }}>
        <p>La séance disparaît de l’historique. Son XP, ses records et sa régularité sont retirés par des corrections tracées, puis niveaux, attributs et statistiques sont recalculés.</p>
        <p>Les sauvegardes existantes conservent l’état d’avant.</p>
      </ConfirmDialog>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Corriger la série">{editing ? <EditLog session={session} slotId={editing.slotId} log={editing.log} ex={exOf(editing.log.exerciseId)} onDone={() => setEditing(null)} /> : null}</Sheet>
    </div>
  )
}

function EditLog({ session, slotId, log, ex, onDone }: { session: SportSession; slotId: string; log: SetLog; ex?: Exercise; onDone: () => void }) {
  const [reps, setReps] = useState(String(log.reps ?? ''))
  const [load, setLoad] = useState(String(log.loadKg ?? ''))
  const [dur, setDur] = useState(String(log.durationSec ?? ''))
  const act = useAction()
  return (
    <div className={s.stack}>
      {ex?.mode === 'time' ? <Field label="Durée (s)" htmlFor="el-d"><input id="el-d" className={inputClass} type="number" value={dur} onChange={(e) => setDur(e.target.value)} /></Field> : <><Field label="Répétitions" htmlFor="el-r"><input id="el-r" className={inputClass} type="number" value={reps} onChange={(e) => setReps(e.target.value)} /></Field>{ex && !ex.bodyweight ? <Field label="Charge (kg)" htmlFor="el-l"><input id="el-l" className={inputClass} type="number" step="0.5" value={load} onChange={(e) => setLoad(e.target.value)} /></Field> : null}</>}
      {act.error ? <p className={errorClass} role="alert">{act.error}</p> : null}
      <div className={s.actions}>
        <button className={sheet.btnDanger} onClick={async () => { await act.run(() => sportService.deleteSet(session.id, slotId, log.n)); onDone() }}>Supprimer la série</button>
        <button className={sheet.btnPrimary} onClick={async () => { await act.run(() => sportService.updateSet(session.id, slotId, log.n, ex?.mode === 'time' ? { durationSec: Number(dur) } : { reps: Number(reps), loadKg: load ? Number(load) : undefined })); onDone() }}>Enregistrer</button>
      </div>
    </div>
  )
}
