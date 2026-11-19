import { useEffect, useState } from 'react'
import { Field, inputClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { backups } from '@/data/backup'
import { formatDateTime, formatSize } from './labels'
import { useAction } from './useBackupData'
import s from './backup.module.css'

type Made = Awaited<ReturnType<typeof backups.exportFile>>

/** Export manuel : fichier chiffré complet à conserver EN DEHORS de l'application. Distinct des rapports PDF. */
export function ExportSheet({ open, configured, onClose, onSetup }: { open: boolean; configured: boolean; onClose: () => void; onSetup: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Exporter une sauvegarde">
      {open ? (configured ? <ExportForm onDone={onClose} /> : (
        <div className={s.stack}>
          <p className={s.lead}>Un fichier exporté doit pouvoir être rouvert sur un autre appareil. Il faut donc d’abord définir une phrase secrète (et sa clé de secours).</p>
          <div className={s.actions}><button className={sheet.btnPrimary} onClick={() => { onClose(); onSetup() }}>Définir ma phrase secrète</button></div>
        </div>
      )) : null}
    </Sheet>
  )
}

function ExportForm({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState('')
  const [made, setMade] = useState<Made | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const { busy, error, run } = useAction()

  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await run(() => backups.exportFile(pass))
    if (r) { setMade(r); setUrl(URL.createObjectURL(new Blob([r.content], { type: 'application/octet-stream' }))); setPass('') }
  }

  if (made && url) {
    const c = made.verification.counts ?? {}
    return (
      <div className={s.stack}>
        <div className={s.proof} role="status">
          <b>Fichier créé et vérifié</b>
          <table className={s.table}>
            <tbody>
              <tr><td>Relu et déchiffré avec votre phrase</td><td className={s.okCell}>✓ réussi</td></tr>
              <tr><td>Contenu</td><td>{c.quests ?? 0} quêtes · {c.xpEvents ?? 0} événements XP · {c.revisions ?? 0} révisions</td></tr>
              <tr><td>Créé le</td><td>{formatDateTime(made.meta.createdAt)}</td></tr>
              <tr><td>Taille</td><td>{formatSize(made.meta.size)}</td></tr>
            </tbody>
          </table>
        </div>
        <a className={`${sheet.btnPrimary} ${s.downloadBtn}`} href={url} download={made.filename}>Télécharger {made.filename}</a>
        <p className={s.note}>Le fichier n’est <b>pas</b> enregistré tant que vous ne le téléchargez pas. Conservez-le <b>hors de cet appareil</b> (clé USB, disque externe, stockage personnel). Il est chiffré : sans votre phrase secrète ou votre clé de secours, il est illisible.</p>
        <div className={s.actions}><button className={sheet.btnGhost} onClick={onDone}>Fermer</button></div>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <p className={s.lead}>Crée un fichier chiffré contenant <b>toutes</b> vos données : quêtes, journal d’XP et corrections, révisions, analyses, catégories, profil et réglages.</p>
      <Field label="Votre phrase secrète" htmlFor="ex-pass" hint="Saisie requise : elle sert aussi à tester que le fichier créé est bien récupérable.">
        <input id="ex-pass" className={inputClass} type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus required />
      </Field>
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      <div className={s.actions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary} disabled={busy || !pass}>{busy ? 'Création et test…' : 'Créer le fichier chiffré'}</button>
      </div>
    </form>
  )
}
