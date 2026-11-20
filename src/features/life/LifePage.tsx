import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Card, EmptyState, PageHeader, SectionTitle } from '@/design/components'
import { Tabs } from '@/design/Tabs'
import sheet from '@/design/sheet.module.css'
import { isRecurring, type Quest, type QuestType } from '@/core/quest'
import { BilanPanel } from './BilanPanel'
import { LibraryPanel } from './LibraryPanel'
import { CategoriesPanel } from './CategoriesPanel'
import { GoalsPanel } from './GoalsPanel'
import { IndicatorsPanel } from './IndicatorsPanel'
import { OverviewPanel } from './OverviewPanel'
import { ProjectsPanel } from './ProjectsPanel'
import { QuestCard } from './QuestCard'
import { QuestFormSheet } from './QuestForm'
import { RewardsPanel } from './RewardsPanel'
import { TYPE_LABEL } from './labels'
import { useQuestViews } from './useQuestViews'
import s from './life.module.css'

type Tab = 'overview' | 'quests' | 'library' | 'goals' | 'projects' | 'indicators' | 'rewards' | 'review' | 'categories'
/** Adresse de chaque section : /life (défaut), /life/objectifs, /life/projets… */
const SLUG: Record<Tab, string> = { overview: 'apercu', quests: 'quetes', library: 'bibliotheque', goals: 'objectifs', projects: 'projets', indicators: 'indicateurs', rewards: 'gains', review: 'bilan', categories: 'categories' }
const LABEL: Record<Tab, string> = { overview: 'Ensemble', quests: 'Quêtes', library: 'Bibliothèque', goals: 'Objectifs', projects: 'Projets', indicators: 'Indicateurs', rewards: 'Gains', review: 'Bilan', categories: 'Catégories' }
type TypeFilter = 'all' | QuestType

export function LifePage() {
  const { progress, missed } = useAppState()
  const { section } = useParams()
  const navigate = useNavigate()
  const fromUrl = (Object.keys(SLUG) as Tab[]).find((k) => SLUG[k] === section)
  // Par défaut : les quêtes (l'action d'abord) ; l'ensemble et les réglages avancés sont derrière « Plus »
  const tab: Tab = fromUrl ?? 'quests'
  const setTab = (t: Tab) => navigate(`/life/${SLUG[t]}`)
  const [form, setForm] = useState<{ quest?: Quest } | null>(null)

  return (
    <div className={s.stack}>
      <PageHeader title="LIFE" subtitle={`Niveau ${progress.life.level} · quêtes, objectifs, projets et indicateurs.`}
        right={<button className={`${sheet.btnPrimary} ${s.newDesktop}`} onClick={() => setForm({})}>+ Nouvelle quête</button>} />
      <Tabs label="Sections LIFE" color="var(--c-life)" value={tab} onChange={(id) => setTab(id as Tab)}
        primary={['quests', 'library', 'goals', 'projects']}
        items={(Object.keys(LABEL) as Tab[]).map((id) => ({ id, label: LABEL[id], badge: id === 'review' && missed.length > 0 ? missed.length : undefined, badgeLabel: id === 'review' ? `${missed.length} à analyser` : undefined }))} />

      {tab === 'overview' ? <OverviewPanel go={(slug) => navigate(`/life/${slug}`)} /> : null}
      {tab === 'library' ? <LibraryPanel openQuests={() => setTab('quests')} /> : null}
      {tab === 'goals' ? <GoalsPanel /> : null}
      {tab === 'projects' ? <ProjectsPanel /> : null}
      {tab === 'indicators' ? <IndicatorsPanel /> : null}
      {tab === 'quests' ? <QuestsTab onEdit={(q) => setForm({ quest: q })} onNew={() => setForm({})} onLibrary={() => setTab('library')} /> : null}
      {tab === 'rewards' ? <RewardsPanel /> : null}
      {tab === 'review' ? <BilanPanel /> : null}
      {tab === 'categories' ? <CategoriesPanel /> : null}

      {tab === 'quests' ? <button className={s.fab} onClick={() => setForm({})} aria-label="Créer une quête">+</button> : null}
      <QuestFormSheet open={form !== null} quest={form?.quest} onClose={() => setForm(null)} />
    </div>
  )
}

function QuestsTab({ onEdit, onNew, onLibrary }: { onEdit: (q: Quest) => void; onNew: () => void; onLibrary: () => void }) {
  const views = useQuestViews()
  const [filter, setFilter] = useState<TypeFilter>('all')
  const [showArchived, setShowArchived] = useState(false)

  if (views.length === 0) {
    return (
      <Card variant="flat">
        <div className={s.empty}>
          <h3>Commence par ajouter quelques activités à ton quotidien</h3>
          <p>Une quête est une action à accomplir ; chaque validation te rapporte de l’XP. Pas besoin de tout inventer : choisis dans la bibliothèque.</p>
          <div className={s.emptyActions}>
            <button className={sheet.btnPrimary} onClick={onLibrary}>Choisir des quêtes prédéfinies</button>
            <button className={sheet.btnGhost} onClick={onLibrary}>Charger un pack de démarrage</button>
            <button className={sheet.btnGhost} onClick={onNew}>Créer une quête personnelle</button>
          </div>
        </div>
      </Card>
    )
  }

  const visible = views.filter((v) => (filter === 'all' || v.quest.type === filter) && (showArchived || !v.quest.archived))
  const todo = visible.filter((v) => !v.quest.archived && !v.cp.completed)
  const done = visible.filter((v) => !v.quest.archived && v.cp.completed)
  const archived = visible.filter((v) => v.quest.archived)
  const recurringPending = todo.filter((v) => isRecurring(v.quest.type)).length

  return (
    <>
      <div className={s.chips} role="group" aria-label="Filtrer par type">
        {(['all', 'daily', 'weekly', 'personal', 'exceptional'] as const).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'Toutes' : TYPE_LABEL[f]}</button>
        ))}
      </div>

      <section aria-label="Quêtes à faire">
        <SectionTitle title="À faire" aside={recurringPending ? `${recurringPending} récurrente(s)` : `${todo.length}`} />
        {todo.length === 0 ? <EmptyState title="Tout est accompli">Rien à faire dans cette vue. Créez une nouvelle quête quand vous êtes prêt.</EmptyState> : (
          <div className={s.list}>{todo.map((v) => <QuestCard key={v.quest.id} view={v} onEdit={() => onEdit(v.quest)} />)}</div>
        )}
      </section>

      {done.length > 0 ? (
        <section aria-label="Quêtes accomplies">
          <SectionTitle title="Accomplies" aside={`${done.length}`} />
          <div className={s.list}>{done.map((v) => <QuestCard key={v.quest.id} view={v} onEdit={() => onEdit(v.quest)} />)}</div>
        </section>
      ) : null}

      {views.some((v) => v.quest.archived) ? (
        <button className={s.act} onClick={() => setShowArchived(!showArchived)} style={{ justifySelf: 'start' }}>
          {showArchived ? 'Masquer les archivées' : 'Afficher les archivées'}
        </button>
      ) : null}
      {archived.length > 0 ? (
        <section aria-label="Quêtes archivées"><SectionTitle title="Archivées" /><div className={s.list}>{archived.map((v) => <QuestCard key={v.quest.id} view={v} onEdit={() => onEdit(v.quest)} />)}</div></section>
      ) : null}
    </>
  )
}
