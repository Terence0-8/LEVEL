import { Link } from 'react-router-dom'
import { Badge, Card, ProgressBar, SectionTitle } from '@/design/components'
import { Icon } from '@/design/Icon'
import { questService } from '@/data/questService'
import { useQuestViews } from '../life/useQuestViews'
import sheet from '@/design/sheet.module.css'
import q from '../shared/QuestList.module.css'

/** Quêtes réelles à faire, validables depuis l'accueil. Les quêtes à étapes se gèrent dans LIFE. */
export function HomeRealQuests() {
  const views = useQuestViews().filter((v) => !v.quest.archived)
  const todo = views.filter((v) => !v.cp.completed)
  const shown = todo.slice(0, 5)
  const doneCount = views.length - todo.length

  return (
    <Card>
      <SectionTitle title="Quêtes du jour" aside={views.length ? `${doneCount}/${views.length}` : undefined} />
      {views.length === 0 ? (
        <div style={{ display: 'grid', gap: 12, justifyItems: 'start', color: 'var(--c-text-dim)' }}>
          <p>Aucune quête pour l'instant. Créez la première pour commencer à gagner de l'XP.</p>
          <Link to="/life" className={sheet.btnPrimary} style={{ display: 'inline-flex', alignItems: 'center' }}>Aller dans LIFE</Link>
        </div>
      ) : todo.length === 0 ? (
        <p style={{ color: 'var(--c-text-dim)' }}>Tout est accompli. Belle progression !</p>
      ) : (
        <ul className={q.list}>
          {shown.map(({ quest, cp }) => {
            const stepped = quest.steps.length > 0
            const body = (
              <>
                <span className={q.body}>
                  <span className={q.title}>{quest.title}</span>
                  <span className={q.meta}>{stepped ? `${cp.doneSteps}/${cp.totalSteps} étapes` : quest.type === 'daily' ? 'QUOTIDIENNE' : 'QUÊTE'}</span>
                </span>
                <Badge tone="gold">+{quest.rewardXp - cp.earnedXp} XP</Badge>
              </>
            )
            return (
              <li key={quest.id}>
                {stepped ? (
                  <Link to="/life" className={q.row}>
                    <span className={q.check} aria-hidden="true"><Icon name="check" size={16} style={{ opacity: 0.25 }} /></span>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{body}</span>
                      <ProgressBar value={cp.progress} thin label={`Étapes de ${quest.title}`} />
                    </span>
                  </Link>
                ) : (
                  <button className={q.row} onClick={() => void questService.completeQuest(quest.id)} aria-label={`Valider ${quest.title}`}>
                    <span className={q.check} />{body}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {todo.length > shown.length ? <p style={{ marginTop: 10 }}><Link to="/life" style={{ color: 'var(--c-gold)', fontSize: 13 }}>Voir les {todo.length - shown.length} autres</Link></p> : null}
    </Card>
  )
}
