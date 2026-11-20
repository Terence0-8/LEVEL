import { Link, useNavigate, useParams } from 'react-router-dom'
import { Tabs } from '@/design/Tabs'
import { Badge, Card, DemoTag, PageHeader, ProgressBar, SectionTitle } from '@/design/components'
import { RadarChart, Ring } from '@/design/charts'
import { Notice } from '@/design/components'
import { RANK_ORDER, DOMAIN_LADDER, RANK_TITLES } from '@/core/progressionConfig'
import { RANK_THRESHOLDS } from '@/core/rank'
import { LIFE_ATTRIBUTE_IDS, SPORT_ATTRIBUTE_IDS } from '@/core/attributes'
import { useAppState } from '@/app/AppState'
import { formatNumber } from '@/lib/format'
import { ACHIEVEMENT_BY_ID } from '@/core/achievements'
import { AnalysisPanel } from './AnalysisPanel'
import { AttributesPanel } from './AttributesPanel'
import { JournalPanel } from './JournalPanel'
import { DistinctionsPanel } from './DistinctionsPanel'
import { PrestigePanel } from './PrestigePanel'
import { RpgRewardsPanel } from './RpgRewardsPanel'
import r from './rpg.module.css'
import s from '../pages.module.css'

const SECTIONS = [['progression', 'Progression'], ['journal', 'Journal'], ['attributs', 'Attributs'], ['distinctions', 'Distinctions'], ['analyse', 'Analyse'], ['recompenses', 'Récompenses'], ['prestige', 'Prestige'], ['bilans', 'Bilans'], ['history', 'Historique'], ['planning', 'Planning']] as const
/** Entrées de ce menu qui ouvrent un autre espace (bilans, historique, planning) */
const EXTERNAL: Record<string, string> = { bilans: '/bilans', history: '/history', planning: '/planning' }

export function RpgPage() {
  const { section = '' } = useParams()
  const { demo } = useAppState()
  const navigate = useNavigate()
  return (
    <div className={r.stack}>
      <PageHeader title="Progression" subtitle="Ton niveau, tes rangs, tes attributs et tes distinctions." />
      <Tabs label="Sections Progression" color="var(--c-rpg)" value={section || 'progression'} primary={['progression', 'journal', 'attributs', 'distinctions']}
        onChange={(id) => navigate(EXTERNAL[id] ?? (id === 'progression' ? '/rpg' : `/rpg/${id}`))}
        items={SECTIONS.map(([id, label]) => ({ id, label }))} />
      {section === '' ? <Progression /> : null}
      {section !== '' && demo ? <Notice title="Données de démonstration">cette section décrit votre vraie progression : désactivez la démonstration dans Profil & réglages pour la consulter.</Notice> : null}
      {section === 'journal' && !demo ? <JournalPanel /> : null}
      {section === 'analyse' && !demo ? <AnalysisPanel /> : null}
      {section === 'attributs' && !demo ? <AttributesPanel /> : null}
      {section === 'distinctions' && !demo ? <DistinctionsPanel /> : null}
      {section === 'recompenses' && !demo ? <RpgRewardsPanel /> : null}
      {section === 'prestige' && !demo ? <PrestigePanel /> : null}
    </div>
  )
}

function Progression() {
  const { displayName, progress: demo, rpg } = useAppState()
  const cyc = demo.cycles
  const titleId = rpg.equippedTitle
  const title = rpg.titles.find((t) => t.id === titleId)?.title
  const domains = [
    { n: 'LIFE' as const, p: demo.life, t: 'gold' as const, rk: demo.lifeRank, c: cyc?.LIFE },
    { n: 'SPORT' as const, p: demo.sportLevel, t: 'info' as const, rk: demo.sportRank, c: cyc?.SPORT },
  ]
  return (
    <>
      <Card variant="event">
        <div className={s.profileHead}>
          <Ring progress={demo.global.progress} size={124} stroke={9} label={`Niveau ${demo.global.level}`}>
            <div style={{ fontFamily: 'var(--font-title)', fontSize: 36, color: 'var(--c-rpg-strong)' }}>{demo.global.level}</div>
          </Ring>
          <div style={{ width: '100%' }}>
            <h2>{displayName}</h2>
            {title ? <p style={{ color: 'var(--c-rpg)', fontSize: 13, letterSpacing: '0.12em', marginTop: 2 }}>{title}</p> : null}
            <div style={{ margin: '8px 0 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone="rpg">Rang {demo.rank.rank} · {demo.rank.title}</Badge>{demo.isDemo ? <DemoTag /> : null}
            </div>
            <ProgressBar value={demo.global.progress} tone="event" label="XP vers le niveau suivant" />
            <p className="num" style={{ fontSize: 12, color: 'var(--c-text-dim)', marginTop: 6 }}>
              {formatNumber(demo.global.xpIntoLevel)} / {formatNumber(demo.global.xpForNext)} XP · Total {formatNumber(demo.totalXp)} XP
            </p>
            <p style={{ fontSize: 12, color: 'var(--c-text-faint)', marginTop: 4 }}>Niveau global : XP LIFE + XP SPORT, sur tout l’historique ; il n’est jamais réinitialisé.</p>
          </div>
        </div>
      </Card>

      <div className={r.grid2}>
        <Card>
          <SectionTitle title="Niveaux" aside={demo.isDemo ? <DemoTag /> : undefined} />
          <div style={{ display: 'grid', gap: 16 }}>
            {domains.map(({ n, p, t, rk, c }) => (
              <div key={n}>
                <div className={r.progLabel}>
                  <b style={{ fontFamily: 'var(--font-title)', letterSpacing: '0.12em' }}>{n}</b>
                  <span>Niveau {p.level}{rk ? ` · rang ${rk.rank} ${rk.title}` : ''}</span>
                </div>
                <ProgressBar value={p.progress} tone={t} label={`Progression ${n}`} />
                <p className="num" style={{ fontSize: 12, color: 'var(--c-text-dim)', marginTop: 5 }}>
                  {p.maxed ? `Niveau maximal du cycle · ${formatNumber(p.xpIntoLevel)} XP au-delà` : `${formatNumber(p.xpIntoLevel)} / ${formatNumber(p.xpForNext)} XP`}
                  {c && c.cycle > 1 ? ` · cycle ${c.cycle} (prestige ×${c.prestigeCount})` : ''}
                </p>
                {c?.eligible ? <p style={{ marginTop: 6 }}><Link to="/rpg/prestige" style={{ color: 'var(--c-rpg-strong)', fontSize: 13 }}>Prestige {n} disponible — facultatif</Link></p> : null}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Attributs" aside={<Link to="/rpg/attributs" style={{ color: 'var(--c-rpg)' }}>Détail</Link>} />
          <div className={s.center}><RadarChart attributes={demo.attributes.filter((a) => LIFE_ATTRIBUTE_IDS.includes(a.id))} /></div>
          <p style={{ fontSize: 12, color: 'var(--c-text-faint)', marginTop: 6, textAlign: 'center' }}>Attributs LIFE · SPORT dans le détail</p>
        </Card>
      </div>

      {demo.attributes.some((a) => SPORT_ATTRIBUTE_IDS.includes(a.id) && !LIFE_ATTRIBUTE_IDS.includes(a.id)) ? (
        <Card>
          <SectionTitle title="Attributs SPORT" aside="Force, Endurance et Discipline sont partagés avec LIFE" />
          <div className={s.center}><RadarChart attributes={demo.attributes.filter((a) => SPORT_ATTRIBUTE_IDS.includes(a.id))} /></div>
        </Card>
      ) : null}

      <div className={r.grid2}>
        <Card>
          <SectionTitle title="Rangs des domaines" aside={`${DOMAIN_LADDER.maxLevel} niveaux`} />
          <div className={s.ladder}>
            {[...RANK_ORDER].reverse().map((rk) => {
              const min = DOMAIN_LADDER.minLevels[rk]
              const reachedBy = (lv: number) => lv >= min
              const cur = (d: typeof domains[number]) => d.rk?.rank === rk
              const last = RANK_ORDER[RANK_ORDER.indexOf(rk) + 1]
              const span = `${min}–${last ? DOMAIN_LADDER.minLevels[last] - 1 : DOMAIN_LADDER.maxLevel}`
              const reached = domains.some((d) => reachedBy(d.p.level))
              return (
                <div key={rk} className={`${s.rung} ${reached ? s.reached : ''} ${domains.some(cur) ? s.current : ''}`}>
                  <span className={s.letter}>{rk}</span><span>{RANK_TITLES[rk]}</span>
                  <span className={`${s.lvl} num`}>Niv. {span}{domains.filter(cur).length ? ` · ${domains.filter(cur).map((d) => d.n).join(' + ')}` : ''}</span>
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 12, color: 'var(--c-text-faint)', marginTop: 8 }}>Le rang global suit une échelle propre (niveau global 1–100) : {RANK_THRESHOLDS.map((x) => `${x.rank} ${x.minLevel}`).join(' · ')}.</p>
        </Card>
        <Card variant="flat">
          <SectionTitle title="Prestige" aside={<Link to="/rpg/prestige" style={{ color: 'var(--c-rpg)' }}>Ouvrir</Link>} />
          <p className={r.muted}>
            Au dernier niveau du rang SSS d’un domaine, vous pouvez ouvrir un nouveau cycle : récompense majeure au choix, historique conservé, difficulté en légère hausse.
            Il reste toujours facultatif.
          </p>
          <p className="num" style={{ marginTop: 10 }}>LIFE ×{cyc?.LIFE.prestigeCount ?? 0} · SPORT ×{cyc?.SPORT.prestigeCount ?? 0}</p>
        </Card>
      </div>

      {rpg.recent.length ? (
        <Card>
          <SectionTitle title="Distinctions récentes" aside={<Link to="/rpg/distinctions" style={{ color: 'var(--c-rpg)' }}>Toutes</Link>} />
          <ul className={r.rows}>{rpg.recent.slice(0, 3).map((x) => <li key={`${x.kind}${x.id}`} className={r.row}><span className={r.grow + ' ' + 'grow'} style={{ flex: 1 }}>{x.name}<small style={{ display: 'block' }}>{x.kind === 'reward' ? 'Récompense' : ACHIEVEMENT_BY_ID[x.id]?.description}</small></span></li>)}</ul>
        </Card>
      ) : null}
    </>
  )
}
