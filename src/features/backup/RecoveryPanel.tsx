import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Card, SectionTitle } from '@/design/components'
import { Field, Segmented, inputClass, errorClass } from '@/design/Form'
import { ConfirmDialog } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { backups, type Secret } from '@/data/backup'
import { MIN_PASSPHRASE_LENGTH } from '@/data/backup/crypto'
import { RecoveryKeyDisplay } from './RecoveryKeyDisplay'
import { formatDateTime, relativeAge } from './labels'
import { useAction, useBackupData } from './useBackupData'
import s from './backup.module.css'

type Kind = 'passphrase' | 'recoveryKey'
const secretOf = (k: Kind, v: string): Secret => (k === 'passphrase' ? { passphrase: v } : { recoveryKey: v })

function SecretInput({ kind, setKind, value, setValue, id }: { kind: Kind; setKind: (k: Kind) => void; value: string; setValue: (v: string) => void; id: string }) {
  return (
    <Field label="Secret" htmlFor={id}>
      <Segmented label="Type de secret" value={kind} options={[{ value: 'passphrase', label: 'Phrase secrète' }, { value: 'recoveryKey', label: 'Clé de secours' }]} onChange={(k) => { setKind(k); setValue('') }} />
      <input id={id} className={inputClass} type={kind === 'passphrase' ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} style={{ marginTop: 6 }} required />
    </Field>
  )
}

/** Récupération : tester réellement, changer la phrase, repartir de zéro si les secrets sont perdus. */
export function RecoveryPanel({ onSetup }: { onSetup: () => void }) {
  const { protection, list } = useBackupData()
  const { now } = useAppState()
  if (!protection) {
    return (
      <Card>
        <SectionTitle title="Récupération" />
        <p className={s.lead}>Aucune phrase secrète n’est définie : vos points de restauration ne sont lisibles que sur cet appareil. Définissez-la pour pouvoir récupérer vos données ailleurs.</p>
        <button className={sheet.btnPrimary} onClick={onSetup}>Définir ma phrase secrète</button>
      </Card>
    )
  }
  const latest = list[0]
  return (
    <Card>
      <SectionTitle title="Récupération et secrets" />
      <p className={s.lead}>
        {protection.testedAt
          ? <>Dernier test réel de récupération : <b>{formatDateTime(protection.testedAt)}</b> ({relativeAge(protection.testedAt, now)}) avec {protection.testedWith === 'both' ? 'la phrase secrète et la clé de secours' : protection.testedWith === 'recovery' ? 'la clé de secours' : 'la phrase secrète'}.</>
          : 'La récupération n’a pas encore été testée avec un secret.'}
      </p>
      <TestRecovery latestId={latest?.id} />
      <ChangePassphrase />
      <ResetFromDevice />
    </Card>
  )
}

function TestRecovery({ latestId }: { latestId?: string }) {
  const [kind, setKind] = useState<Kind>('passphrase')
  const [val, setVal] = useState('')
  const [ok, setOk] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setOk(null)
    if (!latestId) return
    const v = await run(() => backups.verifyBackup(latestId, secretOf(kind, val)))
    if (v) {
      setVal('')
      setOk(v.status === 'ok' || v.status === 'warning'
        ? `Déchiffrement réussi avec ${kind === 'passphrase' ? 'la phrase secrète' : 'la clé de secours'} : ${v.counts?.quests ?? 0} quêtes, ${v.counts?.xpEvents ?? 0} événements XP, ${v.totalXp ?? 0} XP, somme de contrôle conforme.`
        : `Échec : ${v.issues.join(' ')}`)
    }
  }
  return (
    <details className={s.fold}>
      <summary>Tester la récupération</summary>
      <form onSubmit={submit}>
        <p className={s.note}>Déchiffre la dernière sauvegarde en repartant uniquement du secret saisi : c’est la preuve qu’elle est récupérable.</p>
        <SecretInput id="rt-secret" kind={kind} setKind={setKind} value={val} setValue={setVal} />
        {error ? <p className={errorClass} role="alert">{error}</p> : null}
        {ok ? <p className={s.okText} role="status">{ok}</p> : null}
        <button className={sheet.btnPrimary} disabled={busy || !val || !latestId}>{busy ? 'Test…' : 'Tester maintenant'}</button>
      </form>
    </details>
  )
}

function ChangePassphrase() {
  const [kind, setKind] = useState<Kind>('passphrase')
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [done, setDone] = useState(false)
  const { busy, error, run } = useAction()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDone(false)
    const r = await run(() => backups.changePassphrase(secretOf(kind, cur), next))
    if (r) { setDone(true); setCur(''); setNext('') }
  }
  return (
    <details className={s.fold}>
      <summary>Changer la phrase secrète ou l’avoir oubliée</summary>
      <form onSubmit={submit}>
        <p className={s.note}>Phrase oubliée ? Saisissez votre <b>clé de secours</b> à la place, puis choisissez une nouvelle phrase. Les fichiers déjà exportés restent ouverts par l’ancienne phrase.</p>
        <SecretInput id="cp-secret" kind={kind} setKind={setKind} value={cur} setValue={setCur} />
        <Field label="Nouvelle phrase secrète" htmlFor="cp-new" hint={`${MIN_PASSPHRASE_LENGTH} caractères minimum.`}>
          <input id="cp-new" className={inputClass} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        {error ? <p className={errorClass} role="alert">{error}</p> : null}
        {done ? <p className={s.okText} role="status">Phrase changée. Le déchiffrement a été testé avec la nouvelle phrase.</p> : null}
        <button className={sheet.btnPrimary} disabled={busy || !cur || next.length < MIN_PASSPHRASE_LENGTH}>{busy ? 'Changement et test…' : 'Changer la phrase'}</button>
      </form>
    </details>
  )
}

function ResetFromDevice() {
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [ack, setAck] = useState(false)
  const { busy, error, run } = useAction()
  const go = async () => {
    setConfirm(false)
    const r = await run(() => backups.resetFromDevice(next))
    if (r) { setResult(r.recoveryKey); setNext('') }
  }
  return (
    <details className={s.fold}>
      <summary>Phrase et clé de secours perdues</summary>
      {result ? (
        <div className={s.stack}>
          <p className={s.warnText}><b>Nouvelle clé de secours.</b> Notez-la maintenant : elle ne sera plus affichée.</p>
          <RecoveryKeyDisplay recoveryKey={result} />
          <label className={s.checkLine}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Je l’ai conservée.</label>
          <button className={sheet.btnPrimary} disabled={!ack} onClick={() => { setResult(null); setAck(false) }}>Terminé</button>
        </div>
      ) : (
        <>
          <p className={s.note}>Dernier recours, <b>uniquement si cet appareil fonctionne encore</b> : de nouveaux secrets sont créés à partir de la clé de cet appareil. Les <b>fichiers déjà exportés</b> ne pourront plus être ouverts que par leurs anciens secrets — si vous les avez perdus, ces fichiers sont définitivement illisibles. Exportez un nouveau fichier ensuite.</p>
          <Field label="Nouvelle phrase secrète" htmlFor="rd-new"><input id="rd-new" className={inputClass} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          {error ? <p className={errorClass} role="alert">{error}</p> : null}
          <button className={sheet.btnDanger} disabled={busy || next.length < MIN_PASSPHRASE_LENGTH} onClick={() => setConfirm(true)}>Créer de nouveaux secrets</button>
          <ConfirmDialog open={confirm} danger title="Créer de nouveaux secrets ?" confirmLabel="Créer de nouveaux secrets" onConfirm={go} onCancel={() => setConfirm(false)}>
            <p>Les anciens secrets cesseront de fonctionner pour les sauvegardes de cet appareil.</p>
            <p>Les fichiers exportés auparavant resteront protégés par leurs anciens secrets uniquement.</p>
          </ConfirmDialog>
        </>
      )}
    </details>
  )
}
