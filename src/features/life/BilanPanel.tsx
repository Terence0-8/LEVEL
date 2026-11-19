import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, EmptyState, ProgressBar, SectionTitle } from '@/design/components'
import { causeStats, type MissedItem } from '@/core/missed'
import { dayKey, addDays } from '@/core/dates'
import { REWARD_CONFIG } from '@/core/rewards'
import { questService } from '@/data/questService'
import { formatDayLabel } from '@/lib/format'
import { AnalysisSheet } from './AnalysisSheet'
import { WorkSheet } from './WorkSheet'
import { ACTION_LABEL, CAUSE_LABEL, CAUSES, catchUpDate, formatCycle } from './labels'
import { useQuestViews } from './useQuestViews'
import s from './life.module.css'

/** Bilan des quêtes non réalisées : à analyser, causes, décisions. Aucune pénalité d'XP. */
export function BilanPanel() {
  const { missed, analyses, now } = useAppState()
  const views = useQuestViews()
  const [analysing, setAnalysing] = useState<MissedItem | null>(null)
  const [catchUp, setCatchUp] = useState<{ item: MissedItem; date: string } | null>(null)
  const stats = causeStats(analyses)
  const max = Math.max(1, ...Object.values(stats))
  const minDate = dayKey(addDays(now, -REWARD_CONFIG.retroactiveMaxDays))
  const view = catchUp ? views.find((v) => v.quest.id === catchUp.item.quest.id) : undefined

  return (
    <div className={s.stack}>
      <Card>
        <SectionTitle title="À analyser" aside={missed.length ? `${missed.length}` : undefined} />
        <p className={s.desc}>Quêtes récurrentes non validées et échéances dépassées. <strong style={{ color: 'var(--c-text)' }}>Aucune XP n’est retirée</strong> : l’analyse sert à comprendre et à ajuster.</p>
        {missed.length === 0 ? (
          <p className={s.hintLine} style={{ marginTop: 12 }}>Rien à analyser pour l’instant. Les cycles manqués apparaîtront ici.</p>
        ) : (
          <ul className={s.missedList}>
            {missed.map((m) => {
              const date = catchUpDate(m.cycleKey)
              const canCatchUp = m.kind === 'cycle' && date !== null && date >= minDate
              return (
                <li key={m.quest.id + m.cycleKey}>
                  <div className={s.missedInfo}><b>{m.quest.title}</b><small>{formatCycle(m.cycleKey)}</small></div>
                  <div className={s.missedActions}>
                    <button className={s.act} onClick={() => setAnalysing(m)}>Analyser</button>
                    {canCatchUp ? <button className={s.act} onClick={() => setCatchUp({ item: m, date: date! })}>J’ai fait</button> : null}
                    <button className={s.act} onClick={() => void questService.recordMissedAnalysis({ questId: m.quest.id, cycleKey: m.cycleKey, cause: null, action: 'none', dismissed: true })}>Ignorer</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {Object.keys(stats).length > 0 ? (
        <Card>
          <SectionTitle title="Causes les plus fréquentes" />
          <div className={s.catBars}>
            {CAUSES.filter((c) => stats[c]).sort((a, b) => (stats[b] ?? 0) - (stats[a] ?? 0)).map((c) => (
              <div key={c}>
                <div className={s.catBarHead}><span>{CAUSE_LABEL[c]}</span><span className="num">{stats[c]}</span></div>
                <ProgressBar value={(stats[c] ?? 0) / max} thin label={CAUSE_LABEL[c]} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Historique des analyses" aside={analyses.length ? `${analyses.length}` : undefined} />
        {analyses.length === 0 ? (
          <EmptyState title="Aucune analyse">Vos analyses de quêtes manquées seront conservées ici.</EmptyState>
        ) : (
          <ul className={s.ledger}>
            {analyses.map((a) => (
              <li key={a.id}>
                <div className={s.ledgerMain}>
                  <b>{a.questTitle}</b>
                  <small>{formatCycle(a.cycleKey)} · analysé {formatDayLabel(a.createdAt).toLowerCase()}</small>
                  {a.dismissed ? <small>Ignoré</small> : <small>{ACTION_LABEL[a.action]} — {a.actionDetail}</small>}
                  {a.note ? <small>« {a.note} »</small> : null}
                </div>
                <div className={s.ledgerXp}>{a.cause ? <Badge tone="info">{CAUSE_LABEL[a.cause]}</Badge> : <Badge>Ignoré</Badge>}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AnalysisSheet item={analysing} onClose={() => setAnalysing(null)} onCatchUp={(item) => { const d = catchUpDate(item.cycleKey); if (d) setCatchUp({ item, date: d }) }} />
      {view && catchUp ? <WorkSheet open view={view} initialDoneOn={catchUp.date} onClose={() => setCatchUp(null)} /> : null}
    </div>
  )
}
