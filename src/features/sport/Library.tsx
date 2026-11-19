import { useMemo, useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, SectionTitle } from '@/design/components'
import { Field, Segmented, inputClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { EXERCISES, EXERCISE_BY_ID } from '@/core/sport/exercises'
import { equipmentFor } from '@/core/sport/generator'
import {
  AREA_LABEL, EQUIPMENT_LABEL, MOVEMENT_LABEL, MUSCLE_GROUPS, MUSCLE_LABEL, PROFILE_LABEL,
  type BodyArea, type EquipmentId, type Exercise, type Movement, type MuscleGroup,
} from '@/core/sport/types'
import { sportService } from '@/data/sportService'
import { useAction } from '../backup/useBackupData'
import { ExerciseFigure } from './ExerciseFigure'
import s from './sport.module.css'

const LEVEL = { 1: 'Technique simple', 2: 'Technique intermédiaire', 3: 'Technique avancée' } as const
const eqText = (e: Exercise) => (e.equipment.length ? e.equipment.map((q) => EQUIPMENT_LABEL[q]).join(' + ') : 'Aucun matériel')

/** Bibliothèque d'exercices : consultation, filtres, préférences (favori, exclu, évitement temporaire), exercices personnalisés. */
export function Library() {
  const { sport } = useAppState()
  const [group, setGroup] = useState<MuscleGroup | 'all'>('all')
  const [avail, setAvail] = useState(true)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Exercise | null>(null)
  const [creating, setCreating] = useState(false)
  const [limit, setLimit] = useState(18)
  const all = useMemo(() => [...EXERCISES.filter((e) => e.kind === 'strength' || e.kind === 'mobility' || e.pushup), ...sport.custom], [sport.custom])
  const eq = useMemo(() => new Set([...equipmentFor(sport.profile, 'bodyweight'), ...equipmentFor(sport.profile, 'equipment')]), [sport.profile])
  const prefOf = (id: string) => sport.prefs.find((p) => p.exerciseId === id)
  const list = all.filter((e) => (group === 'all' || e.primary.includes(group)) && (!avail || e.equipment.every((x) => eq.has(x))) && (!q || e.name.toLowerCase().includes(q.toLowerCase())))

  return (
    <Card>
      <SectionTitle title="Bibliothèque d’exercices" aside={`${list.length} exercice${list.length > 1 ? 's' : ''}`} />
      <p className={s.dim}>Choisissez vos exercices : Level propose, mais ne modifie jamais votre sélection durablement sans votre validation. Les pompes (toutes variantes) sont réservées aux circuits HIIT full-body, si vous les autorisez dans votre profil.</p>
      <div className={s.filters}>
        <input className={inputClass} type="search" placeholder="Rechercher un exercice" aria-label="Rechercher un exercice" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputClass} aria-label="Groupe musculaire" value={group} onChange={(e) => setGroup(e.target.value as MuscleGroup | 'all')}>
          <option value="all">Tous les groupes</option>
          {MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{MUSCLE_LABEL[g]}</option>)}
        </select>
      </div>
      <label className={s.checkLine}><input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} /> Seulement avec mon matériel ({PROFILE_LABEL[sport.profile.equipmentProfile]})</label>
      <ul className={s.exList}>
        {list.slice(0, q || group !== 'all' ? 200 : limit).map((e) => {
          const pref = prefOf(e.id)
          return (
            <li key={e.id}>
              <button className={s.exRow} onClick={() => setOpen(e)}>
                <span className={s.exThumb}><ExerciseFigure exercise={e} size="sm" /></span>
                <span className={s.exMain}>
                  <b>{e.name}</b>
                  <small>{e.primary.map((g) => MUSCLE_LABEL[g]).join(', ')} · {eqText(e)}</small>
                  <span className={s.chips}>
                    {pref?.status === 'favorite' ? <Badge tone="gold">Favori</Badge> : null}
                    {pref?.status === 'excluded' ? <Badge tone="danger">Exclu</Badge> : null}
                    {pref?.status === 'avoid_temp' ? <Badge tone="info">Évité{pref.until ? ` jusqu’au ${pref.until}` : ''}</Badge> : null}
                    {e.custom ? <Badge>Perso</Badge> : null}
                    {e.pushup ? <Badge tone="info">Circuit HIIT uniquement</Badge> : null}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {!q && group === 'all' && list.length > limit ? <button className={`${sheet.btnGhost} ${s.fullBtn}`} onClick={() => setLimit(1000)}>Afficher les {list.length - limit} autres exercices</button> : null}
      <button className={`${sheet.btnPrimary} ${s.fullBtn}`} onClick={() => setCreating(true)}>+ Créer mon exercice</button>
      <ExerciseSheet exercise={open} onClose={() => setOpen(null)} onOpen={setOpen} />
      <CustomExerciseSheet open={creating} onClose={() => setCreating(false)} />
    </Card>
  )
}

export function ExerciseSheet({ exercise, onClose, onOpen }: { exercise: Exercise | null; onClose: () => void; onOpen: (e: Exercise) => void }) {
  return (
    <Sheet open={exercise !== null} onClose={onClose} title={exercise?.name ?? ''}>
      {exercise ? <ExerciseDetail ex={exercise} onOpen={onOpen} /> : null}
    </Sheet>
  )
}

function ExerciseDetail({ ex, onOpen }: { ex: Exercise; onOpen: (e: Exercise) => void }) {
  const { sport } = useAppState()
  const act = useAction()
  const pref = sport.prefs.find((p) => p.exerciseId === ex.id)
  const [until, setUntil] = useState(pref?.until ?? '')
  const all = (id: string) => EXERCISE_BY_ID[id] ?? sport.custom.find((c) => c.id === id)
  const set = (status: 'favorite' | 'excluded' | 'avoid_temp' | null) => void act.run(() => sportService.setPref(ex.id, status, status === 'avoid_temp' ? until || null : null))
  return (
    <div className={s.stack}>
      <ExerciseFigure exercise={ex} />
      <div className={s.chips}>
        {ex.primary.map((g) => <Badge key={g} tone="gold">{MUSCLE_LABEL[g]}</Badge>)}
        {ex.secondary.map((g) => <Badge key={g}>{MUSCLE_LABEL[g]} (secondaire)</Badge>)}
      </div>
      <table className={s.table}><tbody>
        <tr><td>Matériel requis</td><td>{eqText(ex)}</td></tr>
        <tr><td>Famille biomécanique</td><td>{MOVEMENT_LABEL[ex.movement]}</td></tr>
        <tr><td>Niveau technique</td><td>{LEVEL[ex.level]}</td></tr>
        <tr><td>Mesure</td><td>{ex.mode === 'time' ? 'Durée' : ex.bodyweight ? 'Répétitions' : 'Répétitions et charge'}</td></tr>
        {ex.stress.length ? <tr><td>Zones sollicitées</td><td>{ex.stress.map((a) => AREA_LABEL[a]).join(', ')}</td></tr> : null}
      </tbody></table>
      <section><h3 className={s.h3}>Exécution</h3><ol className={s.steps}>{ex.instructions.map((t) => <li key={t}>{t}</li>)}</ol></section>
      <section className={s.safetyBox}><h3 className={s.h3}>Sécurité</h3>{ex.safety.map((t) => <p key={t}>{t}</p>)}<p>Arrêtez en cas de douleur : ne forcez jamais.</p></section>
      <section><h3 className={s.h3}>Progression</h3><p>{ex.progression}</p></section>
      <section>
        <h3 className={s.h3}>Alternatives</h3>
        <div className={s.chips}>{ex.alternatives.map((id) => all(id)).filter((e): e is Exercise => !!e).map((a) => <button key={a.id} className={s.chip} onClick={() => onOpen(a)}>{a.name}</button>)}</div>
      </section>
      {ex.hiitOnly ? <p className={s.note}>Réservé aux circuits HIIT full-body, si vous autorisez les pompes dans votre profil. Cet exercice n’est jamais proposé dans un programme ordinaire.</p> : (
        <section>
          <h3 className={s.h3}>Mes préférences</h3>
          <div className={s.chips}>
            <button className={s.chip} aria-pressed={pref?.status === 'favorite'} onClick={() => set(pref?.status === 'favorite' ? null : 'favorite')}>Favori</button>
            <button className={s.chip} aria-pressed={pref?.status === 'excluded'} onClick={() => set(pref?.status === 'excluded' ? null : 'excluded')}>Exclure</button>
            <button className={s.chip} aria-pressed={pref?.status === 'avoid_temp'} onClick={() => set(pref?.status === 'avoid_temp' ? null : 'avoid_temp')}>Éviter temporairement</button>
          </div>
          <Field label="Éviter jusqu’au (facultatif)" htmlFor="av-until"><input id="av-until" className={inputClass} type="date" value={until} onChange={(e) => setUntil(e.target.value)} onBlur={() => pref?.status === 'avoid_temp' && set('avoid_temp')} /></Field>
          {act.error ? <p className={errorClass} role="alert">{act.error}</p> : null}
        </section>
      )}
      {ex.custom ? <button className={`${sheet.btnDanger}`} onClick={() => void act.run(() => sportService.deleteCustomExercise(ex.id))}>Supprimer cet exercice</button> : null}
    </div>
  )
}

function CustomExerciseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} title="Mon exercice">{open ? <CustomForm onDone={onClose} /> : null}</Sheet>
}

function CustomForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [primary, setPrimary] = useState<MuscleGroup>('dos')
  const [movement, setMovement] = useState<Movement>('pull')
  const [mode, setMode] = useState<'reps' | 'time'>('reps')
  const [equip, setEquip] = useState<EquipmentId[]>([])
  const [steps, setSteps] = useState('')
  const [area, setArea] = useState<BodyArea[]>([])
  const { busy, error, run } = useAction()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await run(() => sportService.saveCustomExercise({
      name, primary: [primary], secondary: [], equipment: equip, movement, level: 2, kind: 'strength', mode, pose: movement === 'push' ? 'press_flat' : movement === 'pull' ? 'row_bent' : movement === 'hinge' ? 'hinge' : movement === 'flexion' ? 'squat' : 'plank',
      instructions: steps.split('\n').map((x) => x.trim()).filter(Boolean).concat(['Contrôlez le mouvement à chaque répétition.']).slice(0, 8), safety: ['Arrêtez en cas de douleur.'], progression: 'Augmentez progressivement les répétitions puis la charge, après plusieurs séances réussies.',
      alternatives: [], bodyweight: !equip.some((q) => ['dumbbells', 'kettlebell', 'barbell', 'machines', 'cables'].includes(q)), stress: area,
    }))
    if (ok) onDone()
  }
  return (
    <form onSubmit={submit}>
      <Field label="Nom" htmlFor="ce-name"><input id="ce-name" className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus required /></Field>
      <Field label="Muscle principal" htmlFor="ce-prim"><select id="ce-prim" className={inputClass} value={primary} onChange={(e) => setPrimary(e.target.value as MuscleGroup)}>{MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{MUSCLE_LABEL[g]}</option>)}</select></Field>
      <Field label="Famille de mouvement" htmlFor="ce-mov"><select id="ce-mov" className={inputClass} value={movement} onChange={(e) => setMovement(e.target.value as Movement)}>{(Object.keys(MOVEMENT_LABEL) as Movement[]).map((m) => <option key={m} value={m}>{MOVEMENT_LABEL[m]}</option>)}</select></Field>
      <Field label="Mesure"><Segmented label="Mesure" value={mode} options={[{ value: 'reps', label: 'Répétitions' }, { value: 'time', label: 'Durée' }]} onChange={setMode} /></Field>
      <Field label="Matériel requis">
        <div className={s.chips}>{(Object.keys(EQUIPMENT_LABEL) as EquipmentId[]).map((q) => <button type="button" key={q} className={s.chip} aria-pressed={equip.includes(q)} onClick={() => setEquip(equip.includes(q) ? equip.filter((x) => x !== q) : [...equip, q])}>{EQUIPMENT_LABEL[q]}</button>)}</div>
      </Field>
      <Field label="Zones sollicitées (pour les contraintes)">
        <div className={s.chips}>{(Object.keys(AREA_LABEL) as BodyArea[]).map((a) => <button type="button" key={a} className={s.chip} aria-pressed={area.includes(a)} onClick={() => setArea(area.includes(a) ? area.filter((x) => x !== a) : [...area, a])}>{AREA_LABEL[a]}</button>)}</div>
      </Field>
      <Field label="Exécution (une étape par ligne)" htmlFor="ce-steps"><textarea id="ce-steps" className={inputClass} rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} /></Field>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.actions}><button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button><button type="submit" className={sheet.btnPrimary} disabled={busy}>Créer</button></div>
    </form>
  )
}
