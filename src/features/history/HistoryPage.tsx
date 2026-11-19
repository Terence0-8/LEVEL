import { useMemo, useState } from 'react'
import { Card, DemoTag, PageHeader, SectionTitle } from '@/design/components'
import { BarChart } from '@/design/charts'
import { Icon } from '@/design/Icon'
import { dayKey, formatDayLabel, formatTime } from '@/lib/format'
import type { Activity, Domain } from '@/core/types'
import { DemoGate } from '../shared/DemoGate'
import s from '../pages.module.css'

type Filter = 'ALL' | Domain

function xpPerDay(activities: Activity[], days = 14) {
  const now = new Date()
  const out: Array<{ label: string; value: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const key = dayKey(d)
    out.push({ label: key, value: activities.filter((a) => dayKey(new Date(a.at)) === key).reduce((n, a) => n + a.xp, 0) })
  }
  return out
}

export function HistoryPage() {
  const [filter, setFilter] = useState<Filter>('ALL')
  return (
    <div className={s.stack}>
      <PageHeader title="Historique" subtitle="Activités et progression." />
      <DemoGate>
        {(demo) => <HistoryBody activities={demo.activities} filter={filter} setFilter={setFilter} />}
      </DemoGate>
    </div>
  )
}

function HistoryBody({ activities, filter, setFilter }: { activities: Activity[]; filter: Filter; setFilter: (f: Filter) => void }) {
  const list = useMemo(() => activities.filter((a) => filter === 'ALL' || a.domain === filter), [activities, filter])
  const groups = useMemo(() => {
    const m = new Map<string, Activity[]>()
    for (const a of list) { const k = dayKey(new Date(a.at)); m.set(k, [...(m.get(k) ?? []), a]) }
    return [...m.values()]
  }, [list])
  const chart = useMemo(() => xpPerDay(list), [list])
  const total = list.reduce((n, a) => n + a.xp, 0)

  return (
    <>
      <Card>
        <SectionTitle title="XP · 14 derniers jours" aside={<><span className="num">{total} XP</span> <DemoTag /></>} />
        <BarChart data={chart} label="XP gagnée par jour sur 14 jours" />
      </Card>
      <div>
        <div className={s.tabs} role="group" aria-label="Filtrer par domaine">
          {(['ALL', 'LIFE', 'SPORT'] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'ALL' ? 'Tout' : f}</button>
          ))}
        </div>
        {groups.length === 0 ? <p style={{ color: 'var(--c-text-dim)' }}>Aucune activité.</p> : groups.map((g) => (
          <div key={g[0].id}>
            <div className={s.dayHead}>{formatDayLabel(g[0].at)}</div>
            <Card>
              {g.map((a) => (
                <div key={a.id} className={s.act}>
                  <span className={s.ico}><Icon name={a.domain === 'SPORT' ? 'sport' : 'life'} size={18} /></span>
                  <div className={s.grow}><div>{a.label}</div><small>{a.domain} · {formatTime(a.at)}</small></div>
                  <span className={`${s.xp} num`}>+{a.xp} XP</span>
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </>
  )
}
