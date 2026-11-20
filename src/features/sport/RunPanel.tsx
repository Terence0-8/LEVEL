import { useMemo, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, SectionTitle } from '@/design/components'
import { BarChart } from '@/design/charts'
import { Field, Segmented, inputClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { dayKey } from '@/core/dates'
import { buildRun, easyPace, formatDuration, formatPace, paceOf, runWeeks, runsOf, suggestRun, type RunSuggestion } from '@/core/sport/running'
import type { RunInterval } from '@/core/sport/session'
import { RUN_FAMILY_LABEL, type RunFamily } from '@/core/sport/types'
import { sportService } from '@/data/sportService'
import { useAction } from '../backup/useBackupData'
import { Link } from 'react-router-dom'
import s from './sport.module.css'

export function RunPanel() {
  const { sport, now } = useAppState()
  const [open, setOpen] = useState<{ pre?: RunSuggestion } | null>(null)
  const sug = useMemo(() => suggestRun(sport.profile, sport.sessions, sport.recovery, now), [sport, now])
  const runs = runsOf(sport.sessions).reverse()
  const weeks = runWeeks(sport.sessions).slice(-8)
  const pace = easyPace(sport.sessions)
  return (
    <div className={s.stack}>
      <Card>
        <SectionTitle title="Prochaine sortie conseillée" />
        {sport.recovery.level === 'ALERTE' ? <p className={s.warn}>Alerte de récupération : aucune sortie n’est proposée. Réévaluez-vous avant de reprendre.</p>
          : !sug ? <p className={s.dim}>Aucune famille de course n’est activée : choisissez-les dans <Link to="/sport/profil" className={s.link}>votre profil</Link>. Level n’en ajoute jamais une que vous avez exclue.</p> : (
            <>
              <h3 className={s.bigTitle}>{RUN_FAMILY_LABEL[sug.family]} · {sug.minutes} min{sug.distanceKm ? ` · ≈ ${sug.distanceKm} km` : ''}</h3>
              <p className={s.dim}>{sug.effort}{sug.paceRange ? ` · allure ${formatPace(sug.paceRange[0])} à ${formatPace(sug.paceRange[1])}` : ''}</p>
              {sug.notes.map((n) => <p key={n} className={s.note}>{n}</p>)}
              <div className={s.actions}><button className={sheet.btnPrimary} onClick={() => setOpen({ pre: sug })}>Enregistrer cette sortie</button></div>
            </>
          )}
        <p className={s.dim}>Saisie manuelle uniquement (ni GPS ni montre connectée dans cette version). Les propositions ne sont jamais imposées.</p>
      </Card>

      <Card>
        <SectionTitle title="Mes familles de séances" aside={<Link to="/sport/profil" className={s.link}>Modifier</Link>} />
        <div className={s.chips}>{sport.profile.runFamilies.length ? sport.profile.runFamilies.map((f) => <Badge key={f} tone="info">{RUN_FAMILY_LABEL[f]}</Badge>) : <span className={s.dim}>Aucune</span>}</div>
        <p className={s.dim}>Objectif : {sport.profile.runGoal || 'amélioration générale de l’endurance'}. Allure facile estimée : {pace ? formatPace(pace) : 'après 2 sorties faciles'}.</p>
      </Card>

      {weeks.length ? (
        <Card>
          <SectionTitle title="Volume hebdomadaire" aside="km" />
          <BarChart data={weeks.map((w) => ({ label: w.week, value: Math.round(w.km * 10) / 10 }))} label="Kilomètres par semaine" />
          <p className={s.dim}>Règle : un seul levier progresse à la fois (volume, sortie longue ou intensité), +10 % de volume maximum par semaine.</p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Mes sorties" aside={<button className={s.small} onClick={() => setOpen({})}>+ Enregistrer</button>} />
        {runs.length === 0 ? <p className={s.dim}>Aucune sortie enregistrée. Votre première sortie sert de test prudent : allure de conversation, sans chercher la performance.</p> : (
          <ul className={s.list}>
            {runs.slice(0, 12).map((x) => (
              <li key={x.id} className={s.rowCard}>
                <div><b>{x.run!.distanceKm} km · {formatDuration(x.run!.durationSec)}</b><small>{x.date} · {RUN_FAMILY_LABEL[x.run!.family]} · {formatPace(x.run!.paceSecPerKm)} · difficulté {x.run!.rpe}/10</small></div>
                {x.origin === 'unplanned' ? <Badge>Sans XP</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <RunSheet open={open !== null} pre={open?.pre} onClose={() => setOpen(null)} />
    </div>
  )
}

export function RunSheet({ open, pre, programTag, onClose }: { open: boolean; pre?: RunSuggestion; programTag?: { templateId: string; startedAt: string; index: number }; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="Enregistrer une course">{open ? <RunForm pre={pre} programTag={programTag} onDone={onClose} /> : null}</Sheet>
}

function RunForm({ pre, programTag, onDone }: { pre?: RunSuggestion; programTag?: { templateId: string; startedAt: string; index: number }; onDone: () => void }) {
  const { sport, now } = useAppState()
  const planned = sport.sessions.find((x) => x.kind === 'run' && x.status === 'planned' && x.date <= dayKey(now))
  const [family, setFamily] = useState<RunFamily>(pre?.family ?? planned?.runFamilyPlanned ?? sport.profile.runFamilies[0] ?? 'easy')
  const [date, setDate] = useState(dayKey(now))
  const [km, setKm] = useState(pre?.distanceKm ? String(pre.distanceKm) : '')
  const [min, setMin] = useState(pre ? String(pre.minutes) : '')
  const [sec, setSec] = useState('0')
  const [rpe, setRpe] = useState(family === 'recovery' ? 3 : 5)
  const [organised, setOrganised] = useState(true)
  const [notes, setNotes] = useState('')
  const [iv, setIv] = useState<RunInterval[]>([])
  const [result, setResult] = useState<{ warnings: string[]; xp: { awarded: number } } | null>(null)
  const { busy, error, run } = useAction()
  const durationSec = Number(min || 0) * 60 + Number(sec || 0)
  const pace = Number(km) > 0 && durationSec > 0 ? paceOf(Number(km), durationSec) : 0
  const check = Number(km) > 0 && durationSec > 0 ? buildRun({ family, distanceKm: Number(km), durationSec, rpe, intervals: iv }) : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await run(() => sportService.logRun({ family, distanceKm: Number(km), durationSec, rpe, intervals: iv, date, organised, plannedSessionId: planned?.id, notes, programTag }))
    if (r) setResult({ warnings: r.warnings, xp: r.xp })
  }
  if (result) return (
    <div className={s.stack} role="status">
      <div className={s.proof}><b>Course enregistrée</b><p>{km} km · allure {formatPace(pace)}</p>{organised ? <p>{result.xp.awarded ? 'XP d’endurance inscrite dans votre journal.' : 'Aucune XP (durée minimale non atteinte ou déjà une séance récompensée ce jour).'}</p> : <p>Activité libre : prise en compte dans la récupération et les statistiques, sans XP.</p>}</div>
      {result.warnings.map((w) => <p key={w} className={s.warn}>{w}</p>)}
      <div className={s.actions}><button className={sheet.btnPrimary} onClick={onDone}>Terminé</button></div>
    </div>
  )
  return (
    <form onSubmit={submit}>
      <Field label="Type de séance" htmlFor="rn-fam"><select id="rn-fam" className={inputClass} value={family} onChange={(e) => setFamily(e.target.value as RunFamily)}>{(Object.keys(RUN_FAMILY_LABEL) as RunFamily[]).map((f) => <option key={f} value={f}>{RUN_FAMILY_LABEL[f]}</option>)}</select></Field>
      <div className={s.row3}>
        <Field label="Distance (km)" htmlFor="rn-km"><input id="rn-km" className={inputClass} type="number" step="0.01" min="0" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} required /></Field>
        <Field label="Minutes" htmlFor="rn-min"><input id="rn-min" className={inputClass} type="number" min="0" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} required /></Field>
        <Field label="Secondes" htmlFor="rn-sec"><input id="rn-sec" className={inputClass} type="number" min="0" max="59" inputMode="numeric" value={sec} onChange={(e) => setSec(e.target.value)} /></Field>
      </div>
      <p className={s.paceLine}>Allure moyenne calculée : <b className="num">{pace ? formatPace(pace) : '—'}</b></p>
      <Field label="Difficulté ressentie (1–10)">
        <div className={s.chips}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => <button type="button" key={v} className={s.chip} aria-pressed={rpe === v} onClick={() => setRpe(v)}>{v}</button>)}</div>
      </Field>
      {family === 'interval' ? (
        <Field label="Intervalles individuels (facultatif)">
          {iv.map((x, i) => (
            <div key={i} className={s.inline}>
              <input className={inputClass} type="number" inputMode="decimal" step="0.01" placeholder="km" aria-label={`Distance intervalle ${i + 1} (km)`} value={x.distanceKm ?? ''} onChange={(e) => setIv(iv.map((y, j) => (j === i ? { ...y, distanceKm: e.target.value ? Number(e.target.value) : undefined } : y)))} />
              <input className={inputClass} type="number" inputMode="numeric" placeholder="durée (s)" aria-label={`Durée intervalle ${i + 1} (s)`} value={x.durationSec || ''} onChange={(e) => setIv(iv.map((y, j) => (j === i ? { ...y, durationSec: Number(e.target.value) } : y)))} />
              <input className={inputClass} type="number" inputMode="numeric" placeholder="repos (s)" aria-label={`Repos intervalle ${i + 1} (s)`} value={x.restSec ?? ''} onChange={(e) => setIv(iv.map((y, j) => (j === i ? { ...y, restSec: e.target.value ? Number(e.target.value) : undefined } : y)))} />
              <button type="button" className={s.small} onClick={() => setIv(iv.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className={s.small} onClick={() => setIv([...iv, { durationSec: 0 }])}>+ Ajouter un intervalle</button>
        </Field>
      ) : null}
      <Field label="Date" htmlFor="rn-date"><input id="rn-date" className={inputClass} type="date" max={dayKey(now)} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Commentaire (facultatif)" htmlFor="rn-notes"><input id="rn-notes" className={inputClass} value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Field label="Nature"><Segmented label="Nature" value={organised ? 'org' : 'free'} options={[{ value: 'org', label: 'Séance organisée (XP)' }, { value: 'free', label: 'Activité libre (sans XP)' }]} onChange={(v) => setOrganised(v === 'org')} /></Field>
      {check && check.ok && check.warnings.map((w) => <p key={w} className={s.warn}>{w}</p>)}
      {check && !check.ok ? <p className={errorClass}>{check.error}</p> : null}
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.actions}><button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button><button type="submit" className={sheet.btnPrimary} disabled={busy || !check?.ok}>Enregistrer</button></div>
    </form>
  )
}
