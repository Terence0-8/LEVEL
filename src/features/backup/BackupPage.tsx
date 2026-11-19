import { useState } from 'react'
import { useAppState } from '@/app/AppState'
import { Badge, Card, EmptyState, Notice, PageHeader, SectionTitle } from '@/design/components'
import { ConfirmDialog } from '@/design/Sheet'
import { Icon } from '@/design/Icon'
import sheet from '@/design/sheet.module.css'
import { backups } from '@/data/backup'
import { PROTECTED_REASONS } from '@/core/backupFormat'
import { ExportSheet } from './ExportSheet'
import { RecoveryPanel } from './RecoveryPanel'
import { RestoreSheet, StatusBadge, type RestoreSource } from './RestoreSheet'
import { SetupSheet } from './SetupSheet'
import { formatDateTime, formatSize, REASON_LABEL, relativeAge } from './labels'
import { useAction, useBackupData } from './useBackupData'
import s from './backup.module.css'

const HEALTH_TITLE = { ok: 'Données protégées', attention: 'Action recommandée', critical: 'Action requise' } as const

export function BackupPage() {
  const { list, protection, health } = useBackupData()
  const { now } = useAppState()
  const [setup, setSetup] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [restore, setRestore] = useState<RestoreSource | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const snap = useAction()
  const verify = useAction()
  const latest = list[0]

  return (
    <div className={s.page}>
      <PageHeader title="Sauvegardes" subtitle="Chiffrées, vérifiées et restaurables. Aucune donnée ne quitte cet appareil." />

      <Card variant={health.level === 'ok' ? 'event' : 'default'} className={`${s.status} ${s[health.level]}`}>
        <div className={s.statusHead}>
          <span className={s.seal} aria-hidden="true"><Icon name="shield" size={26} /></span>
          <div>
            <h2 className={s.statusTitle}>{HEALTH_TITLE[health.level]}</h2>
            {health.messages.length ? health.messages.map((m) => <p key={m} className={s.statusMsg}>{m}</p>) : <p className={s.statusMsg}>Sauvegarde récente vérifiée, récupération testée avec votre secret.</p>}
          </div>
        </div>
        <div className={s.stats}>
          <div className={s.stat}><span className={s.statValue}>{latest ? relativeAge(latest.createdAt, now) : '—'}</span><span className={s.statLabel}>Dernière sauvegarde</span></div>
          <div className={s.stat}><span className={s.statValue}>{list.length}</span><span className={s.statLabel}>Points de restauration</span></div>
          <div className={s.stat}><span className={s.statValue}>{protection?.testedAt ? relativeAge(protection.testedAt, now) : 'Jamais'}</span><span className={s.statLabel}>Récupération testée</span></div>
        </div>
        {!protection ? <button className={`${sheet.btnPrimary} ${s.cta}`} onClick={() => setSetup(true)}>Définir ma phrase secrète</button> : null}
      </Card>

      <div className={s.actionGrid}>
        <button className={s.actionCard} onClick={() => void snap.run(() => backups.createBackup('manual-snapshot', { force: true }))} disabled={snap.busy}>
          <Icon name="shield" /><b>{snap.busy ? 'Sauvegarde…' : 'Sauvegarder maintenant'}</b><small>Crée un point de restauration chiffré sur cet appareil.</small>
        </button>
        <button className={s.actionCard} onClick={() => setExporting(true)}>
          <Icon name="download" /><b>Exporter un fichier</b><small>Copie chiffrée complète à conserver hors de l’application.</small>
        </button>
        <button className={s.actionCard} onClick={() => setRestore({ kind: 'file' })}>
          <Icon name="upload" /><b>Restaurer depuis un fichier</b><small>Rouvrir un export avec votre phrase ou votre clé de secours.</small>
        </button>
      </div>
      {snap.error ? <p className={s.warnText} role="alert">{snap.error}</p> : null}

      <Card>
        <SectionTitle title="Points de restauration" aside={list.length ? `${list.length}` : undefined}
          level={2} />
        {list.length === 0 ? (
          <EmptyState title="Aucun point de restauration">Une sauvegarde automatique sera créée au prochain changement. Vous pouvez aussi en créer une maintenant.</EmptyState>
        ) : (
          <ul className={s.backupList}>
            {list.map((m) => (
              <li key={m.id} className={s.backupRow}>
                <div className={s.backupMain}>
                  <b>{formatDateTime(m.createdAt)}</b>
                  <small>{REASON_LABEL[m.reason]} · {formatSize(m.size)}{m.verification?.counts ? ` · ${m.verification.counts.quests} quêtes, ${m.verification.counts.xpEvents} événements XP` : ''}</small>
                  <div className={s.badges}>
                    <StatusBadge meta={m} />
                    {!m.keyWraps ? <Badge>Cet appareil uniquement</Badge> : null}
                    {m.verification && m.verification.status !== 'ok' && m.verification.issues[0] ? <small className={s.issue}>{m.verification.issues[0]}</small> : null}
                  </div>
                </div>
                <div className={s.backupActions}>
                  <button className={s.small} disabled={verify.busy} onClick={() => void verify.run(() => backups.verifyBackup(m.id))}>Vérifier</button>
                  <button className={s.small} onClick={() => setRestore({ kind: 'local', id: m.id })} disabled={m.verification?.status === 'corrupt' || m.verification?.status === 'incompatible'}>Restaurer</button>
                  <button className={`${s.small} ${s.dangerSmall}`} onClick={() => setDeleting(m.id)}>Supprimer</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {verify.error ? <p className={s.warnText} role="alert">{verify.error}</p> : null}
      </Card>

      <RecoveryPanel onSetup={() => setSetup(true)} />

      <Notice title="Ce que couvre cette protection">
        les points de restauration vivent dans ce navigateur : ils protègent d’une erreur, d’un bug ou d’une mauvaise restauration, <b>pas</b> de la perte de l’appareil ni de l’effacement des données du navigateur. Exportez régulièrement un fichier et gardez-le ailleurs.
      </Notice>

      <SetupSheet open={setup} onClose={() => setSetup(false)} />
      <ExportSheet open={exporting} configured={!!protection} onClose={() => setExporting(false)} onSetup={() => setSetup(true)} />
      <RestoreSheet source={restore} onClose={() => setRestore(null)} />
      <ConfirmDialog open={deleting !== null} danger title="Supprimer ce point de restauration ?" confirmLabel="Supprimer"
        onCancel={() => setDeleting(null)} onConfirm={() => { const id = deleting; setDeleting(null); if (id) void backups.deleteBackup(id) }}>
        <p>Cette sauvegarde sera supprimée de cet appareil. {PROTECTED_REASONS.includes(list.find((m) => m.id === deleting)?.reason as never) ? 'Elle est protégée contre le nettoyage automatique : seule votre action peut la retirer.' : ''}</p>
        <p>Vos données actuelles ne sont pas touchées.</p>
      </ConfirmDialog>
    </div>
  )
}
