import { useState } from 'react'
import s from './backup.module.css'

/** Affichage unique de la clé de secours, avec copie et enregistrement en fichier texte. */
export function RecoveryKeyDisplay({ recoveryKey }: { recoveryKey: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(recoveryKey); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* copie indisponible : la clé reste affichée */ }
  }
  const href = `data:text/plain;charset=utf-8,${encodeURIComponent(`Level — clé de secours des sauvegardes\n\n${recoveryKey}\n\nConservez ce fichier hors de votre téléphone ou ordinateur (gestionnaire de mots de passe, coffre, papier).\nSans phrase secrète ni clé de secours, un fichier de sauvegarde ne peut pas être rouvert.\n`)}`
  const groups = recoveryKey.split('-')
  return (
    <div className={s.keyBox}>
      <div className={s.keyGroups} aria-label="Clé de secours">{groups.map((g, i) => <span key={i}>{g}</span>)}</div>
      <div className={s.keyActions}>
        <button type="button" className={s.small} onClick={copy}>{copied ? 'Copiée ✓' : 'Copier'}</button>
        <a className={s.small} href={href} download="level-cle-de-secours.txt">Enregistrer en fichier</a>
      </div>
    </div>
  )
}
