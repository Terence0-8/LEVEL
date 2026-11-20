import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/design/components'
import { useAppState } from '@/app/AppState'
import { CyclesPanel } from './CyclesPanel'
import { Dashboard } from './Dashboard'
import { HistoryPanel } from './HistoryPanel'
import { OrientationsPanel } from './OrientationsPanel'
import { PrioritiesPanel } from './PrioritiesPanel'
import { ReviewsPanel } from './ReviewsPanel'
import { VisionPanel } from './VisionPanel'
import s from './pilotage.module.css'

type Tab = 'overview' | 'vision' | 'orientations' | 'priorities' | 'cycles' | 'reviews' | 'history'
const SLUG: Record<Tab, string> = { overview: 'ensemble', vision: 'vision', orientations: 'orientations', priorities: 'priorites', cycles: 'cycles', reviews: 'revues', history: 'historique' }
const LABEL: Record<Tab, string> = { overview: 'Ensemble', vision: 'Vision', orientations: 'Orientations', priorities: 'Priorités', cycles: 'Cycles', reviews: 'Revues', history: 'Historique' }

/** Couche stratégique au-dessus de LIFE : vision → orientations → priorités → objectifs → projets → quêtes. Tout est facultatif. */
export function PilotagePage() {
  const { section } = useParams()
  const navigate = useNavigate()
  const { demo } = useAppState()
  const tab: Tab = (Object.keys(SLUG) as Tab[]).find((k) => SLUG[k] === section) ?? 'overview'
  const go = (slug: string) => navigate(`/pilotage/${slug}`)
  return (
    <div className={s.stack}>
      <PageHeader title="Pilotage" subtitle="Relier votre vision à vos priorités, objectifs, projets et actions concrètes." />
      {demo ? <p className={s.note}>Le mode démonstration n’affiche pas de données stratégiques.</p> : null}
      <div className={s.tabs} role="tablist" aria-label="Sections Pilotage">
        {(Object.keys(LABEL) as Tab[]).map((id) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => go(SLUG[id])}>{LABEL[id]}</button>)}
      </div>
      {tab === 'overview' ? <Dashboard go={go} /> : null}
      {tab === 'vision' ? <VisionPanel /> : null}
      {tab === 'orientations' ? <OrientationsPanel /> : null}
      {tab === 'priorities' ? <PrioritiesPanel /> : null}
      {tab === 'cycles' ? <CyclesPanel /> : null}
      {tab === 'reviews' ? <ReviewsPanel /> : null}
      {tab === 'history' ? <HistoryPanel /> : null}
    </div>
  )
}
