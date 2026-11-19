import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Badge } from '@/design/components'
import { Segmented, inputClass } from '@/design/Form'
import { ConfirmDialog, Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { EXERCISE_BY_ID } from '@/core/sport/exercises'
import type { SessionSlot, SetLog, SlotChoice, SportSession, Variant } from '@/core/sport/session'
import { completion } from '@/core/sport/xp'
import { sessionDebrief } from '@/core/sport/stats'
import { MUSCLE_LABEL, type Exercise, type PainLevel } from '@/core/sport/types'
import { loadStep } from '@/core/sport/progression'
import { sportService } from '@/data/sportService'
import { ExerciseFigure } from './ExerciseFigure'
import { SafetyBadge } from './parts'
import s from './player.module.css'

/** Horloge locale : les durées se déduisent d'horodatages absolus, donc exactes même après mise en veille ou écran verrouillé. */
function useTick(ms = 500) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), ms)
    const v = () => setT(Date.now())
    document.addEventListener('visibilitychange', v)
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', v) }
  }, [ms])
  return t
}

/** Garde l'écran allumé pendant une séance active lorsque la plateforme le permet (Screen Wake Lock). */
function useWakeLock(active: boolean) {
  const [state, setState] = useState<'idle' | 'on' | 'unsupported'>('idle')
  useEffect(() => {
    if (!active) return
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void>; addEventListener: (e: string, f: () => void) => void }> } }
    if (!nav.wakeLock) { setState('unsupported'); return }
    let lock: Awaited<ReturnType<NonNullable<typeof nav.wakeLock>['request']>> | null = null
    let cancelled = false
    const acquire = async () => { try { lock = await nav.wakeLock!.request('screen'); if (!cancelled) setState('on'); lock.addEventListener('release', () => setState('idle')) } catch { setState('unsupported') } }
    void acquire()
    const vis = () => { if (document.visibilityState === 'visible') void acquire() }
    document.addEventListener('visibilitychange', vis)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', vis); void lock?.release() }
  }, [active])
  return state
}

const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`

export function SessionPlayer() {
  const { id } = useParams()
  const nav = useNavigate()
  const { sport, events } = useAppState()
  const session = sport.sessions.find((x) => x.id === id)
  const tick = useTick()
  const [cur, setCur] = useState(0)
  const [caution, setCaution] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [reorder, setReorder] = useState(false)
  const [altFor, setAltFor] = useState<{ slot: SessionSlot; alt: Exercise } | null>(null)
  const [editing, setEditing] = useState<{ slot: SessionSlot; log: SetLog } | null>(null)
  const [safety, setSafety] = useState<string[]>([])
  const wake = useWakeLock(session?.status === 'active')

  const exOf = (eid: string): Exercise | undefined => EXERCISE_BY_ID[eid] ?? sport.custom.find((c) => c.id === eid)
  const guard = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => { setError(null); try { return await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Action impossible.'); return undefined } }

  const firstPending = useMemo(() => session?.slots.findIndex((sl) => sl.status === 'pending') ?? 0, [session?.id])
  useEffect(() => { if (firstPending > 0) setCur(firstPending) }, [firstPending])

  // Vibration à la fin du repos
  const restEnd = session?.restEndsAt ? new Date(session.restEndsAt).getTime() : 0
  const vibrated = useRef(0)
  useEffect(() => {
    if (restEnd && tick >= restEnd && vibrated.current !== restEnd) { vibrated.current = restEnd; try { navigator.vibrate?.([200, 100, 200]) } catch { /* indisponible */ } }
  }, [tick, restEnd])

  if (!session) return <div className={s.shell}><p>Séance introuvable.</p><Link to="/sport/muscu" className={sheet.btnPrimary}>Retour</Link></div>
  const ended = session.status === 'completed' || session.status === 'partial' || session.status === 'abandoned'
  const hasBoth = session.slots.some((sl) => sl.equipment && sl.bodyweight)
  const slot = session.slots[Math.min(cur, session.slots.length - 1)]
  const c = completion(session)

  const elapsed = session.startedAt ? Math.max(0, Math.floor(((session.endedAt ? new Date(session.endedAt).getTime() : session.pausedAt ? new Date(session.pausedAt).getTime() : tick) - new Date(session.startedAt).getTime() - session.pausedMs) / 1000)) : 0

  // ── Écran de fin ──
  if (ended) return <Summary session={session} onDone={() => nav('/sport/historique')} events={events.filter((e) => e.sourceId === session.id && e.kind === 'award' && e.status === 'valid')} all={sport.sessions} custom={sport.custom} />

  // ── Écran de démarrage / reprise ──
  if (session.status === 'planned' || session.status === 'paused') {
    const resume = session.status === 'paused'
    return (
      <div className={s.shell}>
        <header className={s.top}><Link to="/sport/muscu" className={s.exit}>‹ Quitter</Link><SafetyBadge level={sport.recovery.level} /></header>
        <h1 className={s.title}>{session.title}</h1>
        <p className={s.dim}>{session.slots.length} exercice{session.slots.length > 1 ? 's' : ''} · ~{session.plannedMinutes} min{resume ? ` · interrompue à ${fmt(elapsed)}` : ''}</p>
        {sport.recovery.level !== 'NORMAL' ? <p className={s.warn}>{sport.recovery.level === 'ALERTE' ? 'Alerte de récupération' : 'Vigilance'} : écoutez votre corps, ne forcez jamais sur une douleur.</p> : null}
        <ol className={s.overview}>
          {session.slots.map((sl) => { const ch = (session.variant === 'equipment' ? sl.equipment ?? sl.bodyweight : sl.bodyweight ?? sl.equipment)!; const ex = exOf(ch.exerciseId); return <li key={sl.id}><b>{ex?.name}</b><small>{sl.sets} × {ex?.mode === 'time' ? `${ch.durationSec} s` : `${ch.repsMin}–${ch.repsMax} rép.`}{sl.logs.length ? ` · ${sl.logs.length} faite${sl.logs.length > 1 ? 's' : ''}` : ''}</small></li> })}
        </ol>
        {hasBoth ? <div className={s.variantBox}><Segmented label="Variante" value={session.variant} options={[{ value: 'equipment', label: 'Avec matériel' }, { value: 'bodyweight', label: 'Sans matériel' }]} onChange={(v: Variant) => void guard(() => sportService.switchVariant(session.id, v))} /><small>Mêmes objectifs, même historique. Vous pourrez changer pendant la séance sans perdre vos séries.</small></div> : null}
        {safety.length ? <div className={s.warn}>{safety.map((x) => <p key={x}>Écarté par sécurité : {x}</p>)}</div> : null}
        {error ? <p className={s.err} role="alert">{error}</p> : null}
        <button className={s.big} onClick={async () => { if (resume) { await guard(() => sportService.resumeSession(session.id)); return } const r = await guard(() => sportService.startSession(session.id)); if (r) setSafety(r.skippedForSafety) }}>{resume ? 'Reprendre la séance' : 'Démarrer la séance'}</button>
      </div>
    )
  }

  const choice = pickChoice(slot, session.variant)
  const ex = choice ? exOf(choice.exerciseId) : undefined
  const logsHere = slot.logs
  const allHandled = session.slots.every((sl) => sl.status !== 'pending')
  const remaining = restEnd > tick ? Math.ceil((restEnd - tick) / 1000) : 0

  return (
    <div className={s.shell}>
      <header className={s.top}>
        <button className={s.exit} onClick={async () => { await guard(() => sportService.pauseSession(session.id)); nav('/sport/muscu') }}>‹ Interrompre</button>
        <span className={`${s.clock} num`} aria-label="Durée écoulée">{fmt(elapsed)}</span>
        <SafetyBadge level={sport.recovery.level} />
      </header>
      <div className={s.progress} aria-label={`Exercice ${Math.min(cur, session.slots.length - 1) + 1} sur ${session.slots.length}`}>
        {session.slots.map((sl, i) => <button key={sl.id} className={`${s.pip} ${sl.status === 'done' ? s.pipDone : sl.status === 'skipped' ? s.pipSkip : ''} ${i === cur ? s.pipOn : ''}`} onClick={() => setCur(i)} aria-label={`Exercice ${i + 1}`} />)}
      </div>
      {wake === 'unsupported' ? <small className={s.dim}>Écran toujours allumé indisponible sur cet appareil : réglez la veille manuellement.</small> : null}

      {hasBoth ? <Segmented label="Variante" value={session.variant} options={[{ value: 'equipment', label: 'Avec matériel' }, { value: 'bodyweight', label: 'Sans matériel' }]} onChange={(v: Variant) => void guard(() => sportService.switchVariant(session.id, v))} /> : null}

      {slot && ex && choice ? (
        <section className={s.card} aria-label="Exercice en cours">
          <div className={s.exHead}>
            <div><h1 className={s.title}>{ex.name}</h1><small className={s.dim}>{ex.primary.map((g) => MUSCLE_LABEL[g]).join(', ')}{slot.status === 'skipped' ? ' · passé' : ''}</small></div>
            <Badge tone="gold">Série {Math.min(logsHere.length + 1, slot.sets)}/{slot.sets}</Badge>
          </div>
          <ExerciseFigure exercise={ex} />
          <div className={s.target}>
            <div><small>Objectif</small><b>{ex.mode === 'time' ? `${choice.durationSec ?? 40} s` : `${choice.repsMin}–${choice.repsMax} rép.`}</b></div>
            {!ex.bodyweight ? <div><small>Charge conseillée</small><b>{choice.loadKg ? `${choice.loadKg} kg` : 'À choisir'}</b></div> : null}
            <div><small>Repos</small><b>{choice.restSec} s</b></div>
          </div>
          {choice.note ? <p className={s.note}>{choice.note}</p> : null}
          <details className={s.how}><summary>Voir l’exécution et la sécurité</summary><ol>{ex.instructions.map((t) => <li key={t}>{t}</li>)}</ol><p><b>Sécurité :</b> {ex.safety.join(' ')} Arrêtez en cas de douleur.</p></details>

          {remaining > 0 ? (
            <div className={s.rest} role="timer" aria-live="off">
              <small>Repos</small><b className="num">{fmt(remaining)}</b>
              <div className={s.restBtns}><button className={s.mid} onClick={() => void guard(() => sportService.setRest(session.id, remaining + 15))}>+15 s</button><button className={s.mid} onClick={() => void guard(() => sportService.setRest(session.id, null))}>Passer le repos</button></div>
            </div>
          ) : null}

          {slot.status !== 'skipped' && logsHere.length < slot.sets ? (
            <SetEntry key={`${slot.id}-${choice.exerciseId}-${logsHere.length}`} ex={ex} choice={choice} last={[...logsHere].reverse().find((l) => l.exerciseId === choice.exerciseId)} nowTick={tick}
              onSave={async (v) => { const r = await guard(() => sportService.logSet(session.id, slot.id, { exerciseId: choice.exerciseId, ...v })); if (r) { setCaution(r.caution); if (r.session.slots[Math.min(cur, r.session.slots.length - 1)].status === 'done' && cur < session.slots.length - 1) setCur(cur + 1) } }} />
          ) : slot.status === 'skipped' ? <p className={s.dim}>Exercice passé. <button className={s.link} onClick={() => void guard(() => sportService.skipSlot(session.id, slot.id, false))}>Le reprendre</button></p> : <p className={s.dim}>Toutes les séries sont faites. Passez à l’exercice suivant.</p>}

          {caution ? <p className={s.warn} role="alert">{caution} <Link to="/sport/recuperation" className={s.link}>Ouvrir le questionnaire</Link></p> : null}

          {logsHere.length ? (
            <ul className={s.logs} aria-label="Séries saisies">
              {logsHere.map((l) => { const lx = exOf(l.exerciseId); return <li key={`${l.exerciseId}-${l.n}`}><button onClick={() => setEditing({ slot, log: l })}><span>#{l.n}</span><b className="num">{lx?.mode === 'time' ? `${l.durationSec ?? 0} s` : `${l.reps ?? 0} rép.${l.loadKg ? ` × ${l.loadKg} kg` : ''}`}</b><small>{lx?.name !== ex.name ? lx?.name : ''}{l.pain && l.pain !== 'none' ? ' · douleur' : ''}</small></button></li> })}
            </ul>
          ) : null}

          <div className={s.nav}>
            <button className={s.mid} disabled={cur === 0} onClick={() => setCur(cur - 1)}>‹ Précédent</button>
            <button className={s.mid} onClick={async () => { await guard(() => sportService.skipSlot(session.id, slot.id, true)); if (cur < session.slots.length - 1) setCur(cur + 1) }}>Passer</button>
            <button className={s.mid} disabled={cur >= session.slots.length - 1} onClick={() => setCur(cur + 1)}>Suivant ›</button>
          </div>
          <div className={s.nav}>
            <button className={s.mid} onClick={async () => { const alt = await guard(() => sportService.alternativeFor(ex.id, session.variant === 'equipment' && slot.equipment ? 'equipment' : 'bodyweight')); if (alt) setAltFor({ slot, alt }); else setError('Aucune alternative disponible avec votre matériel et vos contraintes.') }}>Exercice impossible ?</button>
            <button className={s.mid} onClick={() => setReorder(true)}>Réorganiser</button>
          </div>
        </section>
      ) : null}

      {error ? <p className={s.err} role="alert">{error}</p> : null}
      <button className={`${s.big} ${allHandled ? '' : s.bigGhost}`} onClick={() => (allHandled ? void guard(() => sportService.finishSession(session.id)) : setConfirmFinish(true))}>{allHandled ? 'Terminer la séance' : 'Terminer maintenant'}</button>

      <ConfirmDialog open={confirmFinish} title="Terminer la séance maintenant ?" confirmLabel="Terminer" onCancel={() => setConfirmFinish(false)} onConfirm={() => { setConfirmFinish(false); void guard(() => sportService.finishSession(session.id)) }}>
        <p>{c.done}/{c.planned} séries réalisées. La séance sera enregistrée comme écourtée et la récompense sera <b>proportionnelle au travail réalisé</b>.</p>
        {c.done === 0 ? <p>Aucune série saisie : la séance sera abandonnée, sans XP.</p> : null}
      </ConfirmDialog>

      <ConfirmDialog open={altFor !== null} title="Utiliser une alternative ?" confirmLabel="Remplacer pour cette séance" onCancel={() => setAltFor(null)}
        onConfirm={() => { const a = altFor; setAltFor(null); if (a) void guard(() => sportService.swapExerciseInSession(session.id, a.slot.id, session.variant === 'equipment' && a.slot.equipment ? 'equipment' : 'bodyweight', a.alt.id)) }}>
        <p><b>{altFor?.alt.name}</b> sollicite les mêmes muscles et respecte votre matériel et vos contraintes.</p>
        <p>Le remplacement ne vaut que pour cette séance : votre sélection d’exercices n’est pas modifiée. Pour la changer durablement, utilisez la bibliothèque (favoris, exclusions).</p>
      </ConfirmDialog>

      <Sheet open={reorder} onClose={() => setReorder(false)} title="Réorganiser la séance">
        <ol className={s.reorder}>
          {session.slots.map((sl, i) => { const ch = pickChoice(sl, session.variant); return (
            <li key={sl.id}><span>{exOf(ch?.exerciseId ?? '')?.name}{sl.logs.length ? ` (${sl.logs.length} série${sl.logs.length > 1 ? 's' : ''})` : ''}</span>
              <span><button className={s.mid} disabled={i === 0} aria-label="Monter" onClick={() => { const o = session.slots.map((x) => x.id); [o[i - 1], o[i]] = [o[i], o[i - 1]]; void guard(() => sportService.reorderSlots(session.id, o)) }}>↑</button>
                <button className={s.mid} disabled={i === session.slots.length - 1} aria-label="Descendre" onClick={() => { const o = session.slots.map((x) => x.id); [o[i + 1], o[i]] = [o[i], o[i + 1]]; void guard(() => sportService.reorderSlots(session.id, o)) }}>↓</button></span></li>) })}
        </ol>
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Corriger la série">
        {editing ? <EditSet session={session} slot={editing.slot} log={editing.log} ex={exOf(editing.log.exerciseId)} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </div>
  )
}

function pickChoice(slot: SessionSlot, variant: Variant): SlotChoice | null {
  return variant === 'equipment' ? slot.equipment ?? slot.bodyweight : slot.bodyweight ?? slot.equipment
}

/** Saisie rapide d'une série : gros boutons, valeurs préremplies, effort/technique/douleur en un geste. */
function SetEntry({ ex, choice, last, nowTick, onSave }: { ex: Exercise; choice: SlotChoice; last?: SetLog; nowTick: number; onSave: (v: { reps?: number; loadKg?: number; durationSec?: number; rpe: number; technique: 1 | 2 | 3; pain: PainLevel }) => Promise<void> }) {
  const timeMode = ex.mode === 'time'
  const [reps, setReps] = useState(last?.reps ?? choice.repsMax ?? 10)
  const [load, setLoad] = useState<number | ''>(last?.loadKg ?? choice.loadKg ?? '')
  const [dur, setDur] = useState(last?.durationSec ?? choice.durationSec ?? 40)
  const [rpe, setRpe] = useState(last?.rpe ?? 7)
  const [tech, setTech] = useState<1 | 2 | 3>(last?.technique ?? 3)
  const [pain, setPain] = useState<PainLevel>('none')
  const [started, setStarted] = useState<number | null>(null)
  const step = loadStep(ex)
  const running = started !== null
  const watch = running ? Math.floor((nowTick - started) / 1000) : 0

  return (
    <div className={s.entry}>
      {timeMode ? (
        <div className={s.stopwatch}>
          <b className="num">{running ? fmt(watch) : fmt(dur)}</b>
          <small>{running ? `objectif ${choice.durationSec ?? 40} s` : 'durée tenue'}</small>
          {running ? <button className={s.big} onClick={() => { setDur(watch); setStarted(null) }}>Arrêter le chrono</button> : <button className={s.mid} onClick={() => setStarted(Date.now())}>Lancer le chrono</button>}
          {!running ? <Stepper label="Durée (s)" value={dur} onChange={setDur} step={5} min={0} max={900} /> : null}
        </div>
      ) : (
        <>
          <Stepper label="Répétitions" value={reps} onChange={setReps} step={1} min={0} max={200} />
          {!ex.bodyweight ? <Stepper label="Charge (kg)" value={load === '' ? 0 : load} onChange={setLoad} step={step || 1} min={0} max={500} decimals /> : null}
        </>
      )}
      <fieldset className={s.quick}><legend>Effort ressenti</legend>{[5, 6, 7, 8, 9, 10].map((v) => <button key={v} type="button" aria-pressed={rpe === v} onClick={() => setRpe(v)}>{v}</button>)}</fieldset>
      <fieldset className={s.quick}><legend>Technique</legend>{([[1, 'Dégradée'], [2, 'Correcte'], [3, 'Propre']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={tech === v} onClick={() => setTech(v)}>{l}</button>)}</fieldset>
      <fieldset className={s.quick}><legend>Douleur</legend>{([['none', 'Aucune'], ['light', 'Légère'], ['strong', 'Importante']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={pain === v} className={v === 'strong' && pain === v ? s.danger : ''} onClick={() => setPain(v)}>{l}</button>)}</fieldset>
      <button className={s.big} disabled={running} onClick={() => void onSave(timeMode ? { durationSec: dur, rpe, technique: tech, pain } : { reps, loadKg: load === '' || ex.bodyweight ? undefined : load, rpe, technique: tech, pain })}>Valider la série</button>
    </div>
  )
}

function Stepper({ label, value, onChange, step, min, max, decimals }: { label: string; value: number; onChange: (v: number) => void; step: number; min: number; max: number; decimals?: boolean }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)))
  return (
    <div className={s.stepper} role="group" aria-label={label}>
      <button type="button" className={s.stepBtn} onClick={() => set(value - step)} aria-label={`Diminuer ${label}`}>−</button>
      <label><small>{label}</small><input className={`${s.stepInput} num`} type="number" inputMode={decimals ? 'decimal' : 'numeric'} step={step} value={value} onChange={(e) => set(Number(e.target.value))} aria-label={label} /></label>
      <button type="button" className={s.stepBtn} onClick={() => set(value + step)} aria-label={`Augmenter ${label}`}>+</button>
    </div>
  )
}

function EditSet({ session, slot, log, ex, onDone }: { session: SportSession; slot: SessionSlot; log: SetLog; ex?: Exercise; onDone: () => void }) {
  const [reps, setReps] = useState(log.reps ?? 0)
  const [load, setLoad] = useState(log.loadKg ?? 0)
  const [dur, setDur] = useState(log.durationSec ?? 0)
  const [rpe, setRpe] = useState(log.rpe ?? 7)
  return (
    <div className={s.edit}>
      {ex?.mode === 'time' ? <Stepper label="Durée (s)" value={dur} onChange={setDur} step={5} min={0} max={900} /> : <><Stepper label="Répétitions" value={reps} onChange={setReps} step={1} min={0} max={200} />{ex && !ex.bodyweight ? <Stepper label="Charge (kg)" value={load} onChange={setLoad} step={ex ? loadStep(ex) || 1 : 1} min={0} max={500} decimals /> : null}</>}
      <label className={s.rpeRow}><span>Effort ressenti</span><input className={inputClass} type="number" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} /></label>
      <div className={s.nav}>
        <button className={`${s.mid} ${s.danger}`} onClick={async () => { await sportService.deleteSet(session.id, slot.id, log.n); onDone() }}>Supprimer</button>
        <button className={s.mid} onClick={async () => { await sportService.updateSet(session.id, slot.id, log.n, ex?.mode === 'time' ? { durationSec: dur, rpe } : { reps, loadKg: load || undefined, rpe }); onDone() }}>Enregistrer</button>
      </div>
    </div>
  )
}

function Summary({ session, onDone, events, all, custom }: { session: SportSession; onDone: () => void; events: Array<{ id: string; amount: number; label: string; reason: string }>; all: SportSession[]; custom: Exercise[] }) {
  const lines = sessionDebrief(session, all, custom)
  const total = events.reduce((n, e) => n + e.amount, 0)
  return (
    <div className={s.shell}>
      <h1 className={s.title}>{session.status === 'completed' ? 'Séance terminée' : session.status === 'partial' ? 'Séance écourtée' : 'Séance abandonnée'}</h1>
      <div className={s.xpBox}><b className="num">+{total} XP</b><small>{total ? 'SPORT · inscrits dans votre journal' : session.origin === 'unplanned' ? 'Activité imprévue : enregistrée, sans XP' : 'Pas d’XP pour cette séance'}</small></div>
      <ul className={s.debrief}>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {events.length ? <ul className={s.awards}>{events.map((e) => <li key={e.id}><b>{e.label}</b><small>{e.reason}</small><span className="num">+{e.amount}</span></li>)}</ul> : null}
      <p className={s.dim}>Vous pouvez corriger cette séance à tout moment depuis l’historique : XP, niveaux, records et recommandations sont alors recalculés.</p>
      <button className={s.big} onClick={onDone}>Voir l’historique</button>
    </div>
  )
}
