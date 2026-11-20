import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { DemoTag } from '@/design/components'
import { Icon } from '@/design/Icon'
import { QuestList } from '../shared/QuestList'
import { ProgramNextCard } from '../sport/ProgramsPanel'
import { totalXp } from '@/core/ledger'
import { cycleProgress } from '@/core/questState'
import { questService } from '@/data/questService'
import { formatNumber } from '@/lib/format'
import s from './home.module.css'

const greeting = (h: number) => (h < 5 ? 'Bonsoir' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir')
const dateLabel = (d: Date) => { const t = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d); return t.charAt(0).toUpperCase() + t.slice(1) }

/**
 * Accueil : ce qu'il y a à faire aujourd'hui, la prochaine activité, la progression et — seulement s'il y en a — ce qui demande de l'attention.
 * Aucune information n'est affichée parce qu'elle existe : le reste vit dans LIFE, SPORT, Progression et Pilotage.
 */
export function HomePage() {
  const { displayName, progress, demo, toggleDemoQuest, dashboard, quests, events, program, intel, now, rpg } = useAppState()
  const [done, setDone] = useState<Array<{ id: string; title: string; xp: number }>>([])
  const [error, setError] = useState<string | null>(null)
  const g = progress.global
  const hasQuests = quests.some((q) => !q.archived)

  const complete = async (id: string, title: string) => {
    setError(null)
    try { const ev = await questService.completeQuest(id); setDone((d) => [...d, { id, title, xp: totalXp(ev) }]) } catch { setError('Cette quête ne peut pas être validée ici : ouvrez-la dans LIFE.') }
  }

  const todo = (dashboard?.priorities ?? []).filter((p) => !done.some((d) => d.id === p.quest.id)).slice(0, 5)
  const sportToday = dashboard?.nextSession?.when === 'today' ? dashboard.nextSession : null
  const showProgram = !!program
  const upcoming = dashboard?.nextSession && dashboard.nextSession.when !== 'today' ? dashboard.nextSession : null
  const important = (dashboard?.alerts ?? []).filter((a) => a.tone === 'warn' || a.id.startsWith('rec-') || a.id.startsWith('prestige-'))
  const title = rpg.titles.find((x) => x.id === rpg.equippedTitle)?.title
  const prestige = (k: 'LIFE' | 'SPORT') => progress.cycles?.[k]?.prestigeCount ?? 0
  const soonDeadlines = (dashboard?.deadlines ?? []).filter((d) => d.important && d.daysLeft <= 2 && !important.some((a) => a.detail === d.title)).slice(0, 2)
  const rec = intel.recommendations.find((r) => r.confidence !== 'low')
  const event = intel.latest && !intel.latest.seenAt ? intel.latest : null
  const attention = important.length + soonDeadlines.length + (rec ? 1 : 0) + (event ? 1 : 0)

  const knowCard = (
        <section className={`${s.card} ${s.aKnow}`} aria-label="À savoir">
          <h2>À savoir</h2>
          <ul className={s.notes}>
            {important.map((a) => <li key={a.id}><Link to={a.route} className={`${s.note} ${a.id === 'rec-alert' ? s.noteAlert : a.id.startsWith('prestige-') ? s.noteRpg : s.noteWarn}`}><b>{a.title}</b><span>{a.detail}</span></Link></li>)}
            {soonDeadlines.map((d) => <li key={d.id}><Link to={d.route} className={s.note}><b>{d.title}</b><span>{d.daysLeft <= 0 ? 'Échéance aujourd’hui' : d.daysLeft === 1 ? 'Échéance demain' : 'Échéance dans 2 jours'}</span></Link></li>)}
            {event ? <li><Link to="/rpg/journal" className={`${s.note} ${s.noteRpg}`}><b>{event.title}</b><span>Nouveau dans votre journal de progression</span></Link></li> : null}
            {rec ? <li><Link to="/rpg/analyse" className={s.note}><b>{rec.title}</b><span>Recommandation de Level — vous décidez</span></Link></li> : null}
          </ul>
        </section>
      
  )

  return (
    <div className={s.page}>
      <header className={`${s.head} ${s.aHead}`}>
        <div>
          <h1>{greeting(now.getHours())}{displayName && displayName !== '…' ? `, ${displayName}` : ''}</h1>
          <p>{dateLabel(now)}</p>
        </div>
        <Link to="/planning" className={s.headLink}>Semaine</Link>
      </header>

      <section className={`${s.rpg} ${s.aRpg}`} aria-label="Progression">
        <div className={s.level} aria-label={`Niveau ${g.level}`}><small>Niveau</small><b>{g.level}</b></div>
        <div className={s.rpgBody}>
          <div className={s.rpgTop}><span>{progress.rank.title}{title ? ` · ${title}` : ''}</span><span className="num">{formatNumber(g.xpIntoLevel)} / {formatNumber(g.xpForNext)} XP</span></div>
          <div className={s.track} role="progressbar" aria-label="XP vers le niveau suivant" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.progress * 100)}><i style={{ width: `${Math.round(g.progress * 100)}%` }} /></div>
          <div className={s.ranks}>
            <Link to="/life" className={s.rankLife}>LIFE · rang {progress.lifeRank?.rank ?? progress.rank.rank}{prestige('LIFE') > 0 ? ` · prestige ×${prestige('LIFE')}` : ''}</Link>
            <Link to="/sport" className={s.rankSport}>SPORT · rang {progress.sportRank?.rank ?? progress.rank.rank}{prestige('SPORT') > 0 ? ` · prestige ×${prestige('SPORT')}` : ''}</Link>
          </div>
        </div>
      </section>

      {attention > 0 && important.length > 0 ? knowCard : null}

      {demo ? (
        <section className={`${s.card} ${s.aTodo}`} aria-label="À faire aujourd’hui">
          <h2>À faire aujourd’hui <DemoTag /></h2>
          <p className={s.sub}>Données de démonstration : activez vos vraies données dans Profil &amp; réglages.</p>
          <QuestList quests={demo.quests} onToggle={toggleDemoQuest} />
        </section>
      ) : (
        <section className={`${s.card} ${s.aTodo}`} aria-label="À faire aujourd’hui">
          <h2>À faire aujourd’hui</h2>
          {!hasQuests ? (
            <div className={s.empty}>
              <p><b>Commence par ajouter quelques activités à ton quotidien.</b></p>
              <p>Pas besoin de tout créer : choisis des quêtes prêtes à l’emploi.</p>
              <div className={s.col}>
                <Link to="/life/bibliotheque" className={s.primary}>Choisir des quêtes</Link>
                <Link to="/life/bibliotheque" className={s.secondary}>Charger un pack de démarrage</Link>
              </div>
            </div>
          ) : todo.length === 0 && done.length === 0 ? null : (
            <ul className={s.list}>
              {todo.map(({ quest, remainingMin, score }) => {
                const stepped = quest.steps.length > 0
                const cp = cycleProgress(quest, events, now)
                return (
                  <li key={quest.id} className={s.row}>
                    {stepped ? (
                      <Link to="/life/quetes" className={s.check} aria-label={`Ouvrir ${quest.title}`}><Icon name="life" size={16} /></Link>
                    ) : (
                      <button className={s.check} aria-label={`Valider ${quest.title}`} onClick={() => void complete(quest.id, quest.title)} />
                    )}
                    <span className={s.rowBody}>
                      <span className={s.rowTitle}>{quest.title}</span>
                      <span className={s.rowMeta}><i className={s.tagLife}>LIFE</i>{remainingMin} min{score.reasons.length ? ` · ${score.reasons.slice(0, 2).join(' · ')}` : quest.priority === 'high' ? ' · priorité haute' : ''}{stepped ? ` · ${cp.doneSteps}/${cp.totalSteps} étapes` : ''}</span>
                    </span>
                    <span className={s.xp}>+{quest.rewardXp} XP</span>
                  </li>
                )
              })}
              {done.map((d) => (
                <li key={d.id} className={`${s.row} ${s.rowDone}`}>
                  <span className={`${s.check} ${s.checked}`}><Icon name="check" size={16} /></span>
                  <span className={s.rowBody}><span className={s.rowTitle}>{d.title}</span><span className={s.rowMeta} role="status">Validée</span></span>
                  <span className={`${s.xp} ${s.xpWon}`}>+{d.xp} XP</span>
                </li>
              ))}
            </ul>
          )}
          {hasQuests && !demo && todo.length === 0 && (done.length > 0 || dashboard) ? <p className={s.sub}>Tout est accompli pour aujourd’hui. Inutile de remplir le temps libre.</p> : null}
          {dashboard && dashboard.morePending > 0 ? <p className={s.more}><Link to="/life/quetes">+ {dashboard.morePending} autre{dashboard.morePending > 1 ? 's' : ''} dans LIFE</Link></p> : null}
          {error ? <p className={s.err} role="alert">{error}</p> : null}
        </section>
      )}

      {!demo ? (
        showProgram ? <div className={s.aSide}><ProgramNextCard compact /></div>
          : sportToday ? (
            <section className={`${s.card} ${s.aSide}`} aria-label="Séance du jour">
              <h2>Séance du jour</h2>
              <p className={s.sub}>{sportToday.session.title} · ~{sportToday.session.plannedMinutes} min</p>
              <Link to="/sport" className={s.primarySport}>Ouvrir SPORT</Link>
            </section>
          ) : !upcoming ? (
            <section className={`${s.card} ${s.aSide}`} aria-label="SPORT">
              <h2>SPORT</h2>
              <p className={s.sub}>Aucun programme actif. Choisis un objectif pour obtenir une première programmation.</p>
              <Link to="/sport/programmes" className={s.secondary}>Trouver mon programme</Link>
            </section>
          ) : null
      ) : null}

      {upcoming && !showProgram ? <p className={s.upcoming}>Ensuite : <b>{upcoming.session.title}</b> · {upcoming.label}</p> : null}

      {attention > 0 && important.length === 0 ? knowCard : null}
    </div>
  )
}
