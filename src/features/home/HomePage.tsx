import type { ReactElement } from "react"
import { Link } from "react-router-dom"
import { useAppState } from '@/app/AppState'
import { Badge, Card, DemoTag, ProgressBar, SectionTitle } from '@/design/components'
import { Ring } from '@/design/charts'
import { Icon } from '@/design/Icon'
import { formatDayLabel, formatNumber, formatTime } from '@/lib/format'
import type { WidgetId } from '@/core/homeLayout'
import type { DemoView } from '@/mocks/demoView'
import type { Progress } from '@/app/AppState'
import { HomeRealQuests } from './HomeRealQuests'
import { QuestList } from '../shared/QuestList'
import s from './HomePage.module.css'

function Hero({ demo, name }: { demo: Progress; name: string }) {
  const g = demo.global
  return (
    <Card variant="event" className={s.span2}>
      <div className={s.hero}>
        <Ring progress={g.progress} size={112} stroke={8} label={`Niveau ${g.level}, ${Math.round(g.progress * 100)} % vers le suivant`}>
          <div style={{ fontSize: 10, letterSpacing: '0.25em', color: 'var(--c-text-dim)' }}>NIVEAU</div>
          <div style={{ fontFamily: 'var(--font-title)', fontSize: 38, lineHeight: 1, color: 'var(--c-gold-bright)' }}>{g.level}</div>
        </Ring>
        <div className={s.heroText}>
          <div className={s.eyebrow}>Bienvenue dans Level</div>
          <h1>{name}</h1>
          <div className={s.rankChip}>
            <Badge tone="gold"><span className={s.rankLetter}>Rang {demo.rank.rank}</span> · {demo.rank.title}</Badge>
            {demo.isDemo ? <DemoTag /> : null}
          </div>
          <div className={s.xpRow}><span>Progression</span><span className="num">{formatNumber(g.xpIntoLevel)} / {formatNumber(g.xpForNext)} XP</span></div>
          <ProgressBar value={g.progress} tone="event" label="XP vers le niveau suivant" />
        </div>
      </div>
    </Card>
  )
}

function Domains({ demo }: { demo: Progress }) {
  const items = [
    { key: 'LIFE', to: '/life', p: demo.life, tone: 'gold' as const },
    { key: 'SPORT', to: '/sport', p: demo.sportLevel, tone: 'info' as const },
  ]
  return (
    <div className={`${s.domains} ${s.span2}`}>
      {items.map(({ key, to, p, tone }) => (
        <Link key={key} to={to}>
          <Card className={s.domain}>
            <h3>{key}</h3>
            <div className={s.lv}>{p.level}<small>NIV.</small></div>
            <ProgressBar value={p.progress} tone={tone} thin label={`Progression ${key}`} />
            <div className={`${s.domainXp} num`}>{formatNumber(p.xpIntoLevel)} / {formatNumber(p.xpForNext)} XP</div>
          </Card>
        </Link>
      ))}
    </div>
  )
}

function Attributes({ demo }: { demo: Progress }) {
  const top = [...demo.attributes].sort((a, b) => b.value - a.value).slice(0, 4)
  return (
    <Card>
      <SectionTitle title="Attributs" aside={<Link to="/rpg" style={{ color: 'var(--c-gold)' }}>Tout voir</Link>} />
      <div className={s.attrList}>
        {top.map((a) => (
          <div key={a.id} className={s.attrRow}>
            <span>{a.label}</span><ProgressBar value={a.value / 100} thin label={a.label} /><span className="num">{a.value}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Quests({ demo, toggle }: { demo: DemoView; toggle: (id: string) => void }) {
  return (
    <Card>
      <SectionTitle title="Quêtes du jour" aside={<>{demo.quests.length - demo.pendingCount}/{demo.quests.length} <DemoTag /></>} />
      <QuestList quests={demo.quests} onToggle={toggle} />
    </Card>
  )
}

function SportPreview({ demo }: { demo: DemoView }) {
  const sp = demo.sport
  const next = sp.sessions[0]
  return (
    <Card>
      <SectionTitle title="Progression sportive" aside={<Link to="/sport" style={{ color: 'var(--c-gold)' }}>Détails</Link>} />
      <div className={s.week} aria-label={`${sp.weekDone} séances sur ${sp.weekGoal} cette semaine`}>
        {sp.weekDays.map((d, i) => (
          <div key={i} className={s.day}>
            <div className={`${s.dot} ${d.state === 'done' ? s.done : d.state === 'planned' ? s.planned : ''}`}>
              {d.state === 'done' ? <Icon name="check" size={15} /> : d.state === 'planned' ? <Icon name="bolt" size={15} /> : null}
            </div>{d.label}
          </div>
        ))}
      </div>
      <div className={s.next}>
        <div><small>Prochaine séance</small><b>{next.name}</b><small>{next.when}</small></div>
        <Badge tone="info">{next.duration} min</Badge>
      </div>
      <div className={s.recov}>
        <div className={s.row}><span>Récupération</span><span className="num">{sp.recovery} %</span></div>
        <ProgressBar value={sp.recovery / 100} tone="success" thin label="Récupération" />
      </div>
    </Card>
  )
}

function Activity({ demo }: { demo: Progress }) {
  return (
    <Card>
      <SectionTitle title="Activités récentes" aside={<Link to="/history" style={{ color: 'var(--c-gold)' }}>Historique</Link>} />
      {demo.activities.length === 0 ? <p style={{ color: 'var(--c-text-dim)', fontSize: 14 }}>Rien pour l'instant. Validez une quête dans LIFE pour lancer votre journal.</p> : null}
      <ul className={s.feed}>
        {demo.activities.slice(0, 5).map((a) => (
          <li key={a.id}>
            <span className={s.feedIcon}><Icon name={a.domain === 'SPORT' ? 'sport' : 'life'} size={18} /></span>
            <span className={s.t}><div>{a.label}</div><small>{formatDayLabel(a.at)} · {formatTime(a.at)}</small></span>
            <span className={`${s.xp} num`}>{a.xp > 0 ? '+' : ''}{a.xp}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function HomePage() {
  const { displayName, toggleDemoQuest, progress, demo } = useAppState()
  const widgets: Record<Exclude<WidgetId, 'hero' | 'domains'>, ReactElement | null> = {
    quests: demo ? <Quests demo={demo} toggle={toggleDemoQuest} /> : <HomeRealQuests />,
    sport: demo ? <SportPreview demo={demo} /> : null,
    attributes: <Attributes demo={progress} />,
    activity: <Activity demo={progress} />,
  }
  const top = progress.layout[1]
  return (
    <div className={s.grid}>
      {progress.layout.map((w) => {
        if (w.id === 'hero') return <Hero key={w.id} demo={progress} name={displayName} />
        if (w.id === 'domains') return <Domains key={w.id} demo={progress} />
        const el = widgets[w.id]
        return el ? <div key={w.id}>{el}</div> : null
      })}
      {top ? <p className={`${s.why} ${s.span2}`}>Organisation automatique · en tête : « {top.reason} ».</p> : null}
    </div>
  )
}
