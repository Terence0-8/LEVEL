import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, SectionTitle } from '@/design/components'
import { ConfirmDialog } from '@/design/Sheet'
import { useAppState } from '@/app/AppState'
import { RELIABILITY_LABEL, WINDOW_LABEL, NATURE_LABEL, type Observation, type Window } from '@/core/insights'
import { REC_DECISION_LABEL, type Recommendation } from '@/core/recommendations'
import { eventService } from '@/data/eventService'
import { goalService, GoalError } from '@/data/goalService'
import { pilotageService, PilotageError } from '@/data/pilotageService'
import r from './rpg.module.css'

const WINDOWS: Array<Window | 'all'> = ['all', 'day', 'week', 'month', 'long']

/** Observations (faits, estimations, lectures prudentes) et recommandations explicables ; chaque décision appartient à l'utilisateur. */
export function AnalysisPanel() {
  const { intel, recStates } = useAppState()
  const navigate = useNavigate()
  const [win, setWin] = useState<Window | 'all'>('all')
  const [confirm, setConfirm] = useState<Recommendation | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const obs = intel.observations.filter((o) => win === 'all' || o.window === win)
  const hist = recStates.filter((s) => !intel.recommendations.some((x) => x.id === s.id)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)

  const accept = async (rec: Recommendation) => {
    setMsg(null)
    if (rec.action?.type === 'life-proposal' || rec.action?.type === 'pilotage-proposal') { setConfirm(rec); return }
    await eventService.decide(rec, 'accepted')
    if (rec.action?.type === 'open') navigate(rec.action.route)
    else setMsg('Noté : rien n’est modifié, c’était un constat à valoriser.')
  }
  const apply = async () => {
    const rec = confirm!; setConfirm(null)
    if (rec.action?.type === 'pilotage-proposal') {
      try { const res = await pilotageService.applyProposal(rec.action.proposal); await eventService.decide(rec, 'accepted'); setMsg(res.applied) }
      catch (e) { setMsg(e instanceof PilotageError ? e.message : 'Action impossible : la situation a changé.') }
      return
    }
    if (rec.action?.type !== 'life-proposal') return
    try { const res = await goalService.applyLifeProposal(rec.action.proposal); await eventService.decide(rec, 'accepted'); setMsg(res.applied) }
    catch (e) { setMsg(e instanceof GoalError ? e.message : 'Action impossible : la situation a changé.') }
  }

  return (
    <div className={r.stack}>
      <p className={r.note}>Analyse locale, sans IA distante : des règles et des statistiques simples sur vos données. Une observation n’est produite que si l’échantillon est suffisant ; la fiabilité l’indique. Level ne devine ni motivation ni émotion, et ne modifie rien sans votre accord.</p>
      {msg ? <p className={r.note} role="status">{msg}</p> : null}

      <Card variant={intel.recommendations.length ? 'event' : 'default'}>
        <SectionTitle title="Recommandations" aside={`${intel.recommendations.length}`} />
        {intel.recommendations.length === 0 ? <p className={r.muted}>Aucune recommandation pour l’instant : soit la situation n’en appelle pas, soit les données sont encore trop peu nombreuses. Les recommandations déjà traitées ne reviennent que si la situation change.</p> : (
          <div style={{ display: 'grid', gap: 12 }}>
            {intel.recommendations.map((rec) => (
              <article key={rec.id} className={r.rec} aria-label={rec.title}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <b style={{ fontFamily: 'var(--font-title)', fontSize: 16 }}>{rec.title}</b>
                  <span className={`${r.tagChip} ${r.recommendation}`}>{RELIABILITY_LABEL[rec.confidence].replace('Fiabilité', 'Confiance')}</span>
                </div>
                <dl>
                  <div><dt>Constat</dt><dd>{rec.finding}</dd></div>
                  <div><dt>Ce qui le justifie</dt><dd><ul className={r.evid}>{rec.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></dd></div>
                  <div><dt>Recommandation</dt><dd>{rec.recommendation}</dd></div>
                  <div><dt>Bénéfice attendu</dt><dd>{rec.benefit}</dd></div>
                </dl>
                <div className={r.decisions}>
                  <button className={`${r.btn} ${r.mini}`} onClick={() => void accept(rec)}>{rec.action?.type === 'open' ? rec.action.label : rec.action ? 'Accepter' : 'Bien noté'}</button>
                  <button className={`${r.btn} ${r.mini} ${r.ghost}`} onClick={() => void eventService.decide(rec, 'snoozed')}>Reporter (7 jours)</button>
                  <button className={`${r.btn} ${r.mini} ${r.ghost}`} onClick={() => void eventService.decide(rec, 'declined')}>Refuser</button>
                  <button className={`${r.btn} ${r.mini} ${r.ghost}`} onClick={() => void eventService.decide(rec, 'ignored')}>Ignorer</button>
                </div>
              </article>
            ))}
          </div>
        )}
        {hist.length ? (
          <details style={{ marginTop: 14 }}>
            <summary className={r.sectionHint} style={{ cursor: 'pointer' }}>Décisions passées ({hist.length})</summary>
            <ul className={r.rows} style={{ marginTop: 8 }}>
              {hist.map((h) => <li key={h.id} className={r.row}><span className={r.grow} style={{ flex: 1 }}>{h.id.replace('rec:', '')}<small>{REC_DECISION_LABEL[h.status]} le {new Date(h.at).toLocaleDateString('fr-FR')}{h.snoozeUntil ? ` · jusqu’au ${h.snoozeUntil}` : ''}</small></span><button className={`${r.btn} ${r.mini} ${r.ghost}`} onClick={() => void eventService.resetDecision(h.id)}>Réexaminer</button></li>)}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title="Observations" aside={`${obs.length}`} />
        <div className={r.chips} role="group" aria-label="Fenêtre d’analyse" style={{ marginBottom: 12 }}>
          {WINDOWS.map((w) => <button key={w} className={r.chip} aria-pressed={win === w} onClick={() => setWin(w)}>{w === 'all' ? 'Toutes' : WINDOW_LABEL[w]}</button>)}
        </div>
        {obs.length === 0 ? <p className={r.muted}>Pas encore assez de données pour une observation fiable sur cette fenêtre. Level préfère se taire plutôt que de conclure à partir d’une seule action : il faut en général plusieurs semaines d’usage.</p> : (
          <div style={{ display: 'grid', gap: 12 }}>{obs.map((o) => <ObsCard key={o.id} o={o} />)}</div>
        )}
      </Card>

      <ConfirmDialog open={!!confirm} title={confirm?.title ?? ''} confirmLabel="Appliquer" onCancel={() => setConfirm(null)} onConfirm={() => void apply()}>
        <p>{confirm?.recommendation}</p>
        <p>Cette modification sera consignée ; elle ne porte que sur l’élément indiqué.</p>
      </ConfirmDialog>
    </div>
  )
}

function ObsCard({ o }: { o: Observation }) {
  return (
    <article className={`${r.obs} ${r[o.tone]}`} aria-label={o.title}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={`${r.tagChip} ${r[o.nature]}`}>{NATURE_LABEL[o.nature]}</span>
        <span className={r.tagChip}>{WINDOW_LABEL[o.window]}</span>
        <Badge tone={o.reliability === 'high' ? 'success' : o.reliability === 'medium' ? 'info' : 'neutral'}>{RELIABILITY_LABEL[o.reliability]}</Badge>
        {o.certainty ? <span className={r.tagChip}>{o.certainty === 'certain' ? 'Certain' : o.certainty === 'probable' ? 'Probable' : 'Estimation'}</span> : null}
      </div>
      <h3>{o.title}</h3>
      <p className={r.muted}>{o.detail}</p>
      <ul className={r.evid}>{o.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
      <small className={r.sectionHint}>Échantillon : {o.samples}</small>
    </article>
  )
}
