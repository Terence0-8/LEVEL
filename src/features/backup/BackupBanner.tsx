import { Link, useLocation } from 'react-router-dom'
import { useBackupData } from './useBackupData'
import s from './backup.module.css'

/** Alerte discrète quand les sauvegardes demandent une action ; absente de la page Sauvegardes elle-même. */
export function BackupBanner() {
  const { ready, health } = useBackupData()
  const { pathname } = useLocation()
  if (!ready || health.level === 'ok' || pathname === '/backups' || pathname.startsWith('/sport/seance/')) return null
  return (
    <Link to="/backups" className={`${s.banner} ${s[health.level]}`} role="status">
      <b>{health.level === 'critical' ? 'Sauvegardes : action requise' : 'Sauvegardes : action recommandée'}</b>
      <span>{health.messages[0]}</span>
    </Link>
  )
}
