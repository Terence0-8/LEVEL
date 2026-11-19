import { useAppState } from '@/app/AppState'
import { Badge, Card, DemoTag, Notice, PageHeader, SectionTitle } from '@/design/components'
import { Icon } from '@/design/Icon'
import { QuestList } from '../shared/QuestList'
import { DemoGate } from '../shared/DemoGate'
import s from '../pages.module.css'

export function LifePage() {
  const { toggleDemoQuest } = useAppState()
  return (
    <div className={s.stack}>
      <PageHeader title="LIFE" subtitle="Organisation et progression personnelle : tâches, habitudes, objectifs, finances." />
      <Notice title="Module en préparation">les catégories ci-dessous montrent la structure prévue. La création de quêtes, habitudes et budgets arrivera dans une prochaine itération.</Notice>
      <DemoGate>
        {(demo) => (
          <>
            <section>
              <SectionTitle title="Catégories" aside={<DemoTag />} />
              <div className={s.grid3}>
                {demo.lifeCategories.map((c) => (
                  <Card key={c.id} className={s.cat}>
                    <span className={s.catIcon}><Icon name={c.icon} /></span>
                    <h3>{c.label}</h3>
                    <p>{c.hint}</p>
                    <div className={s.foot}><Badge>{c.active} en cours</Badge></div>
                  </Card>
                ))}
              </div>
            </section>
            <Card>
              <SectionTitle title="Quêtes LIFE du jour" aside={<DemoTag />} />
              <QuestList quests={demo.quests.filter((q) => q.domain === 'LIFE')} onToggle={toggleDemoQuest} />
            </Card>
          </>
        )}
      </DemoGate>
    </div>
  )
}
