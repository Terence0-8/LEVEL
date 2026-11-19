import { NavLink, useParams } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { PageHeader } from '@/design/components'
import { Dashboard } from './Dashboard'
import { HistoryPanel } from './HistoryPanel'
import { Library } from './Library'
import { PlanPanel } from './PlanPanel'
import { ProfilePanel } from './ProfilePanel'
import { RecoveryPanel } from './RecoveryPanel'
import { RunPanel } from './RunPanel'
import { SportDemo } from './SportDemo'
import { StatsPanel } from './StatsPanel'
import { StrengthPanel } from './StrengthPanel'
import s from './sport.module.css'

const SECTIONS = [
  ['', 'Tableau de bord'], ['muscu', 'Musculation'], ['course', 'Course'], ['planning', 'Planning'],
  ['recuperation', 'Récupération'], ['progression', 'Progression'], ['historique', 'Historique'], ['profil', 'Profil'],
] as const

export function SportPage() {
  const { demo, sport } = useAppState()
  const { section = '' } = useParams()
  if (demo) return <SportDemo />
  const level = sport.recovery.level

  return (
    <div className={s.page}>
      <PageHeader title="SPORT" subtitle="Coaching sportif personnalisé : musculation, course, récupération. Vos données restent sur cet appareil." />
      <nav className={s.sections} aria-label="Sections SPORT">
        {SECTIONS.map(([id, label]) => (
          <NavLink key={id} to={id ? `/sport/${id}` : '/sport'} end className={() => (section === id ? `${s.sec} ${s.secOn}` : s.sec)}>
            {label}{id === 'recuperation' && level !== 'NORMAL' ? <i className={`${s.dot} ${level === 'ALERTE' ? s.dotAlert : s.dotWarn}`} aria-label={level} /> : null}
          </NavLink>
        ))}
      </nav>
      {section === '' ? <Dashboard /> : null}
      {section === 'muscu' ? <><StrengthPanel /><Library /></> : null}
      {section === 'course' ? <RunPanel /> : null}
      {section === 'planning' ? <PlanPanel /> : null}
      {section === 'recuperation' ? <RecoveryPanel /> : null}
      {section === 'progression' ? <StatsPanel /> : null}
      {section === 'historique' ? <HistoryPanel /> : null}
      {section === 'profil' ? <ProfilePanel /> : null}
    </div>
  )
}
