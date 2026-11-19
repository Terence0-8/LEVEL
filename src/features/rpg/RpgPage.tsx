import { Badge, Card, DemoTag, PageHeader, ProgressBar, SectionTitle } from '@/design/components'
import { RadarChart, Ring } from '@/design/charts'
import { Icon } from '@/design/Icon'
import { RANK_THRESHOLDS } from '@/core/rank'
import { useAppState } from '@/app/AppState'
import { formatNumber } from '@/lib/format'
import s from '../pages.module.css'

export function RpgPage() {
  const { displayName, progress: demo } = useAppState()
  return (
    <div className={s.stack}>
      <PageHeader title="RPG" subtitle="Profil, niveaux, attributs et rang." />
      <>
        {(() => (
          <>
            <Card variant="event">
              <div className={s.profileHead}>
                <Ring progress={demo.global.progress} size={124} stroke={9} label={`Niveau ${demo.global.level}`}>
                  <div style={{ fontFamily: 'var(--font-title)', fontSize: 36, color: 'var(--c-gold-bright)' }}>{demo.global.level}</div>
                </Ring>
                <div style={{ width: '100%' }}>
                  <h2>{displayName}</h2>
                  <div style={{ margin: '8px 0 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Badge tone="gold">Rang {demo.rank.rank} · {demo.rank.title}</Badge><DemoTag />
                  </div>
                  <ProgressBar value={demo.global.progress} tone="event" label="XP vers le niveau suivant" />
                  <p className="num" style={{ fontSize: 12, color: 'var(--c-text-dim)', marginTop: 6 }}>
                    {formatNumber(demo.global.xpIntoLevel)} / {formatNumber(demo.global.xpForNext)} XP · Total {formatNumber(demo.totalXp)} XP
                  </p>
                </div>
              </div>
            </Card>

            <div className={s.grid2}>
              <Card>
                <SectionTitle title="Niveaux" aside={demo.isDemo ? <DemoTag /> : undefined} />
                <div style={{ display: 'grid', gap: 16 }}>
                  {[{ n: 'LIFE', p: demo.life, t: 'gold' as const }, { n: 'SPORT', p: demo.sportLevel, t: 'info' as const }].map(({ n, p, t }) => (
                    <div key={n}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <b style={{ fontFamily: 'var(--font-title)', letterSpacing: '0.12em' }}>{n}</b><span>Niveau {p.level}</span>
                      </div>
                      <ProgressBar value={p.progress} tone={t} label={`Progression ${n}`} />
                      <p className="num" style={{ fontSize: 12, color: 'var(--c-text-dim)', marginTop: 5 }}>{formatNumber(p.xpIntoLevel)} / {formatNumber(p.xpForNext)} XP</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <SectionTitle title="Attributs" aside={demo.isDemo ? <DemoTag /> : undefined} />
                <div className={s.center}><RadarChart attributes={demo.attributes} /></div>
              </Card>
            </div>

            <div className={s.grid2}>
              <Card>
                <SectionTitle title="Rangs" />
                <div className={s.ladder}>
                  {[...RANK_THRESHOLDS].reverse().map((r) => {
                    const reached = demo.global.level >= r.minLevel
                    const current = demo.rank.rank === r.rank
                    return (
                      <div key={r.rank} className={`${s.rung} ${reached ? s.reached : ''} ${current ? s.current : ''}`}>
                        <span className={s.letter}>{r.rank}</span><span>{r.title}</span><span className={`${s.lvl} num`}>Niv. {r.minLevel}+</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
              <Card variant="flat">
                <SectionTitle title="Prestige" />
                <div className={s.locked}>
                  <Icon name="lock" size={28} />
                  <p style={{ color: 'var(--c-text-dim)', fontSize: 13 }}>Le système de prestige sera débloqué dans une prochaine itération : renaissance, bonus permanents et marques de rang.</p>
                </div>
              </Card>
            </div>
          </>
        ))()}
      </>
    </div>
  )
}
