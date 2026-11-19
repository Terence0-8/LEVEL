import { useMemo, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, EmptyState, ProgressBar, SectionTitle, Stat } from '@/design/components'
import { REWARD_CONFIG } from '@/core/rewards'
import { ConfirmDialog } from '@/design/Sheet'
import { questService } from '@/data/questService'
import type { XpEvent } from '@/core/ledger'
import { formatDayLabel, formatNumber, formatTime } from '@/lib/format'
import s from './life.module.css'

const SOURCE_LABEL = { quest: 'Quête', step: 'Étape', activity: 'Activité', bonus: 'Bonus' } as const

export function RewardsPanel() {
  const { progress, events, categories } = useAppState()
  const [target, setTarget] = useState<XpEvent | null>(null)
  const life = events.filter((e) => e.domain === 'LIFE')
  const byCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of life) if (e.categoryId) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + e.amount)
    const max = Math.max(1, ...m.values())
    return categories.map((c) => ({ c, xp: m.get(c.id) ?? 0, max })).filter((x) => x.xp > 0).sort((a, b) => b.xp - a.xp)
  }, [life, categories])
  const recent = [...life].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25)

  return (
    <div className={s.stack}>
      <Card variant="event">
        <div className={s.statRow}>
          <Stat value={`Niv. ${progress.life.level}`} label="LIFE" />
          <Stat value={formatNumber(progress.life.xp)} label="XP LIFE" />
          <Stat value={life.filter((e) => e.kind === 'award' && e.status === 'valid').length} label="Gains" />
        </div>
        <div style={{ marginTop: 14 }}><ProgressBar value={progress.life.progress} tone="event" label="Progression LIFE" /></div>
        <p className="num" style={{ fontSize: 12, color: 'var(--c-text-dim)', marginTop: 6 }}>{formatNumber(progress.life.xpIntoLevel)} / {formatNumber(progress.life.xpForNext)} XP vers le niveau suivant</p>
      </Card>

      {byCat.length > 0 ? (
        <Card>
          <SectionTitle title="XP par catégorie" />
          <div className={s.catBars}>
            {byCat.map(({ c, xp, max }) => (
              <div key={c.id}>
                <div className={s.catBarHead}><span>{c.name}</span><span className="num">{formatNumber(xp)} XP</span></div>
                <ProgressBar value={xp / max} thin label={c.name} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Journal des récompenses" aside={`${recent.length} derniers`} />
        {recent.length === 0 ? (
          <EmptyState title="Aucune récompense">Validez une quête pour voir apparaître vos premiers gains d'XP, avec leur justification.</EmptyState>
        ) : (
          <ul className={s.ledger}>
            {recent.map((e) => (
              <li key={e.id} className={e.kind === 'reversal' ? s.reversal : e.status === 'reversed' ? s.voided : ''}>
                <div className={s.ledgerMain}>
                  <b>{e.kind === 'reversal' ? `Correction · ${e.label}` : e.label}</b>
                  <small>{SOURCE_LABEL[e.source]} · {formatDayLabel(e.at)} {formatTime(e.at)}</small>
                  <small>{e.reason}</small>
                  {e.note ? <small>« {e.note} »</small> : null}
                  {e.retroactive ? <small>Rétroactif · réalisé le {formatDayLabel(e.at).toLowerCase()}, enregistré le {formatDayLabel(e.recordedAt).toLowerCase()} {formatTime(e.recordedAt)}</small> : null}
                </div>
                <div className={s.ledgerXp}>
                  <span className="num">{e.amount > 0 ? '+' : ''}{e.amount} XP</span>
                  {e.status === 'reversed' ? <Badge>Corrigé</Badge> : null}
                  {e.credit === 'partial' ? <Badge tone="info">{e.percent} %</Badge> : e.credit === 'effort' ? <Badge tone="info">Effort</Badge> : null}
                  {e.retroactive && e.kind === 'award' ? <Badge>Rétroactif</Badge> : null}
                  {e.kind === 'award' && e.status === 'valid' ? <button className={s.act} onClick={() => setTarget(e)} aria-label={`Annuler le gain « ${e.label} »`}>Annuler</button> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog open={target !== null} title="Annuler ce gain ?" confirmLabel="Annuler le gain" onCancel={() => setTarget(null)}
        onConfirm={() => { const id = target?.id; setTarget(null); if (id) void questService.reverseEvent(id, 'Correction manuelle depuis le journal') }}>
        <p><strong>{target?.label}</strong> · +{target?.amount} XP</p>
        <p>L’XP est retirée par une correction tracée ; niveaux, attributs et séries sont recalculés. La quête pourra être validée à nouveau.</p>
      </ConfirmDialog>

      <Card variant="flat">
        <SectionTitle title="Règles de récompense" level={3} />
        <div className={s.rules}>
          <p><strong>Aucune pénalité.</strong> Une quête manquée ne retire jamais d'XP ; elle interrompt seulement une série.</p>
          <p><strong>Une seule fois.</strong> Chaque étape ou quête n'est récompensée qu'une fois par cycle.</p>
          <p><strong>Micro-tâches.</strong> Au-delà de {REWARD_CONFIG.microFullRewardsPerDay} quêtes de {REWARD_CONFIG.microEffortMinutes} min ou moins par jour, leur récompense est réduite.</p>
          <p><strong>Trois situations.</strong> Réussite complète (récompense normale), progression partielle (proportionnelle) ou effort sans objectif atteint (réduit, jamais nul). Les crédits sont déduits de la validation finale.</p>
          <p><strong>Rétroactif.</strong> Vous pouvez déclarer un travail à n’importe quelle date passée (confirmation au-delà de {REWARD_CONFIG.retroactiveConfirmAfterDays} jours) ; date réelle et date d’enregistrement sont conservées.</p>
          <p><strong>Barèmes provisoires.</strong> Les montants seront calibrés ultérieurement.</p>
        </div>
      </Card>
    </div>
  )
}
