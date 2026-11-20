import { Link } from 'react-router-dom'
import { Badge, Card, ProgressBar, SectionTitle } from '@/design/components'
import { Icon } from '@/design/Icon'
import { questService } from '@/data/questService'
import { useAppState } from '@/app/AppState'
import type { Dashboard } from '@/core/dashboard'
import { PHASE_LABEL } from '@/core/sport/cycle'
import q from '../shared/QuestList.module.css'
import s from './HomePage.module.css'

const more = (to: string, label: string) => <Link to={to} style={{ color: 'var(--c-gold)' }}>{label}</Link>
const LEVEL_LABEL = { NORMAL: 'Normal', VIGILANCE: 'Vigilance', ALERTE: 'Alerte' } as const
const LEVEL_TONE = { NORMAL: 'success', VIGILANCE: 'gold', ALERTE: 'danger' } as const

export function Alerts({ d }: { d: Dashboard }) {
  return (
    <Card className={s.span2} variant={d.alerts.some((a) => a.tone === 'warn') ? 'event' : 'default'}>
      <SectionTitle title="À savoir maintenant" aside={more('/planning', 'Planning')} />
      <ul className={s.alertList}>
        {d.alerts.map((a) => (
          <li key={a.id}>
            <Link to={a.route} className={`${s.alert} ${s[a.tone]}`}>
              <span className={s.alertIcon}><Icon name={a.tone === 'good' ? 'check' : 'alert'} size={18} /></span>
              <span className={s.alertText}><b>{a.title}</b><small>{a.detail}</small></span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function Priorities({ d }: { d: Dashboard }) {
  const { quests } = useAppState()
  const none = !quests.some((x) => !x.archived)
  return (
    <Card>
      <SectionTitle title="Quêtes prioritaires" aside={d.today.usable ? <span className="num">{d.today.load} / {d.today.usable} min</span> : undefined} />
      {d.priorities.length === 0 ? (
        none ? (
          <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
            <p className={s.muted}>Aucune quête pour l'instant. Créez la première pour commencer à gagner de l'XP.</p>
            <Link to="/life" className={s.linkBtn}>Aller dans LIFE</Link>
          </div>
        ) : <p className={s.muted}>Tout est accompli. Belle progression ! Inutile de remplir le temps libre.</p>
      ) : (
        <ul className={q.list}>
          {d.priorities.map(({ quest, score, remainingMin }) => {
            const stepped = quest.steps.length > 0
            const body = (
              <span className={q.body}>
                <span className={q.title}>{quest.title}</span>
                <span className={q.meta}>{score.reasons.slice(0, 2).join(' · ') || 'quête'} · {remainingMin} min</span>
              </span>
            )
            return (
              <li key={quest.id}>
                {stepped ? (
                  <Link to="/life" className={q.row}>
                    <span className={q.check} aria-hidden="true"><Icon name="check" size={16} style={{ opacity: 0.25 }} /></span>{body}
                    <Badge tone="gold">+{quest.rewardXp} XP</Badge>
                  </Link>
                ) : (
                  <button className={q.row} onClick={() => void questService.completeQuest(quest.id)} aria-label={`Valider ${quest.title}`}>
                    <span className={q.check} />{body}<Badge tone="gold">+{quest.rewardXp} XP</Badge>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {d.morePending > 0 ? <p style={{ marginTop: 10 }}>{more('/life', `Voir les ${d.morePending} autres`)}</p> : null}
    </Card>
  )
}

export function NextSession({ d }: { d: Dashboard }) {
  const { sport } = useAppState()
  const ns = d.nextSession
  return (
    <Card>
      <SectionTitle title="Prochaine séance" aside={more('/sport', 'SPORT')} />
      {ns ? (
        <div className={s.next}>
          <div>
            <small>{ns.label}</small>
            <b>{ns.session.title || (ns.session.kind === 'run' ? 'Course prévue' : 'Séance prévue')}</b>
            <small>{ns.session.status === 'active' || ns.session.status === 'paused' ? 'En cours' : `${PHASE_LABEL[sport.cycle.phase]}`}</small>
          </div>
          <Badge tone="info">{ns.session.plannedMinutes} min</Badge>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
          <p className={s.muted}>Aucune séance prévue. Level propose une semaine adaptée à vos disponibilités et à votre récupération.</p>
          <Link to="/sport" className={s.linkBtn}>Planifier ma semaine</Link>
        </div>
      )}
    </Card>
  )
}

export function RecoveryCard({ d }: { d: Dashboard }) {
  const { sport } = useAppState()
  const r = sport.recovery
  return (
    <Card>
      <SectionTitle title="Récupération" aside={<Badge tone={LEVEL_TONE[r.level]}>{LEVEL_LABEL[r.level]}</Badge>} />
      <div className={s.recov}>
        <div className={s.row}><span>Indice estimé</span><span className="num">{r.index} %</span></div>
        <ProgressBar value={r.index / 100} tone={r.level === 'NORMAL' ? 'success' : 'gold'} thin label="Indice de récupération" />
      </div>
      <p className={s.muted} style={{ marginTop: 10 }}>{r.messages[0] ?? (d.home.hasCheckToday ? 'Tout est en ordre pour aujourd’hui.' : 'Un questionnaire d’environ 30 secondes affine l’estimation.')}</p>
      {!d.home.hasCheckToday ? <p style={{ marginTop: 8 }}>{more('/sport/recuperation', 'Répondre au questionnaire')}</p> : null}
    </Card>
  )
}

const dueLabel = (n: number) => (n <= 0 ? 'Aujourd’hui' : n === 1 ? 'Demain' : `J-${n}`)

export function Deadlines({ d }: { d: Dashboard }) {
  return (
    <Card>
      <SectionTitle title="Échéances importantes" aside={more('/planning', 'Planning')} />
      <ul className={s.feed}>
        {d.deadlines.map((x) => (
          <li key={x.id}>
            <span className={s.feedIcon}><Icon name={x.kind === 'commitment' ? 'calendar' : 'target'} size={18} /></span>
            <Link to={x.route} className={s.t}><div>{x.title}</div><small>{dueLabel(x.daysLeft)}{x.important ? ' · important' : ''}</small></Link>
            <Badge tone={x.daysLeft <= 1 ? 'danger' : x.daysLeft <= 3 ? 'gold' : 'neutral'}>{dueLabel(x.daysLeft)}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  )
}

const DAY_LETTER = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function WeekProgress({ d }: { d: Dashboard }) {
  const w = d.week
  const today = (new Date().getDay() + 6) % 7
  return (
    <Card>
      <SectionTitle title="Cette semaine" aside={more('/bilans', 'Bilans')} />
      <div className={s.week} aria-label="Jours actifs de la semaine">
        {DAY_LETTER.map((l, i) => (
          <div key={i} className={s.day} aria-current={i === today ? 'date' : undefined}>
            <div className={`${s.dot} ${w.sportDays[i] ? s.done : w.activeDays[i] ? s.active : ''} ${i === today ? s.today : ''}`}>
              {w.sportDays[i] ? <Icon name="sport" size={15} /> : w.activeDays[i] ? <Icon name="check" size={15} /> : null}
            </div>{l}
          </div>
        ))}
      </div>
      <div className={s.weekRows}>
        <div><div className={s.row}><span>Quêtes LIFE</span><span className="num">{w.life.done} sur {w.life.planned} prévues</span></div><ProgressBar value={w.life.planned ? w.life.done / w.life.planned : 0} thin label="Quêtes LIFE de la semaine" /></div>
        <div><div className={s.row}><span>Séances SPORT</span><span className="num">{w.sport.done} sur {w.sport.planned} prévues</span></div><ProgressBar value={w.sport.planned ? w.sport.done / w.sport.planned : 0} tone="info" thin label="Séances SPORT de la semaine" /></div>
      </div>
      {w.streakWeeks >= 2 ? <p className={s.muted} style={{ marginTop: 10 }}>{w.streakWeeks} semaines de suite avec l’objectif sportif atteint.</p> : null}
    </Card>
  )
}
