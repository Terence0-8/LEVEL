import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Card, EmptyState, SectionTitle } from '@/design/components'
import { Field, Segmented, textareaClass } from '@/design/Form'
import { useAppState } from '@/app/AppState'
import { dayKey } from '@/core/dates'
import { monthPeriod, quarterOf, REVIEW_KIND_LABEL, type PeriodFacts, type ReviewKind, type StrategyReview } from '@/core/pilotage'
import { pilotageService } from '@/data/pilotageService'
import sh from '@/design/sheet.module.css'
import { frDay, useRun } from './shared'
import s from './pilotage.module.css'

const KINDS: ReviewKind[] = ['monthly', 'quarterly', 'annual', 'free']
const QUESTIONS: Record<ReviewKind, Array<[string, string]>> = {
  monthly: [['progress', 'Qu’est-ce qui a avancé ?'], ['difficulties', 'Qu’est-ce qui a été difficile ?'], ['adjust', 'Que souhaitez-vous ajuster ?']],
  quarterly: [['progress', 'Qu’est-ce qui a avancé ce trimestre ?'], ['difficulties', 'Quelles difficultés avez-vous rencontrées ?'], ['changes', 'Qu’est-ce qui a changé, et pourquoi ?'], ['keepDrop', 'Que gardez-vous, que laissez-vous de côté ?']],
  annual: [['achieved', 'Qu’avez-vous accompli cette année ?'], ['learned', 'Qu’avez-vous appris ?'], ['direction', 'Votre vision et vos orientations sont-elles toujours justes ?']],
  free: [['note', 'Ce que vous souhaitez relire ou décider']],
}

function defaultPeriod(kind: ReviewKind, now: Date): string {
  if (kind === 'monthly') return monthPeriod(now.getDate() <= 7 ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now)
  if (kind === 'quarterly') return `${now.getFullYear()}-Q${quarterOf(now)}`
  if (kind === 'annual') return String(now.getFullYear())
  return dayKey(now)
}

/** Revues facultatives : mensuelle, trimestrielle, annuelle ou libre. Level présente des faits mesurés ; les décisions sont les vôtres. */
export function ReviewsPanel() {
  const { strategy, now } = useAppState()
  const [params] = useSearchParams()
  const qKind = params.get('type') as ReviewKind | null
  const [kind, setKind] = useState<ReviewKind>(qKind && KINDS.includes(qKind) ? qKind : 'quarterly')
  const [period, setPeriod] = useState(params.get('periode') ?? defaultPeriod(kind, now))
  const [facts, setFacts] = useState<PeriodFacts | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [decisions, setDecisions] = useState('')
  const [closeCycle, setCloseCycle] = useState(true)
  const [prepareNext, setPrepareNext] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  const { error, run } = useRun()
  const existing = strategy.reviews.find((r) => r.id === `review:${kind}:${period}`) ?? null
  const history = [...strategy.reviews].sort((a, b) => b.at.localeCompare(a.at))
  const cycleExists = kind === 'quarterly' && strategy.cycles.some((c) => `${c.year}-Q${c.quarter}` === period)

  useEffect(() => {
    let live = true
    setFacts(null)
    pilotageService.previewFacts(kind, period).then((f) => { if (live) setFacts(f) }, () => { if (live) setFacts(null) })
    return () => { live = false }
  }, [kind, period, strategy.log.length, strategy.priorities, strategy.cycles])
  useEffect(() => { setAnswers(existing?.answers ?? {}); setDecisions(existing?.decisions ?? ''); setSaved(null) }, [existing?.id, existing?.at])

  const changeKind = (k: ReviewKind) => { setKind(k); setPeriod(defaultPeriod(k, now)) }
  const save = async () => {
    const [y] = period.split('-')
    const nextPriorities = strategy.priorities.filter((p) => p.status === 'active').map((p) => p.id)
    const r = await run(() => pilotageService.saveReview({
      kind, period, answers, decisions,
      closeCycle: kind === 'quarterly' ? closeCycle : false,
      createNext: kind === 'quarterly' && closeCycle && prepareNext && cycleExists ? { priorityIds: nextPriorities, orientationIds: strategy.orientations.filter((o) => !o.archived && o.status === 'active').map((o) => o.id) } : null,
      nextYear: kind === 'annual' && prepareNext && y ? { priorityIds: nextPriorities, orientationIds: strategy.orientations.filter((o) => !o.archived && o.status === 'active').map((o) => o.id) } : null,
    }))
    if (r) setSaved(`${REVIEW_KIND_LABEL[kind]} ${period} enregistrée.`)
  }

  return (
    <div className={s.stack}>
      <p className={s.note}>Une revue est un moment pour faire le point, jamais une obligation ni un contrôle. Level présente des faits tirés de vos données ; vous décidez de ce que vous gardez, changez ou abandonnez.</p>
      <Segmented<ReviewKind> label="Type de revue" value={kind} options={KINDS.map((k) => ({ value: k, label: REVIEW_KIND_LABEL[k].replace('Revue ', '').replace('Révision ', '') }))} onChange={changeKind} />

      <Card>
        <SectionTitle title={`${REVIEW_KIND_LABEL[kind]} · ${period}`} aside={existing ? <Badge tone="gold">Déjà faite le {frDay(existing.at)}</Badge> : undefined} />
        {facts ? <Facts facts={facts} /> : <p className={s.muted}>Calcul des faits…</p>}
      </Card>

      <Card>
        <SectionTitle title="Votre point" />
        {QUESTIONS[kind].map(([key, label]) => <Field key={key} label={label} htmlFor={`rv-${key}`}><textarea id={`rv-${key}`} className={textareaClass} value={answers[key] ?? ''} maxLength={1500} onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })} /></Field>)}
        <Field label="Décisions à retenir (facultatif)" htmlFor="rv-dec"><textarea id="rv-dec" className={textareaClass} value={decisions} maxLength={1500} onChange={(e) => setDecisions(e.target.value)} /></Field>
        {kind === 'quarterly' && cycleExists ? <>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40 }}><input type="checkbox" checked={closeCycle} onChange={(e) => setCloseCycle(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--c-gold)' }} /> Clore le cycle de ce trimestre</label>
          {closeCycle ? <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40 }}><input type="checkbox" checked={prepareNext} onChange={(e) => setPrepareNext(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--c-gold)' }} /> Préparer le cycle suivant avec mes priorités actives (modifiable ensuite)</label> : null}
        </> : null}
        {kind === 'annual' ? <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 40 }}><input type="checkbox" checked={prepareNext} onChange={(e) => setPrepareNext(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--c-gold)' }} /> Préparer le plan de l’année suivante (l’actuel sera clos, pas supprimé)</label> : null}
        {error ? <p className={s.err} role="alert">{error}</p> : null}
        {saved ? <p className={s.ok} role="status">{saved}</p> : null}
        <div className={s.actions} style={{ marginTop: 12 }}><button className={sh.btnPrimary} onClick={() => void save()}>{existing ? 'Remplacer cette revue' : 'Enregistrer la revue'}</button></div>
        {existing ? <p className={s.note} style={{ marginTop: 8 }}>La version précédente reste consultable dans l’historique.</p> : null}
      </Card>

      <Card>
        <SectionTitle title="Revues passées" aside={`${history.length}`} />
        {history.length === 0 ? <EmptyState title="Aucune revue pour l’instant">Faire une revue est facultatif. Les rappels se règlent dans Profil et réglages.</EmptyState> : (
          <div className={s.list}>{history.map((r) => <PastReview key={r.id} r={r} />)}</div>
        )}
      </Card>
    </div>
  )
}

function Facts({ facts }: { facts: PeriodFacts }) {
  return (
    <div className={s.facts}>
      <p className={s.sub}>Du {new Date(facts.from + 'T12:00:00').toLocaleDateString('fr-FR')} au {new Date(facts.to + 'T12:00:00').toLocaleDateString('fr-FR')} — faits calculés depuis LIFE</p>
      <ul>
        <li>Objectifs : {facts.goals.achieved} atteint{facts.goals.achieved > 1 ? 's' : ''}{facts.goals.planned ? ` sur ${facts.goals.planned} prévu${facts.goals.planned > 1 ? 's' : ''}` : ''}</li>
        <li>Projets avancés : {facts.projects.length ? facts.projects.map((p) => `${p.title} (${p.stepsDone} étape${p.stepsDone > 1 ? 's' : ''})`).join(', ') : 'aucun sur la période'}</li>
        {facts.indicators.length ? <li>Indicateurs : {facts.indicators.map((i) => `${i.name} ${i.from} → ${i.to}`).join(', ')}</li> : null}
        {facts.blocked.length ? <li>Points bloqués ou en retard : {facts.blocked.join(', ')}</li> : null}
        {facts.changes.length ? <li>Changements de cap enregistrés : {facts.changes.length}<ul>{facts.changes.slice(0, 5).map((c, i) => <li key={i}>{c}</li>)}</ul></li> : null}
      </ul>
      {facts.keep.length || facts.reconsider.length ? <div>
        {facts.keep.length ? <p style={{ margin: 0 }}>Priorités qui ont avancé : {facts.keep.join(', ')}</p> : null}
        {facts.reconsider.length ? <p style={{ margin: '4px 0 0' }}>Priorités sans activité sur la période : {facts.reconsider.join(', ')} <span className={s.sub}>— à confirmer ou à revoir, sans jugement : vos priorités ont pu évoluer.</span></p> : null}
      </div> : null}
    </div>
  )
}

function PastReview({ r }: { r: StrategyReview }) {
  return (
    <details className={s.item}>
      <summary>{REVIEW_KIND_LABEL[r.kind]} · {r.period} <small className={s.sub}>— {frDay(r.at)}</small></summary>
      <div style={{ marginTop: 8 }}>
        {Object.entries(r.answers).filter(([, v]) => v).map(([k, v]) => <p key={k} className={s.muted}>{v}</p>)}
        {r.decisions ? <p><b>Décisions :</b> {r.decisions}</p> : null}
        <Facts facts={r.facts} />
      </div>
    </details>
  )
}
