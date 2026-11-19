import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Card, ProgressBar, SectionTitle } from '@/design/components'
import { Ring } from '@/design/charts'
import { Field, Segmented, inputClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { latestPerDay } from '@/core/sport/recovery'
import { AREA_LABEL, MUSCLE_GROUPS, MUSCLE_LABEL, type BodyArea, type Level3, type MuscleGroup, type PainLevel, type SorenessLevel } from '@/core/sport/types'
import { sportService } from '@/data/sportService'
import { useAction } from '../backup/useBackupData'
import { SafetyBadge, SafetyNotice } from './parts'
import s from './sport.module.css'

const FATIGUE: Array<{ value: string; label: string }> = [['0', 'Aucune'], ['1', 'Légère'], ['2', 'Marquée'], ['3', 'Forte']].map(([value, label]) => ({ value, label }))
const SLEEP: Array<{ value: string; label: string }> = [['0', 'Très mauvaise'], ['1', 'Moyenne'], ['2', 'Bonne'], ['3', 'Très bonne']].map(([value, label]) => ({ value, label }))

export function RecoveryPanel() {
  const { sport, now } = useAppState()
  const act = useAction()
  const [open, setOpen] = useState(false)
  const r = sport.recovery
  const days = latestPerDay(sport.checks).slice(0, 10)
  const fatigue = (Object.entries(r.localFatigue) as Array<[MuscleGroup, number]>).sort((a, b) => b[1] - a[1])
  const canRest = r.hasCheckToday && r.level !== 'NORMAL'
  const rested = sport.checks.some((c) => c.day === sport.today && c.restChosen)
  void now
  return (
    <div className={s.stack}>
      <SafetyNotice />
      <Card>
        <SectionTitle title="Indice de récupération" aside={<SafetyBadge level={r.level} />} />
        <div className={s.ringRow}>
          <Ring progress={r.index / 100} size={112} tone={r.level === 'NORMAL' ? 'success' : 'gold'} label={`Indice de récupération ${r.index} sur 100`}><div className={s.ringNum}>{r.index}</div></Ring>
          <div className={s.dim}>
            <p>{r.hasCheckToday ? 'Calculé à partir de votre questionnaire du jour et de la charge de vos dernières séances.' : 'Sans questionnaire, l’indice ne tient compte que de la charge de vos séances.'}</p>
            <p><b>{r.disclaimer}</b></p>
          </div>
        </div>
        <div className={s.actions}>
          <button className={sheet.btnPrimary} onClick={() => setOpen(true)}>{r.hasCheckToday ? 'Me réévaluer' : 'Questionnaire du jour (30 s)'}</button>
          {canRest ? <button className={sheet.btnGhost} disabled={act.busy || rested} onClick={() => void act.run(() => sportService.chooseRest())}>{rested ? 'Repos choisi ✓' : 'Je me repose aujourd’hui'}</button> : null}
        </div>
        {canRest ? <p className={s.dim}>Écouter son corps est récompensé (petite XP de Résilience, plafonnée à 2 par semaine). Jamais de pénalité si vous vous entraînez prudemment.</p> : null}
        {act.error ? <p className={errorClass} role="alert">{act.error}</p> : null}
      </Card>

      <Card>
        <SectionTitle title="Fatigue locale par groupe" />
        <p className={s.dim}>Distincte de la fatigue générale : elle diminue avec le temps après chaque séance (demi-vie d’environ 36 h).</p>
        <div className={s.bars}>
          {fatigue.map(([g, v]) => <div key={g}><div className={s.barHead}><span>{MUSCLE_LABEL[g]}</span><span className="num">{v}</span></div><ProgressBar value={v / 100} thin tone={v >= 65 ? 'gold' : 'info'} label={`Fatigue ${MUSCLE_LABEL[g]}`} /></div>)}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Historique du questionnaire" />
        {days.length === 0 ? <p className={s.dim}>Aucune saisie pour l’instant.</p> : (
          <table className={s.table}>
            <thead><tr><th>Jour</th><th>Fatigue</th><th>Sommeil</th><th>Douleur</th><th>Niveau</th></tr></thead>
            <tbody>{days.map((c) => <tr key={c.id}><td>{c.day.slice(5)}</td><td>{c.fatigue}/3</td><td>{c.sleep}/3</td><td>{c.pain === 'none' ? '—' : c.pain === 'light' ? 'légère' : 'importante'}</td><td><SafetyBadge level={c.safety} /></td></tr>)}</tbody>
          </table>
        )}
      </Card>
      <Sheet open={open} onClose={() => setOpen(false)} title="Questionnaire du jour">{open ? <CheckForm onDone={() => setOpen(false)} /> : null}</Sheet>
    </div>
  )
}

function CheckForm({ onDone }: { onDone: () => void }) {
  const [fatigue, setFatigue] = useState('0')
  const [sleep, setSleep] = useState('2')
  const [soreness, setSoreness] = useState<SorenessLevel>('none')
  const [sorenessArea, setSorenessArea] = useState<MuscleGroup | ''>('')
  const [pain, setPain] = useState<PainLevel>('none')
  const [area, setArea] = useState<string>('')
  const [res, setRes] = useState<Awaited<ReturnType<typeof sportService.saveCheck>> | null>(null)
  const { busy, error, run } = useAction()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await run(() => sportService.saveCheck({
      fatigue: Number(fatigue) as Level3, sleep: Number(sleep) as Level3, soreness,
      sorenessAreas: sorenessArea && soreness !== 'none' ? { [sorenessArea]: soreness } : {}, pain, painArea: pain === 'none' ? null : ((area || null) as MuscleGroup | BodyArea | null),
    }))
    if (r) setRes(r)
  }
  if (res) return (
    <div className={s.stack} role="status">
      <div className={res.state.level === 'NORMAL' ? s.proof : s.proofBad}><b>Niveau {res.state.level === 'NORMAL' ? 'normal' : res.state.level === 'VIGILANCE' ? 'de vigilance' : 'd’alerte'} · indice {res.state.index}/100</b>{res.state.messages.map((m) => <p key={m}>{m}</p>)}<small>{res.state.disclaimer}</small></div>
      {res.state.blocked.length ? <p className={s.warn}>Sollicitation bloquée jusqu’à une nouvelle évaluation : {res.state.blocked.map((b) => b.reason).join(' ')}</p> : null}
      <div className={s.actions}><button className={sheet.btnPrimary} onClick={onDone}>Terminé</button></div>
    </div>
  )
  return (
    <form onSubmit={submit}>
      <Field label="Fatigue générale"><Segmented label="Fatigue générale" value={fatigue} options={FATIGUE} onChange={setFatigue} /></Field>
      <Field label="Qualité du sommeil"><Segmented label="Qualité du sommeil" value={sleep} options={SLEEP} onChange={setSleep} /></Field>
      <Field label="Courbatures"><Segmented label="Courbatures" value={soreness} options={[{ value: 'none', label: 'Aucune' }, { value: 'light', label: 'Légères' }, { value: 'moderate', label: 'Modérées' }, { value: 'high', label: 'Importantes' }]} onChange={setSoreness} /></Field>
      {soreness !== 'none' ? <Field label="Où ? (facultatif)" htmlFor="ck-sor"><select id="ck-sor" className={inputClass} value={sorenessArea} onChange={(e) => setSorenessArea(e.target.value as MuscleGroup | '')}><option value="">Général</option>{MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{MUSCLE_LABEL[g]}</option>)}</select></Field> : null}
      <Field label="Douleur inhabituelle"><Segmented label="Douleur inhabituelle" value={pain} options={[{ value: 'none', label: 'Non' }, { value: 'light', label: 'Légère' }, { value: 'strong', label: 'Importante' }]} onChange={setPain} /></Field>
      {pain !== 'none' ? (
        <Field label="Zone concernée" htmlFor="ck-area" hint="Une douleur importante bloque la zone concernée jusqu’à réévaluation. Sans précision, la musculation est bloquée.">
          <select id="ck-area" className={inputClass} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Je ne sais pas</option>
            <optgroup label="Muscles">{MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{MUSCLE_LABEL[g]}</option>)}</optgroup>
            <optgroup label="Articulations">{(Object.keys(AREA_LABEL) as BodyArea[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}</optgroup>
          </select>
        </Field>
      ) : null}
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.actions}><button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button><button type="submit" className={sheet.btnPrimary} disabled={busy}>Évaluer</button></div>
    </form>
  )
}
