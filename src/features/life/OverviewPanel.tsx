import { Link } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Badge, Card, ProgressBar, SectionTitle } from '@/design/components'
import { Sparkline } from '@/design/charts'
import { dayKey, daysBetweenKeys } from '@/core/dates'
import { formatValue, indicatorState, isOpenGoal, isOpenProject, type Goal } from '@/core/goals'
import { goalService } from '@/data/goalService'
import { formatDue } from './labels'
import { Box, pct, useLifeMaps } from './lifeShared'
import s from './life.module.css'

const dueTxt = (d: number) => (d < 0 ? 'en retard' : d === 0 ? 'aujourd’hui' : d === 1 ? 'demain' : `dans ${d} j`)

/** Vue d'ensemble LIFE : l'essentiel des objectifs, projets, étapes, échéances et indicateurs importants. */
export function OverviewPanel({ go }: { go: (tab: string) => void }) {
  const { goals, projects, indicators, readings, lifeFindings, now } = useAppState()
  const { goalP, projectP } = useLifeMaps()
  const today = dayKey(now)
  const activeGoals = goals.filter((g) => g.status === 'active')
  const activeProjects = projects.filter((p) => p.status === 'active')
  const nothing = goals.length === 0 && projects.length === 0 && indicators.length === 0
  const globalValue = activeGoals.length ? activeGoals.reduce((n, g) => n + goalP.get(g.id)!.value, 0) / activeGoals.length : null

  const steps = projects.filter(isOpenProject).flatMap((p) => p.steps.filter((x) => !x.done).map((st) => ({ p, st })))
    .sort((a, b) => Number(!!b.st.blocked) - Number(!!a.st.blocked) || (a.st.dueDate ?? '9999').localeCompare(b.st.dueDate ?? '9999') || Number(b.p.priority === 'high') - Number(a.p.priority === 'high')).slice(0, 5)
  const deadlines = [
    ...projects.filter((p) => isOpenProject(p) && p.dueDate).map((p) => ({ id: p.id, title: p.title, kind: 'Projet', date: p.dueDate! })),
    ...goals.filter((g) => isOpenGoal(g) && g.dueDate).map((g) => ({ id: g.id, title: g.title, kind: 'Objectif', date: g.dueDate! })),
    ...projects.filter(isOpenProject).flatMap((p) => p.steps.filter((x) => !x.done && x.dueDate).map((x) => ({ id: x.id, title: `${x.title} (${p.title})`, kind: 'Étape', date: x.dueDate! }))),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  const importantInd = indicators.filter((i) => i.important && !i.archived)
  const gTitle = (g: Goal) => g.title

  if (nothing) {
    return (
      <Card variant="flat"><div className={s.empty}>
        <h3>Piloter vos ambitions</h3>
        <p>Au-delà des quêtes du quotidien, LIFE peut suivre vos objectifs, vos projets et des indicateurs chiffrés. Commencez par ce qui vous parle le plus.</p>
        <div className={s.inlineAdd} style={{ justifyContent: 'center' }}>
          <button className={s.mini} onClick={() => go('objectifs')}>Créer un objectif</button>
          <button className={s.mini} onClick={() => go('projets')}>Créer un projet</button>
          <button className={s.mini} onClick={() => go('indicateurs')}>Suivre un indicateur</button>
        </div>
      </div></Card>
    )
  }
  return (
    <div className={s.stack}>
      <Card>
        <SectionTitle title="Progression globale" aside={globalValue !== null ? <span className="num">{pct(globalValue)}</span> : undefined} />
        {globalValue !== null ? <ProgressBar value={globalValue} label="Progression moyenne des objectifs en cours" /> : <p style={{ color: 'var(--c-text-dim)', fontSize: 14 }}>Aucun objectif en cours.</p>}
        <p className={s.metaRow} style={{ marginTop: 8 }}><span>{activeGoals.length} objectif{activeGoals.length > 1 ? 's' : ''} en cours</span><span>{activeProjects.length} projet{activeProjects.length > 1 ? 's' : ''} en cours</span><span>{indicators.filter((i) => !i.archived).length} indicateur{indicators.length > 1 ? 's' : ''}</span></p>
      </Card>

      {lifeFindings.length ? (
        <Card>
          <SectionTitle title="À surveiller" aside={`${lifeFindings.length}`} />
          <div style={{ display: 'grid', gap: 8 }}>
            {lifeFindings.slice(0, 3).map((f) => <div key={f.id} className={`${s.finding} ${f.severity === 'warn' ? s.warn : ''}`}><div><b>{f.title}</b><small>{f.detail}</small></div></div>)}
            <Link to="/planning" style={{ color: 'var(--c-life)', fontSize: 13 }}>Voir les adaptations proposées dans le planning</Link>
          </div>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Objectifs en cours" aside={<button className={s.mini} onClick={() => go('objectifs')}>Tous</button>} />
        {activeGoals.length === 0 ? <p style={{ color: 'var(--c-text-dim)', fontSize: 14 }}>Aucun objectif en cours. Passez un objectif « À définir » en « En cours » quand vous êtes prêt.</p> : (
          <div className={s.cards}>
            {activeGoals.slice(0, 4).map((g) => (
              <div key={g.id} style={{ display: 'grid', gap: 6 }}>
                <div className={s.itemTop}><span className={s.itemTitle}>{gTitle(g)}</span><span className={`${s.pct} num`}>{pct(goalP.get(g.id)!.value)}</span></div>
                <ProgressBar value={goalP.get(g.id)!.value} thin label={`Avancement de ${g.title}`} />
                <div className={s.metaRow}>{g.dueDate ? <span>échéance {formatDue(g.dueDate)} ({dueTxt(daysBetweenKeys(today, g.dueDate))})</span> : <span>long terme · sans échéance</span>}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title="Projets en cours" aside={<button className={s.mini} onClick={() => go('projets')}>Tous</button>} />
        {activeProjects.length === 0 ? <p style={{ color: 'var(--c-text-dim)', fontSize: 14 }}>Aucun projet en cours.</p> : (
          <div className={s.cards}>
            {activeProjects.slice(0, 4).map((p) => { const pr = projectP.get(p.id)!; return (
              <div key={p.id} style={{ display: 'grid', gap: 6 }}>
                <div className={s.itemTop}><span className={s.itemTitle}>{p.title}</span><span className={`${s.pct} num`}>{pct(pr.value)}</span></div>
                <ProgressBar value={pr.value} thin label={`Avancement de ${p.title}`} />
                <div className={s.metaRow}><span>{pr.doneSteps}/{pr.totalSteps} étapes</span>{p.dueDate ? <span>échéance {formatDue(p.dueDate)}</span> : null}</div>
              </div>
            ) })}
          </div>
        )}
      </Card>

      {steps.length ? (
        <Card>
          <SectionTitle title="Étapes prioritaires" />
          <ul className={s.checkList}>
            {steps.map(({ p, st }) => (
              <li key={st.id} className={s.checkRow}>
                <Box checked={false} label={`Valider l’étape ${st.title}`} onToggle={() => void goalService.toggleStep(p.id, st.id)} />
                <span className={s.body}>{st.title}<small>{p.title}{st.dueDate ? ` · pour le ${formatDue(st.dueDate)}` : ''}{st.blocked ? ' · bloquée' : ''}</small></span>
                {st.blocked ? <Badge tone="danger">Bloquée</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {deadlines.length ? (
        <Card>
          <SectionTitle title="Échéances" />
          <ul className={s.checkList}>
            {deadlines.map((d) => { const n = daysBetweenKeys(today, d.date); return (
              <li key={`${d.kind}${d.id}`} className={s.checkRow}><span className={s.body}>{d.title}<small>{d.kind} · {formatDue(d.date)}</small></span><Badge tone={n < 0 ? 'danger' : n <= 3 ? 'gold' : 'neutral'}>{dueTxt(n)}</Badge></li>
            ) })}
          </ul>
        </Card>
      ) : null}

      {importantInd.length ? (
        <Card>
          <SectionTitle title="Indicateurs importants" aside={<button className={s.mini} onClick={() => go('indicateurs')}>Tous</button>} />
          <ul className={s.checkList}>
            {importantInd.slice(0, 4).map((i) => { const st = indicatorState(i, readings); return (
              <li key={i.id} className={s.checkRow}><span className={s.body}>{i.name}<small>{st.last ? `mesuré le ${formatDue(st.last.at)}` : 'aucune mesure'}{i.target !== null ? ` · cible ${formatValue(i.kind, i.unit, i.target)}` : ''}</small></span><Sparkline values={st.list.slice(-10).map((r) => r.value)} /><b className="num">{st.current !== null ? formatValue(i.kind, i.unit, st.current) : '—'}</b></li>
            ) })}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
