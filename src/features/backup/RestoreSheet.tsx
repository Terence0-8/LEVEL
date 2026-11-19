import { useEffect, useState } from 'react'
import { Badge } from '@/design/components'
import { Field, Segmented, inputClass, errorClass } from '@/design/Form'
import { Sheet } from '@/design/Sheet'
import sheet from '@/design/sheet.module.css'
import { backups, type RestorePlan, type RestoreReport, type Secret } from '@/data/backup'
import { formatDateTime, REASON_LABEL } from './labels'
import { useAction } from './useBackupData'
import s from './backup.module.css'

export type RestoreSource = { kind: 'local'; id: string } | { kind: 'file' }

/**
 * Restauration en 4 temps, jamais silencieuse :
 * 1) choix et déchiffrement  2) vérification d'intégrité + comparaison avec les données actuelles
 * 3) confirmation explicite  4) application, vérification après coup, retour arrière si échec.
 */
export function RestoreSheet({ source, onClose }: { source: RestoreSource | null; onClose: () => void }) {
  return (
    <Sheet open={source !== null} onClose={onClose} title="Restaurer une sauvegarde">
      {source ? <RestoreFlow source={source} onDone={onClose} /> : null}
    </Sheet>
  )
}

function RestoreFlow({ source, onDone }: { source: RestoreSource; onDone: () => void }) {
  const [plan, setPlan] = useState<RestorePlan | null>(null)
  const [report, setReport] = useState<RestoreReport | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [kind, setKind] = useState<'passphrase' | 'recoveryKey'>('passphrase')
  const [secret, setSecret] = useState('')
  const [ack, setAck] = useState(false)
  const prep = useAction()
  const apply = useAction()

  useEffect(() => {
    if (source.kind === 'local') void prep.run(async () => setPlan(await backups.prepareRestoreFromBackup(source.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setFileName(f.name)
    setText(await f.text())
  }
  const analyse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (text === null) return
    const sec: Secret = kind === 'passphrase' ? { passphrase: secret } : { recoveryKey: secret }
    const p = await prep.run(() => backups.prepareRestoreFromFile(text, sec))
    if (p) { setPlan(p); setSecret('') }
  }
  const doApply = async () => {
    if (!plan) return
    const r = await apply.run(() => backups.applyRestore(plan))
    if (r) setReport(r)
  }

  // ── 4. Résultat ────────────────────────────────────────────────
  if (report) {
    return (
      <div className={s.stack} role="status">
        <div className={report.ok ? s.proof : s.proofBad}>
          <b>{report.ok ? 'Restauration terminée et vérifiée' : 'Restauration annulée : vos données d’origine ont été rétablies'}</b>
          <table className={s.table}>
            <tbody>
              {report.checks.map((c) => <tr key={c.id}><td>{c.label}</td><td className={c.ok ? s.okCell : s.badCell}>{c.ok ? '✓ conforme' : '✗ écart'}</td></tr>)}
              <tr><td>XP totale / niveau</td><td className="num">{report.totalXp} XP · niv. {report.level}</td></tr>
            </tbody>
          </table>
          {report.checks.find((c) => c.id === 'ledger' && !c.ok)?.detail ? <small>Journal : {report.checks.find((c) => c.id === 'ledger')!.detail}</small> : null}
        </div>
        {report.safetyBackupId ? <p className={s.note}>Vos données d’avant la restauration ont été sauvegardées (« Avant restauration ») : vous pouvez revenir en arrière depuis la liste des points de restauration.</p> : null}
        <div className={s.actions}><button className={sheet.btnPrimary} onClick={onDone}>Terminé</button></div>
      </div>
    )
  }

  // ── 2-3. Revue et confirmation ─────────────────────────────────
  if (plan) {
    const rows: Array<[string, number | string, number | string]> = [
      ['Quêtes', plan.summary.counts.quests, plan.current.counts.quests],
      ['Événements XP', plan.summary.counts.xpEvents, plan.current.counts.xpEvents],
      ['Révisions et analyses', plan.summary.counts.revisions + plan.summary.counts.analyses, plan.current.counts.revisions + plan.current.counts.analyses],
      ['XP totale', plan.summary.totalXp, plan.current.totalXp],
      ['Niveau', plan.summary.level, plan.current.level],
    ]
    return (
      <div className={s.stack}>
        <div className={s.proof}>
          <b>Sauvegarde déchiffrée et vérifiée</b>
          <small>{formatDateTime(plan.createdAt)} · {REASON_LABEL[plan.reason]} · intégrité contrôlée (somme de contrôle, comptages{plan.verification.status === 'warning' ? ', journal à vérifier' : ', journal d’XP'})</small>
        </div>
        <table className={`${s.table} ${s.compare}`}>
          <thead><tr><th></th><th>Cette sauvegarde</th><th>Données actuelles</th></tr></thead>
          <tbody>{rows.map(([l, a, b]) => <tr key={l}><td>{l}</td><td className="num">{a}</td><td className="num">{b}</td></tr>)}</tbody>
        </table>
        {plan.warnings.map((w) => <p key={w} className={s.warnText}>{w}</p>)}
        <p className={s.note}>Vos données actuelles seront <b>remplacées</b>. Elles sont d’abord sauvegardées automatiquement, et la restauration est vérifiée puis annulée d’elle-même en cas d’écart.</p>
        <label className={s.checkLine}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Je comprends que mes données actuelles vont être remplacées.</label>
        {apply.error ? <p className={errorClass} role="alert">{apply.error}</p> : null}
        <div className={s.actions}>
          <button className={sheet.btnGhost} onClick={onDone}>Annuler</button>
          <button className={sheet.btnDanger} disabled={!ack || apply.busy} onClick={doApply}>{apply.busy ? 'Restauration…' : 'Remplacer mes données'}</button>
        </div>
      </div>
    )
  }

  // ── 1. Choix / déchiffrement ───────────────────────────────────
  if (source.kind === 'local') {
    return (
      <div className={s.stack}>
        {prep.error ? <p className={s.warnText} role="alert">{prep.error} Cette sauvegarde ne peut pas être restaurée.</p> : <p className={s.lead}>Vérification de la sauvegarde…</p>}
        <div className={s.actions}><button className={sheet.btnGhost} onClick={onDone}>Fermer</button></div>
      </div>
    )
  }
  return (
    <form onSubmit={analyse}>
      <p className={s.lead}>Choisissez un fichier de sauvegarde Level (<code>.levelbackup</code>). Rien n’est modifié avant votre confirmation.</p>
      <Field label="Fichier de sauvegarde" htmlFor="rf-file">
        <input id="rf-file" className={inputClass} type="file" accept=".levelbackup,application/json,application/octet-stream" onChange={(e) => void onFile(e.target.files?.[0])} />
        {fileName ? <small className={s.fileName}>{fileName}</small> : null}
      </Field>
      <Field label="Secret de déchiffrement">
        <Segmented label="Type de secret" value={kind} options={[{ value: 'passphrase', label: 'Phrase secrète' }, { value: 'recoveryKey', label: 'Clé de secours' }]} onChange={(v) => { setKind(v); setSecret('') }} />
        <input className={inputClass} type={kind === 'passphrase' ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} aria-label={kind === 'passphrase' ? 'Phrase secrète' : 'Clé de secours'} placeholder={kind === 'recoveryKey' ? 'XXXX-XXXX-XXXX-…' : ''} style={{ marginTop: 6 }} required />
      </Field>
      {prep.error ? <p className={errorClass} role="alert">{prep.error}</p> : null}
      <div className={s.actions}>
        <button type="button" className={sheet.btnGhost} onClick={onDone}>Annuler</button>
        <button type="submit" className={sheet.btnPrimary} disabled={prep.busy || text === null || !secret}>{prep.busy ? 'Analyse…' : 'Analyser la sauvegarde'}</button>
      </div>
    </form>
  )
}

export function StatusBadge({ meta }: { meta: { verification: import('@/core/backupFormat').Verification | null; keyWraps: unknown } }) {
  const v = meta.verification
  if (!v) return <Badge>Non vérifiée</Badge>
  if (v.status === 'corrupt') return <Badge tone="danger">Corrompue</Badge>
  if (v.status === 'incompatible') return <Badge tone="danger">Incompatible</Badge>
  if (v.status === 'warning') return <Badge tone="info">À vérifier</Badge>
  if (v.method === 'passphrase' || v.method === 'recovery') return <Badge tone="gold">Récupération testée</Badge>
  return <Badge tone="success">Intégrité vérifiée</Badge>
}
