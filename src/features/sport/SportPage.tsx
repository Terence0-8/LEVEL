import { useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { PageHeader } from '@/design/components'
import { Tabs } from '@/design/Tabs'
import { Dashboard } from './Dashboard'
import { ProgramsPanel } from './ProgramsPanel'
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
  ['', 'Aujourd’hui'], ['programmes', 'Programmes'], ['muscu', 'Musculation'], ['course', 'Course'],
  ['planning', 'Planning'], ['recuperation', 'Récupération'], ['progression', 'Progression'], ['historique', 'Historique'], ['profil', 'Profil'],
] as const
const TODAY = 'aujourdhui'

export function SportPage() {
  const { demo, sport } = useAppState()
  const { section = '' } = useParams()
  if (demo) return <SportDemo />
  const level = sport.recovery.level
  const navigate = useNavigate()

  return (
    <div className={s.page}>
      <PageHeader title="SPORT" subtitle="Ton programme, ta prochaine séance et ta récupération." />
      <Tabs label="Sections SPORT" color="var(--c-sport)" value={section || TODAY} onChange={(id) => navigate(id === TODAY ? '/sport' : `/sport/${id}`)}
        primary={[TODAY, 'programmes', 'muscu']}
        items={SECTIONS.map(([id, label]) => ({ id: id || TODAY, label, dot: id === 'recuperation' && level !== 'NORMAL' ? (level === 'ALERTE' ? 'alert' as const : 'warn' as const) : undefined }))} />
      {section === '' ? <Dashboard /> : null}
      {section === 'programmes' ? <ProgramsPanel /> : null}
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
