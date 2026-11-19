import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Card, ProgressBar, SectionTitle } from '@/design/components'
import { Ring } from '@/design/charts'
import sheet from '@/design/sheet.module.css'
import { profileCompleteness } from '@/core/sport/profile'
import { PHASE_HINT, PHASE_LABEL } from '@/core/sport/cycle'
import { SPORT_CONFIG } from '@/core/sport/config'
import { MUSCLE_LABEL, MUSCLE_GROUPS, EXPERIENCE_LABEL, PRIORITY_LABEL, type MuscleGroup } from '@/core/sport/types'
import { EXERCISE_BY_ID } from '@/core/sport/exercises'
import { periodReview } from '@/core/sport/stats'
import { dayKey, mondayOf, addDays, weekKey } from '@/core/dates'
import { runsOf } from '@/core/sport/running'
import { sportService } from '@/data/sportService'
import { formatNumber } from '@/lib/format'
import { useAction } from '../backup/useBackupData'
import { SafetyBadge, SafetyNotice } from './parts'
import { UnplannedSheet } from './UnplannedSheet'
import { useState } from 'react'
import s from './sport.module.css'

const dayLabel = (d: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00'))

export function Dashboard() {
  const { sport, progress, now } = useAppState()
  const nav = useNavigate()
  const act = useAction()
  const [unplanned, setUnplanned] = useState(false)
  const { profile, recovery, sessions, cycle } = sport
  const week = weekKey(now)
  const today = sport.today
  const planned = sessions.filter((x) => x.status === 'planned' || x.status === 'active' || x.status === 'paused').sort((a, b) => a.date.localeCompare(b.date))
  const todays = planned.find((x) => x.date <= today)
  const next = planned.find((x) => x.date > today)
  const monday = dayKey(mondayOf(now)), sunday = dayKey(addDays(mondayOf(now), 6))
  const wk = periodReview(sessions, monday, sunday, sport.custom)
  const doneThisWeek = sessions.filter((x) => (x.status === 'completed' || x.status === 'partial') && weekKey(new Date(x.date + 'T12:00:00')) === week && x.kind !== 'other')
  const target = profile.availability.strengthPerWeek + profile.availability.runsPerWeek
  const km = Math.round(runsOf(sessions.filter((x) => weekKey(new Date(x.date + 'T12:00:00')) === week)).reduce((a, x) => a + x.run!.distanceKm, 0) * 10) / 10
  const setsByGroup = (g: MuscleGroup) => doneThisWeek.reduce((n, x) => n + x.slots.reduce((m, sl) => m + sl.logs.filter((l) => (EXERCISE_BY_ID[l.exerciseId] ?? sport.custom.find((c) => c.id === l.exerciseId))?.primary.includes(g)).length, 0), 0)
  const priorities = MUSCLE_GROUPS.filter((g) => profile.musclePriorities[g] === 'develop' || profile.musclePriorities[g] === 'progress')
  const completeness = profileCompleteness(profile)

  const prepare = async (kind: 'strength' | 'hiit') => {
    const r = await act.run(async () => (kind === 'strength' ? sportService.generateStrength() : sportService.generateHiit()))
    if (r) nav(`/sport/seance/${r.session.id}`)
  }

  return (
    <div className={s.stack}>
      <SafetyNotice />
      {completeness < 1 ? (
        <Card variant="flat" className={s.setupCard}>
          <div><b>Profil sportif à {Math.round(completeness * 100)} %</b><p className={s.dim}>Facultatif : plus vous précisez, mieux Level adapte vos séances. Rien n’est bloqué en attendant.</p></div>
          <Link to="/sport/profil" className={sheet.btnPrimary}>Compléter</Link>
        </Card>
      ) : null}

      <Card variant="event">
        <SectionTitle title={todays ? 'Séance du jour' : 'Aujourd’hui'} aside={dayLabel(today)} />
        {todays ? (
          <div className={s.todayRow}>
            <div>
              <h3 className={s.bigTitle}>{todays.title}</h3>
              <p className={s.dim}>{todays.kind === 'run' ? 'Course' : 'Musculation'} · ~{todays.plannedMinutes} min{todays.status !== 'planned' ? ' · en cours' : ''}</p>
            </div>
            {todays.kind === 'run' ? <Link to="/sport/course" className={sheet.btnPrimary}>Enregistrer</Link> : (
              <button className={sheet.btnPrimary} disabled={act.busy} onClick={async () => { const r = await act.run(() => sportService.prepareSession(todays.id)); if (r) nav(`/sport/seance/${todays.id}`) }}>
                {todays.status === 'planned' ? 'Préparer et démarrer' : 'Reprendre'}
              </button>
            )}
          </div>
        ) : (
          <div className={s.todayRow}>
            <div>
              <h3 className={s.bigTitle}>{recovery.level === 'ALERTE' ? 'Repos conseillé' : 'Pas de séance prévue'}</h3>
              <p className={s.dim}>{recovery.level === 'ALERTE' ? 'Alerte de récupération : aucune séance n’est proposée.' : 'Level compose une séance selon vos priorités, votre récupération et votre historique.'}</p>
            </div>
            {recovery.level !== 'ALERTE' ? <button className={sheet.btnPrimary} disabled={act.busy} onClick={() => void prepare('strength')}>Préparer une séance</button> : null}
          </div>
        )}
        {act.error ? <p className={s.warn} role="alert">{act.error}</p> : null}
        {next ? <p className={s.nextLine}>Prochaine séance : <b>{dayLabel(next.date)}</b> · {next.kind === 'run' ? 'Course' : 'Musculation'}</p> : null}
      </Card>

      <div className={s.grid2}>
        <Card>
          <SectionTitle title="Récupération" aside={<SafetyBadge level={recovery.level} />} />
          <div className={s.ringRow}>
            <Ring progress={recovery.index / 100} size={96} tone={recovery.level === 'NORMAL' ? 'success' : 'gold'} label={`Indice de récupération ${recovery.index} sur 100`}>
              <div className={s.ringNum}>{recovery.index}</div>
            </Ring>
            <p className={s.dim}>{recovery.hasCheckToday ? 'Estimation non médicale à partir de votre questionnaire et de vos séances.' : 'Questionnaire du jour non rempli (30 secondes).'}</p>
          </div>
          <Link to="/sport/recuperation" className={s.link}>{recovery.hasCheckToday ? 'Voir le détail' : 'Remplir le questionnaire'}</Link>
        </Card>
        <Card>
          <SectionTitle title="Progression générale" />
          <div className={s.ringRow}>
            <Ring progress={progress.sportLevel.progress} size={96} tone="info" label={`Niveau SPORT ${progress.sportLevel.level}`}>
              <div className={s.ringNum}>{progress.sportLevel.level}</div>
            </Ring>
            <div className={s.dim}>
              <div>{formatNumber(progress.sportLevel.xpIntoLevel)} / {formatNumber(progress.sportLevel.xpForNext)} XP</div>
              <div>Niveau opérationnel : <b>{EXPERIENCE_LABEL[sport.operational]}</b></div>
              <div>Phase : {PHASE_LABEL[cycle.phase]} (sem. {cycle.week}/{cycle.totalWeeks})</div>
            </div>
          </div>
          <p className={s.dim} style={{ marginTop: 8 }}>{PHASE_HINT[cycle.phase]}</p>
        </Card>
      </div>

      <div className={s.grid2}>
        <Card>
          <SectionTitle title="Cette semaine" aside={`${doneThisWeek.length}/${target || '—'} séances`} />
          {target > 0 ? <ProgressBar value={Math.min(1, doneThisWeek.length / target)} tone="info" label="Séances de la semaine" /> : null}
          <table className={s.table}><tbody>
            <tr><td>Séries réalisées</td><td className="num">{wk.sets}</td></tr>
            <tr><td>Durée</td><td className="num">{wk.minutes} min</td></tr>
            <tr><td>Course</td><td className="num">{km} km</td></tr>
          </tbody></table>
        </Card>
        <Card>
          <SectionTitle title="Groupes prioritaires" aside={<Link to="/sport/profil" className={s.link}>Modifier</Link>} />
          {priorities.length === 0 ? <p className={s.dim}>Aucune priorité définie : Level répartit le travail de façon équilibrée.</p> : (
            <div className={s.bars}>
              {priorities.map((g) => {
                const goal = SPORT_CONFIG.generator.weeklySets[profile.musclePriorities[g]!]
                const done = setsByGroup(g)
                return (
                  <div key={g}>
                    <div className={s.barHead}><span>{MUSCLE_LABEL[g]} · {PRIORITY_LABEL[profile.musclePriorities[g]!]}</span><span className="num">{done}/{goal}</span></div>
                    <ProgressBar value={Math.min(1, done / goal)} thin label={MUSCLE_LABEL[g]} />
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
      <div className={s.quick}>
        <button className={s.quickBtn} onClick={() => void prepare('hiit')} disabled={act.busy || recovery.level === 'ALERTE'}>Circuit HIIT full-body</button>
        <Link to="/sport/course" className={s.quickBtn}>Enregistrer une course</Link>
        <Link to="/sport/recuperation" className={s.quickBtn}>Questionnaire du jour</Link>
        <button className={s.quickBtn} onClick={() => setUnplanned(true)}>Activité imprévue (sans XP)</button>
      </div>
      <UnplannedSheet open={unplanned} onClose={() => setUnplanned(false)} />
    </div>
  )
}
