import { useMemo, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, ProgressBar, SectionTitle } from '@/design/components'
import { BarChart } from '@/design/charts'
import { Field, Segmented, inputClass, errorClass } from '@/design/Form'
import sheet from '@/design/sheet.module.css'
import { addDays, dayKey, mondayOf } from '@/core/dates'
import { formatPace, runWeeks } from '@/core/sport/running'
import { RANGE_LABEL, inRange, measureSeries, muscleSplit, periodReview, personalRecords, regularity, runSeries, setsSeries, volume, type StatRange } from '@/core/sport/stats'
import { MUSCLE_LABEL, type MuscleGroup } from '@/core/sport/types'
import { sportService } from '@/data/sportService'
import { formatNumber } from '@/lib/format'
import { useAction } from '../backup/useBackupData'
import s from './sport.module.css'

export function StatsPanel() {
  const { sport, now, progress } = useAppState()
  const [range, setRange] = useState<StatRange>('month')
  const sessions = useMemo(() => inRange(sport.sessions, range, now), [sport.sessions, range, now])
  const v = volume(sessions, sport.custom)
  const split = muscleSplit(sessions, sport.custom)
  const maxSplit = Math.max(1, ...Object.values(split))
  const series = setsSeries(sport.sessions, range, now)
  const prs = personalRecords(sport.sessions, sport.custom)
  const reg = regularity(sport.sessions, sport.profile.availability.strengthPerWeek + sport.profile.availability.runsPerWeek, now)
  const runs = runSeries(sport.sessions, range, now)
  const monday = dayKey(mondayOf(now))
  const wkReview = periodReview(sport.sessions, monday, dayKey(addDays(mondayOf(now), 6)), sport.custom)
  const moReview = periodReview(sport.sessions, dayKey(addDays(now, -30)), dayKey(now), sport.custom)
  const weightSeries = measureSeries(sport.measures, 'weightKg')

  return (
    <div className={s.stack}>
      <Segmented label="Période" value={range} options={(Object.keys(RANGE_LABEL) as StatRange[]).map((r) => ({ value: r, label: RANGE_LABEL[r] }))} onChange={setRange} />
      <Card>
        <SectionTitle title="Volume d’entraînement" aside={`${v.count} séance${v.count > 1 ? 's' : ''}`} />
        <table className={s.table}><tbody>
          <tr><td>Séries</td><td className="num">{v.sets}</td></tr>
          <tr><td>Tonnage (charges)</td><td className="num">{formatNumber(v.tonnageKg)} kg</td></tr>
          <tr><td>Répétitions au poids du corps</td><td className="num">{formatNumber(v.bodyweightReps)}</td></tr>
          <tr><td>Durée</td><td className="num">{v.minutes} min</td></tr>
        </tbody></table>
        {series.length > 1 ? <BarChart data={series} label="Séries par période" /> : null}
        <p className={s.dim}>Les variantes avec et sans matériel alimentent le même historique de développement ; les performances restent distinctes par exercice.</p>
      </Card>

      <Card>
        <SectionTitle title="Répartition musculaire" />
        <div className={s.bars}>
          {(Object.entries(split) as Array<[MuscleGroup, number]>).sort((a, b) => b[1] - a[1]).map(([g, n]) => <div key={g}><div className={s.barHead}><span>{MUSCLE_LABEL[g]}</span><span className="num">{n}</span></div><ProgressBar value={n / maxSplit} thin label={MUSCLE_LABEL[g]} /></div>)}
        </div>
        <p className={s.dim}>Séries pondérées : muscle principal 1, secondaire 0,5.</p>
      </Card>

      <Card>
        <SectionTitle title="Records personnels" aside={`${prs.length}`} />
        {prs.length === 0 ? <p className={s.dim}>Vos records apparaîtront avec vos séances.</p> : (
          <table className={s.table}><tbody>{prs.slice(0, 15).map((p) => <tr key={p.id}><td>{p.label}<br /><small className={s.dim}>{p.date}</small></td><td className="num">{p.value}</td></tr>)}</tbody></table>
        )}
        <p className={s.dim}>Un record ne rapporte de l’XP qu’après plusieurs expositions, avec technique propre et sans douleur.</p>
      </Card>

      <Card>
        <SectionTitle title="Fréquence et régularité" />
        <table className={s.table}><tbody>
          <tr><td>Séances par semaine active</td><td className="num">{reg.avgPerWeek}</td></tr>
          <tr><td>Semaines actives</td><td className="num">{reg.activeWeeks}</td></tr>
          <tr><td>Semaines consécutives à l’objectif</td><td className="num">{reg.streakWeeks}</td></tr>
          <tr><td>Niveau SPORT</td><td className="num">{progress.sportLevel.level}</td></tr>
        </tbody></table>
      </Card>

      {runs.length ? (
        <Card>
          <SectionTitle title="Progression en course" />
          <BarChart data={runs.map((r) => ({ label: r.date, value: Math.max(0, 600 - r.pace) }))} label="Allure des sorties (barres plus hautes = plus rapide)" />
          <table className={s.table}><tbody>{runs.slice(-5).reverse().map((r) => <tr key={r.date + r.km}><td>{r.date}</td><td className="num">{r.km} km · {formatPace(r.pace)}</td></tr>)}</tbody></table>
          <p className={s.dim}>{runWeeks(sport.sessions).slice(-1)[0] ? `Dernière semaine : ${Math.round(runWeeks(sport.sessions).slice(-1)[0].km * 10) / 10} km.` : ''}</p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Bilans" />
        <h3 className={s.h3}>Cette semaine</h3>
        <p>{wkReview.sessions} séance{wkReview.sessions > 1 ? 's' : ''}, {wkReview.sets} séries, {wkReview.minutes} min{wkReview.km ? `, ${wkReview.km} km` : ''}. {wkReview.topGroups.length ? `Surtout travaillé : ${wkReview.topGroups.map((g) => MUSCLE_LABEL[g]).join(', ')}.` : ''}</p>
        <h3 className={s.h3}>30 derniers jours</h3>
        <p>{moReview.sessions} séance{moReview.sessions > 1 ? 's' : ''}, {moReview.sets} séries. {moReview.neglected.length && moReview.sessions > 2 ? `Peu ou pas travaillé : ${moReview.neglected.map((g) => MUSCLE_LABEL[g]).join(', ')}. À vous de décider si c’est voulu.` : ''}</p>
        <p className={s.dim}>Bilan après séance : affiché à la fin de chaque séance et dans l’historique.</p>
      </Card>

      <Measures weightSeries={weightSeries} />
    </div>
  )
}

function Measures({ weightSeries }: { weightSeries: Array<{ label: string; value: number }> }) {
  const { sport, now } = useAppState()
  const [date, setDate] = useState(dayKey(now))
  const [w, setW] = useState('')
  const [waist, setWaist] = useState('')
  const { busy, error, run } = useAction()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await run(() => sportService.addMeasure({ date, weightKg: w ? Number(w) : undefined, waistCm: waist ? Number(waist) : undefined }))
    if (ok) { setW(''); setWaist('') }
  }
  return (
    <Card>
      <SectionTitle title="Mensurations (facultatif)" />
      {weightSeries.length > 1 ? <BarChart data={weightSeries} label="Poids dans le temps" /> : null}
      <form onSubmit={submit}>
        <div className={s.row3}>
          <Field label="Date" htmlFor="ms-d"><input id="ms-d" className={inputClass} type="date" max={dayKey(now)} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Poids (kg)" htmlFor="ms-w"><input id="ms-w" className={inputClass} type="number" step="0.1" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></Field>
          <Field label="Tour de taille (cm)" htmlFor="ms-t"><input id="ms-t" className={inputClass} type="number" step="0.5" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} /></Field>
        </div>
        {error ? <p className={errorClass} role="alert">{error}</p> : null}
        <button className={sheet.btnPrimary} disabled={busy || (!w && !waist)}>Ajouter une mesure</button>
      </form>
      {sport.measures.length ? <ul className={s.list}>{[...sport.measures].reverse().slice(0, 6).map((m) => <li key={m.id} className={s.rowCard}><div><b>{m.date}</b><small>{[m.weightKg ? `${m.weightKg} kg` : '', m.waistCm ? `taille ${m.waistCm} cm` : ''].filter(Boolean).join(' · ')}</small></div><button className={s.small} onClick={() => void sportService.deleteMeasure(m.id)}>Supprimer</button></li>)}</ul> : null}
      <Badge>Données personnelles : conservées sur cet appareil</Badge>
    </Card>
  )
}
