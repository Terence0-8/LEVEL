import { Link } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { strategyLinksOfGoal, strategyLinksOfProject } from '@/core/pilotage'
import s from './pilotage.module.css'

/** Relations stratégiques vues depuis une fiche LIFE : lecture seule (les liens se gèrent dans Pilotage ; rien n'est dupliqué). */
export function GoalPilotage({ goalId }: { goalId: string }) {
  const { strategy } = useAppState()
  const l = strategyLinksOfGoal(goalId, strategy)
  if (!l.orientations.length && !l.priorities.length && !l.cycles.length && !l.plans.length) return null
  return (
    <section aria-label="Pilotage">
      <h3>Pilotage</h3>
      {l.contribution ? <p className={s.muted}>{l.contribution}</p> : null}
      <div className={s.pills} style={{ marginTop: 6 }}>
        {l.orientations.map((o) => <span key={o.id} className={s.pill}>Orientation · {o.name}</span>)}
        {l.priorities.map((p) => <span key={p.id} className={s.pill} data-tone={p.level === 'fundamental' ? 'fundamental' : undefined}>Priorité · {p.title}</span>)}
        {l.cycles.map((c) => <span key={c.id} className={s.pill}>Cycle T{c.quarter} {c.year}</span>)}
        {l.plans.map((p) => <span key={p.id} className={s.pill}>Plan {p.year}</span>)}
      </div>
      <p className={s.sub} style={{ marginTop: 6 }}><Link to="/pilotage/orientations" style={{ color: 'var(--c-gold)' }}>Gérer dans Pilotage</Link></p>
    </section>
  )
}

export function ProjectPilotage({ projectId }: { projectId: string }) {
  const { strategy } = useAppState()
  const l = strategyLinksOfProject(projectId, strategy)
  if (!l.orientations.length && !l.cycles.length && !l.plans.length) return null
  return (
    <section aria-label="Pilotage">
      <h3>Pilotage</h3>
      <div className={s.pills}>
        {l.orientations.map((o) => <span key={o.id} className={s.pill}>Orientation · {o.name}</span>)}
        {l.cycles.map((c) => <span key={c.id} className={s.pill}>Cycle T{c.quarter} {c.year}</span>)}
        {l.plans.map((p) => <span key={p.id} className={s.pill}>Plan {p.year} · projet structurant</span>)}
      </div>
      <p className={s.sub} style={{ marginTop: 6 }}><Link to="/pilotage/orientations" style={{ color: 'var(--c-gold)' }}>Gérer dans Pilotage</Link></p>
    </section>
  )
}

/** Avertissement à afficher dans la confirmation de suppression d'un objectif ou d'un projet LIFE : les liens stratégiques seront retirés (rien d'autre). */
export function StrategyDeleteNote({ goalId, projectId }: { goalId?: string; projectId?: string }) {
  const { strategy } = useAppState()
  const n = goalId
    ? (() => { const l = strategyLinksOfGoal(goalId, strategy); return l.orientations.length + l.priorities.length + l.cycles.length + l.plans.length })()
    : projectId ? (() => { const l = strategyLinksOfProject(projectId, strategy); return l.orientations.length + l.cycles.length + l.plans.length })() : 0
  if (!n) return null
  return <p>Cet élément est relié à Pilotage ({n} lien{n > 1 ? 's' : ''} : orientations, priorités, cycles ou plan). Ces liens seront retirés ; les orientations, priorités, cycles et plans eux-mêmes sont conservés, et le retrait est noté dans l’historique stratégique.</p>
}
