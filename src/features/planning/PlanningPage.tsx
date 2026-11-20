import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Badge, Card, EmptyState, PageHeader, ProgressBar, SectionTitle } from '@/design/components'
import { Field, inputClass, smallBtn } from '@/design/Form'
import { Icon } from '@/design/Icon'
import { ConfirmDialog, Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { addDays, dayKey, fromDayKey, mondayOf } from '@/core/dates'
import { buildPlan, capacityOn, dayLoad, detectConflicts, planDay, proposeReorganisations, usableOn, type Commitment, type PlanItem, type Proposal } from '@/core/planning'
import { planningService, PlanningError } from '@/data/planningService'
import s from './PlanningPage.module.css'

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const label = (key: string) => { const d = fromDayKey(key); return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` }
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`)
const msg = (e: unknown) => (e instanceof PlanningError ? e.message : 'Action impossible pour le moment.')

interface Target { item: PlanItem }

export function PlanningPage() {
  const { plan, commitments, now, prefs, quests } = useAppState()
  const [anchor, setAnchor] = useState(() => mondayOf(now))
  const [status, setStatus] = useState<{ text: string; err?: boolean } | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<Proposal | null>(null)
  const [move, setMove] = useState<Target | null>(null)
  const [moveDate, setMoveDate] = useState('')
  const [editing, setEditing] = useState<Commitment | 'new' | null>(null)
  const [placing, setPlacing] = useState<string | null>(null)

  const today = dayKey(now)
  const from = dayKey(anchor)
  const to = dayKey(addDays(anchor, 6))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayKey(addDays(anchor, i))), [anchor])
  const data = useMemo(() => {
    const p = buildPlan(plan, from, to)
    const conflicts = detectConflicts(plan, p, from, to)
    const proposals = proposeReorganisations(plan, p, from, to)
    return { p, conflicts, proposals, plans: days.map((d) => planDay(plan, p, d)) }
  }, [plan, from, to, days])
  const backlog = data.p.backlog
  const proposals = data.proposals.filter((x) => !dismissed.has(x.id))

  async function run(fn: () => Promise<{ applied?: string } | unknown>, ok: string) {
    try { const r = (await fn()) as { applied?: string } | undefined; setStatus({ text: r?.applied ?? ok }) } catch (e) { setStatus({ text: msg(e), err: true }) }
  }

  const openMove = (item: PlanItem) => { setMove({ item }); setMoveDate(item.date < today ? today : item.date) }
  const moveQuest = quests.find((q) => q.id === move?.item.refId)

  return (
    <div className={s.section}>
      <PageHeader title="Planning" subtitle="LIFE et SPORT sur une même semaine. Level propose, vous décidez." right={<button className={sheet.btnPrimary} onClick={() => setEditing('new')}>Ajouter un engagement</button>} />
      <div className={s.nav}>
        <button className={smallBtn} onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Semaine précédente">←</button>
        <div className={s.label}>{label(from)} – {label(to)}</div>
        <button className={smallBtn} onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Semaine suivante">→</button>
        <button className={smallBtn} onClick={() => setAnchor(mondayOf(now))}>Cette semaine</button>
      </div>
      {status ? <div className={`${s.status} ${status.err ? s.err : ''}`} role="status">{status.text}</div> : null}

      {data.conflicts.length ? (
        <Card>
          <SectionTitle title="Conflits et points d’attention" aside={`${data.conflicts.length}`} />
          <ul className={s.conflicts}>
            {data.conflicts.map((c) => (
              <li key={c.id} className={`${s.conflict} ${c.severity === 'conflict' ? s.conflict_ : c.severity === 'warn' ? s.warn : ''}`}>
                <span className={s.sev}><Icon name={c.severity === 'info' ? 'clock' : 'alert'} size={16} /></span>
                <span><b>{label(c.date)}</b><small>{c.message}</small></span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {proposals.length ? (
        <Card variant="event">
          <SectionTitle title="Propositions de Level" aside={`${proposals.length}`} />
          <p className="muted" style={{ color: 'var(--c-text-dim)', fontSize: 13, marginBottom: 10 }}>Rien n’est modifié sans votre accord. Les échéances, les engagements et les quêtes importantes ne sont jamais déplacés.</p>
          <ul className={s.props}>
            {proposals.map((p) => (
              <li key={p.id} className={s.prop}>
                <div><b>{p.title}</b><p>{p.detail}</p></div>
                <div className={s.actions}>
                  {p.kind === 'review-repeated'
                    ? <Link to="/life" className={smallBtn}>Ouvrir la quête</Link>
                    : <button className={sheet.btnPrimary} onClick={() => setConfirm(p)}>Appliquer</button>}
                  <button className={smallBtn} onClick={() => setDismissed(new Set([...dismissed, p.id]))}>Ignorer</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className={s.days}>
        {data.plans.filter((dp) => dp.date >= today || dp.items.length > 0).map((dp) => {
          const isPast = dp.date < today
          const cap = capacityOn(prefs.planning, dp.date)
          const usable = usableOn(prefs.planning, dp.date)
          const load = dayLoad(data.p.items, dp.date)
          return (
            <Card key={dp.date} className={`${s.day} ${isPast ? s.past : ''} ${dp.date === today ? s.today : ''}`}>
              <div className={s.dayHead}>
                <h3>{label(dp.date)}{dp.date === today ? ' · aujourd’hui' : ''}</h3>
                <span className={`${s.load} num`}>{cap === 0 ? 'Jour indisponible' : `${dur(load)} / ${dur(usable)}`}</span>
              </div>
              {cap > 0 ? <ProgressBar value={usable ? Math.min(1, load / usable) : 0} tone={load > usable ? 'event' : 'success'} thin label={`Charge du ${label(dp.date)}`} /> : null}
              {dp.items.length === 0 && dp.suggestions.length === 0 ? <p className={s.empty}>Rien de prévu. Une journée libre, c’est voulu.</p> : null}
              <ul className={s.items}>
                {dp.items.map((it) => (
                  <li key={it.id} className={`${s.item} ${it.kind === 'sport' ? s.sport : it.kind === 'commitment' ? s.commitment : ''}`}>
                    <span className={s.ico}><Icon name={it.kind === 'sport' ? 'sport' : it.kind === 'commitment' ? 'calendar' : it.recurring ? 'clock' : 'target'} size={16} /></span>
                    <span className={s.t}><span>{it.title}</span><small>{it.start ? `${it.start} · ` : ''}{dur(it.minutes)}{it.overdue ? ' · en retard' : ''}{it.recurring ? ' · quotidienne' : ''}</small></span>
                    {it.important ? <Badge tone="gold">Important</Badge> : null}
                    {it.kind === 'quest' && !it.recurring && !isPast ? <button className={smallBtn} onClick={() => openMove(it)}>Déplacer</button> : null}
                    {it.kind === 'commitment' ? <button className={smallBtn} onClick={() => setEditing(commitments.find((c) => c.id === it.refId) ?? null)}>Modifier</button> : null}
                    {it.kind === 'sport' ? <Link to="/sport" className={smallBtn}>Ouvrir</Link> : null}
                  </li>
                ))}
              </ul>
              {!isPast && dp.suggestions.length ? (
                <>
                  <div className={s.suggLabel}>Suggestions (jamais au-delà de la marge conseillée)</div>
                  <ul className={s.items}>
                    {dp.suggestions.map((sg) => (
                      <li key={sg.questId} className={`${s.item} ${s.sugg}`}>
                        <span className={s.ico}><Icon name="target" size={16} /></span>
                        <span className={s.t}><span>{sg.title}</span><small>{sg.reasons.slice(0, 2).join(' · ')} · {dur(sg.minutes)}</small></span>
                        <button className={smallBtn} onClick={() => void run(() => planningService.setQuestDay(sg.questId, dp.date), 'Quête placée.')}>Placer ici</button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
          )
        })}
      </div>

      <Card>
        <SectionTitle title="Quêtes sans jour prévu" aside={`${backlog.length}`} />
        {backlog.length === 0 ? <p className={s.empty}>Tout est placé ou sans urgence. Rien à décider ici.</p> : (
          <ul className={s.items}>
            {backlog.map((q) => (
              <li key={q.id} className={s.item}>
                <span className={s.ico}><Icon name="target" size={16} /></span>
                <span className={s.t}><span>{q.title}</span><small>{q.type === 'weekly' ? 'hebdomadaire · ' : ''}{dur(q.effortMinutes)}</small></span>
                <button className={smallBtn} onClick={() => { setPlacing(q.id); setMoveDate(today) }}>Placer</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p style={{ fontSize: 12, color: 'var(--c-text-faint)' }}>Capacité réglée dans <Link to="/profile#planning" style={{ color: 'var(--c-gold)' }}>Profil & réglages</Link> : {dur(prefs.planning.dailyCapacityMin)} par jour, {prefs.planning.marginPct} % de marge conservée.</p>
      {data.plans.length === 0 ? <EmptyState title="Rien à afficher" /> : null}

      <ConfirmDialog open={!!confirm} title={confirm?.title ?? ''} confirmLabel="Appliquer" onCancel={() => setConfirm(null)} onConfirm={() => { const p = confirm!; setConfirm(null); void run(() => planningService.applyProposal(p), 'Fait.') }}>
        <p>{confirm?.detail}</p>
        <p>Ce changement sera consigné dans l’historique de réorganisation.</p>
      </ConfirmDialog>

      <Sheet open={!!move || !!placing} onClose={() => { setMove(null); setPlacing(null) }} title="Choisir le jour"
        footer={<><button className={sheet.btnGhost} onClick={() => { setMove(null); setPlacing(null) }}>Annuler</button><button className={sheet.btnPrimary} onClick={() => { const id = move?.item.refId ?? placing!; setMove(null); setPlacing(null); void run(() => planningService.setQuestDay(id, moveDate), 'Quête placée.') }}>Valider</button></>}>
        <Field label="Jour prévu" htmlFor="mv" hint={moveQuest?.dueDate ? `L’échéance du ${moveQuest.dueDate} reste inchangée.` : 'Aucune échéance n’est modifiée.'}>
          <input id="mv" type="date" className={inputClass} min={today} max={(moveQuest ?? quests.find((q) => q.id === placing))?.dueDate ?? undefined} value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
        </Field>
      </Sheet>

      <CommitmentSheet editing={editing} onClose={() => setEditing(null)} today={today} onDone={(t, err) => setStatus({ text: t, err })} />
    </div>
  )
}

function CommitmentSheet({ editing, onClose, today, onDone }: { editing: Commitment | 'new' | null; onClose: () => void; today: string; onDone: (t: string, err?: boolean) => void }) {
  const cur = editing && editing !== 'new' ? editing : null
  const [form, setForm] = useState({ title: '', date: today, start: '', minutes: 60, important: false, note: '' })
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const key = editing === 'new' ? 'new' : cur?.id ?? null
  if (key !== loadedFor) {
    setLoadedFor(key)
    if (key) setForm(cur ? { title: cur.title, date: cur.date, start: cur.start ?? '', minutes: cur.minutes, important: cur.important, note: cur.note } : { title: '', date: today, start: '', minutes: 60, important: false, note: '' })
  }
  const save = async () => {
    try {
      const input = { ...form, start: form.start || null }
      if (cur) await planningService.updateCommitment(cur.id, input); else await planningService.addCommitment(input)
      onDone(cur ? 'Engagement mis à jour.' : 'Engagement ajouté.')
      onClose()
    } catch (e) { onDone(msg(e), true) }
  }
  return (
    <Sheet open={!!editing} onClose={onClose} title={cur ? 'Modifier l’engagement' : 'Nouvel engagement'}
      footer={<>
        {cur ? <button className={sheet.btnDanger} onClick={() => void planningService.removeCommitment(cur.id).then(() => { onDone('Engagement supprimé.'); onClose() })}>Supprimer</button> : null}
        <button className={sheet.btnGhost} onClick={onClose}>Annuler</button>
        <button className={sheet.btnPrimary} onClick={() => void save()}>Enregistrer</button>
      </>}>
      <Field label="Intitulé" htmlFor="c-title"><input id="c-title" className={inputClass} maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <div className={s.row2}>
        <Field label="Jour" htmlFor="c-date"><input id="c-date" type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Heure (facultative)" htmlFor="c-start"><input id="c-start" type="time" className={inputClass} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
      </div>
      <Field label="Durée (minutes)" htmlFor="c-min"><input id="c-min" type="number" min={5} max={720} step={5} className={inputClass} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })} /></Field>
      <label className={s.check}><input type="checkbox" checked={form.important} onChange={(e) => setForm({ ...form, important: e.target.checked })} /> Engagement important : jamais déplacé par Level</label>
    </Sheet>
  )
}
