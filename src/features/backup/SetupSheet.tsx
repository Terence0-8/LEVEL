import { useState } from 'react'
import { Field, inputClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { backups } from '@/data/backup'
import { MIN_PASSPHRASE_LENGTH } from '@/data/backup/crypto'
import { RecoveryKeyDisplay } from './RecoveryKeyDisplay'
import { useAction } from './useBackupData'
import s from './backup.module.css'

/** Définir la phrase secrète : génère la clé de secours et TESTE réellement le déchiffrement avec les deux. */
export function SetupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Sécuriser mes sauvegardes">
      {open ? <SetupForm onDone={onClose} /> : null}
    </Sheet>
  )
}

function SetupForm({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [result, setResult] = useState<{ recoveryKey: string } | null>(null)
  const [ack, setAck] = useState(false)
  const { busy, error, setError, run } = useAction()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pass !== confirm) return setError('Les deux phrases ne sont pas identiques.')
    const r = await run(() => backups.setupProtection(pass))
    if (r) setResult({ recoveryKey: r.recoveryKey })
  }

  if (result) {
    return (
      <div className={s.stack}>
        <div className={s.proof} role="status">
          <b>Test de déchiffrement réussi</b>
          <table className={s.table}>
            <tbody>
              <tr><td>Avec votre phrase secrète</td><td className={s.okCell}>✓ réussi</td></tr>
              <tr><td>Avec la clé de secours</td><td className={s.okCell}>✓ réussi</td></tr>
            </tbody>
          </table>
          <small>Ces deux tests ont réellement déchiffré une sauvegarde à partir du secret saisi, pas seulement vérifié qu’elle existe.</small>
        </div>
        <p className={s.warnText}><b>Notez votre clé de secours maintenant.</b> Elle ne sera plus affichée. Si vous oubliez votre phrase secrète, elle est votre seul moyen de rouvrir vos fichiers de sauvegarde.</p>
        <RecoveryKeyDisplay recoveryKey={result.recoveryKey} />
        <label className={s.checkLine}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> J’ai conservé ma clé de secours en lieu sûr, hors de cet appareil.</label>
        <div className={s.actions}><button className={sheet.btnPrimary} disabled={!ack} onClick={onDone}>Terminé</button></div>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <p className={s.lead}>Cette phrase chiffre vos sauvegardes. Elle n’est enregistrée nulle part : vous seul pouvez rouvrir un fichier exporté.</p>
      <Field label="Phrase secrète" htmlFor="sp-pass" hint={`${MIN_PASSPHRASE_LENGTH} caractères minimum ; 4 mots ou plus, c’est mieux.`}>
        <input id="sp-pass" className={inputClass} type={show ? 'text' : 'password'} autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus required />
      </Field>
      <Field label="Confirmer la phrase" htmlFor="sp-conf">
        <input id="sp-conf" className={inputClass} type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      <label className={s.checkLine}><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Afficher la phrase</label>
      <p className={s.note}>Une <b>clé de secours</b> sera aussi générée. Perdre l’un des deux secrets n’empêche pas de récupérer vos données ; perdre les deux, si, pour tout fichier exporté.</p>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.actions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary} disabled={busy || pass.length < MIN_PASSPHRASE_LENGTH}>{busy ? 'Chiffrement et test…' : 'Chiffrer et tester'}</button>
      </div>
    </form>
  )
}
