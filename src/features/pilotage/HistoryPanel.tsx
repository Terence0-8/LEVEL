import { useState } from 'react'
import { Card, EmptyState, SectionTitle } from '@/design/components'
import { Field, inputClass, textareaClass } from '@/design/Form'
import { useAppState } from '@/app/AppState'
import { LOG_KIND_LABEL, type LogKind } from '@/core/pilotage'
import { pilotageService } from '@/data/pilotageService'
import sh from '@/design/sheet.module.css'
import { frDay, useRun } from './shared'
import s from './pilotage.module.css'

/** Mémoire stratégique : chronologie append-only (visions, orientations, priorités, plans, cycles, revues, décisions). Rien n'y est réécrit. */
export function HistoryPanel() {
  const { strategy } = useAppState()
  const [kind, setKind] = useState<LogKind | 'all'>('all')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const { error, run } = useRun()
  const list = [...strategy.log].sort((a, b) => b.at.localeCompare(a.at)).filter((l) => kind === 'all' || l.kind === kind)
  const kinds = (Object.keys(LOG_KIND_LABEL) as LogKind[]).filter((k) => strategy.log.some((l) => l.kind === k))

  return (
    <div className={s.stack}>
      <Card>
        <SectionTitle title="Noter une décision" />
        <p className={s.note}>Pour garder la trace d’un choix important et de son contexte (« pourquoi j’ai mis ce projet en pause »).</p>
        <form onSubmit={(e) => { e.preventDefault(); void run(() => pilotageService.logDecision(title, note)).then((ok) => { if (ok) { setTitle(''); setNote('') } }) }}>
          <Field label="Décision" htmlFor="d-title"><input id="d-title" className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Concentrer le trimestre sur la bêta" /></Field>
          <Field label="Contexte (facultatif)" htmlFor="d-note"><textarea id="d-note" className={textareaClass} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
          {error ? <p className={s.err} role="alert">{error}</p> : null}
          <div className={s.actions}><button type="submit" className={sh.btnPrimary} disabled={!title.trim()}>Enregistrer la décision</button></div>
        </form>
      </Card>

      <Card>
        <SectionTitle title="Chronologie" aside={`${strategy.log.length}`} />
        {kinds.length > 1 ? <div className={s.actions} role="group" aria-label="Filtrer l’historique" style={{ marginBottom: 12 }}>
          <button className={s.mini} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>Tout</button>
          {kinds.map((k) => <button key={k} className={s.mini} aria-pressed={kind === k} onClick={() => setKind(k)}>{LOG_KIND_LABEL[k]}</button>)}
        </div> : null}
        {list.length === 0 ? <EmptyState title="Rien pour l’instant">Chaque vision, orientation, priorité, plan, cycle, revue ou décision s’inscrira ici, dans l’ordre, sans jamais être écrasé.</EmptyState> : (
          <div className={s.timeline}>
            {list.map((l) => (
              <div key={l.id} className={s.event}>
                <b>{l.summary}</b>
                <small>{frDay(l.at)} · {LOG_KIND_LABEL[l.kind]}</small>
                {l.note ? <p>{l.note}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className={s.note}>Cet historique est inclus dans vos sauvegardes chiffrées.</p>
    </div>
  )
}
