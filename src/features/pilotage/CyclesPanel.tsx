import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, SectionTitle } from '@/design/components'
import { Sheet } from '@/design/Sheet'
import { Field, textareaClass } from '@/design/Form'
import { useAppState } from '@/app/AppState'
import { CYCLE_STATUS_LABEL, cycleId, planId, quarterLabel, quarterOf, quarterRange, type AnnualPlan, type Cycle, type Quarter } from '@/core/pilotage'
import { pilotageService } from '@/data/pilotageService'
import sh from '@/design/sheet.module.css'
import { LinkPicker, useRun } from './shared'
import s from './pilotage.module.css'

const CAPACITY_IDS = ['cross-overload', 'cross-capacity', 'cross-deadline-cluster', 'strat-fundamental-limit', 'strat-priority-notime', 'strat-projects-unlinked', 'strat-goal-timeline']
const QUARTERS: Quarter[] = [1, 2, 3, 4]
const toLines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean)

/** Plan annuel (quoi, pourquoi, actions concrètes) et cycles trimestriels : ils SÉLECTIONNENT ce qui existe déjà, ils ne créent pas de tâches. */
export function CyclesPanel() {
  const { strategy, now, intel, sport } = useAppState()
  const navigate = useNavigate()
  const [year, setYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState<Quarter>(quarterOf(now))
  const [planForm, setPlanForm] = useState(false)
  const [cycleForm, setCycleForm] = useState(false)
  const { error, run } = useRun()
  const plan = strategy.plans.find((p) => p.id === planId(year)) ?? null
  const cycle = strategy.cycles.find((c) => c.id === cycleId(year, quarter)) ?? null
  const capacity = intel.observations.filter((o) => CAPACITY_IDS.some((id) => o.id.startsWith(id)))
  const cur = quarterOf(now)

  return (
    <div className={s.stack}>
      <div className={s.actions} role="group" aria-label="Année">
        <button className={s.mini} aria-label="Année précédente" onClick={() => setYear(year - 1)}>←</button>
        <b style={{ alignSelf: 'center', fontFamily: 'var(--font-title)' }}>{year}</b>
        <button className={s.mini} aria-label="Année suivante" onClick={() => setYear(year + 1)}>→</button>
      </div>
      {error ? <p className={s.err} role="alert">{error}</p> : null}

      <Card>
        <SectionTitle title={`Plan annuel ${year}`} aside={plan ? <Badge tone={plan.status === 'active' ? 'gold' : 'neutral'}>{plan.status === 'active' ? 'En cours' : 'Clos'}</Badge> : undefined} />
        {plan ? <PlanView plan={plan} /> : <p className={s.muted}>Pas encore de plan pour {year}. Trois questions suffisent : qu’est-ce que je souhaite accomplir, pourquoi, et par quelles actions concrètes ?</p>}
        <div className={s.actions} style={{ marginTop: 10 }}><button className={s.mini} onClick={() => setPlanForm(true)}>{plan ? 'Modifier le plan' : 'Préparer le plan'}</button></div>
      </Card>

      <Card>
        <SectionTitle title="Cycles trimestriels" />
        <div className={s.quarterTrack} role="group" aria-label="Trimestres">
          {QUARTERS.map((q) => {
            const c = strategy.cycles.find((x) => x.id === cycleId(year, q))
            return <button key={q} className={s.quarter} aria-pressed={q === quarter} data-now={year === now.getFullYear() && q === cur} onClick={() => setQuarter(q)}><b>{quarterLabel(year, q)}</b><span>{c ? `${CYCLE_STATUS_LABEL[c.status]} · ${c.priorityIds.length} priorité${c.priorityIds.length > 1 ? 's' : ''}` : 'Pas de cycle'}</span></button>
          })}
        </div>
        <div className={s.horizon} style={{ margin: '14px 0' }} />
        <CycleView year={year} quarter={quarter} cycle={cycle} />
        <div className={s.actions} style={{ marginTop: 10 }}>
          <button className={s.mini} onClick={() => setCycleForm(true)}>{cycle ? 'Modifier le cycle' : 'Préparer le cycle'}</button>
          {cycle ? <button className={s.mini} onClick={() => navigate(`/pilotage/revues?type=quarterly&periode=${year}-Q${quarter}`)}>Faire la revue du trimestre</button> : null}
          {cycle && cycle.status !== 'closed' ? <select className={s.mini} aria-label="Statut du cycle" value={cycle.status} onChange={(e) => void run(() => pilotageService.setCycleStatus(cycle.id, e.target.value as Cycle['status']))}>{(Object.keys(CYCLE_STATUS_LABEL) as Cycle['status'][]).map((st) => <option key={st} value={st}>{CYCLE_STATUS_LABEL[st]}</option>)}</select> : null}
        </div>
      </Card>

      <Card variant={capacity.some((o) => o.tone === 'attention') ? 'event' : 'default'}>
        <SectionTitle title="Charge et capacité" />
        <p className={s.note}>Ces constats viennent du planning et de l’analyse de Level ; Pilotage n’en invente aucun. Chacun est qualifié : certain (compté), probable (déduit de l’historique) ou estimation. Rien n’est modifié automatiquement.</p>
        <div className={s.list} style={{ marginTop: 10 }}>
          {sport.recovery.level !== 'NORMAL' ? <div className={s.obs} data-tone="attention"><b>Récupération sportive : {sport.recovery.level === 'ALERTE' ? 'alerte' : 'vigilance'}</b><span>La récupération est une contrainte prioritaire : n’ajoutez pas d’effort sportif aux priorités tant qu’elle n’est pas revenue à la normale.</span></div> : null}
          {capacity.map((o) => <div key={o.id} className={s.obs} data-tone={o.tone}><b>{o.title}</b><span>{o.detail}</span><div className={s.badges}><Badge tone="neutral">{o.certainty === 'certain' ? 'Certain' : o.certainty === 'probable' ? 'Probable' : 'Estimation'}</Badge></div></div>)}
          {!capacity.length && sport.recovery.level === 'NORMAL' ? <p className={s.muted}>Rien à signaler sur la charge : vos priorités paraissent compatibles avec le temps disponible.</p> : null}
        </div>
        <div className={s.actions} style={{ marginTop: 10 }}><button className={s.mini} onClick={() => navigate('/planning')}>Ouvrir le planning</button><button className={s.mini} onClick={() => navigate('/rpg/analyse')}>Voir l’analyse</button></div>
      </Card>

      <Sheet open={planForm} onClose={() => setPlanForm(false)} title={`Plan annuel ${year}`}>{planForm ? <PlanForm year={year} plan={plan} onDone={() => setPlanForm(false)} /> : null}</Sheet>
      <Sheet open={cycleForm} onClose={() => setCycleForm(false)} title={`Cycle ${quarterLabel(year, quarter)}`}>{cycleForm ? <CycleForm year={year} quarter={quarter} cycle={cycle} onDone={() => setCycleForm(false)} /> : null}</Sheet>
    </div>
  )
}

function names<T extends { id: string }>(ids: string[], list: T[], label: (x: T) => string) { return ids.map((i) => list.find((x) => x.id === i)).filter((x): x is T => !!x).map(label) }

function PlanView({ plan }: { plan: AnnualPlan }) {
  const { strategy, goals, projects } = useAppState()
  const rows: Array<[string, string]> = [['Ce que je souhaite accomplir', plan.aims], ['Pourquoi c’est important', plan.why], ['Actions concrètes', plan.actions], ['Contraintes', plan.constraints]]
  const refs: Array<[string, string[]]> = [['Orientations', names(plan.orientationIds, strategy.orientations, (o) => o.name)], ['Priorités', names(plan.priorityIds, strategy.priorities, (p) => p.title)], ['Objectifs', names(plan.goalIds, goals, (g) => g.title)], ['Projets structurants', names(plan.projectIds, projects, (p) => p.title)]]
  return (
    <div className={s.facts}>
      {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><small className={s.sub}>{k}</small><p style={{ margin: '2px 0 0' }}>{v}</p></div>)}
      {plan.expectedResults.length ? <div><small className={s.sub}>Résultats attendus</small><ul>{plan.expectedResults.map((r) => <li key={r}>{r}</li>)}</ul></div> : null}
      {refs.filter(([, v]) => v.length).map(([k, v]) => <div key={k}><small className={s.sub}>{k}</small><div className={s.pills}>{v.map((x) => <span key={x} className={s.pill}>{x}</span>)}</div></div>)}
    </div>
  )
}

function CycleView({ year, quarter, cycle }: { year: number; quarter: Quarter; cycle: Cycle | null }) {
  const { strategy, goals, projects } = useAppState()
  const r = quarterRange(year, quarter)
  if (!cycle) return <p className={s.muted}>Aucun cycle {quarterLabel(year, quarter)} ({new Date(r.from + 'T12:00:00').toLocaleDateString('fr-FR')} → {new Date(r.to + 'T12:00:00').toLocaleDateString('fr-FR')}). Un cycle regroupe les priorités, objectifs et projets sur lesquels vous voulez avancer ce trimestre.</p>
  const refs: Array<[string, string[]]> = [['Orientations', names(cycle.orientationIds, strategy.orientations, (o) => o.name)], ['Priorités', names(cycle.priorityIds, strategy.priorities, (p) => p.title)], ['Objectifs', names(cycle.goalIds, goals, (g) => g.title)], ['Projets', names(cycle.projectIds, projects, (p) => p.title)]]
  return (
    <div className={s.facts}>
      <div className={s.badges}><Badge tone={cycle.status === 'active' ? 'gold' : 'neutral'}>{CYCLE_STATUS_LABEL[cycle.status]}</Badge></div>
      {cycle.expectedResults.length ? <div><small className={s.sub}>Résultats attendus</small><ul>{cycle.expectedResults.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      {refs.filter(([, v]) => v.length).map(([k, v]) => <div key={k}><small className={s.sub}>{k}</small><div className={s.pills}>{v.map((x) => <span key={x} className={s.pill}>{x}</span>)}</div></div>)}
      {!refs.some(([, v]) => v.length) && !cycle.expectedResults.length ? <p className={s.muted}>Ce cycle est vide pour l’instant.</p> : null}
    </div>
  )
}

function PlanForm({ year, plan, onDone }: { year: number; plan: AnnualPlan | null; onDone: () => void }) {
  const { strategy, goals, projects } = useAppState()
  const [aims, setAims] = useState(plan?.aims ?? '')
  const [why, setWhy] = useState(plan?.why ?? '')
  const [actions, setActions] = useState(plan?.actions ?? '')
  const [constraints, setConstraints] = useState(plan?.constraints ?? '')
  const [results, setResults] = useState((plan?.expectedResults ?? []).join('\n'))
  const [orientationIds, setO] = useState(plan?.orientationIds ?? [])
  const [priorityIds, setP] = useState(plan?.priorityIds ?? [])
  const [goalIds, setG] = useState(plan?.goalIds ?? [])
  const [projectIds, setPr] = useState(plan?.projectIds ?? [])
  const { error, run } = useRun()
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(() => pilotageService.savePlan(year, { aims, why, actions, constraints, expectedResults: toLines(results), orientationIds, priorityIds, goalIds, projectIds })).then((ok) => { if (ok) onDone() }) }}>
      <Field label="Qu’est-ce que je souhaite accomplir cette année ?" htmlFor="pl-aims"><textarea id="pl-aims" className={textareaClass} value={aims} maxLength={1500} onChange={(e) => setAims(e.target.value)} /></Field>
      <Field label="Pourquoi est-ce important ?" htmlFor="pl-why"><textarea id="pl-why" className={textareaClass} value={why} maxLength={1500} onChange={(e) => setWhy(e.target.value)} /></Field>
      <Field label="Quelles actions concrètes permettront d’y parvenir ?" htmlFor="pl-act"><textarea id="pl-act" className={textareaClass} value={actions} maxLength={1500} onChange={(e) => setActions(e.target.value)} /></Field>
      <Field label="Résultats attendus (un par ligne)" htmlFor="pl-res"><textarea id="pl-res" className={textareaClass} value={results} onChange={(e) => setResults(e.target.value)} /></Field>
      <Field label="Contraintes (facultatif)" htmlFor="pl-con"><textarea id="pl-con" className={textareaClass} value={constraints} maxLength={800} onChange={(e) => setConstraints(e.target.value)} /></Field>
      <LinkPicker legend="Orientations" value={orientationIds} onChange={setO} options={strategy.orientations.filter((o) => !o.archived).map((o) => ({ id: o.id, label: o.name }))} empty="Aucune orientation." />
      <div style={{ height: 10 }} />
      <LinkPicker legend="Priorités" value={priorityIds} onChange={setP} options={strategy.priorities.filter((p) => p.status === 'active' || priorityIds.includes(p.id)).map((p) => ({ id: p.id, label: p.title }))} empty="Aucune priorité." />
      <div style={{ height: 10 }} />
      <LinkPicker legend="Objectifs" value={goalIds} onChange={setG} options={goals.filter((g) => g.status !== 'abandoned' || goalIds.includes(g.id)).map((g) => ({ id: g.id, label: g.title }))} empty="Aucun objectif LIFE." />
      <div style={{ height: 10 }} />
      <LinkPicker legend="Projets structurants" value={projectIds} onChange={setPr} options={projects.filter((p) => p.status !== 'abandoned' || projectIds.includes(p.id)).map((p) => ({ id: p.id, label: p.title }))} empty="Aucun projet LIFE." />
      {error ? <p className={s.err} role="alert">{error}</p> : null}
      <p className={s.note} style={{ marginTop: 8 }}>Les changements importants du plan sont conservés dans l’historique.</p>
      <div className={s.actions} style={{ marginTop: 10 }}><button type="submit" className={sh.btnPrimary}>Enregistrer le plan</button></div>
    </form>
  )
}

function CycleForm({ year, quarter, cycle, onDone }: { year: number; quarter: Quarter; cycle: Cycle | null; onDone: () => void }) {
  const { strategy, goals, projects } = useAppState()
  const [results, setResults] = useState((cycle?.expectedResults ?? []).join('\n'))
  const [orientationIds, setO] = useState(cycle?.orientationIds ?? [])
  const [priorityIds, setP] = useState(cycle?.priorityIds ?? [])
  const [goalIds, setG] = useState(cycle?.goalIds ?? [])
  const [projectIds, setPr] = useState(cycle?.projectIds ?? [])
  const { error, run } = useRun()
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(() => pilotageService.saveCycle(year, quarter, { expectedResults: toLines(results), orientationIds, priorityIds, goalIds, projectIds })).then((ok) => { if (ok) onDone() }) }}>
      <p className={s.note}>Choisissez parmi ce qui existe déjà. Un cycle n’est pas une liste de tâches : vos quêtes restent dans LIFE.</p>
      <LinkPicker legend="Priorités du trimestre" value={priorityIds} onChange={setP} options={strategy.priorities.filter((p) => p.status === 'active' || priorityIds.includes(p.id)).map((p) => ({ id: p.id, label: p.title }))} empty="Aucune priorité : créez-en depuis l’onglet Priorités." />
      <div style={{ height: 10 }} />
      <LinkPicker legend="Orientations concernées" value={orientationIds} onChange={setO} options={strategy.orientations.filter((o) => !o.archived).map((o) => ({ id: o.id, label: o.name }))} empty="Aucune orientation." />
      <div style={{ height: 10 }} />
      <LinkPicker legend="Objectifs visés" value={goalIds} onChange={setG} options={goals.filter((g) => g.status !== 'abandoned' || goalIds.includes(g.id)).map((g) => ({ id: g.id, label: g.title }))} empty="Aucun objectif LIFE." />
      <div style={{ height: 10 }} />
      <LinkPicker legend="Projets à faire avancer" value={projectIds} onChange={setPr} options={projects.filter((p) => p.status !== 'abandoned' || projectIds.includes(p.id)).map((p) => ({ id: p.id, label: p.title }))} empty="Aucun projet LIFE." />
      <Field label="Résultats attendus (un par ligne)" htmlFor="cy-res"><textarea id="cy-res" className={textareaClass} value={results} onChange={(e) => setResults(e.target.value)} /></Field>
      {error ? <p className={s.err} role="alert">{error}</p> : null}
      <div className={s.actions} style={{ marginTop: 10 }}><button type="submit" className={sh.btnPrimary}>Enregistrer le cycle</button></div>
    </form>
  )
}
