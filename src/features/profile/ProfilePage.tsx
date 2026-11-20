import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '@/app/AppState'
import { Badge, Card, PageHeader, SectionTitle } from '@/design/components'
import { Field, inputClass, Segmented } from '@/design/Form'
import { repos } from '@/data/repositories'
import { prefsService } from '@/data/prefsService'
import { notificationService } from '@/data/notificationService'
import { useBackupData } from '@/features/backup/useBackupData'
import { auditRpg } from '@/core/rpgConsistency'
import { FREQUENCY_CAP, FREQUENCY_LABEL, NOTIF_CATEGORIES, NOTIF_CATEGORY_LABEL, type AppPrefs, type NotifFrequency } from '@/core/prefs'
import { PROFILE_LABEL } from '@/core/sport/types'
import { describeCapabilityNow } from './capability'
import s from '../pages.module.css'
import c from './settings.module.css'

const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DAY_FULL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={s.toggle}>
      <div><div>{label}</div>{hint ? <small>{hint}</small> : null}</div>
      <button role="switch" aria-checked={checked} aria-label={label} className={s.switch} onClick={() => onChange(!checked)} />
    </div>
  )
}

const upd = (fn: (p: AppPrefs) => AppPrefs) => void prefsService.update(fn)

/**
 * Champ numérique : on saisit librement (plusieurs chiffres, effacement) et la valeur est enregistrée à la sortie du champ ou sur Entrée.
 * Évite qu'une valeur partielle (« 1 » en tapant « 180 ») soit enregistrée, puis assainie, puis réaffichée.
 */
function NumberField({ id, value, min, max, step, onCommit }: { id: string; value: number; min: number; max: number; step: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setDraft(String(value)) }, [value, focus])
  const commit = () => {
    setFocus(false)
    const v = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(v)) { setDraft(String(value)); return }
    const clamped = Math.min(max, Math.max(min, Math.round(v)))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }
  return <input id={id} type="number" inputMode="numeric" min={min} max={max} step={step} className={inputClass} value={draft} onFocus={() => setFocus(true)} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
}

export function ProfilePage() {
  const { displayName, settings, prefs, notifLog, events, sport, quests, rpg, achievements, prestiges, rewards } = useAppState()
  const [name, setName] = useState(displayName)
  const [saved, setSaved] = useState(false)
  const [capVersion, setCapVersion] = useState(0)
  const [testMsg, setTestMsg] = useState('')
  const [newTime, setNewTime] = useState('08:30')
  const [newLabel, setNewLabel] = useState('')
  const [audit, setAudit] = useState<ReturnType<typeof auditRpg> | null>(null)
  const { health, list } = useBackupData()
  useEffect(() => setName(displayName), [displayName])
  useEffect(() => { if (location.hash.includes('planning')) document.getElementById('planning')?.scrollIntoView() }, [])

  const cap = useMemo(() => describeCapabilityNow(), [capVersion])
  const n = prefs.notifications
  const unread = notifLog.filter((x) => !x.read).length

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    await repos.profile.setName(name)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }
  /** Mise à jour fonctionnelle : part toujours de la valeur la plus récente (pas de modification écrasée par un affichage en retard). */
  const setN = (patch: Partial<typeof n> | ((cur: typeof n) => Partial<typeof n>)) => upd((p) => ({ ...p, notifications: { ...p.notifications, ...(typeof patch === 'function' ? patch(p.notifications) : patch) } }))

  return (
    <div className={s.stack}>
      <PageHeader title="Profil & réglages" subtitle="Vos données restent sur cet appareil." />

      <Card>
        <SectionTitle title="Profil" />
        <form onSubmit={save} className={s.field}>
          <label htmlFor="name">Nom affiché</label>
          <div className={s.inline}>
            <input id="name" className={s.input} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            <button className={s.btn} type="submit">{saved ? 'Enregistré ✓' : 'Enregistrer'}</button>
          </div>
        </form>
      </Card>

      <Card>
        <SectionTitle title="Affichage" />
        <Toggle label="Réduire les animations" hint="Désactive les transitions et effets lumineux animés." checked={settings.reducedMotion} onChange={(v) => void repos.settings.set('reducedMotion', v)} />
        <Toggle label="Données de démonstration" hint="Affiche des données fictives (niveaux, quêtes, séances) pour illustrer l’application. Les bilans et notifications restent basés sur vos vraies données." checked={settings.showDemoData} onChange={(v) => void repos.settings.set('showDemoData', v)} />
      </Card>

      <Card>
        <SectionTitle title="Pilotage" />
        <p className={c.sub}>Vision, orientations et priorités sont facultatives. Ces réglages ne servent qu’à cadrer les repères de Pilotage et ses rappels de revue.</p>
        <Field label="Priorités fondamentales conseillées" htmlFor="pil-max" hint="Limite souple : vous pouvez la dépasser après confirmation, Level vous le signale simplement.">
          <NumberField id="pil-max" value={prefs.pilotage.maxFundamental} min={1} max={8} step={1} onCommit={(v) => upd((p) => ({ ...p, pilotage: { ...p.pilotage, maxFundamental: v } }))} />
        </Field>
        <Toggle label="Rappel de revue trimestrielle" hint="Une proposition douce en fin de trimestre, jamais obligatoire." checked={prefs.pilotage.reminders.quarterly} onChange={(v) => upd((p) => ({ ...p, pilotage: { ...p.pilotage, reminders: { ...p.pilotage.reminders, quarterly: v } } }))} />
        <Toggle label="Rappel de revue annuelle" hint="En décembre et début janvier." checked={prefs.pilotage.reminders.annual} onChange={(v) => upd((p) => ({ ...p, pilotage: { ...p.pilotage, reminders: { ...p.pilotage.reminders, annual: v } } }))} />
        <Toggle label="Rappel de revue mensuelle" hint="Désactivé par défaut." checked={prefs.pilotage.reminders.monthly} onChange={(v) => upd((p) => ({ ...p, pilotage: { ...p.pilotage, reminders: { ...p.pilotage.reminders, monthly: v } } }))} />
      </Card>

      <Card>
        <SectionTitle title="Notifications" aside={unread ? <Badge tone="gold">{unread} non lue{unread > 1 ? 's' : ''}</Badge> : undefined} />
        <div className={`${c.cap} ${cap.system ? c.ok : ''}`} role="note">{cap.summary}</div>
        <div className={c.row} style={{ marginBottom: 12 }}>
          {cap.permission === 'default' ? <button className={s.btn} onClick={() => void notificationService.requestPermission().then(() => setCapVersion((v) => v + 1))}>Autoriser les notifications</button> : null}
          <button className={`${s.btn} ${s.ghost}`} onClick={() => void notificationService.sendTest().then((e) => setTestMsg(e.channel === 'system' ? 'Notification envoyée.' : 'Affichée dans la boîte de réception ci-dessous.'))}>Envoyer une notification d’essai</button>
          {testMsg ? <span role="status" style={{ color: 'var(--c-text-dim)', fontSize: 13 }}>{testMsg}</span> : null}
        </div>
        <Toggle label="Activer les rappels" hint="Désactive tout d’un coup. Rien n’est envoyé pendant les plages de tranquillité." checked={n.enabled} onChange={(v) => setN({ enabled: v })} />
        <div style={{ margin: '14px 0' }}>
          <Field label="Fréquence" hint={`Au plus ${FREQUENCY_CAP[n.frequency]} notifications par jour, jamais plusieurs à la suite.`}>
            <Segmented<NotifFrequency> label="Fréquence des notifications" value={n.frequency} onChange={(v) => setN({ frequency: v })} options={(Object.keys(FREQUENCY_LABEL) as NotifFrequency[]).map((v) => ({ value: v, label: FREQUENCY_LABEL[v] }))} />
          </Field>
        </div>
        <Toggle label="Plage de tranquillité" hint="Aucune notification pendant cette période (passage de minuit géré)." checked={n.quiet.enabled} onChange={(v) => setN((c) => ({ quiet: { ...c.quiet, enabled: v } }))} />
        {n.quiet.enabled ? (
          <div className={c.row2} style={{ marginTop: 10 }}>
            <Field label="De" htmlFor="q-start"><input id="q-start" type="time" className={inputClass} value={n.quiet.start} onChange={(e) => { const v = e.target.value; if (v) setN((c) => ({ quiet: { ...c.quiet, start: v } })) }} /></Field>
            <Field label="À" htmlFor="q-end"><input id="q-end" type="time" className={inputClass} value={n.quiet.end} onChange={(e) => { const v = e.target.value; if (v) setN((c) => ({ quiet: { ...c.quiet, end: v } })) }} /></Field>
          </div>
        ) : null}
        <h3 style={{ fontSize: 13, letterSpacing: '0.1em', color: 'var(--c-text-dim)', margin: '16px 0 4px' }}>Catégories</h3>
        {NOTIF_CATEGORIES.map((k) => (
          <Toggle key={k} label={NOTIF_CATEGORY_LABEL[k]} checked={n.categories[k]} onChange={(v) => setN((c) => ({ categories: { ...c.categories, [k]: v } }))} />
        ))}
        <h3 style={{ fontSize: 13, letterSpacing: '0.1em', color: 'var(--c-text-dim)', margin: '16px 0 4px' }}>Rappels à heure fixe</h3>
        {n.reminders.length === 0 ? <p className={c.sub}>Aucun rappel fixe. Ajoutez-en un si une routine a besoin d’un coup de pouce.</p> : null}
        {n.reminders.map((r) => (
          <div key={r.id} className={c.reminder}>
            <div className="grow" style={{ flex: 1 }}><b className="num">{r.time}</b> <span>{r.label}</span></div>
            <button role="switch" aria-checked={r.enabled} aria-label={`Rappel ${r.label}`} className={s.switch} onClick={() => setN((c) => ({ reminders: c.reminders.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)) }))} />
            <button className={`${s.btn} ${s.ghost}`} onClick={() => setN((c) => ({ reminders: c.reminders.filter((x) => x.id !== r.id) }))} aria-label={`Supprimer le rappel ${r.label}`}>Retirer</button>
          </div>
        ))}
        <form className={c.row} style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (!newLabel.trim() || n.reminders.length >= 8) return; const rem = { id: crypto.randomUUID(), time: newTime, label: newLabel.trim().slice(0, 40), enabled: true }; setN((c) => ({ reminders: [...c.reminders, rem].slice(0, 8) })); setNewLabel('') }}>
          <input aria-label="Heure du rappel" type="time" className={inputClass} style={{ width: 130 }} value={newTime} onChange={(e) => e.target.value && setNewTime(e.target.value)} />
          <input aria-label="Texte du rappel" className={inputClass} style={{ flex: 1, minWidth: 160 }} placeholder="Ex. Étirements du soir" maxLength={40} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <button className={s.btn} type="submit">Ajouter</button>
        </form>
        <h3 style={{ fontSize: 13, letterSpacing: '0.1em', color: 'var(--c-text-dim)', margin: '18px 0 8px' }}>Boîte de réception</h3>
        {notifLog.length === 0 ? <p className={c.sub}>Aucune notification pour l’instant.</p> : (
          <>
            <ul className={c.inbox}>
              {notifLog.slice(0, 6).map((x) => (
                <li key={x.id} className={x.read ? '' : c.unread}><Link to={x.route} onClick={() => void notificationService.markRead(x.id)}><b>{x.title}</b></Link><small>{x.body} · {when(x.at)}</small></li>
              ))}
            </ul>
            <div className={c.row} style={{ marginTop: 10 }}>
              <button className={`${s.btn} ${s.ghost}`} onClick={() => void notificationService.markAllRead()}>Tout marquer comme lu</button>
              <button className={`${s.btn} ${s.ghost}`} onClick={() => void notificationService.clear()}>Vider</button>
            </div>
          </>
        )}
      </Card>

      <Card>
        <div id="planning" />
        <SectionTitle title="Planning" />
        <p className={c.sub}>Ces réglages servent au planning central et aux propositions de Level : charge maximale par jour et marge de sécurité conservée.</p>
        <div className={c.row2}>
          <Field label="Capacité par jour (minutes)" htmlFor="cap"><NumberField id="cap" value={prefs.planning.dailyCapacityMin} min={30} max={960} step={15} onCommit={(v) => upd((p) => ({ ...p, planning: { ...p.planning, dailyCapacityMin: v } }))} /></Field>
          <Field label="Marge conservée (%)" htmlFor="margin" hint="Level ne remplit jamais cette part de la journée."><NumberField id="margin" value={prefs.planning.marginPct} min={0} max={50} step={5} onCommit={(v) => upd((p) => ({ ...p, planning: { ...p.planning, marginPct: v } }))} /></Field>
        </div>
        <Field label="Jours disponibles" hint="Un jour décoché est considéré indisponible : Level n’y place rien.">
          <div className={c.days} role="group" aria-label="Jours disponibles">
            {DAY_LETTERS.map((l, i) => (
              <button key={i} aria-pressed={prefs.planning.days.includes(i)} aria-label={DAY_FULL[i]} onClick={() => upd((p) => ({ ...p, planning: { ...p.planning, days: p.planning.days.includes(i) ? p.planning.days.filter((d) => d !== i) : [...p.planning.days, i].sort() } }))}>{l}</button>
            ))}
          </div>
        </Field>
      </Card>

      <Card>
        <SectionTitle title="LIFE et SPORT" />
        <p className={c.sub}>Les préférences propres à chaque module restent dans le module, pour ne rien dupliquer.</p>
        <div className={c.summary}>
          <div>LIFE<b>{quests.filter((q) => !q.archived).length} quêtes actives</b><Link to="/life" style={{ color: 'var(--c-gold)' }}>Catégories et quêtes</Link></div>
          <div>SPORT<b>{PROFILE_LABEL[sport.profile.equipmentProfile]} · {sport.profile.availability.strengthPerWeek} séance{sport.profile.availability.strengthPerWeek > 1 ? 's' : ''}/sem.</b><Link to="/sport/profil" style={{ color: 'var(--c-gold)' }}>Profil sportif et matériel</Link></div>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Distinctions" aside={<Link to="/rpg/distinctions" style={{ color: 'var(--c-gold)' }}>Ouvrir</Link>} />
        <div className={c.summary}>
          <div>Titre affiché<b>{rpg.titles.find((t) => t.id === rpg.equippedTitle)?.title ?? 'Aucun'}</b></div>
          <div>Succès<b>{achievements.length} débloqué{achievements.length > 1 ? 's' : ''}</b></div>
          <div>Prestiges<b>LIFE ×{rpg.cycles.LIFE.prestigeCount} · SPORT ×{rpg.cycles.SPORT.prestigeCount}</b></div>
          <div>Récompenses<b>{rewards.length} obtenue{rewards.length > 1 ? 's' : ''}</b></div>
        </div>
        <Link to="/rpg/prestige" style={{ color: 'var(--c-gold)', fontSize: 14 }}>Historique des prestiges</Link>
      </Card>

      <Card>
        <SectionTitle title="RPG" />
        <Toggle label="Annonces de montée de niveau" hint="Affiche un bandeau lumineux à chaque nouveau niveau ou rang." checked={prefs.rpg.celebrations} onChange={(v) => upd((p) => ({ ...p, rpg: { ...p.rpg, celebrations: v } }))} />
        <div style={{ marginTop: 14 }}>
          <button className={s.btn} onClick={() => setAudit(auditRpg(events, prestiges, rewards, achievements))}>Vérifier la cohérence du RPG</button>
          {audit ? (
            <div role="status" aria-live="polite">
              <p style={{ marginTop: 10, fontSize: 14 }} className={audit.ok ? c.ok : c.ko}>{audit.ok ? 'Tout est cohérent : XP, niveaux, rangs et attributs correspondent au journal.' : 'Une incohérence a été trouvée.'}</p>
              <ul className={c.check}>
                {audit.checks.map((k) => <li key={k.id}><span className={k.ok ? c.ok : c.ko} aria-hidden="true">{k.ok ? '✓' : '✗'}</span><span>{k.label}{k.detail ? <small style={{ display: 'block', color: 'var(--c-text-dim)' }}>{k.detail}</small> : null}</span></li>)}
              </ul>
              {audit.notImplemented.map((t) => <p key={t} className={c.sub} style={{ marginTop: 10 }}>À venir : {t}</p>)}
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Sécurité et sauvegardes" />
        <p style={{ color: 'var(--c-text-dim)', fontSize: 14, marginBottom: 12 }}>
          {health.level === 'ok' ? 'Vos données sont sauvegardées, chiffrées et leur récupération a été testée.' : health.messages[0]} ({list.length} point{list.length > 1 ? 's' : ''} de restauration)
        </p>
        <Link to="/backups" className={s.btn} style={{ display: 'inline-block' }}>Gérer les sauvegardes</Link>
      </Card>

      <Card>
        <SectionTitle title="Démonstration" />
        <p style={{ color: 'var(--c-text-dim)', fontSize: 13, marginBottom: 12 }}>Remet à zéro les quêtes fictives cochées. Ne touche ni à votre profil ni à vos réglages.</p>
        <button className={`${s.btn} ${s.ghost}`} onClick={() => void repos.demo.reset()}>Réinitialiser les quêtes de démo</button>
      </Card>
    </div>
  )
}
