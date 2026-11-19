import { Link } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Badge, Card, SectionTitle } from '@/design/components'
import sheet from '@/design/sheet.module.css'
import { addDays, dayKey, mondayOf } from '@/core/dates'
import { planWeek } from '@/core/sport/planner'
import { RUN_FAMILY_LABEL } from '@/core/sport/types'
import { sportService } from '@/data/sportService'
import { useAction } from '../backup/useBackupData'
import { useState } from 'react'
import s from './sport.module.css'

const DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })

export function PlanPanel() {
  const { sport, now } = useAppState()
  const act = useAction()
  const [last, setLast] = useState<{ notes: string[]; dropped: string[] } | null>(null)
  const preview = planWeek({ profile: sport.profile, sessions: sport.sessions, recovery: sport.recovery, now })
  const monday = mondayOf(now)
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)))
  const today = sport.today
  const missed = sport.sessions.filter((x) => x.status === 'planned' && x.date < today && x.origin === 'planned')

  const apply = async () => {
    const r = await act.run(() => sportService.applyWeekPlan())
    if (r) setLast({ notes: r.plan.notes, dropped: r.plan.dropped.map((d) => d.reason) })
  }
  return (
    <div className={s.stack}>
      <Card>
        <SectionTitle title="Ma semaine" aside={<Link to="/sport/profil" className={s.link}>Disponibilités</Link>} />
        <p className={s.dim}>Level répartit vos séances sur vos jours disponibles : une seule par jour, musculation prioritaire, sans jamais compromettre la récupération. Après une séance manquée, le reste de la semaine est réorganisé <b>sans empiler</b>.</p>
        <ul className={s.week}>
          {days.map((d) => {
            const items = sport.sessions.filter((x) => x.date === d && x.status !== 'abandoned')
            const proposed = preview.slots.filter((x) => x.date === d && !items.some((i) => i.status === 'planned'))
            return (
              <li key={d} className={d === today ? s.weekToday : ''}>
                <b>{DAY.format(new Date(d + 'T12:00:00'))}</b>
                {items.map((x) => <Badge key={x.id} tone={x.status === 'completed' ? 'success' : x.status === 'partial' ? 'info' : x.status === 'planned' && d < today ? 'neutral' : 'gold'}>{x.kind === 'run' ? 'Course' : x.kind === 'other' ? 'Activité' : 'Muscu'}{x.status === 'planned' ? (d < today ? ' · manquée' : ' · prévue') : ''}</Badge>)}
                {proposed.map((p, i) => <Badge key={i} tone="info">{p.kind === 'run' ? `Course${p.family ? ` · ${RUN_FAMILY_LABEL[p.family]}` : ''}` : 'Muscu'} · proposée</Badge>)}
                {!items.length && !proposed.length ? <small className={s.dim}>Repos</small> : null}
              </li>
            )
          })}
        </ul>
        {missed.length ? <p className={s.note}>{missed.length} séance{missed.length > 1 ? 's' : ''} manquée{missed.length > 1 ? 's' : ''} : aucune pénalité d’XP. Réorganisez la semaine pour repartir proprement.</p> : null}
        {[...preview.notes, ...(last?.notes ?? [])].filter((v, i, a) => a.indexOf(v) === i).map((n) => <p key={n} className={s.note}>{n}</p>)}
        {[...preview.dropped.map((d) => d.reason), ...(last?.dropped ?? [])].filter((v, i, a) => a.indexOf(v) === i).map((n) => <p key={n} className={s.warn}>{n}</p>)}
        {act.error ? <p className={s.warn} role="alert">{act.error}</p> : null}
        <div className={s.actions}><button className={sheet.btnPrimary} disabled={act.busy} onClick={() => void apply()}>{sport.sessions.some((x) => x.status === 'planned' && x.origin === 'planned') ? 'Réorganiser ma semaine' : 'Planifier ma semaine'}</button></div>
        <p className={s.dim}>Seconde séance le même jour : possible exceptionnellement, à votre initiative. Elle rapporte de l’XP si la récupération le permettait au départ (niveau normal), avec un coefficient réduit, au plus 2 séances récompensées par jour et un délai minimal entre deux séances.</p>
      </Card>
    </div>
  )
}
