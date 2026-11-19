import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Badge, Card, SectionTitle } from '@/design/components'
import { Field, Segmented, inputClass, errorClass } from '@/design/Form'
import { PHASE_HINT, PHASE_LABEL } from '@/core/sport/cycle'
import { GOAL_LABEL, profileSteps, type SportGoal, type SportProfile } from '@/core/sport/profile'
import {
  ALL_EQUIPMENT, AREA_LABEL, EQUIPMENT_LABEL, EXPERIENCE_LABEL, MUSCLE_GROUPS, MUSCLE_LABEL, PRIORITY_LABEL, PROFILE_LABEL, RUN_FAMILY_LABEL,
  type BodyArea, type EquipmentId, type EquipmentProfile, type Experience, type PriorityLevel, type RunFamily,
} from '@/core/sport/types'
import { sportService } from '@/data/sportService'
import { useAction } from '../backup/useBackupData'
import s from './sport.module.css'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** Profil sportif : configuration progressive, enregistrée à chaque modification, jamais bloquante. */
export function ProfilePanel() {
  const { sport } = useAppState()
  const p = sport.profile
  const act = useAction()
  const save = (patch: Partial<SportProfile> | ((cur: SportProfile) => Partial<SportProfile>)) => void act.run(() => sportService.saveProfile(patch))
  const [area, setArea] = useState<BodyArea>('shoulder')
  const [note, setNote] = useState('')
  const steps = profileSteps(p)

  return (
    <div className={s.stack}>
      <Card variant="flat">
        <SectionTitle title="Configuration progressive" aside={`${steps.filter((x) => x.done).length}/${steps.length}`} />
        <p className={s.dim}>Tout est facultatif et modifiable à tout moment. Vos changements sont enregistrés immédiatement.</p>
        <div className={s.chips}>{steps.map((x) => <Badge key={x.id} tone={x.done ? 'success' : 'neutral'}>{x.label}</Badge>)}</div>
        {act.error ? <p className={errorClass} role="alert">{act.error}</p> : null}
      </Card>

      <Card>
        <SectionTitle title="Expérience et niveaux" />
        <Segmented label="Expérience sportive" value={(p.experience ?? '') as Experience} options={(['beginner', 'intermediate', 'advanced'] as Experience[]).map((v) => ({ value: v, label: EXPERIENCE_LABEL[v] }))} onChange={(v) => save({ experience: v })} />
        <table className={s.table}><tbody>
          <tr><td>Niveau déclaré</td><td>{p.experience ? EXPERIENCE_LABEL[p.experience] : 'Non précisé'}</td></tr>
          <tr><td>Niveau mesuré</td><td>{sport.measured ? EXPERIENCE_LABEL[sport.measured] : 'Disponible après 6 séances'}</td></tr>
          <tr><td>Niveau opérationnel</td><td><b>{EXPERIENCE_LABEL[sport.operational]}</b></td></tr>
        </tbody></table>
        <p className={s.note}>Le niveau <b>opérationnel</b> pilote vos séances. Il reste prudent : « avancé » se démontre par vos séances, et la mesure ne dépasse jamais d’un cran ce que vous déclarez. Les premières séances servent d’évaluation, avec des tests non maximaux (4 répétitions en réserve, jamais d’essai à l’échec).</p>
      </Card>

      <Card>
        <SectionTitle title="Objectifs" />
        <div className={s.chips}>
          {(Object.keys(GOAL_LABEL) as SportGoal[]).map((g) => (
            <button key={g} className={s.chip} aria-pressed={p.goals.includes(g)} onClick={() => save((c) => ({ goals: toggle(c.goals, g) }))}>{GOAL_LABEL[g]}</button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Priorités musculaires" />
        <p className={s.dim}>Trois niveaux : <b>Développement</b> (priorité haute), <b>Progression</b>, <b>Entretien</b>. Sans choix, un groupe est en entretien. Aucun split imposé : Level répartit les groupes selon vos priorités et votre récupération.</p>
        <div className={s.prio}>
          {MUSCLE_GROUPS.map((g) => (
            <label key={g} className={s.prioRow}>
              <span>{MUSCLE_LABEL[g]}</span>
              <select className={inputClass} value={p.musclePriorities[g] ?? ''} onChange={(e) => { const v = e.target.value as PriorityLevel | ''; save((c) => { const m = { ...c.musclePriorities }; if (v) m[g] = v; else delete m[g]; return { musclePriorities: m } }) }}>
                <option value="">Entretien (par défaut)</option>
                {(['develop', 'progress', 'maintain'] as PriorityLevel[]).map((v) => <option key={v} value={v}>{PRIORITY_LABEL[v]}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Disponibilités" />
        <Field label="Jours disponibles" hint="Aucun jour coché : planning souple sur toute la semaine.">
          <div className={s.chips}>{DAYS.map((d, i) => <button key={d} className={s.chip} aria-pressed={p.availability.days.includes(i)} onClick={() => save((c) => ({ availability: { ...c.availability, days: toggle(c.availability.days, i).sort() } }))}>{d}</button>)}</div>
        </Field>
        <div className={s.row3}>
          <Field label="Musculation / sem." htmlFor="pf-str"><input id="pf-str" className={inputClass} type="number" min={0} max={7} value={p.availability.strengthPerWeek} onChange={(e) => { const v = Number(e.target.value); save((c) => ({ availability: { ...c.availability, strengthPerWeek: v } })) }} /></Field>
          <Field label="Course / sem." htmlFor="pf-run"><input id="pf-run" className={inputClass} type="number" min={0} max={7} value={p.availability.runsPerWeek} onChange={(e) => { const v = Number(e.target.value); save((c) => ({ availability: { ...c.availability, runsPerWeek: v } })) }} /></Field>
          <Field label="Minutes / séance" htmlFor="pf-min"><input id="pf-min" className={inputClass} type="number" min={10} max={180} placeholder="45" value={p.sessionMinutes ?? ''} onChange={(e) => save({ sessionMinutes: e.target.value ? Number(e.target.value) : null })} /></Field>
        </div>
        <p className={s.dim}>Une seule séance par jour en fonctionnement normal. La musculation est prioritaire dans les arbitrages.</p>
      </Card>

      <Card>
        <SectionTitle title="Matériel" />
        <Segmented label="Profil de matériel" value={p.equipmentProfile} options={(['none', 'home', 'gym'] as EquipmentProfile[]).map((v) => ({ value: v, label: PROFILE_LABEL[v] }))} onChange={(v) => save({ equipmentProfile: v })} />
        <p className={s.dim} style={{ marginTop: 8 }}>
          {p.equipmentProfile === 'none' ? 'Par défaut : aucun matériel ni mobilier (le sol et un mur suffisent ; un tapis est facultatif). Vos programmes n’ont alors qu’une variante.' : 'Chaque séance a deux variantes cohérentes, avec et sans matériel, qui alimentent le même historique. Vous pouvez basculer pendant la séance sans perdre vos séries.'}
        </p>
        {p.equipmentProfile === 'home' ? (
          <Field label="Petit matériel à domicile" hint="Le mobilier solide (chaise, table, marche) et le tapis sont toujours pris en compte à domicile.">
            <div className={s.chips}>{ALL_EQUIPMENT.filter((e) => !['machines', 'cables', 'rack', 'dip_bars', 'furniture', 'mat'].includes(e)).map((e: EquipmentId) => <button key={e} className={s.chip} aria-pressed={p.homeEquipment.includes(e)} onClick={() => save((c) => ({ homeEquipment: toggle(c.homeEquipment, e) }))}>{EQUIPMENT_LABEL[e]}</button>)}</div>
          </Field>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title="Contraintes physiques" />
        <p className={s.dim}>Les exercices qui sollicitent une zone déclarée sont écartés. Ce n’est pas un avis médical.</p>
        {p.constraints.map((c) => (
          <div key={c.id} className={s.constraint}><span><b>{AREA_LABEL[c.area]}</b>{c.note ? ` · ${c.note}` : ''}</span><button className={s.small} onClick={() => save((cur) => ({ constraints: cur.constraints.filter((x) => x.id !== c.id) }))}>Retirer</button></div>
        ))}
        <div className={s.inline}>
          <select className={inputClass} aria-label="Zone concernée" value={area} onChange={(e) => setArea(e.target.value as BodyArea)}>{(Object.keys(AREA_LABEL) as BodyArea[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}</select>
          <input className={inputClass} aria-label="Précision (facultative)" placeholder="Précision (facultative)" value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} />
          <button className={s.small} onClick={() => { save((cur) => ({ constraints: [...cur.constraints, { id: `${area}-${cur.constraints.length}-${Date.now()}`, area, note: note.trim(), since: new Date().toISOString().slice(0, 10) }] })); setNote('') }}>Ajouter</button>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Course à pied" />
        <p className={s.dim}>Vous choisissez les familles intégrées : Level n’en ajoute jamais une que vous avez exclue.</p>
        <div className={s.chips}>{(Object.keys(RUN_FAMILY_LABEL) as RunFamily[]).map((f) => <button key={f} className={s.chip} aria-pressed={p.runFamilies.includes(f)} onClick={() => save((c) => ({ runFamilies: toggle(c.runFamilies, f) }))}>{RUN_FAMILY_LABEL[f]}</button>)}</div>
        <Field label="Objectif" htmlFor="pf-goal"><input id="pf-goal" className={inputClass} value={p.runGoal} maxLength={100} onChange={(e) => save({ runGoal: e.target.value })} /></Field>
      </Card>

      <Card>
        <SectionTitle title="Préférences d’exercices" />
        <label className={s.checkLine}><input type="checkbox" checked={p.allowPushupsInHiit} onChange={(e) => save({ allowPushupsInHiit: e.target.checked })} /> Autoriser les pompes classiques dans les circuits HIIT full-body (elles ne figurent jamais dans les programmes ordinaires).</label>
        <p className={s.dim}>Favoris, exclusions, évitements temporaires et exercices personnalisés se gèrent dans <Link to="/sport/muscu" className={s.link}>la bibliothèque</Link>.</p>
      </Card>

      <Card>
        <SectionTitle title="Cycle adaptatif" />
        <p className={s.dim}><b>{PHASE_LABEL[sport.cycle.phase]}</b> · semaine {sport.cycle.week} sur {sport.cycle.totalWeeks}. {PHASE_HINT[sport.cycle.phase]}</p>
        <button className={s.small} onClick={() => void act.run(() => sportService.startNewCycle())}>Redémarrer un cycle cette semaine</button>
      </Card>
    </div>
  )
}
