import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Card, EmptyState, Notice, PageHeader, SectionTitle } from '@/design/components'
import sheet from '@/design/sheet.module.css'
import { isRecurring, type Quest, type QuestType } from '@/core/quest'
import { BilanPanel } from './BilanPanel'
import { CategoriesPanel } from './CategoriesPanel'
import { QuestCard } from './QuestCard'
import { QuestFormSheet } from './QuestForm'
import { RewardsPanel } from './RewardsPanel'
import { TYPE_LABEL } from './labels'
import { useQuestViews } from './useQuestViews'
import s from './life.module.css'

type Tab = 'quests' | 'rewards' | 'review' | 'categories'
type TypeFilter = 'all' | QuestType

export function LifePage() {
  const { progress, missed } = useAppState()
  const [tab, setTab] = useState<Tab>('quests')
  const [form, setForm] = useState<{ quest?: Quest } | null>(null)

  return (
    <div className={s.stack}>
      <PageHeader title="LIFE" subtitle={`Niveau ${progress.life.level} · quêtes, gains, bilan et catégories.`}
        right={<button className={`${sheet.btnPrimary} ${s.newDesktop}`} onClick={() => setForm({})}>+ Nouvelle quête</button>} />
      <Notice title="Module en cours de construction">quêtes, journal d’XP, bilan des manques et catégories sont opérationnels. Habitudes avancées, budgets et objectifs arriveront dans une prochaine étape.</Notice>

      <div className={s.tabs} role="tablist" aria-label="Sections LIFE">
        {([['quests', 'Quêtes'], ['rewards', 'Gains'], ['review', 'Bilan'], ['categories', 'Catégories']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}{id === 'review' && missed.length > 0 ? <span className={s.tabBadge} aria-label={`${missed.length} à analyser`}>{missed.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'quests' ? <QuestsTab onEdit={(q) => setForm({ quest: q })} onNew={() => setForm({})} /> : null}
      {tab === 'rewards' ? <RewardsPanel /> : null}
      {tab === 'review' ? <BilanPanel /> : null}
      {tab === 'categories' ? <CategoriesPanel /> : null}

      {tab === 'quests' ? <button className={s.fab} onClick={() => setForm({})} aria-label="Créer une quête">+</button> : null}
      <QuestFormSheet open={form !== null} quest={form?.quest} onClose={() => setForm(null)} />
    </div>
  )
}

function QuestsTab({ onEdit, onNew }: { onEdit: (q: Quest) => void; onNew: () => void }) {
  const views = useQuestViews()
  const [filter, setFilter] = useState<TypeFilter>('all')
  const [showArchived, setShowArchived] = useState(false)

  if (views.length === 0) {
    return (
      <Card variant="flat">
        <div className={s.empty}>
          <h3>Aucune quête pour l'instant</h3>
          <p>Une quête est une action à accomplir, seule ou découpée en étapes. Chaque validation rapporte de l'XP.</p>
          <button className={sheet.btnPrimary} onClick={onNew}>Créer ma première quête</button>
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
