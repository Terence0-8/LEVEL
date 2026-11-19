import { Icon } from '@/design/Icon'
import { Badge } from '@/design/components'
import type { DemoQuest } from '@/mocks/demoView'
import s from './QuestList.module.css'

export function QuestList({ quests, onToggle }: { quests: DemoQuest[]; onToggle: (id: string) => void }) {
  return (
    <ul className={s.list}>
      {quests.map((q) => (
        <li key={q.id}>
          <button className={`${s.row} ${q.done ? s.done : ''}`} onClick={() => onToggle(q.id)} aria-pressed={q.done}>
            <span className={s.check}>{q.done ? <Icon name="check" size={16} /> : null}</span>
            <span className={s.body}>
              <span className={s.title}>{q.title}</span>
              <span className={s.meta}>{q.domain === 'LIFE' ? 'LIFE' : 'SPORT'}</span>
            </span>
            <Badge tone={q.done ? 'success' : 'gold'}>+{q.xp} XP</Badge>
          </button>
        </li>
      ))}
    </ul>
  )
}
