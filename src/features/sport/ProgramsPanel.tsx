import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Field, Segmented } from '@/design/Form'
import { ConfirmDialog, Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { cycleInfo } from '@/core/sport/cycle'
import { generateStrengthSession } from '@/core/sport/generator'
import {
  describeSession, nextProgramSession as nextOf, programSessions, PROGRAM_CATEGORY_LABEL, PROGRAM_GOAL_LABEL, PROGRAMS, programById, programWeek, recommendPrograms, runInstruction, type ProgramAnswers, type ProgramCategory, type ProgramGoal, type ProgramTemplate,
  type Recommendation,
} from '@/core/sport/programs'
import { EXPERIENCE_LABEL, PROFILE_LABEL, type EquipmentProfile, type Experience } from '@/core/sport/types'
import { EXERCISE_BY_ID } from '@/core/sport/exercises'
import { RunSheet } from './RunPanel'
import type { RunSuggestion } from '@/core/sport/running'
import { programService, ProgramError } from '@/data/programService'
import { sportService } from '@/data/sportService'
import p from './programs.module.css'

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DAY_FULL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const errText = (e: unknown) => (e instanceof ProgramError || (e instanceof Error && 'code' in e) ? (e as Error).message : 'Action impossible pour le moment.')

/** Démarrage de la prochaine séance du programme : séance de musculation ou de circuit (préparée par le moteur SPORT) ou consigne de course. */
function useStartNext() {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<{ pre: RunSuggestion; tag: { templateId: string; startedAt: string; index: number } } | null>(null)
  const start = async () => {
    setBusy(true); setError(null)
    try {
      const r = await programService.startNext()
      if (r.kind === 'run') setRun({ pre: r.suggestion, tag: r.tag })
      else { await sportService.prepareSession(r.session.id); nav(`/sport/seance/${r.session.id}`) }
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  return { start, busy, error, run, closeRun: () => setRun(null) }
}

/** Carte « prochaine séance » du programme actif (accueil et SPORT). */
export function ProgramNextCard({ compact = false }: { compact?: boolean }) {
  const { program, sport, now } = useAppState()
  const st = useStartNext()
  const next = useMemo(() => (program ? nextOf(program, sport.sessions, sport.recovery, now) : null), [program, sport.sessions, sport.recovery, now])
  if (!program || !next) return null
  const t = programById(program.templateId)
  const def = next.session
  const canStart = next.state === 'ready' || next.state === 'lighter' || next.state === 'week-done'
  const detail = def.kind === 'run' && t ? runInstruction(t, def, Math.min(next.week, program.weeks)) : def.kind === 'strength' ? describeSession(def) : 'Circuit court, effort contrôlé'
  return (
    <section className={p.next} aria-label="Prochaine séance du programme">
      <div className={p.nextHead}><span className={p.pill}>{program.name}</span><span className={p.dim}>Semaine {Math.min(next.week, program.weeks)} sur {program.weeks}</span></div>
      <h2 className={p.nextTitle}>{next.state === 'finished' ? 'Programme terminé' : def.label}</h2>
      <p className={p.dim}>{next.state === 'finished' ? next.message : `${detail} · ~${next.minutes} min`}</p>
      {next.state !== 'ready' && next.state !== 'finished' ? <p className={`${p.state} ${next.state === 'blocked' ? p.stateAlert : ''}`} role="status">{next.message}</p> : null}
      {!compact && def.scheme ? <p className={p.dim}>{def.scheme}</p> : null}
      <div className={p.row}>
        {canStart ? <button className={p.primary} disabled={st.busy} onClick={() => void st.start()}>{def.kind === 'run' ? 'Enregistrer la sortie' : 'Commencer la séance'}</button> : null}
        <Link className={p.secondary} to="/sport/programmes">Mon programme</Link>
      </div>
      {st.error ? <p className={p.err} role="alert">{st.error}</p> : null}
      <RunSheet open={!!st.run} pre={st.run?.pre} programTag={st.run?.tag} onClose={st.closeRun} />
    </section>
  )
}

export function ProgramsPanel() {
  const { program, sport, now } = useAppState()
  const [wizard, setWizard] = useState(false)
  const [detail, setDetail] = useState<ProgramTemplate | null>(null)
  const [activate, setActivate] = useState<{ t: ProgramTemplate; answers?: Partial<ProgramAnswers> } | null>(null)
  const [edit, setEdit] = useState(false)
  const [stop, setStop] = useState(false)
  const [cat, setCat] = useState<ProgramCategory | 'all'>('all')
  const [err, setErr] = useState<string | null>(null)
  const list = PROGRAMS.filter((x) => cat === 'all' || x.category === cat)
  const t = program ? programById(program.templateId) : null
  const done = program ? programSessions(program, sport.sessions) : []
  const week = program ? Math.min(programWeek(program, now), program.weeks) : 0

  return (
    <div className={p.stack}>
      {program ? (
        <>
          <ProgramNextCard />
          <section className={p.card} aria-label="Mon programme">
            <h2 className={p.h2}>{program.name}</h2>
            <p className={p.dim}>{t?.why}</p>
            <p className={p.facts}><span>{program.perWeek} séances par semaine</span><span>Semaine {week} sur {program.weeks}</span><span>{done.length} séance{done.length > 1 ? 's' : ''} faite{done.length > 1 ? 's' : ''}</span><span>{PROFILE_LABEL[program.equipment]}</span><span>{EXPERIENCE_LABEL[program.level]}</span></p>
            <p className={p.dim}>{program.days.length ? `Jours habituels : ${program.days.map((d) => DAY_FULL[d]).join(', ')}.` : 'Jours souples : vous choisissez quand vous vous entraînez.'}</p>
            <details className={p.details}>
              <summary>Voir les séances du programme</summary>
              <SessionList template={t ?? undefined} sessions={program.split} week={week} />
            </details>
            <div className={p.row}>
              <button className={p.secondary} onClick={() => setEdit(true)}>Modifier mon programme</button>
              <button className={p.secondary} onClick={() => setWizard(true)}>Changer de programme</button>
              <button className={p.secondary} onClick={() => setStop(true)}>Arrêter</button>
            </div>
          </section>
        </>
      ) : (
        <section className={p.hero} aria-label="Aucun programme actif">
          <h2>Aucun programme actif</h2>
          <p>Choisis un objectif pour obtenir une première programmation. Level propose un programme adapté à ton niveau, à ton matériel et à tes disponibilités ; tu peux le personnaliser ou en changer à tout moment.</p>
          <div className={p.col}>
            <button className={p.primary} onClick={() => setWizard(true)}>Obtenir une recommandation</button>
            <a className={p.secondary} href="#catalogue">Découvrir les programmes</a>
            <Link className={p.secondary} to="/sport/muscu">Créer un programme personnalisé</Link>
          </div>
        </section>
      )}
      {err ? <p className={p.err} role="alert">{err}</p> : null}

      <section id="catalogue" aria-label="Catalogue de programmes">
        <h2 className={p.h2}>Tous les programmes</h2>
        <div className={p.chips} role="group" aria-label="Familles de programmes">
          {(['all', 'strength', 'run', 'mixed'] as const).map((c) => <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>{c === 'all' ? 'Tous' : PROGRAM_CATEGORY_LABEL[c]}</button>)}
        </div>
        <ul className={p.catalog}>
          {list.map((x) => (
            <li key={x.id} className={p.item} data-active={program?.templateId === x.id}>
              <button className={p.itemBtn} onClick={() => setDetail(x)} aria-label={`Voir le programme ${x.name}`}>
                <b>{x.name}</b>
                <span>{x.description}</span>
                <small>{x.perWeek} séances/sem. · {x.weeks} semaines · ~{x.minutesPerSession} min · {x.levels.map((l) => EXPERIENCE_LABEL[l].toLowerCase()).join(' / ')}</small>
                {program?.templateId === x.id ? <em>Programme actif</em> : null}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Sheet open={wizard} onClose={() => setWizard(false)} title="Trouver mon programme">{wizard ? <Wizard onClose={() => setWizard(false)} onChoose={(t, answers) => { setWizard(false); setActivate({ t, answers }) }} /> : null}</Sheet>
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.name ?? ''}>{detail ? <Detail t={detail} onChoose={() => { setActivate({ t: detail }); setDetail(null) }} /> : null}</Sheet>
      <Sheet open={!!activate} onClose={() => setActivate(null)} title="Activer ce programme">{activate ? <Activate t={activate.t} initial={activate.answers} onDone={() => setActivate(null)} onError={setErr} /> : null}</Sheet>
      <Sheet open={edit} onClose={() => setEdit(false)} title="Modifier mon programme">{edit && program ? <Customize onDone={() => setEdit(false)} /> : null}</Sheet>
      <ConfirmDialog open={stop} title="Arrêter le programme ?" confirmLabel="Arrêter le programme" onCancel={() => setStop(false)} onConfirm={() => { setStop(false); void programService.stop().catch((e) => setErr(errText(e))) }}>
        <p>Votre programme rejoint l’historique. Vos séances, performances, records et XP sont conservés.</p>
      </ConfirmDialog>
    </div>
  )
}

function SessionList({ template, sessions, week }: { template?: ProgramTemplate; sessions: ProgramTemplate['split']; week: number }) {
  return (
    <ol className={p.sessions}>
      {sessions.map((s) => (
        <li key={s.id}>
          <b>{s.label}</b> <span className={p.dim}>· ~{s.minutes} min · {describeSession(s)}</span>
          {s.scheme ? <p className={p.dim}>{s.scheme}</p> : null}
          {s.kind === 'run' && template ? <p className={p.dim}>{runInstruction(template, s, week || 1)}</p> : null}
          <ul>{s.cues.map((c) => <li key={c}>{c}</li>)}</ul>
        </li>
      ))}
    </ol>
  )
}

/** Exemple de séance composé par le moteur SPORT avec le profil actuel (aucune écriture) */
function SamplePreview({ t, equipment, level }: { t: ProgramTemplate; equipment: EquipmentProfile; level: Experience }) {
  const { sport, now } = useAppState()
  const first = t.split.find((s) => s.kind === 'strength')
  const slots = useMemo(() => {
    if (!first) return null
    const profile = { ...sport.profile, experience: level, equipmentProfile: equipment, sessionMinutes: first.minutes }
    return generateStrengthSession({ profile, prefs: sport.prefs, custom: sport.custom, recovery: sport.recovery, sessions: [], states: [], now, cycle: cycleInfo(null, now), focus: first.focus }).slots
  }, [first, sport, now, equipment, level])
  if (!first || !slots?.length) return null
  return (
    <details className={p.details}>
      <summary>Exemple de séance : {first.label}</summary>
      <ul className={p.sample}>
        {slots.map((sl) => { const ex = sl.equipment ?? sl.bodyweight; const e = ex ? EXERCISE_BY_ID[ex.exerciseId] : null; return <li key={sl.id}><b>{e?.name ?? 'Exercice choisi le jour de la séance'}</b><span className={p.dim}> · {sl.sets} séries{ex ? ` · ${ex.repsMin ?? ''}${ex.repsMax && ex.repsMax !== ex.repsMin ? `–${ex.repsMax}` : ''} rép.` : ''}</span></li> })}
      </ul>
      <p className={p.dim}>Les exercices réels sont choisis le jour de la séance selon votre matériel, vos contraintes et votre récupération.</p>
    </details>
  )
}

function Detail({ t, onChoose }: { t: ProgramTemplate; onChoose: () => void }) {
  const { sport } = useAppState()
  return (
    <div className={p.detail}>
      <p>{t.description}</p>
      <p className={p.dim}>{t.why}</p>
      <dl className={p.dl}>
        <div><dt>Niveau</dt><dd>{t.levels.map((l) => EXPERIENCE_LABEL[l]).join(' · ')}</dd></div>
        <div><dt>Durée</dt><dd>{t.weeks} semaines</dd></div>
        <div><dt>Fréquence</dt><dd>{t.perWeek} séances par semaine, ~{t.minutesPerSession} min</dd></div>
        <div><dt>Matériel</dt><dd>{t.equipment.map((e) => PROFILE_LABEL[e]).join(' · ')}</dd></div>
      </dl>
      <h3 className={p.h3}>Les séances</h3>
      <SessionList template={t} sessions={t.split} week={1} />
      <h3 className={p.h3}>Progression</h3><p className={p.dim}>{t.progression}</p>
      <h3 className={p.h3}>Récupération</h3><p className={p.dim}>{t.recovery}</p>
      <SamplePreview t={t} equipment={t.equipment.includes(sport.profile.equipmentProfile) ? sport.profile.equipmentProfile : t.equipment[0]} level={sport.profile.experience ?? t.levels[0]} />
      <div className={p.sheetRow}><button className={sheet.btnPrimary} onClick={onChoose}>Choisir ce programme</button></div>
    </div>
  )
}

function Activate({ t, initial, onDone, onError }: { t: ProgramTemplate; initial?: Partial<ProgramAnswers>; onDone: () => void; onError: (e: string | null) => void }) {
  const { sport, program } = useAppState()
  const pr = sport.profile
  const [level, setLevel] = useState<Experience>(initial?.level ?? (t.levels.includes(pr.experience ?? 'beginner') ? pr.experience ?? t.levels[0] : t.levels[0]))
  const [equipment, setEquipment] = useState<EquipmentProfile>(initial?.equipment ?? (t.equipment.includes(pr.equipmentProfile) ? pr.equipmentProfile : t.equipment[0]))
  const [perWeek, setPerWeek] = useState(initial?.perWeek ?? t.perWeek)
  const [days, setDays] = useState<number[]>(initial?.days ?? pr.availability.days)
  const [minutes, setMinutes] = useState(initial?.minutes ?? t.minutesPerSession)
  const [busy, setBusy] = useState(false)
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); onError(null); try { await programService.activate(t.id, { level, equipment, perWeek, days, minutes }); onDone() } catch (er) { onError(errText(er)); onDone() } finally { setBusy(false) } }}>
      <p><b>{t.name}</b> · {t.weeks} semaines</p>
      <Field label="Niveau"><Segmented<Experience> label="Niveau" value={level} options={(['beginner', 'intermediate', 'advanced'] as const).map((v) => ({ value: v, label: EXPERIENCE_LABEL[v] }))} onChange={setLevel} /></Field>
      <Field label="Matériel"><Segmented<EquipmentProfile> label="Matériel" value={equipment} options={t.equipment.map((v) => ({ value: v, label: PROFILE_LABEL[v] }))} onChange={setEquipment} /></Field>
      <Field label="Séances par semaine"><Segmented<string> label="Séances par semaine" value={String(perWeek)} options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setPerWeek(Number(v))} /></Field>
      <Field label="Jours habituels (facultatif)" hint="Laissez vide pour rester souple.">
        <div className={p.days} role="group" aria-label="Jours habituels">{DAYS.map((l, i) => <button type="button" key={i} aria-pressed={days.includes(i)} aria-label={DAY_FULL[i]} onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort())}>{l}</button>)}</div>
      </Field>
      <Field label="Durée d’une séance de musculation"><Segmented<string> label="Durée" value={String(minutes)} options={[30, 40, 50, 60].map((n) => ({ value: String(n), label: `${n} min` }))} onChange={(v) => setMinutes(Number(v))} /></Field>
      <div className={p.explain}>
        <b>Ce qui va changer</b>
        <p>Votre profil SPORT sera adapté (niveau, matériel, jours, durée). Vos contraintes physiques et vos préférences ne changent pas. Le programme du catalogue reste intact ; vous activez votre propre copie.{program ? ' Votre programme actuel rejoindra l’historique ; vos séances et performances sont conservées.' : ''}</p>
      </div>
      <div className={p.sheetRow}><button type="submit" className={sheet.btnPrimary} disabled={busy}>Activer le programme</button></div>
    </form>
  )
}

function Customize({ onDone }: { onDone: () => void }) {
  const { program } = useAppState()
  const [perWeek, setPerWeek] = useState(program!.perWeek)
  const [days, setDays] = useState<number[]>(program!.days)
  const [minutes, setMinutes] = useState(program!.minutes ?? programById(program!.templateId)?.minutesPerSession ?? 40)
  const [err, setErr] = useState<string | null>(null)
  return (
    <form onSubmit={async (e) => { e.preventDefault(); try { await programService.customize({ perWeek, days, minutes }); onDone() } catch (er) { setErr(errText(er)) } }}>
      <p className={p.dim}>Ces réglages ne concernent que votre programme ; le catalogue n’est pas modifié.</p>
      <Field label="Séances par semaine"><Segmented<string> label="Séances par semaine" value={String(perWeek)} options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setPerWeek(Number(v))} /></Field>
      <Field label="Jours habituels (facultatif)"><div className={p.days} role="group" aria-label="Jours habituels">{DAYS.map((l, i) => <button type="button" key={i} aria-pressed={days.includes(i)} aria-label={DAY_FULL[i]} onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort())}>{l}</button>)}</div></Field>
      <Field label="Durée d’une séance de musculation"><Segmented<string> label="Durée" value={String(minutes)} options={[30, 40, 50, 60].map((n) => ({ value: String(n), label: `${n} min` }))} onChange={(v) => setMinutes(Number(v))} /></Field>
      {err ? <p className={p.err} role="alert">{err}</p> : null}
      <div className={p.sheetRow}><button type="submit" className={sheet.btnPrimary}>Enregistrer</button></div>
    </form>
  )
}

const GOALS: ProgramGoal[] = ['muscle', 'strength', 'endurance', 'run', 'fitness', 'restart']
const GOAL_HINT: Record<ProgramGoal, string> = { muscle: 'Prise de masse, développement musculaire', strength: 'Soulever plus lourd', endurance: 'Tenir plus longtemps', run: 'Débuter ou progresser en course', fitness: 'Condition physique générale', restart: 'Après une pause ou une blessure' }

function Wizard({ onClose, onChoose }: { onClose: () => void; onChoose: (t: ProgramTemplate, a: ProgramAnswers) => void }) {
  const { sport } = useAppState()
  const pr = sport.profile
  const levelKnown = pr.experience !== null
  const [step, setStep] = useState(0)
  const [a, setA] = useState<ProgramAnswers>({ goal: pr.goals[0] === 'strength' ? 'strength' : pr.goals[0] === 'endurance' ? 'endurance' : 'muscle', level: pr.experience ?? 'beginner', perWeek: Math.max(2, Math.min(5, pr.availability.strengthPerWeek + pr.availability.runsPerWeek)), days: pr.availability.days, minutes: pr.sessionMinutes ?? 40, equipment: pr.equipmentProfile })
  const [pick, setPick] = useState(0)
  const steps = levelKnown ? ['goal', 'time', 'equipment', 'result'] as const : ['goal', 'level', 'time', 'equipment', 'result'] as const
  const cur = steps[step]
  const recs: Recommendation[] = useMemo(() => recommendPrograms(a), [a])
  const back = () => (step === 0 ? onClose() : setStep(step - 1))
  const rec = recs[pick]
  return (
    <div>
      <p className={p.step} aria-live="polite">Étape {step + 1} sur {steps.length}</p>
      {cur === 'goal' ? (
        <Field label="Que souhaites-tu développer ?">
          <div className={p.choices} role="radiogroup" aria-label="Objectif">
            {GOALS.map((g) => <button key={g} type="button" role="radio" aria-checked={a.goal === g} className={p.choice} onClick={() => setA({ ...a, goal: g })}><b>{PROGRAM_GOAL_LABEL[g]}</b><span>{GOAL_HINT[g]}</span></button>)}
          </div>
        </Field>
      ) : null}
      {cur === 'level' ? (
        <Field label="Quel est ton niveau ?" hint="Tu pourras le corriger : Level mesure aussi ton niveau réel au fil des séances.">
          <Segmented<Experience> label="Niveau" value={a.level} options={(['beginner', 'intermediate', 'advanced'] as const).map((v) => ({ value: v, label: EXPERIENCE_LABEL[v] }))} onChange={(v) => setA({ ...a, level: v })} />
        </Field>
      ) : null}
      {cur === 'time' ? (
        <>
          <Field label="Combien de séances par semaine ?"><Segmented<string> label="Séances par semaine" value={String(a.perWeek)} options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => setA({ ...a, perWeek: Number(v) })} /></Field>
          <Field label="Durée d’une séance"><Segmented<string> label="Durée" value={String(a.minutes)} options={[30, 40, 50, 60].map((n) => ({ value: String(n), label: `${n} min` }))} onChange={(v) => setA({ ...a, minutes: Number(v) })} /></Field>
          <Field label="Jours disponibles (facultatif)" hint="Laisse vide pour rester souple.">
            <div className={p.days} role="group" aria-label="Jours disponibles">{DAYS.map((l, i) => <button type="button" key={i} aria-pressed={a.days.includes(i)} aria-label={DAY_FULL[i]} onClick={() => setA({ ...a, days: a.days.includes(i) ? a.days.filter((d) => d !== i) : [...a.days, i].sort() })}>{l}</button>)}</div>
          </Field>
        </>
      ) : null}
      {cur === 'equipment' ? (
        <Field label="De quel matériel disposes-tu ?" hint="Sans matériel : aucun équipement ni mobilier. Domicile : petit matériel choisi dans ton profil. Salle : tout.">
          <div className={p.choices} role="radiogroup" aria-label="Matériel">
            {(['none', 'home', 'gym'] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={a.equipment === v} className={p.choice} onClick={() => setA({ ...a, equipment: v })}><b>{PROFILE_LABEL[v]}</b></button>)}
          </div>
        </Field>
      ) : null}
      {cur === 'result' ? (
        recs.length === 0 ? (
          <p className={p.dim}>Aucun programme du catalogue ne correspond à ces réponses (matériel et niveau). Essaie un autre matériel, ou crée une séance personnalisée dans Musculation.</p>
        ) : (
          <div className={p.result}>
            <p className={p.dim}>{pick === 0 ? 'Level te recommande :' : 'Autre proposition :'}</p>
            <h3 className={p.h3}>{rec.template.name}</h3>
            <p>{rec.template.description}</p>
            <p className={p.facts}><span>{rec.template.perWeek} séances/sem.</span><span>{rec.template.weeks} semaines</span><span>~{rec.template.minutesPerSession} min</span></p>
            <p><b>Pourquoi ce programme ?</b></p>
            <ul className={p.why}>{rec.reasons.map((r) => <li key={r}>{r}</li>)}{rec.cautions.map((r) => <li key={r} className={p.caution}>{r}</li>)}</ul>
            <div className={p.col}>
              <button className={sheet.btnPrimary} onClick={() => onChoose(rec.template, a)}>Activer ce programme</button>
              {recs.length > 1 ? <button className={sheet.btnGhost} onClick={() => setPick((pick + 1) % Math.min(recs.length, 4))}>Voir un autre programme</button> : null}
              <button className={sheet.btnGhost} onClick={() => setStep(steps.indexOf('time'))}>Modifier mes disponibilités</button>
            </div>
          </div>
        )
      ) : null}
      <div className={p.sheetRow}>
        <button className={sheet.btnGhost} type="button" onClick={back}>{step === 0 ? 'Annuler' : 'Retour'}</button>
        {cur !== 'result' ? <button className={sheet.btnPrimary} type="button" onClick={() => { setPick(0); setStep(step + 1) }}>Continuer</button> : null}
      </div>
    </div>
  )
}
